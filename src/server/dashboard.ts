// Dashboard summary (design 7): one scoped aggregate built from the same tables and filters as the lists.
// Role user: own Site only. Super Admin: all Sites or one chosen Site. Archived devices are excluded for everyone.
// The "total assets" KPI formula is NOT fixed by the business yet, so only raw per-status counts are returned.

import { getPool, request, sql } from "./db.ts";
import { readSiteFilter } from "./scope.ts";
import type { AuthUser } from "./scope.ts";

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface MonthPoint {
  month: string; // YYYY-MM, the local month of started_at_local
  installation: number;
  replacement: number;
  removal: number;
  troubleshoot: number;
  total: number;
}

export interface DashboardSummary {
  scope: { siteId: number | null; allSites: boolean };
  kpis: {
    registeredDevices: number;
    inUse: number;
    inStockRfu: number;
    inStockDamaged: number;
    inStockHo: number;
    fleetUnits: number;
    unitsWithDevice: number;
    activitiesInRange: number;
  };
  statusDistribution: CountRow[];
  /** Where devices physically are (current_location_site_id), not who owns them. */
  locationDistribution: CountRow[];
  ownerSiteDistribution: CountRow[];
  /** In Use devices by the equipment type of their Unit (stock devices have no Unit). */
  equipmentDistribution: CountRow[];
  healthDistribution: CountRow[];
  activityByType: CountRow[];
  monthlyActivity: MonthPoint[];
  notes: string[];
}

/** The last `n` months ending at `endYm` (YYYY-MM), oldest first. Pure; used to zero-fill the monthly series. */
export function monthRange(endYm: string, n: number): string[] {
  const [y, m] = endYm.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Merge SQL rows into the zero-filled month series. Pure. */
export function buildMonthly(months: string[], rows: { month: string; type: string; n: number }[]): MonthPoint[] {
  const byMonth = new Map<string, MonthPoint>(
    months.map((month) => [month, { month, installation: 0, replacement: 0, removal: 0, troubleshoot: 0, total: 0 }])
  );
  for (const r of rows) {
    const point = byMonth.get(r.month);
    if (!point) continue;
    if (r.type === "installation" || r.type === "replacement" || r.type === "removal" || r.type === "troubleshoot") {
      point[r.type] += r.n;
      point.total += r.n;
    }
  }
  return months.map((m) => byMonth.get(m) as MonthPoint);
}

const count = (rows: Record<string, unknown>[], key: string, label: string): CountRow[] =>
  rows.map((r) => ({ key: String(r[key]), label: String(r[label]), count: Number(r.n) }));

export async function getDashboardSummary(user: AuthUser, query: { siteId?: number; months: number }, now: Date = new Date()): Promise<DashboardSummary> {
  const site = readSiteFilter(user, query.siteId);
  const pool = await getPool();
  const q = () => request(pool).input("site", sql.Int, site);
  const deviceScope = `d.is_deleted = 0 AND (@site IS NULL OR d.site_id = @site)`;

  const status = await q().query(
    `SELECT st.code AS code, ISNULL(st.label, st.code) AS label, st.status_id AS sort_id, COUNT(d.device_id) AS n
     FROM dbo.device_statuses st
     LEFT JOIN dbo.devices d ON d.status_id = st.status_id AND ${deviceScope}
     GROUP BY st.code, st.label, st.status_id ORDER BY st.status_id`
  );
  const location = await q().query(
    `SELECT s.site_code AS code, s.name AS label, COUNT(*) AS n
     FROM dbo.devices d INNER JOIN dbo.sites s ON s.site_id = d.current_location_site_id
     WHERE ${deviceScope} GROUP BY s.site_code, s.name ORDER BY s.name`
  );
  const owner = await q().query(
    `SELECT s.site_code AS code, s.name AS label, COUNT(*) AS n
     FROM dbo.devices d INNER JOIN dbo.sites s ON s.site_id = d.site_id
     WHERE ${deviceScope} GROUP BY s.site_code, s.name ORDER BY s.name`
  );
  const equipment = await q().query(
    `SELECT et.name AS code, et.name AS label, COUNT(*) AS n
     FROM dbo.devices d
     INNER JOIN dbo.fleet_units fu ON fu.unit_id = d.current_unit_id
     INNER JOIN dbo.equipment_types et ON et.equipment_type_id = fu.equipment_type_id
     WHERE ${deviceScope} GROUP BY et.name ORDER BY et.name`
  );
  const health = await q().query(
    `SELECT d.health_check_status AS code, d.health_check_status AS label, COUNT(*) AS n
     FROM dbo.devices d WHERE ${deviceScope} GROUP BY d.health_check_status ORDER BY d.health_check_status`
  );
  const units = await q().query(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT d.current_unit_id) AS used
     FROM dbo.fleet_units fu
     LEFT JOIN dbo.devices d ON d.current_unit_id = fu.unit_id AND d.is_deleted = 0
     WHERE fu.is_active = 1 AND (@site IS NULL OR fu.site_id = @site)`
  );

  // Monthly series: the local month of started_at_local, the same column the lists filter on.
  const endYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = monthRange(endYm, query.months);
  const monthly = await q()
    .input("from", sql.Date, `${months[0]}-01`)
    .query(
      `SELECT FORMAT(a.started_at_local, 'yyyy-MM') AS month, a.activity_type AS type, COUNT(*) AS n
       FROM dbo.activities a
       WHERE (@site IS NULL OR a.site_id = @site) AND CAST(a.started_at_local AS DATE) >= @from
       GROUP BY FORMAT(a.started_at_local, 'yyyy-MM'), a.activity_type`
    );
  const byType = await q().query(
    `SELECT a.activity_type AS code, a.activity_type AS label, COUNT(*) AS n
     FROM dbo.activities a WHERE (@site IS NULL OR a.site_id = @site) GROUP BY a.activity_type ORDER BY a.activity_type`
  );
  const series = buildMonthly(months, monthly.recordset.map((r) => ({ month: String(r.month), type: String(r.type), n: Number(r.n) })));

  const statusRows = count(status.recordset, "code", "label");
  const n = (code: string) => statusRows.find((r) => r.key === code)?.count ?? 0;
  const registered = statusRows.reduce((sum, r) => sum + r.count, 0);
  const u = units.recordset[0] ?? {};
  return {
    scope: { siteId: site, allSites: site === null },
    kpis: {
      registeredDevices: registered,
      inUse: n("in_use"),
      inStockRfu: n("in_stock_rfu"),
      inStockDamaged: n("in_stock_damaged"),
      inStockHo: n("in_stock_ho"),
      fleetUnits: Number(u.total ?? 0),
      unitsWithDevice: Number(u.used ?? 0),
      activitiesInRange: series.reduce((sum, p) => sum + p.total, 0),
    },
    statusDistribution: statusRows,
    locationDistribution: count(location.recordset, "code", "label"),
    ownerSiteDistribution: count(owner.recordset, "code", "label"),
    equipmentDistribution: count(equipment.recordset, "code", "label"),
    healthDistribution: count(health.recordset, "code", "label"),
    activityByType: count(byType.recordset, "code", "label"),
    monthlyActivity: series,
    notes: [
      "In Stock covers RFU, damaged and needs-repair-at-HO devices (Pak Tama clarification, 15 Oct 2026).",
      "The total-assets KPI formula is not confirmed yet; raw per-status counts are returned instead.",
    ],
  };
}
