// Reference data, fleet units and audit-log listing, all restricted to the caller's Site scope.

import { getPool, request, sql, uuid } from "./db.ts";
import { readSiteFilter } from "./scope.ts";
import type { AuthUser } from "./scope.ts";
import { formatWithOffset, offsetMinutesAt, zoneLabel } from "./time.ts";

export async function getReference(user: AuthUser) {
  const site = readSiteFilter(user);
  const pool = await getPool();
  const rq = () => request(pool).input("site", sql.Int, site);
  const [sites, types, statuses, lookups] = await Promise.all([
    rq().query(
      `SELECT site_id, site_code, name, time_zone_id, is_operating_district FROM dbo.sites
       WHERE is_active = 1 AND (@site IS NULL OR site_id = @site) ORDER BY name`
    ),
    request(pool).query(`SELECT equipment_type_id, name FROM dbo.equipment_types ORDER BY equipment_type_id`),
    request(pool).query(`SELECT status_id, code, label, is_in_stock FROM dbo.device_statuses ORDER BY status_id`),
    rq().query(
      `SELECT category, code, label, site_id, sort_order FROM dbo.lookup_values
       WHERE is_active = 1 AND (site_id IS NULL OR @site IS NULL OR site_id = @site)
       ORDER BY category, sort_order, label`
    ),
  ]);
  return {
    sites: sites.recordset.map((s) => ({
      siteId: Number(s.site_id),
      siteCode: String(s.site_code),
      name: String(s.name),
      timeZone: String(s.time_zone_id),
      timeZoneLabel: zoneLabel(String(s.time_zone_id)),
      isOperatingDistrict: Boolean(s.is_operating_district),
    })),
    equipmentTypes: types.recordset.map((t) => ({ id: Number(t.equipment_type_id), name: String(t.name) })),
    deviceStatuses: statuses.recordset.map((s) => ({
      id: Number(s.status_id),
      code: String(s.code),
      label: s.label === null ? null : String(s.label),
      isInStock: Boolean(s.is_in_stock),
    })),
    lookups: lookups.recordset.map((l) => ({
      category: String(l.category),
      code: String(l.code),
      label: String(l.label),
      siteId: l.site_id === null ? null : Number(l.site_id),
    })),
  };
}

export async function listFleetUnits(user: AuthUser, opts: { available?: boolean; siteId?: number }) {
  const site = readSiteFilter(user, opts.siteId);
  const pool = await getPool();
  const r = await request(pool)
    .input("site", sql.Int, site)
    .input("avail", sql.Bit, opts.available ? 1 : 0)
    .query(
      `SELECT u.unit_id, u.unit_no, u.site_id, u.egi, u.is_egi_confirmed, et.name AS equipment_type,
              CASE WHEN EXISTS (SELECT 1 FROM dbo.devices d WHERE d.current_unit_id = u.unit_id) THEN 1 ELSE 0 END AS occupied
       FROM dbo.fleet_units u
       INNER JOIN dbo.equipment_types et ON et.equipment_type_id = u.equipment_type_id
       WHERE u.is_active = 1 AND (@site IS NULL OR u.site_id = @site)
         AND (@avail = 0 OR NOT EXISTS (SELECT 1 FROM dbo.devices d WHERE d.current_unit_id = u.unit_id))
       ORDER BY u.unit_no`
    );
  return r.recordset.map((u) => ({
    unitId: uuid(u.unit_id),
    unitNo: String(u.unit_no),
    siteId: Number(u.site_id),
    equipmentType: String(u.equipment_type),
    egi: u.egi === null ? null : String(u.egi),
    isEgiConfirmed: Boolean(u.is_egi_confirmed),
    occupied: Boolean(u.occupied),
  }));
}

export interface AuditListQuery {
  page: number;
  pageSize: number;
  table?: string;
  operation?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  siteId?: number;
}

export async function listAuditLogs(user: AuthUser, query: AuditListQuery) {
  const site = readSiteFilter(user, query.siteId);
  const pool = await getPool();
  const bind = (rq: ReturnType<typeof request>) =>
    rq
      .input("site", sql.Int, site)
      .input("table", sql.VarChar(30), query.table ?? null)
      .input("op", sql.VarChar(6), query.operation ?? null)
      .input("action", sql.VarChar(30), query.action ?? null)
      .input("from", sql.Date, query.dateFrom ?? null)
      .input("to", sql.Date, query.dateTo ?? null);
  const where = `WHERE (@site IS NULL OR l.site_id = @site)
      AND (@table IS NULL OR l.table_name = @table)
      AND (@op IS NULL OR l.operation = @op)
      AND (@action IS NULL OR l.action = @action)
      AND (@from IS NULL OR CAST(l.occurred_at AS DATE) >= @from)
      AND (@to IS NULL OR CAST(l.occurred_at AS DATE) <= @to)`;
  const total = await bind(request(pool)).query(`SELECT COUNT(*) AS n FROM dbo.audit_log l ${where}`);
  const rows = await bind(request(pool))
    .input("offset", sql.Int, (query.page - 1) * query.pageSize)
    .input("size", sql.Int, query.pageSize)
    .query(
      `SELECT l.audit_id, l.occurred_at, s.time_zone_id, l.actor_name, l.site_id, l.table_name, l.record_id, l.entity_id,
              l.operation, l.action, l.reason, l.old_values, l.new_values, l.change_group_id, l.request_id
       FROM dbo.audit_log l LEFT JOIN dbo.sites s ON s.site_id = l.site_id
       ${where}
       ORDER BY l.audit_id DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`
    );
  const parse = (v: unknown) => {
    if (typeof v !== "string") return null;
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  };
  return {
    items: rows.recordset.map((l) => {
      const at = l.occurred_at as Date;
      const zone = l.time_zone_id ? String(l.time_zone_id) : null;
      return {
        auditId: Number(l.audit_id),
        occurredAt: zone ? formatWithOffset(at.getTime(), offsetMinutesAt(at.getTime(), zone)) : at.toISOString(),
        timeZoneLabel: zone ? zoneLabel(zone) : "UTC",
        actorName: l.actor_name === null ? null : String(l.actor_name),
        siteId: l.site_id === null ? null : Number(l.site_id),
        table: String(l.table_name),
        recordId: String(l.record_id),
        entityId: uuid(l.entity_id),
        operation: String(l.operation),
        action: String(l.action),
        reason: l.reason === null ? null : String(l.reason),
        oldValues: parse(l.old_values),
        newValues: parse(l.new_values),
        changeGroupId: uuid(l.change_group_id),
        requestId: l.request_id === null ? null : String(l.request_id),
      };
    }),
    total: Number(total.recordset[0].n),
    page: query.page,
    pageSize: query.pageSize,
  };
}
