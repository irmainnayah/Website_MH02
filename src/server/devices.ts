// Device service: list/read (Site-scoped), register (idempotent), edit descriptive fields, Super Admin
// override of status/Unit, archive (soft delete), and the Device Timeline. Every write audits in the same
// SQL transaction (design 3.15 coverage rule) and records the matching device event (3.18).

import { randomUUID } from "node:crypto";
import { writeAudit, writeDeviceEvent } from "./audit.ts";
import { err } from "./errors.ts";
import { requestHash } from "./hash.ts";
import { runIdempotent } from "./idempotency.ts";
import type { IdempotentResult } from "./idempotency.ts";
import { getPool, request, rowVersionBuffer, sql, toYmd, uuid, withTransaction } from "./db.ts";
import type { Db } from "./db.ts";
import { likePattern, loadDeviceById, loadSite, loadUnitByNo } from "./repo.ts";
import { isSuperAdmin, readSiteFilter, writeSiteId } from "./scope.ts";
import type { AuthUser } from "./scope.ts";
import { checkArchivable, planOverride, STATUS } from "./transitions.ts";
import type { StatusCode } from "./transitions.ts";
import { formatWithOffset, offsetMinutesAt, zoneLabel } from "./time.ts";
import type {
  ArchiveDeviceInput,
  CreateDeviceInput,
  OverrideDeviceInput,
  UpdateDeviceInput,
} from "./validators.ts";

export interface ServiceCtx {
  user: AuthUser;
  requestId: string;
  ip: string | null;
}

export interface DeviceDto {
  deviceId: string;
  deviceCode: string;
  serialNumber: string;
  status: { id: number; code: string; label: string | null };
  siteId: number;
  siteName: string;
  locationSiteId: number | null;
  unit: { unitId: string; unitNo: string; equipmentType: string; egi: string | null } | null;
  healthCheckStatus: string;
  lastMaintenanceDate: string | null;
  notes: string | null;
  isArchived: boolean;
  rowVersion: string;
  createdAt: string;
}

const DEVICE_SELECT = `
  SELECT d.device_id, d.device_code, d.serial_number, d.status_id, st.code AS status_code, st.label AS status_label,
         d.site_id, s.name AS site_name, d.current_location_site_id, d.current_unit_id, fu.unit_no, fu.egi,
         et.name AS equipment_type, d.health_check_status, d.last_maintenance_date, d.notes, d.is_deleted,
         d.row_version, d.created_at
  FROM dbo.devices d
  INNER JOIN dbo.device_statuses st ON st.status_id = d.status_id
  INNER JOIN dbo.sites s ON s.site_id = d.site_id
  LEFT JOIN dbo.fleet_units fu ON fu.unit_id = d.current_unit_id
  LEFT JOIN dbo.equipment_types et ON et.equipment_type_id = fu.equipment_type_id`;

function toDto(r: Record<string, unknown>): DeviceDto {
  return {
    deviceId: uuid(r.device_id),
    deviceCode: String(r.device_code),
    serialNumber: String(r.serial_number),
    status: { id: Number(r.status_id), code: String(r.status_code), label: r.status_label === null ? null : String(r.status_label) },
    siteId: Number(r.site_id),
    siteName: String(r.site_name),
    locationSiteId: r.current_location_site_id === null ? null : Number(r.current_location_site_id),
    unit: r.current_unit_id
      ? { unitId: uuid(r.current_unit_id), unitNo: String(r.unit_no), equipmentType: String(r.equipment_type), egi: r.egi === null ? null : String(r.egi) }
      : null,
    healthCheckStatus: String(r.health_check_status),
    lastMaintenanceDate: toYmd(r.last_maintenance_date),
    notes: r.notes === null ? null : String(r.notes),
    isArchived: Boolean(r.is_deleted),
    rowVersion: `0x${Buffer.from(r.row_version as Buffer).toString("hex")}`,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

/** One device, as visible to this user (a regular user never sees archived devices or other Sites). */
export async function getDevice(user: AuthUser, deviceId: string, db?: Db): Promise<DeviceDto | null> {
  const siteFilter = readSiteFilter(user);
  const r = await request(db ?? (await getPool()))
    .input("id", sql.UniqueIdentifier, deviceId)
    .input("site", sql.Int, siteFilter)
    .input("archivedOk", sql.Bit, isSuperAdmin(user) ? 1 : 0)
    .query(`${DEVICE_SELECT} WHERE d.device_id = @id AND (@site IS NULL OR d.site_id = @site) AND (@archivedOk = 1 OR d.is_deleted = 0)`);
  return r.recordset[0] ? toDto(r.recordset[0]) : null;
}

export interface DeviceListQuery {
  page: number;
  pageSize: number;
  q?: string;
  status?: StatusCode;
  equipmentType?: string;
  siteId?: number;
  archived?: "true" | "false";
  purpose?: "installable" | "removable";
}

export async function listDevices(user: AuthUser, query: DeviceListQuery) {
  const wantsArchive = query.archived === "true";
  if (wantsArchive && !isSuperAdmin(user)) {
    throw err.forbidden("SUPERADMIN_ONLY", "Only a Super Admin can view the Device Archive.");
  }
  const siteFilter = readSiteFilter(user, query.siteId);
  const statusId = query.purpose === "installable" ? STATUS.in_stock_rfu : query.purpose === "removable" ? STATUS.in_use : query.status ? STATUS[query.status] : null;
  const pool = await getPool();
  const bind = (rq: ReturnType<typeof request>) =>
    rq
      .input("archived", sql.Bit, wantsArchive ? 1 : 0)
      .input("site", sql.Int, siteFilter)
      .input("status", sql.Int, statusId)
      .input("like", sql.NVarChar(200), query.q ? likePattern(query.q) : null)
      .input("etype", sql.NVarChar(40), query.equipmentType ?? null);
  // User wildcards are neutralized by likePattern (bracket escapes), so no ESCAPE clause is needed.
  const whereClause = `WHERE d.is_deleted = @archived
      AND (@site IS NULL OR d.site_id = @site)
      AND (@status IS NULL OR d.status_id = @status)
      AND (@like IS NULL OR d.device_code LIKE @like OR d.serial_number LIKE @like OR fu.unit_no LIKE @like)
      AND (@etype IS NULL OR et.name = @etype)`;
  const total = await bind(request(pool)).query(
    `SELECT COUNT(*) AS n FROM dbo.devices d
     LEFT JOIN dbo.fleet_units fu ON fu.unit_id = d.current_unit_id
     LEFT JOIN dbo.equipment_types et ON et.equipment_type_id = fu.equipment_type_id ${whereClause}`
  );
  const rows = await bind(request(pool))
    .input("offset", sql.Int, (query.page - 1) * query.pageSize)
    .input("size", sql.Int, query.pageSize)
    .query(`${DEVICE_SELECT} ${whereClause} ORDER BY d.device_code OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`);
  return {
    items: rows.recordset.map(toDto),
    total: Number(total.recordset[0].n),
    page: query.page,
    pageSize: query.pageSize,
  };
}

/* ------------------------------------------------------------------ create */

export async function createDevice(
  ctx: ServiceCtx,
  input: CreateDeviceInput,
  idempotencyKey: string
): Promise<IdempotentResult<DeviceDto>> {
  const siteId = writeSiteId(ctx.user, input.siteId);
  return runIdempotent<DeviceDto>({
    input: {
      user: ctx.user,
      key: idempotencyKey,
      kind: "device",
      requestHash: requestHash("devices", siteId, { ...input, siteId }),
    },
    goneCode: "ALREADY_PROCESSED_AND_ARCHIVED",
    load: (id) => getDevice(ctx.user, id),
    perform: async (tx) => {
      await loadSite(tx, siteId);
      // data_source 'manual' = registered by a person through the application. (devices.data_source allows only
      // dev_seed | import | manual, design 3.8; 'app' is a valid value for users, not for devices.)
      const inserted = await request(tx)
        .input("code", sql.NVarChar(40), input.deviceCode)
        .input("serial", sql.NVarChar(80), input.serialNumber)
        .input("site", sql.Int, siteId)
        .input("health", sql.VarChar(15), input.healthCheckStatus ?? "not_checked")
        .input("notes", sql.NVarChar(500), input.notes ?? null)
        .input("actor", sql.UniqueIdentifier, ctx.user.userId)
        .query(
          `INSERT INTO dbo.devices (device_code, serial_number, status_id, site_id, current_location_site_id,
                                    health_check_status, notes, data_source, created_by)
           OUTPUT INSERTED.device_id
           VALUES (@code, @serial, 2, @site, @site, @health, @notes, 'manual', @actor)`
        );
      const deviceId = uuid(inserted.recordset[0].device_id);
      const auditId = await writeAudit(tx, {
        actor: ctx.user,
        siteId,
        tableName: "device",
        recordId: input.deviceCode,
        entityId: deviceId,
        operation: "INSERT",
        action: "device_register",
        newValues: {
          device_code: input.deviceCode,
          serial_number: input.serialNumber,
          status: "in_stock_rfu",
          site_id: siteId,
          notes: input.notes ?? null,
          health_check_status: input.healthCheckStatus ?? "not_checked",
        },
        changeGroupId: randomUUID(),
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      await writeDeviceEvent(tx, {
        deviceId,
        type: "registered",
        actor: ctx.user,
        siteId,
        auditId,
        summary: "Registered as In Stock RFU",
      });
      return { resourceId: deviceId };
    },
  });
}

/* ------------------------------------------------------------ edit details */

const EDITABLE: Record<string, { column: string; type: sql.ISqlTypeFactoryWithLength | sql.ISqlType; label: string }> = {
  deviceCode: { column: "device_code", type: sql.NVarChar(40), label: "device_code" },
  serialNumber: { column: "serial_number", type: sql.NVarChar(80), label: "serial_number" },
  notes: { column: "notes", type: sql.NVarChar(500), label: "notes" },
  healthCheckStatus: { column: "health_check_status", type: sql.VarChar(15), label: "health_check_status" },
};

export async function updateDevice(ctx: ServiceCtx, deviceId: string, input: UpdateDeviceInput): Promise<DeviceDto> {
  await withTransaction(async (tx) => {
    const dev = await loadDeviceById(tx, deviceId, true);
    if (!dev) throw err.notFound("Device not found.");
    if (dev.rowVersion.toLowerCase() !== input.rowVersion.toLowerCase()) {
      throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");
    }
    if (dev.isDeleted) throw err.conflict("DEVICE_ARCHIVED", "An archived device cannot be edited.");

    const current: Record<string, unknown> = {
      deviceCode: dev.deviceCode,
      serialNumber: dev.serialNumber,
      notes: dev.notes,
      healthCheckStatus: dev.healthCheckStatus,
    };
    const changed: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const key of Object.keys(EDITABLE)) {
      const next = (input as Record<string, unknown>)[key];
      if (next === undefined) continue;
      if (next !== current[key]) {
        changed.push(key);
        oldValues[EDITABLE[key].label] = current[key];
        newValues[EDITABLE[key].label] = next;
      }
    }
    if (changed.length === 0) return; // nothing changed: no write, no audit row

    const rq = request(tx)
      .input("id", sql.UniqueIdentifier, deviceId)
      .input("rv", sql.VarBinary(8), rowVersionBuffer(input.rowVersion))
      .input("actor", sql.UniqueIdentifier, ctx.user.userId);
    const sets = changed.map((key, i) => {
      rq.input(`v${i}`, EDITABLE[key].type, (input as Record<string, unknown>)[key]);
      return `${EDITABLE[key].column} = @v${i}`;
    });
    const upd = await rq.query(
      `UPDATE dbo.devices SET ${sets.join(", ")}, updated_at = SYSUTCDATETIME(), updated_by = @actor
       WHERE device_id = @id AND row_version = @rv`
    );
    if (upd.rowsAffected[0] !== 1) throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");

    const auditId = await writeAudit(tx, {
      actor: ctx.user,
      siteId: dev.siteId,
      tableName: "device",
      recordId: String(newValues.device_code ?? dev.deviceCode),
      entityId: dev.deviceId,
      operation: "UPDATE",
      action: "device_update",
      oldValues,
      newValues,
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    await writeDeviceEvent(tx, {
      deviceId: dev.deviceId,
      type: "details_updated",
      actor: ctx.user,
      siteId: dev.siteId,
      auditId,
      summary: `Details updated: ${changed.map((k) => EDITABLE[k].label).join(", ")}`,
    });
  });
  const dto = await getDevice(ctx.user, deviceId);
  if (!dto) throw err.notFound("Device not found.");
  return dto;
}

/* ---------------------------------------------------------------- override */

async function unitNoById(tx: Db, unitId: string | null): Promise<string | null> {
  if (!unitId) return null;
  const r = await request(tx).input("id", sql.UniqueIdentifier, unitId).query(`SELECT unit_no FROM dbo.fleet_units WHERE unit_id = @id`);
  return r.recordset[0] ? String(r.recordset[0].unit_no) : null;
}

export async function overrideDevice(ctx: ServiceCtx, deviceId: string, input: OverrideDeviceInput): Promise<DeviceDto> {
  await withTransaction(async (tx) => {
    // Lock order everywhere: Unit first, then devices.
    const unit = input.unitNo ? await loadUnitByNo(tx, input.unitNo, true) : null;
    if (input.unitNo && !unit) throw err.unprocessable("UNIT_NOT_FOUND", "The Unit does not exist.");
    const dev = await loadDeviceById(tx, deviceId, true);
    if (!dev) throw err.notFound("Device not found.");
    if (dev.rowVersion.toLowerCase() !== input.rowVersion.toLowerCase()) {
      throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");
    }
    const targetStatusId = STATUS[input.status];
    const plan = planOverride(dev, { statusId: targetStatusId, unitId: unit?.unitId ?? null }, unit);

    const upd = await request(tx)
      .input("id", sql.UniqueIdentifier, dev.deviceId)
      .input("rv", sql.VarBinary(8), rowVersionBuffer(input.rowVersion))
      .input("status", sql.Int, plan.after.statusId)
      .input("unit", sql.UniqueIdentifier, plan.after.unitId)
      .input("actor", sql.UniqueIdentifier, ctx.user.userId)
      .query(
        `UPDATE dbo.devices SET status_id = @status, current_unit_id = @unit, updated_at = SYSUTCDATETIME(), updated_by = @actor
         WHERE device_id = @id AND row_version = @rv`
      );
    if (upd.rowsAffected[0] !== 1) throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");

    const beforeCode = Object.entries(STATUS).find(([, id]) => id === plan.before.statusId)?.[0] ?? String(plan.before.statusId);
    const beforeUnitNo = await unitNoById(tx, plan.before.unitId);
    const auditId = await writeAudit(tx, {
      actor: ctx.user,
      siteId: dev.siteId,
      tableName: "device",
      recordId: dev.deviceCode,
      entityId: dev.deviceId,
      operation: "UPDATE",
      action: "device_override",
      oldValues: { status: beforeCode, unit_no: beforeUnitNo },
      newValues: { status: input.status, unit_no: unit?.unitNo ?? null },
      reason: input.reason,
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    await writeDeviceEvent(tx, {
      deviceId: dev.deviceId,
      type: "device_override",
      actor: ctx.user,
      siteId: dev.siteId,
      auditId,
      summary: `Override: ${beforeCode}${beforeUnitNo ? ` (${beforeUnitNo})` : ""} -> ${input.status}${unit ? ` (${unit.unitNo})` : ""}`,
      reason: input.reason,
      override: {
        beforeStatusId: plan.before.statusId,
        afterStatusId: plan.after.statusId,
        beforeUnitId: plan.before.unitId,
        afterUnitId: plan.after.unitId,
      },
    });
  });
  const dto = await getDevice(ctx.user, deviceId);
  if (!dto) throw err.notFound("Device not found.");
  return dto;
}

/* ----------------------------------------------------------------- archive */

export async function archiveDevice(ctx: ServiceCtx, deviceId: string, input: ArchiveDeviceInput): Promise<DeviceDto> {
  await withTransaction(async (tx) => {
    const dev = await loadDeviceById(tx, deviceId, true);
    if (!dev) throw err.notFound("Device not found.");
    if (dev.rowVersion.toLowerCase() !== input.rowVersion.toLowerCase()) {
      throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");
    }
    checkArchivable(dev);
    const upd = await request(tx)
      .input("id", sql.UniqueIdentifier, dev.deviceId)
      .input("rv", sql.VarBinary(8), rowVersionBuffer(input.rowVersion))
      .input("actor", sql.UniqueIdentifier, ctx.user.userId)
      .query(
        `UPDATE dbo.devices SET is_deleted = 1, deleted_at = SYSUTCDATETIME(), deleted_by = @actor,
                updated_at = SYSUTCDATETIME(), updated_by = @actor
         WHERE device_id = @id AND row_version = @rv`
      );
    if (upd.rowsAffected[0] !== 1) throw err.conflict("STALE_VERSION", "The device was changed by someone else. Reload and try again.");
    const auditId = await writeAudit(tx, {
      actor: ctx.user,
      siteId: dev.siteId,
      tableName: "device",
      recordId: dev.deviceCode,
      entityId: dev.deviceId,
      operation: "UPDATE",
      action: "device_archive",
      oldValues: { is_archived: false },
      newValues: { is_archived: true },
      reason: input.reason ?? null,
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    await writeDeviceEvent(tx, {
      deviceId: dev.deviceId,
      type: "soft_deleted",
      actor: ctx.user,
      siteId: dev.siteId,
      auditId,
      summary: "Archived",
      reason: input.reason ?? null,
    });
  });
  const dto = await getDevice(ctx.user, deviceId);
  if (!dto) throw err.notFound("Device not found.");
  return dto;
}

/* ---------------------------------------------------------------- timeline */

export interface TimelineEntry {
  entryKey: string;
  kind: "event" | "activity";
  type: string;
  /** ISO 8601 with the offset of the record's Site; sorting uses the UTC instant. */
  at: string;
  timeZone: string;
  timeZoneLabel: string;
  summary: string | null;
  actorName: string | null;
  reason: string | null;
  override: { beforeStatus: string | null; afterStatus: string | null; beforeUnit: string | null; afterUnit: string | null } | null;
  formNumber: string | null;
  activityType: string | null;
  role: string | null;
  activityId: string | null;
  sortMs: number;
}

export async function deviceTimeline(user: AuthUser, deviceId: string): Promise<TimelineEntry[]> {
  const device = await getDevice(user, deviceId);
  if (!device) throw err.notFound("Device not found.");
  const pool = await getPool();
  const events = await request(pool).input("id", sql.UniqueIdentifier, deviceId).query(
    `SELECT e.event_id, e.event_type, e.occurred_at, s.time_zone_id, e.summary, e.reason, e.actor_name,
            bs.code AS before_status, afs.code AS after_status, bu.unit_no AS before_unit, au.unit_no AS after_unit,
            e.source_form_number, e.source_activity_type, e.source_role, e.source_started_at_local, e.source_time_zone_id
     FROM dbo.device_events e
     INNER JOIN dbo.sites s ON s.site_id = e.site_id
     LEFT JOIN dbo.device_statuses bs ON bs.status_id = e.before_status_id
     LEFT JOIN dbo.device_statuses afs ON afs.status_id = e.after_status_id
     LEFT JOIN dbo.fleet_units bu ON bu.unit_id = e.before_unit_id
     LEFT JOIN dbo.fleet_units au ON au.unit_id = e.after_unit_id
     WHERE e.device_id = @id`
  );
  const acts = await request(pool).input("id", sql.UniqueIdentifier, deviceId).query(
    `SELECT a.activity_id, a.activity_type, a.form_number, a.started_at, a.time_zone_id, a.start_utc_offset_minutes,
            a.technician_name, ad.role
     FROM dbo.activity_devices ad
     INNER JOIN dbo.activities a ON a.activity_id = ad.activity_id
     WHERE ad.device_id = @id`
  );
  const entries: TimelineEntry[] = [];
  for (const e of events.recordset) {
    const at = e.occurred_at as Date;
    const zone = String(e.time_zone_id);
    const offset = offsetMinutesAt(at.getTime(), zone);
    const isOverride = e.event_type === "device_override";
    const deleted = e.event_type === "transaction_deleted";
    entries.push({
      entryKey: `E:${uuid(e.event_id)}`,
      kind: "event",
      type: String(e.event_type),
      at: formatWithOffset(at.getTime(), offset),
      timeZone: zone,
      timeZoneLabel: zoneLabel(zone),
      summary: deleted ? `Transaction ${e.source_form_number} (${e.source_activity_type}) deleted` : (e.summary ?? null),
      actorName: e.actor_name ?? null,
      reason: e.reason ?? null,
      override: isOverride
        ? { beforeStatus: e.before_status ?? null, afterStatus: e.after_status ?? null, beforeUnit: e.before_unit ?? null, afterUnit: e.after_unit ?? null }
        : null,
      formNumber: deleted ? String(e.source_form_number) : null,
      activityType: deleted ? String(e.source_activity_type) : null,
      role: deleted ? String(e.source_role) : null,
      activityId: null,
      sortMs: at.getTime(),
    });
  }
  for (const a of acts.recordset) {
    const at = a.started_at as Date;
    const zone = String(a.time_zone_id);
    entries.push({
      entryKey: `A:${uuid(a.activity_id)}:${deviceId.toLowerCase()}`,
      kind: "activity",
      type: String(a.activity_type),
      at: formatWithOffset(at.getTime(), Number(a.start_utc_offset_minutes)),
      timeZone: zone,
      timeZoneLabel: zoneLabel(zone),
      summary: `${a.form_number}`,
      actorName: a.technician_name ?? null,
      reason: null,
      override: null,
      formNumber: String(a.form_number),
      activityType: String(a.activity_type),
      role: String(a.role),
      activityId: uuid(a.activity_id),
      sortMs: at.getTime(),
    });
  }
  entries.sort((x, y) => x.sortMs - y.sortMs || x.entryKey.localeCompare(y.entryKey));
  return entries;
}
