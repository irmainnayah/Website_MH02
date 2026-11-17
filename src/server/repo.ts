// Shared row loaders. Lock hints are only used inside business transactions (UPDLOCK keeps the facts that
// the transition rules read consistent until COMMIT). All access is parameterized.

import { err } from "./errors.ts";
import { request, rowVersionHex, sql, toYmd, uuid } from "./db.ts";
import type { Db } from "./db.ts";
import type { DeviceFacts, UnitFacts } from "./transitions.ts";

export interface DeviceRow extends DeviceFacts {
  serialNumber: string;
  notes: string | null;
  healthCheckStatus: string;
  rowVersion: string;
}

const DEVICE_COLUMNS = `d.device_id, d.device_code, d.serial_number, d.site_id, d.status_id, d.current_unit_id,
  d.current_location_site_id, d.last_maintenance_date, d.is_deleted, d.row_version, d.notes, d.health_check_status`;

function mapDeviceRow(r: Record<string, unknown>): DeviceRow {
  return {
    deviceId: uuid(r.device_id),
    deviceCode: String(r.device_code),
    serialNumber: String(r.serial_number),
    siteId: Number(r.site_id),
    statusId: Number(r.status_id),
    unitId: r.current_unit_id ? uuid(r.current_unit_id) : null,
    locationSiteId: r.current_location_site_id === null ? null : Number(r.current_location_site_id),
    lastMaintenanceDate: toYmd(r.last_maintenance_date),
    isDeleted: Boolean(r.is_deleted),
    rowVersion: rowVersionHex(r.row_version),
    notes: r.notes === null ? null : String(r.notes),
    healthCheckStatus: String(r.health_check_status),
  };
}

export async function loadDeviceById(db: Db, deviceId: string, lock: boolean): Promise<DeviceRow | null> {
  const hint = lock ? "WITH (UPDLOCK, ROWLOCK)" : "";
  const r = await request(db)
    .input("id", sql.UniqueIdentifier, deviceId)
    .query(`SELECT ${DEVICE_COLUMNS} FROM dbo.devices d ${hint} WHERE d.device_id = @id`);
  return r.recordset[0] ? mapDeviceRow(r.recordset[0]) : null;
}

export async function loadDeviceByCode(db: Db, code: string, lock: boolean): Promise<DeviceRow | null> {
  const hint = lock ? "WITH (UPDLOCK, ROWLOCK)" : "";
  const r = await request(db)
    .input("code", sql.NVarChar(40), code)
    .query(`SELECT ${DEVICE_COLUMNS} FROM dbo.devices d ${hint} WHERE d.device_code = @code`);
  return r.recordset[0] ? mapDeviceRow(r.recordset[0]) : null;
}

export async function loadUnitByNo(db: Db, unitNo: string, lock: boolean): Promise<UnitFacts | null> {
  const hint = lock ? "WITH (UPDLOCK, ROWLOCK)" : "";
  const r = await request(db)
    .input("no", sql.NVarChar(30), unitNo)
    .query(
      `SELECT u.unit_id, u.unit_no, u.site_id, u.is_active,
              (SELECT TOP (1) d.device_id FROM dbo.devices d WHERE d.current_unit_id = u.unit_id) AS occupied_by
       FROM dbo.fleet_units u ${hint} WHERE u.unit_no = @no`
    );
  const row = r.recordset[0];
  if (!row) return null;
  return {
    unitId: uuid(row.unit_id),
    unitNo: String(row.unit_no),
    siteId: Number(row.site_id),
    isActive: Boolean(row.is_active),
    occupiedByDeviceId: row.occupied_by ? uuid(row.occupied_by) : null,
  };
}

export interface SiteRow {
  siteId: number;
  siteCode: string;
  name: string;
  timeZoneId: string;
  isActive: boolean;
}

export async function loadSite(db: Db, siteId: number): Promise<SiteRow> {
  const r = await request(db)
    .input("id", sql.Int, siteId)
    .query(`SELECT site_id, site_code, name, time_zone_id, is_active FROM dbo.sites WHERE site_id = @id`);
  const row = r.recordset[0];
  if (!row) throw err.unprocessable("SITE_NOT_FOUND", "The Site does not exist.");
  if (!row.is_active) throw err.unprocessable("SITE_INACTIVE", "The Site is not active.");
  return {
    siteId: Number(row.site_id),
    siteCode: String(row.site_code),
    name: String(row.name),
    timeZoneId: String(row.time_zone_id),
    isActive: true,
  };
}

/** LIKE pattern with user wildcards escaped. */
export function likePattern(q: string): string {
  return `%${q.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`;
}
