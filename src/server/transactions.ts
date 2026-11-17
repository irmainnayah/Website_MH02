// Transactions (activities): Installation, Replacement, Removal, Troubleshoot (design 3.9-3.11, 6).
// Creation is one SQL transaction: form number, header, per-device before/after snapshots, details, device
// state changes, audit rows, all guarded by the Site rules and the idempotency key. Super Admin delete restores
// the complete previous device state, is blocked by later activity, and leaves transaction_deleted events.

import { randomUUID } from "node:crypto";
import { writeAudit, writeDeviceEvent } from "./audit.ts";
import type { AuditTable } from "./audit.ts";
import { ApiError, err } from "./errors.ts";
import { formatFormNumber } from "./formNumber.ts";
import type { ActivityType } from "./formNumber.ts";
import { requestHash } from "./hash.ts";
import { runIdempotent } from "./idempotency.ts";
import type { IdempotentResult } from "./idempotency.ts";
import { getConfig } from "./config.ts";
import { CommitOutcomeUnknownError, getPool, request, rowVersionBuffer, rowVersionHex, sql, toYmd, uuid, withTransaction } from "./db.ts";
import type { Db } from "./db.ts";
import type { ServiceCtx } from "./devices.ts";
import { discardStaged, finalizeAll, insertPhotoRows, listPhotos, photoFilesOf, photosFingerprint, quarantineFiles, stagePhotos } from "./photos.ts";
import type { PhotoDto, PhotoInput } from "./photos.ts";
import { loadDeviceByCode, loadSite, loadUnitByNo } from "./repo.ts";
import type { DeviceRow, SiteRow } from "./repo.ts";
import { isSuperAdmin, readSiteFilter, writeSiteId } from "./scope.ts";
import type { AuthUser } from "./scope.ts";
import {
  finalStatusId,
  matchesAfterSnapshot,
  planInstallation,
  planRemoval,
  planReplacement,
  planTroubleshoot,
  STATUS,
} from "./transitions.ts";
import type { Plan, UnitFacts } from "./transitions.ts";
import { durationMinutes, formatWithOffset, localDate, localToUtc, localYearMonth, parseLocalDateTime, zoneLabel } from "./time.ts";
import type { InstallationInput, RemovalInput, ReplacementInput, TroubleshootInput } from "./validators.ts";

/* --------------------------------------------------------------------- DTOs */

export interface ActivityDeviceDto {
  deviceId: string;
  deviceCode: string;
  role: string;
  before: { status: string; unitNo: string | null; locationSiteId: number | null; lastMaintenanceDate: string | null };
  after: { status: string; unitNo: string | null; locationSiteId: number | null; lastMaintenanceDate: string | null };
}

export interface ActivityDto {
  activityId: string;
  activityType: ActivityType;
  formNumber: string;
  siteId: number;
  siteName: string;
  unitNo: string | null;
  startedAt: string;
  finishedAt: string;
  timeZone: string;
  timeZoneLabel: string;
  durationMinutes: number;
  shift: string | null;
  technician: { userId: string | null; name: string | null; nrp: string | null };
  groupLeader: string | null;
  remarks: string | null;
  devices: ActivityDeviceDto[];
  details: Record<string, unknown>;
  photos: PhotoDto[];
  /** Concurrency token for PATCH (design 7). */
  rowVersion: string;
  createdAt: string;
}

type CommonInput = { startedAt: string; finishedAt: string; shift?: string; groupLeader?: string; remarks?: string; siteId?: number };

/* ------------------------------------------------------------------ helpers */

interface Times {
  startUtc: Date;
  finishUtc: Date;
  startOffset: number;
  finishOffset: number;
  minutes: number;
}

function resolveTimes(site: SiteRow, input: CommonInput): Times {
  const start = localToUtc(parseLocalDateTime(input.startedAt, "startedAt"), site.timeZoneId);
  const finish = localToUtc(parseLocalDateTime(input.finishedAt, "finishedAt"), site.timeZoneId);
  if (finish.utcMs < start.utcMs) {
    throw err.unprocessable("FINISH_BEFORE_START", "finishedAt must not be before startedAt.");
  }
  if (finish.utcMs > Date.now() + getConfig().clockSkewMs) {
    throw err.unprocessable("FINISH_IN_FUTURE", "finishedAt cannot be in the future: work is recorded after it is finished.");
  }
  return {
    startUtc: new Date(start.utcMs),
    finishUtc: new Date(finish.utcMs),
    startOffset: start.offsetMinutes,
    finishOffset: finish.offsetMinutes,
    minutes: durationMinutes(start.utcMs, finish.utcMs),
  };
}

/** Race-free per-(type, month) counter (design 3.14). The key-range lock is held until COMMIT. */
async function nextFormNumber(tx: Db, type: ActivityType, yearMonth: string): Promise<string> {
  const r = await request(tx)
    .input("t", sql.VarChar(15), type)
    .input("ym", sql.Char(6), yearMonth)
    .query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.form_sequences WITH (UPDLOCK, HOLDLOCK) WHERE activity_type = @t AND year_month = @ym)
         INSERT INTO dbo.form_sequences (activity_type, year_month, last_number) VALUES (@t, @ym, 0);
       UPDATE dbo.form_sequences SET last_number = last_number + 1
       OUTPUT INSERTED.last_number
       WHERE activity_type = @t AND year_month = @ym;`
  );
  return formatFormNumber(type, yearMonth, Number(r.recordset[0].last_number));
}

async function requireDevice(tx: Db, code: string, txSiteId: number, user: AuthUser): Promise<DeviceRow> {
  const dev = await loadDeviceByCode(tx, code, true);
  // A regular user must not learn that a device code exists in another Site.
  if (!dev || (dev.siteId !== txSiteId && !isSuperAdmin(user))) {
    throw err.unprocessable("DEVICE_NOT_FOUND", `Device ${code} was not found.`);
  }
  return dev;
}

async function requireUnit(tx: Db, unitNo: string, txSiteId: number, user: AuthUser): Promise<UnitFacts> {
  const unit = await loadUnitByNo(tx, unitNo, true);
  if (!unit || (unit.siteId !== txSiteId && !isSuperAdmin(user))) {
    throw err.unprocessable("UNIT_NOT_FOUND", `Unit ${unitNo} was not found.`);
  }
  return unit;
}

interface DeviceStep {
  device: DeviceRow;
  role: "subject" | "old" | "new";
  plan: Plan;
}

async function applyDeviceState(tx: Db, step: DeviceStep, actor: AuthUser): Promise<void> {
  const a = step.plan.after;
  await request(tx)
    .input("id", sql.UniqueIdentifier, step.device.deviceId)
    .input("status", sql.Int, a.statusId)
    .input("unit", sql.UniqueIdentifier, a.unitId)
    .input("loc", sql.Int, a.locationSiteId)
    .input("lm", sql.Date, a.lastMaintenanceDate)
    .input("actor", sql.UniqueIdentifier, actor.userId)
    .query(
      `UPDATE dbo.devices SET status_id = @status, current_unit_id = @unit, current_location_site_id = @loc,
              last_maintenance_date = @lm, updated_at = SYSUTCDATETIME(), updated_by = @actor
       WHERE device_id = @id`
    );
}

async function insertSnapshots(tx: Db, activityId: string, steps: DeviceStep[]): Promise<void> {
  for (const s of steps) {
    await request(tx)
      .input("act", sql.UniqueIdentifier, activityId)
      .input("dev", sql.UniqueIdentifier, s.device.deviceId)
      .input("role", sql.VarChar(10), s.role)
      .input("bs", sql.Int, s.plan.before.statusId)
      .input("as", sql.Int, s.plan.after.statusId)
      .input("bu", sql.UniqueIdentifier, s.plan.before.unitId)
      .input("au", sql.UniqueIdentifier, s.plan.after.unitId)
      .input("bl", sql.Int, s.plan.before.locationSiteId)
      .input("al", sql.Int, s.plan.after.locationSiteId)
      .input("bm", sql.Date, s.plan.before.lastMaintenanceDate)
      .input("am", sql.Date, s.plan.after.lastMaintenanceDate)
      .query(
        `INSERT INTO dbo.activity_devices
           (activity_id, device_id, role, before_status_id, after_status_id, before_unit_id, after_unit_id,
            before_location_site_id, after_location_site_id, before_last_maintenance_date, after_last_maintenance_date)
         VALUES (@act, @dev, @role, @bs, @as, @bu, @au, @bl, @al, @bm, @am)`
      );
  }
}

const statusCode = (id: number): string => Object.entries(STATUS).find(([, v]) => v === id)?.[0] ?? String(id);

/* ------------------------------------------------------------------- create */

interface Spec {
  type: ActivityType;
  site: SiteRow;
  times: Times;
  unit: UnitFacts | null;
  steps: DeviceStep[];
  insertDetails: (tx: Db, activityId: string) => Promise<void>;
  auditValues: Record<string, unknown>;
}

async function writeActivity(
  tx: Db,
  ctx: ServiceCtx,
  spec: Spec,
  common: CommonInput
): Promise<{ resourceId: string; formNumber: string }> {
  const { user } = ctx;
  const formNumber = await nextFormNumber(tx, spec.type, localYearMonth(spec.times.startUtc.getTime(), spec.times.startOffset));
  const ins = await request(tx)
    .input("type", sql.VarChar(15), spec.type)
    .input("form", sql.NVarChar(30), formNumber)
    .input("site", sql.Int, spec.site.siteId)
    .input("unit", sql.UniqueIdentifier, spec.unit?.unitId ?? null)
    .input("start", sql.DateTime2(0), spec.times.startUtc)
    .input("finish", sql.DateTime2(0), spec.times.finishUtc)
    .input("zone", sql.VarChar(50), spec.site.timeZoneId)
    .input("so", sql.SmallInt, spec.times.startOffset)
    .input("fo", sql.SmallInt, spec.times.finishOffset)
    .input("dur", sql.Int, spec.times.minutes)
    .input("shift", sql.VarChar(10), common.shift ?? null)
    .input("tech", sql.UniqueIdentifier, user.userId)
    .input("techName", sql.NVarChar(120), user.name)
    .input("techNrp", sql.NVarChar(30), user.nrp)
    .input("gl", sql.NVarChar(120), common.groupLeader ?? null)
    .input("remarks", sql.NVarChar(1000), common.remarks ?? null)
    .input("actor", sql.UniqueIdentifier, user.userId)
    .query(
      `INSERT INTO dbo.activities
         (activity_type, form_number, site_id, unit_id, started_at, finished_at, time_zone_id,
          start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes, shift,
          technician_user_id, technician_name, technician_nrp, group_leader, remarks, created_by)
       OUTPUT INSERTED.activity_id
       VALUES (@type, @form, @site, @unit, @start, @finish, @zone, @so, @fo, @dur, @shift,
               @tech, @techName, @techNrp, @gl, @remarks, @actor)`
    );
  const activityId = uuid(ins.recordset[0].activity_id);

  await insertSnapshots(tx, activityId, spec.steps);
  await spec.insertDetails(tx, activityId);
  for (const step of spec.steps) {
    if (spec.type !== "troubleshoot") await applyDeviceState(tx, step, user);
  }

  const group = randomUUID();
  await writeAudit(tx, {
    actor: user,
    siteId: spec.site.siteId,
    tableName: spec.type as AuditTable,
    recordId: formNumber,
    entityId: activityId,
    operation: "INSERT",
    action: "transaction_create",
    newValues: {
      form_number: formNumber,
      activity_type: spec.type,
      site_id: spec.site.siteId,
      unit_no: spec.unit?.unitNo ?? null,
      started_at: formatWithOffset(spec.times.startUtc.getTime(), spec.times.startOffset),
      finished_at: formatWithOffset(spec.times.finishUtc.getTime(), spec.times.finishOffset),
      duration_minutes: spec.times.minutes,
      ...spec.auditValues,
    },
    changeGroupId: group,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
  for (const step of spec.steps) {
    if (spec.type === "troubleshoot") continue; // the device is unchanged: the activity row is the record
    await writeAudit(tx, {
      actor: user,
      siteId: step.device.siteId,
      tableName: "device",
      recordId: step.device.deviceCode,
      entityId: step.device.deviceId,
      operation: "UPDATE",
      action: "transaction_create",
      oldValues: { status: statusCode(step.plan.before.statusId), unit_id: step.plan.before.unitId },
      newValues: { status: statusCode(step.plan.after.statusId), unit_id: step.plan.after.unitId, form_number: formNumber },
      changeGroupId: group,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  }
  return { resourceId: activityId, formNumber };
}

type BuildFn = (tx: Db, site: SiteRow, times: Times, local: { date: string }) => Promise<Spec>;

async function runCreate<I extends CommonInput>(
  ctx: ServiceCtx,
  type: ActivityType,
  input: I,
  idempotencyKey: string,
  build: BuildFn,
  photoInputs: PhotoInput[] = []
): Promise<IdempotentResult<ActivityDto>> {
  const siteId = writeSiteId(ctx.user, input.siteId);
  // Photos are validated and staged BEFORE the SQL transaction (design 3.12); nothing references them yet.
  const staged = await stagePhotos(type, photoInputs);
  const hashed: Record<string, unknown> = { ...input, siteId };
  if (staged.length > 0) hashed.photos = photosFingerprint(staged);
  let result: IdempotentResult<ActivityDto>;
  try {
    result = await runIdempotent<ActivityDto>({
      input: {
        user: ctx.user,
        key: idempotencyKey,
        kind: type,
        requestHash: requestHash(`${type}s`, siteId, hashed),
      },
      goneCode: "ALREADY_PROCESSED_AND_DELETED",
      load: (id) => getActivity(ctx.user, id),
      perform: async (tx) => {
        const site = await loadSite(tx, siteId);
        const times = resolveTimes(site, input);
        const finishedLocalDate = localDate(times.finishUtc.getTime(), times.finishOffset);
        const spec = await build(tx, site, times, { date: finishedLocalDate });
        if (staged.length > 0) spec.auditValues = { ...spec.auditValues, photo_slots: staged.map((p) => p.slotKey) };
        const created = await writeActivity(tx, ctx, spec, input);
        await insertPhotoRows(tx, created.resourceId, staged, ctx.user.userId);
        return created;
      },
    });
  } catch (error) {
    // Unless the outcome is unknown, the request provably created nothing: its staged files are unreferenced.
    const unknown = error instanceof CommitOutcomeUnknownError || (error instanceof ApiError && error.code === "COMMIT_OUTCOME_UNKNOWN");
    if (!unknown) await discardStaged(staged);
    throw error;
  }
  if (result.replayed) await discardStaged(staged);
  else await finalizeAll(staged);
  return result;
}

function buildInstallation(ctx: ServiceCtx, input: InstallationInput): BuildFn {
  return async (tx, site, times, local) => {
    // Lock order: Unit first, then devices.
    const unit = await requireUnit(tx, input.unitNo, site.siteId, ctx.user);
    const device = await requireDevice(tx, input.deviceCode, site.siteId, ctx.user);
    const plan = planInstallation(device, unit, site.siteId, local.date);
    return {
      type: "installation",
      site,
      times,
      unit,
      steps: [{ device, role: "subject", plan }],
      auditValues: { device_code: device.deviceCode },
      insertDetails: async (db, activityId) => {
        const eq = await request(db)
          .input("id", sql.UniqueIdentifier, unit.unitId)
          .query(`SELECT equipment_type_id, egi FROM dbo.fleet_units WHERE unit_id = @id`);
        await request(db)
          .input("act", sql.UniqueIdentifier, activityId)
          .input("et", sql.Int, eq.recordset[0].equipment_type_id)
          .input("egi", sql.NVarChar(60), eq.recordset[0].egi)
          .input("sp", sql.NVarChar(60), input.sourcePower ?? null)
          .input("spm", sql.NVarChar(60), input.spmVersion ?? null)
          .input("area", sql.NVarChar(60), input.area ?? null)
          .input("loc", sql.NVarChar(200), input.locationDetail ?? null)
          .input("ip", sql.VarChar(45), input.ipAddress ?? null)
          .input("cpe", sql.VarChar(45), input.ipCpe ?? null)
          .input("vhms", sql.VarChar(45), input.ipVhms ?? null)
          .input("notes", sql.NVarChar(1000), input.notes ?? null)
          .query(
            `INSERT INTO dbo.installation_details
               (activity_id, equipment_type_id, egi, source_power, spm_version, area, location_detail, ip_address, ip_cpe, ip_vhms, notes)
             VALUES (@act, @et, @egi, @sp, @spm, @area, @loc, @ip, @cpe, @vhms, @notes)`
          );
      },
    };
  };
}

export function createInstallation(ctx: ServiceCtx, input: InstallationInput, key: string, photos: PhotoInput[] = []) {
  return runCreate(ctx, "installation", input, key, buildInstallation(ctx, input), photos);
}

function buildRemoval(ctx: ServiceCtx, input: RemovalInput): BuildFn {
  return async (tx, site, times, local) => {
    const unit = await requireUnit(tx, input.unitNo, site.siteId, ctx.user);
    const device = await requireDevice(tx, input.deviceCode, site.siteId, ctx.user);
    const plan = planRemoval(device, unit, site.siteId, input.finalCondition, local.date);
    return {
      type: "removal",
      site,
      times,
      unit,
      steps: [{ device, role: "subject", plan }],
      auditValues: { device_code: device.deviceCode, final_condition: input.finalCondition, reason: input.reason },
      insertDetails: async (db, activityId) => {
        await request(db)
          .input("act", sql.UniqueIdentifier, activityId)
          .input("reason", sql.NVarChar(200), input.reason)
          .input("detail", sql.NVarChar(1000), input.reasonDetail ?? null)
          .input("final", sql.Int, finalStatusId(input.finalCondition))
          .query(`INSERT INTO dbo.removal_details (activity_id, reason, reason_detail, final_status_id) VALUES (@act, @reason, @detail, @final)`);
      },
    };
  };
}

export function createRemoval(ctx: ServiceCtx, input: RemovalInput, key: string, photos: PhotoInput[] = []) {
  return runCreate(ctx, "removal", input, key, buildRemoval(ctx, input), photos);
}

function buildReplacement(ctx: ServiceCtx, input: ReplacementInput): BuildFn {
  return async (tx, site, times, local) => {
    const unit = await requireUnit(tx, input.unitNo, site.siteId, ctx.user);
    // Lock the two devices in a fixed order to avoid deadlocks.
    const codes = [input.oldDeviceCode, input.newDeviceCode].sort();
    const loaded = new Map<string, DeviceRow>();
    for (const code of codes) loaded.set(code, await requireDevice(tx, code, site.siteId, ctx.user));
    const oldDevice = loaded.get(input.oldDeviceCode) as DeviceRow;
    const newDevice = loaded.get(input.newDeviceCode) as DeviceRow;
    const plans = planReplacement(oldDevice, newDevice, unit, site.siteId, input.oldFinalCondition, local.date);
    return {
      type: "replacement",
      site,
      times,
      unit,
      // The old device is updated first so the Unit is free for the new one (one device per Unit).
      steps: [
        { device: oldDevice, role: "old", plan: plans.old },
        { device: newDevice, role: "new", plan: plans.new },
      ],
      auditValues: { old_device_code: oldDevice.deviceCode, new_device_code: newDevice.deviceCode, old_final_condition: input.oldFinalCondition },
      insertDetails: async (db, activityId) => {
        await request(db)
          .input("act", sql.UniqueIdentifier, activityId)
          .input("final", sql.Int, finalStatusId(input.oldFinalCondition))
          .input("sp", sql.NVarChar(60), input.sourcePower ?? null)
          .input("spm", sql.NVarChar(60), input.spmVersion ?? null)
          .input("area", sql.NVarChar(60), input.area ?? null)
          .input("loc", sql.NVarChar(200), input.locationDetail ?? null)
          .input("ip", sql.VarChar(45), input.ipAddress ?? null)
          .input("cpe", sql.VarChar(45), input.ipCpe ?? null)
          .input("vhms", sql.VarChar(45), input.ipVhms ?? null)
          .query(
            `INSERT INTO dbo.replacement_details
               (activity_id, old_final_status_id, source_power, spm_version, area, location_detail, ip_address, ip_cpe, ip_vhms)
             VALUES (@act, @final, @sp, @spm, @area, @loc, @ip, @cpe, @vhms)`
          );
      },
    };
  };
}

export function createReplacement(ctx: ServiceCtx, input: ReplacementInput, key: string, photos: PhotoInput[] = []) {
  return runCreate(ctx, "replacement", input, key, buildReplacement(ctx, input), photos);
}

function buildTroubleshoot(ctx: ServiceCtx, input: TroubleshootInput): BuildFn {
  return async (tx, site, times) => {
    const unit = input.unitNo ? await requireUnit(tx, input.unitNo, site.siteId, ctx.user) : null;
    const device = await requireDevice(tx, input.deviceCode, site.siteId, ctx.user);
    const plan = planTroubleshoot(device, site.siteId);
    return {
      type: "troubleshoot",
      site,
      times,
      unit,
      steps: [{ device, role: "subject", plan }],
      auditValues: { device_code: device.deviceCode, component_type: input.componentType },
      insertDetails: async (db, activityId) => {
        await request(db)
          .input("act", sql.UniqueIdentifier, activityId)
          .input("comp", sql.VarChar(20), input.componentType)
          .input("issue", sql.NVarChar(1000), input.issue)
          .input("action", sql.NVarChar(1000), input.actionTaken)
          .input("res", sql.VarChar(10), input.healthCheckResult ?? null)
          .query(
            `INSERT INTO dbo.troubleshoot_details (activity_id, component_type, issue, action_taken, health_check_result)
             VALUES (@act, @comp, @issue, @action, @res)`
          );
      },
    };
  };
}

export function createTroubleshoot(ctx: ServiceCtx, input: TroubleshootInput, key: string, photos: PhotoInput[] = []) {
  return runCreate(ctx, "troubleshoot", input, key, buildTroubleshoot(ctx, input), photos);
}

/* --------------------------------------------------------------------- read */

const DETAIL_TABLE: Record<ActivityType, string> = {
  installation: "installation_details",
  replacement: "replacement_details",
  removal: "removal_details",
  troubleshoot: "troubleshoot_details",
};

export async function getActivity(user: AuthUser, activityId: string, db?: Db): Promise<ActivityDto | null> {
  const site = readSiteFilter(user);
  const conn = db ?? (await getPool());
  const head = await request(conn)
    .input("id", sql.UniqueIdentifier, activityId)
    .input("site", sql.Int, site)
    .query(
      `SELECT a.activity_id, a.activity_type, a.form_number, a.site_id, s.name AS site_name, fu.unit_no,
              a.started_at, a.finished_at, a.time_zone_id, a.start_utc_offset_minutes, a.finish_utc_offset_minutes,
              a.duration_minutes, a.shift, a.technician_user_id, a.technician_name, a.technician_nrp,
              a.group_leader, a.remarks, a.created_at, a.row_version
       FROM dbo.activities a
       INNER JOIN dbo.sites s ON s.site_id = a.site_id
       LEFT JOIN dbo.fleet_units fu ON fu.unit_id = a.unit_id
       WHERE a.activity_id = @id AND (@site IS NULL OR a.site_id = @site)`
    );
  const h = head.recordset[0];
  if (!h) return null;
  const type = String(h.activity_type) as ActivityType;
  const devices = await request(conn)
    .input("id", sql.UniqueIdentifier, activityId)
    .query(
      `SELECT ad.device_id, d.device_code, ad.role, bs.code AS before_status, afs.code AS after_status,
              bu.unit_no AS before_unit, au.unit_no AS after_unit, ad.before_location_site_id, ad.after_location_site_id,
              ad.before_last_maintenance_date, ad.after_last_maintenance_date
       FROM dbo.activity_devices ad
       INNER JOIN dbo.devices d ON d.device_id = ad.device_id
       INNER JOIN dbo.device_statuses bs ON bs.status_id = ad.before_status_id
       INNER JOIN dbo.device_statuses afs ON afs.status_id = ad.after_status_id
       LEFT JOIN dbo.fleet_units bu ON bu.unit_id = ad.before_unit_id
       LEFT JOIN dbo.fleet_units au ON au.unit_id = ad.after_unit_id
       WHERE ad.activity_id = @id ORDER BY ad.role, d.device_code`
    );
  const detail = await request(conn)
    .input("id", sql.UniqueIdentifier, activityId)
    .query(`SELECT * FROM dbo.${DETAIL_TABLE[type]} WHERE activity_id = @id`);
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail.recordset[0] ?? {})) {
    if (k !== "activity_id") details[k] = v;
  }
  const zone = String(h.time_zone_id);
  return {
    activityId: uuid(h.activity_id),
    activityType: type,
    formNumber: String(h.form_number),
    siteId: Number(h.site_id),
    siteName: String(h.site_name),
    unitNo: h.unit_no === null ? null : String(h.unit_no),
    startedAt: formatWithOffset((h.started_at as Date).getTime(), Number(h.start_utc_offset_minutes)),
    finishedAt: formatWithOffset((h.finished_at as Date).getTime(), Number(h.finish_utc_offset_minutes)),
    timeZone: zone,
    timeZoneLabel: zoneLabel(zone),
    durationMinutes: Number(h.duration_minutes),
    shift: h.shift === null ? null : String(h.shift),
    technician: {
      userId: h.technician_user_id ? uuid(h.technician_user_id) : null,
      name: h.technician_name === null ? null : String(h.technician_name),
      nrp: h.technician_nrp === null ? null : String(h.technician_nrp),
    },
    groupLeader: h.group_leader === null ? null : String(h.group_leader),
    remarks: h.remarks === null ? null : String(h.remarks),
    devices: devices.recordset.map((d) => ({
      deviceId: uuid(d.device_id),
      deviceCode: String(d.device_code),
      role: String(d.role),
      before: {
        status: String(d.before_status),
        unitNo: d.before_unit === null ? null : String(d.before_unit),
        locationSiteId: d.before_location_site_id === null ? null : Number(d.before_location_site_id),
        lastMaintenanceDate: toYmd(d.before_last_maintenance_date),
      },
      after: {
        status: String(d.after_status),
        unitNo: d.after_unit === null ? null : String(d.after_unit),
        locationSiteId: d.after_location_site_id === null ? null : Number(d.after_location_site_id),
        lastMaintenanceDate: toYmd(d.after_last_maintenance_date),
      },
    })),
    details,
    photos: await listPhotos(activityId, conn),
    rowVersion: rowVersionHex(h.row_version),
    createdAt: (h.created_at as Date).toISOString(),
  };
}

export interface ActivityListQuery {
  page: number;
  pageSize: number;
  type?: ActivityType;
  dateFrom?: string;
  dateTo?: string;
  siteId?: number;
  deviceCode?: string;
  unitNo?: string;
}

export async function listActivities(user: AuthUser, query: ActivityListQuery) {
  const site = readSiteFilter(user, query.siteId);
  const pool = await getPool();
  const bind = (rq: ReturnType<typeof request>) =>
    rq
      .input("site", sql.Int, site)
      .input("type", sql.VarChar(15), query.type ?? null)
      .input("from", sql.Date, query.dateFrom ?? null)
      .input("to", sql.Date, query.dateTo ?? null)
      .input("device", sql.NVarChar(40), query.deviceCode ?? null)
      .input("unit", sql.NVarChar(30), query.unitNo ?? null);
  const where = `WHERE (@site IS NULL OR a.site_id = @site)
      AND (@type IS NULL OR a.activity_type = @type)
      AND (@from IS NULL OR CAST(a.started_at_local AS DATE) >= @from)
      AND (@to IS NULL OR CAST(a.started_at_local AS DATE) <= @to)
      AND (@unit IS NULL OR fu.unit_no = @unit)
      AND (@device IS NULL OR EXISTS (SELECT 1 FROM dbo.activity_devices x INNER JOIN dbo.devices xd ON xd.device_id = x.device_id
                                      WHERE x.activity_id = a.activity_id AND xd.device_code = @device))`;
  const total = await bind(request(pool)).query(
    `SELECT COUNT(*) AS n FROM dbo.activities a LEFT JOIN dbo.fleet_units fu ON fu.unit_id = a.unit_id ${where}`
  );
  const rows = await bind(request(pool))
    .input("offset", sql.Int, (query.page - 1) * query.pageSize)
    .input("size", sql.Int, query.pageSize)
    .query(
      `SELECT a.activity_id, a.activity_type, a.form_number, a.site_id, s.name AS site_name, fu.unit_no,
              a.started_at, a.start_utc_offset_minutes, a.finished_at, a.finish_utc_offset_minutes, a.time_zone_id,
              a.duration_minutes, a.technician_name,
              (SELECT STRING_AGG(xd.device_code, ',') FROM dbo.activity_devices x
               INNER JOIN dbo.devices xd ON xd.device_id = x.device_id WHERE x.activity_id = a.activity_id) AS device_codes
       FROM dbo.activities a
       INNER JOIN dbo.sites s ON s.site_id = a.site_id
       LEFT JOIN dbo.fleet_units fu ON fu.unit_id = a.unit_id
       ${where}
       ORDER BY a.started_at DESC, a.created_at DESC
       OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`
    );
  return {
    items: rows.recordset.map((a) => ({
      activityId: uuid(a.activity_id),
      activityType: String(a.activity_type),
      formNumber: String(a.form_number),
      siteId: Number(a.site_id),
      siteName: String(a.site_name),
      unitNo: a.unit_no === null ? null : String(a.unit_no),
      startedAt: formatWithOffset((a.started_at as Date).getTime(), Number(a.start_utc_offset_minutes)),
      finishedAt: formatWithOffset((a.finished_at as Date).getTime(), Number(a.finish_utc_offset_minutes)),
      timeZone: String(a.time_zone_id),
      timeZoneLabel: zoneLabel(String(a.time_zone_id)),
      durationMinutes: Number(a.duration_minutes),
      technicianName: a.technician_name === null ? null : String(a.technician_name),
      deviceCodes: a.device_codes ? String(a.device_codes).split(",") : [],
    })),
    total: Number(total.recordset[0].n),
    page: query.page,
    pageSize: query.pageSize,
  };
}

/* ------------------------------------------------- shared revert machinery */

interface SnapshotRow {
  device_id: string;
  role: string;
  before_status_id: number;
  after_status_id: number;
  before_unit_id: string | null;
  after_unit_id: string | null;
  before_location_site_id: number | null;
  after_location_site_id: number | null;
  before_last_maintenance_date: Date | null;
  after_last_maintenance_date: Date | null;
  device_code: string;
  site_id: number;
  status_id: number;
  current_unit_id: string | null;
  current_location_site_id: number | null;
  last_maintenance_date: Date | null;
  is_deleted: boolean;
}

/** The activity's device snapshots joined to the CURRENT device rows, all locked. */
async function loadSnapshots(tx: Db, activityId: string): Promise<SnapshotRow[]> {
  const r = await request(tx).input("id", sql.UniqueIdentifier, activityId).query(
    `SELECT ad.device_id, ad.role, ad.before_status_id, ad.after_status_id, ad.before_unit_id, ad.after_unit_id,
            ad.before_location_site_id, ad.after_location_site_id, ad.before_last_maintenance_date, ad.after_last_maintenance_date,
            d.device_code, d.site_id, d.status_id, d.current_unit_id, d.current_location_site_id, d.last_maintenance_date, d.is_deleted
     FROM dbo.activity_devices ad
     INNER JOIN dbo.devices d WITH (UPDLOCK, ROWLOCK) ON d.device_id = ad.device_id
     WHERE ad.activity_id = @id ORDER BY d.device_code`
  );
  if (r.recordset.length === 0) throw new ApiError(500, "INTERNAL_ERROR", "The transaction has no device snapshot.");
  return r.recordset as SnapshotRow[];
}

/** Design 6, rule 1: a later activity (by started_at, then created_at) on any of the devices blocks the change. */
async function findLaterActivity(tx: Db, activityId: string, deviceIds: string[], start: Date, created: Date): Promise<string | null> {
  if (deviceIds.length === 0) return null;
  const rq = request(tx)
    .input("id", sql.UniqueIdentifier, activityId)
    .input("start", sql.DateTime2(0), start)
    .input("created", sql.DateTime2(0), created);
  const names = deviceIds.map((d, i) => {
    rq.input(`d${i}`, sql.UniqueIdentifier, d);
    return `@d${i}`;
  });
  const r = await rq.query(
    `SELECT TOP (1) a2.form_number
     FROM dbo.activity_devices ad2
     INNER JOIN dbo.activities a2 ON a2.activity_id = ad2.activity_id
     WHERE a2.activity_id <> @id AND ad2.device_id IN (${names.join(", ")})
       AND (a2.started_at > @start OR (a2.started_at = @start AND a2.created_at > @created))
     ORDER BY a2.started_at, a2.created_at`
  );
  return r.recordset[0] ? String(r.recordset[0].form_number) : null;
}

type Side = "before" | "after";
const stateFromSnapshot = (r: SnapshotRow, side: Side) => {
  const unit = side === "before" ? r.before_unit_id : r.after_unit_id;
  const loc = side === "before" ? r.before_location_site_id : r.after_location_site_id;
  const lm = side === "before" ? r.before_last_maintenance_date : r.after_last_maintenance_date;
  return {
    statusId: Number(side === "before" ? r.before_status_id : r.after_status_id),
    unitId: unit ? uuid(unit) : null,
    locationSiteId: loc === null ? null : Number(loc),
    lastMaintenanceDate: toYmd(lm),
  };
};

/** Rules 0, 1 and 7 of design 6, evaluated before any revert (later activity first, so its form number is reported). */
async function assertRevertible(tx: Db, activityId: string, start: Date, created: Date, rows: SnapshotRow[]): Promise<void> {
  const later = await findLaterActivity(tx, activityId, rows.map((r) => uuid(r.device_id)), start, created);
  if (later) {
    throw err.conflict("LATER_ACTIVITY_EXISTS", `This transaction cannot be changed because a later activity (${later}) exists for the same device.`);
  }
  for (const r of rows) {
    if (r.is_deleted) throw err.conflict("DEVICE_ARCHIVED", `Device ${r.device_code} is archived; this transaction cannot be changed.`);
    const current = {
      statusId: Number(r.status_id),
      unitId: r.current_unit_id ? uuid(r.current_unit_id) : null,
      locationSiteId: r.current_location_site_id === null ? null : Number(r.current_location_site_id),
      lastMaintenanceDate: toYmd(r.last_maintenance_date),
    };
    if (!matchesAfterSnapshot(current, stateFromSnapshot(r, "after"))) {
      throw err.conflict("DEVICE_STATE_CHANGED", `Device ${r.device_code} changed after this transaction; it cannot be rolled back safely.`);
    }
  }
}

/** Restore the COMPLETE previous state (status, Unit, location, last maintenance date) of every device. */
async function restoreDevices(tx: Db, activityId: string, rows: SnapshotRow[], actor: AuthUser): Promise<void> {
  for (const r of rows) {
    const beforeUnit = r.before_unit_id ? uuid(r.before_unit_id) : null;
    if (!beforeUnit) continue;
    // Only a device OUTSIDE this activity blocks the rollback: the activity's own devices are restored in the same
    // operation (for example the replacement device that currently holds the Unit is cleared first).
    const occ = await request(tx)
      .input("u", sql.UniqueIdentifier, beforeUnit)
      .input("act", sql.UniqueIdentifier, activityId)
      .query(
        `SELECT TOP (1) device_id FROM dbo.devices
         WHERE current_unit_id = @u AND device_id NOT IN (SELECT device_id FROM dbo.activity_devices WHERE activity_id = @act)`
      );
    if (occ.recordset[0]) throw err.conflict("UNIT_OCCUPIED", "The Unit is now used by another device; the transaction cannot be rolled back.");
  }
  // Clear first, then re-assign, so a Unit swapped inside a Replacement never collides.
  for (const phase of ["clear", "set"] as const) {
    for (const r of rows) {
      const beforeUnit = r.before_unit_id ? uuid(r.before_unit_id) : null;
      if ((phase === "clear") !== (beforeUnit === null)) continue;
      const b = stateFromSnapshot(r, "before");
      const a = stateFromSnapshot(r, "after");
      if (matchesAfterSnapshot(b, a)) continue; // e.g. a Troubleshoot never changed the device
      await request(tx)
        .input("id", sql.UniqueIdentifier, r.device_id)
        .input("status", sql.Int, b.statusId)
        .input("unit", sql.UniqueIdentifier, b.unitId)
        .input("loc", sql.Int, b.locationSiteId)
        .input("lm", sql.Date, b.lastMaintenanceDate)
        .input("actor", sql.UniqueIdentifier, actor.userId)
        .query(
          `UPDATE dbo.devices SET status_id = @status, current_unit_id = @unit, current_location_site_id = @loc,
                  last_maintenance_date = @lm, updated_at = SYSUTCDATETIME(), updated_by = @actor
           WHERE device_id = @id`
        );
    }
  }
}

/* ------------------------------------------------------------------- delete */

/**
 * Super Admin deletes a transaction: restores the COMPLETE previous device state, refuses if a later activity
 * exists (or the state changed since), writes audit rows and one transaction_deleted event per device, all in
 * one SQL transaction (design 6, rules 0-2, 4, 7). Photo files go to quarantine only after COMMIT (rule 5).
 */
export async function deleteActivity(ctx: ServiceCtx, activityId: string): Promise<{ deleted: true; formNumber: string }> {
  let files: { photoId: string; storagePath: string }[] = [];
  const result = await withTransaction(async (tx) => {
    const head = await request(tx).input("id", sql.UniqueIdentifier, activityId).query(
      `SELECT a.activity_id, a.activity_type, a.form_number, a.site_id, a.started_at, a.created_at, a.time_zone_id,
              a.start_utc_offset_minutes, a.started_at_local
       FROM dbo.activities a WITH (UPDLOCK, ROWLOCK) WHERE a.activity_id = @id`
    );
    const h = head.recordset[0];
    if (!h) throw err.notFound("Transaction not found.");
    const type = String(h.activity_type) as ActivityType;
    const formNumber = String(h.form_number);
    const rows = await loadSnapshots(tx, activityId);
    await assertRevertible(tx, activityId, h.started_at as Date, h.created_at as Date, rows);
    await restoreDevices(tx, activityId, rows, ctx.user);
    files = await photoFilesOf(tx, activityId);

    // Audit: the activity DELETE row and one device-level row per device (backing that device's event).
    const group = randomUUID();
    await writeAudit(tx, {
      actor: ctx.user,
      siteId: Number(h.site_id),
      tableName: type as AuditTable,
      recordId: formNumber,
      entityId: activityId,
      operation: "DELETE",
      action: "transaction_delete",
      oldValues: { form_number: formNumber, activity_type: type, photo_count: files.length },
      changeGroupId: group,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    for (const r of rows) {
      const auditId = await writeAudit(tx, {
        actor: ctx.user,
        siteId: Number(r.site_id),
        tableName: "device",
        recordId: String(r.device_code),
        entityId: uuid(r.device_id),
        operation: "UPDATE",
        action: "transaction_delete",
        oldValues: { status: statusCode(Number(r.after_status_id)), unit_id: r.after_unit_id ? uuid(r.after_unit_id) : null },
        newValues: { status: statusCode(Number(r.before_status_id)), unit_id: r.before_unit_id ? uuid(r.before_unit_id) : null, deleted_form_number: formNumber },
        changeGroupId: group,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      await writeDeviceEvent(tx, {
        deviceId: uuid(r.device_id),
        type: "transaction_deleted",
        actor: ctx.user,
        siteId: Number(r.site_id),
        auditId,
        deleted: {
          activityId,
          activityType: type,
          formNumber,
          role: String(r.role) as "subject" | "old" | "new",
          startedAtLocal: h.started_at_local as Date,
          timeZoneId: String(h.time_zone_id),
        },
      });
    }
    await request(tx).input("id", sql.UniqueIdentifier, activityId).query(`DELETE FROM dbo.activities WHERE activity_id = @id`);
    return { deleted: true as const, formNumber };
  });
  await quarantineFiles(files); // after COMMIT only
  return result;
}

/* --------------------------------------------------------------------- edit */

type DetailKind = "text" | "status";
const DETAIL_COLUMNS: Record<ActivityType, Record<string, { column: string; kind: DetailKind }>> = {
  installation: {
    sourcePower: { column: "source_power", kind: "text" },
    spmVersion: { column: "spm_version", kind: "text" },
    area: { column: "area", kind: "text" },
    locationDetail: { column: "location_detail", kind: "text" },
    ipAddress: { column: "ip_address", kind: "text" },
    ipCpe: { column: "ip_cpe", kind: "text" },
    ipVhms: { column: "ip_vhms", kind: "text" },
    notes: { column: "notes", kind: "text" },
  },
  replacement: {
    sourcePower: { column: "source_power", kind: "text" },
    spmVersion: { column: "spm_version", kind: "text" },
    area: { column: "area", kind: "text" },
    locationDetail: { column: "location_detail", kind: "text" },
    ipAddress: { column: "ip_address", kind: "text" },
    ipCpe: { column: "ip_cpe", kind: "text" },
    ipVhms: { column: "ip_vhms", kind: "text" },
    oldFinalCondition: { column: "old_final_status_id", kind: "status" },
  },
  removal: {
    reason: { column: "reason", kind: "text" },
    reasonDetail: { column: "reason_detail", kind: "text" },
    finalCondition: { column: "final_status_id", kind: "status" },
  },
  troubleshoot: {
    componentType: { column: "component_type", kind: "text" },
    issue: { column: "issue", kind: "text" },
    actionTaken: { column: "action_taken", kind: "text" },
    healthCheckResult: { column: "health_check_result", kind: "text" },
  },
};

/** Fields whose change affects device state, the Unit, time ordering or the last maintenance date (design 6, rule 3). */
export const MASTER_FIELDS: readonly string[] = ["startedAt", "finishedAt", "deviceCode", "oldDeviceCode", "newDeviceCode", "unitNo", "finalCondition", "oldFinalCondition"];

export interface EditPatch extends Record<string, unknown> {
  rowVersion: string;
}

const norm = (v: unknown): unknown => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : (v ?? null));

/** Which fields of the patch really differ from the current values (a patch that repeats a value changes nothing). */
export function diffPatch(current: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => k !== "rowVersion" && patch[k] !== undefined && norm(patch[k]) !== norm(current[k]));
}

/** Master (device-affecting) changes need a revert + re-validate + re-apply; anything else touches no device. */
export function isMasterEdit(changed: readonly string[]): boolean {
  return changed.some((k) => MASTER_FIELDS.includes(k));
}

const localString = (d: Date): string => d.toISOString().slice(0, 16);

async function currentInput(tx: Db, type: ActivityType, h: Record<string, unknown>, rows: SnapshotRow[]): Promise<Record<string, unknown>> {
  const cur: Record<string, unknown> = {
    startedAt: localString(h.started_at_local as Date),
    finishedAt: localString(h.finished_at_local as Date),
    shift: h.shift ?? null,
    groupLeader: h.group_leader ?? null,
    remarks: h.remarks ?? null,
  };
  if (h.unit_id) {
    const u = await request(tx).input("id", sql.UniqueIdentifier, h.unit_id).query(`SELECT unit_no FROM dbo.fleet_units WHERE unit_id = @id`);
    cur.unitNo = u.recordset[0] ? String(u.recordset[0].unit_no) : null;
  }
  const byRole = (role: string) => rows.find((r) => r.role === role)?.device_code ?? null;
  if (type === "replacement") {
    cur.oldDeviceCode = byRole("old");
    cur.newDeviceCode = byRole("new");
  } else {
    cur.deviceCode = byRole("subject");
  }
  const d = await request(tx).input("id", sql.UniqueIdentifier, h.activity_id).query(`SELECT * FROM dbo.${DETAIL_TABLE[type]} WHERE activity_id = @id`);
  const det = (d.recordset[0] ?? {}) as Record<string, unknown>;
  for (const [field, def] of Object.entries(DETAIL_COLUMNS[type])) {
    const v = det[def.column];
    cur[field] = def.kind === "status" ? statusCode(Number(v)) : (v ?? null);
  }
  return cur;
}

function builderFor(type: ActivityType, ctx: ServiceCtx, input: Record<string, unknown>): BuildFn {
  switch (type) {
    case "installation":
      return buildInstallation(ctx, input as unknown as InstallationInput);
    case "replacement":
      return buildReplacement(ctx, input as unknown as ReplacementInput);
    case "removal":
      return buildRemoval(ctx, input as unknown as RemovalInput);
    default:
      return buildTroubleshoot(ctx, input as unknown as TroubleshootInput);
  }
}

/**
 * Super Admin edits a transaction (design 6, rules 0-4, 6, 7; design 7 PATCH).
 * - Metadata-only edits touch no device and skip the revert rules.
 * - Master edits revert every device to its before-snapshot, re-validate the new values exactly as a creation would,
 *   re-apply them and rewrite the snapshots, all in ONE SQL transaction; any failure rolls everything back.
 * - A patch that changes nothing writes nothing (no audit row).
 * The Site and the time zone are never editable; times are re-resolved with the activity's SNAPSHOTTED zone and only
 * a time that actually changed gets a new offset. The form number is kept.
 */
export async function editActivity(ctx: ServiceCtx, type: ActivityType, activityId: string, patch: EditPatch): Promise<ActivityDto> {
  await withTransaction(async (tx) => {
    const head = await request(tx).input("id", sql.UniqueIdentifier, activityId).query(
      `SELECT a.activity_id, a.activity_type, a.form_number, a.site_id, a.unit_id, a.started_at, a.finished_at, a.created_at,
              a.time_zone_id, a.start_utc_offset_minutes, a.finish_utc_offset_minutes, a.started_at_local, a.finished_at_local,
              a.shift, a.group_leader, a.remarks, a.row_version
       FROM dbo.activities a WITH (UPDLOCK, ROWLOCK) WHERE a.activity_id = @id`
    );
    const h = head.recordset[0];
    if (!h || h.activity_type !== type) throw err.notFound("Transaction not found.");
    if (rowVersionHex(h.row_version).toLowerCase() !== patch.rowVersion.toLowerCase()) {
      throw err.conflict("STALE_VERSION", "The transaction was changed by someone else. Reload and try again.");
    }
    const formNumber = String(h.form_number);
    const siteId = Number(h.site_id);
    const rows = await loadSnapshots(tx, activityId);
    const current = await currentInput(tx, type, h, rows);
    const changed = diffPatch(current, patch);
    if (changed.length === 0) return; // nothing changed: no write, no audit row
    const master = isMasterEdit(changed);

    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(current)) if (v !== null && v !== undefined) next[k] = v;
    for (const k of changed) {
      const v = norm(patch[k]);
      if (v === null) delete next[k];
      else next[k] = v;
    }
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const k of changed) {
      oldValues[k] = current[k] ?? null;
      newValues[k] = norm(patch[k]);
    }

    const sets: string[] = [];
    const rq = request(tx)
      .input("id", sql.UniqueIdentifier, activityId)
      .input("rv", sql.VarBinary(8), rowVersionBuffer(patch.rowVersion))
      .input("actor", sql.UniqueIdentifier, ctx.user.userId);
    const deviceAudit: { code: string; deviceId: string; siteId: number; old: Record<string, unknown>; next: Record<string, unknown> }[] = [];

    if (master) {
      await assertRevertible(tx, activityId, h.started_at as Date, h.created_at as Date, rows);
      await restoreDevices(tx, activityId, rows, ctx.user);

      // Times: re-resolved in the SNAPSHOTTED zone; an unchanged time keeps its stored instant and offset.
      const site = { ...(await loadSite(tx, siteId)), timeZoneId: String(h.time_zone_id) };
      const startChanged = changed.includes("startedAt");
      const finishChanged = changed.includes("finishedAt");
      const start = startChanged
        ? localToUtc(parseLocalDateTime(String(next.startedAt), "startedAt"), site.timeZoneId)
        : { utcMs: (h.started_at as Date).getTime(), offsetMinutes: Number(h.start_utc_offset_minutes) };
      const finish = finishChanged
        ? localToUtc(parseLocalDateTime(String(next.finishedAt), "finishedAt"), site.timeZoneId)
        : { utcMs: (h.finished_at as Date).getTime(), offsetMinutes: Number(h.finish_utc_offset_minutes) };
      if (finish.utcMs < start.utcMs) throw err.unprocessable("FINISH_BEFORE_START", "finishedAt must not be before startedAt.");
      if (finishChanged && finish.utcMs > Date.now() + getConfig().clockSkewMs) {
        throw err.unprocessable("FINISH_IN_FUTURE", "finishedAt cannot be in the future: work is recorded after it is finished.");
      }
      const times: Times = {
        startUtc: new Date(start.utcMs),
        finishUtc: new Date(finish.utcMs),
        startOffset: start.offsetMinutes,
        finishOffset: finish.offsetMinutes,
        minutes: durationMinutes(start.utcMs, finish.utcMs),
      };

      // Re-validate as a creation would: the same builder and transition rules, on the restored devices.
      const spec = await builderFor(type, ctx, next)(tx, site, times, { date: localDate(times.finishUtc.getTime(), times.finishOffset) });

      // Rule 6: the edited start time must keep this activity the latest one on every device it now involves.
      const later = await findLaterActivity(tx, activityId, spec.steps.map((s) => s.device.deviceId), times.startUtc, h.created_at as Date);
      if (later) throw err.conflict("LATER_ACTIVITY_EXISTS", `The edit would place this transaction before a later activity (${later}) on the same device.`);

      // Device audit rows: state BEFORE the edit (this activity's after-snapshot) versus the state AFTER it.
      const oldAfter = new Map(rows.map((r) => [uuid(r.device_id), stateFromSnapshot(r, "after")]));
      const oldBefore = new Map(rows.map((r) => [uuid(r.device_id), stateFromSnapshot(r, "before")]));
      const newAfter = new Map(spec.steps.map((s) => [s.device.deviceId, s.plan.after]));
      const newBefore = new Map(spec.steps.map((s) => [s.device.deviceId, s.plan.before]));
      const meta = new Map<string, { code: string; siteId: number }>();
      for (const r of rows) meta.set(uuid(r.device_id), { code: String(r.device_code), siteId: Number(r.site_id) });
      for (const s of spec.steps) meta.set(s.device.deviceId, { code: s.device.deviceCode, siteId: s.device.siteId });
      for (const [deviceId, m] of meta) {
        const was = oldAfter.get(deviceId) ?? newBefore.get(deviceId);
        const now = newAfter.get(deviceId) ?? oldBefore.get(deviceId);
        if (!was || !now || matchesAfterSnapshot(was, now)) continue;
        deviceAudit.push({
          code: m.code,
          deviceId,
          siteId: m.siteId,
          old: { status: statusCode(was.statusId), unit_id: was.unitId },
          next: { status: statusCode(now.statusId), unit_id: now.unitId, form_number: formNumber },
        });
      }

      // Rewrite the header times/unit, then the snapshots, then apply the new device states.
      sets.push("unit_id = @unit", "started_at = @start", "finished_at = @finish", "start_utc_offset_minutes = @so", "finish_utc_offset_minutes = @fo", "duration_minutes = @dur");
      rq.input("unit", sql.UniqueIdentifier, spec.unit?.unitId ?? null)
        .input("start", sql.DateTime2(0), times.startUtc)
        .input("finish", sql.DateTime2(0), times.finishUtc)
        .input("so", sql.SmallInt, times.startOffset)
        .input("fo", sql.SmallInt, times.finishOffset)
        .input("dur", sql.Int, times.minutes);
      await request(tx).input("id", sql.UniqueIdentifier, activityId).query(`DELETE FROM dbo.activity_devices WHERE activity_id = @id`);
      await insertSnapshots(tx, activityId, spec.steps);
      if (type !== "troubleshoot") for (const step of spec.steps) await applyDeviceState(tx, step, ctx.user);
      if (type === "installation" && changed.includes("unitNo") && spec.unit) {
        await request(tx)
          .input("act", sql.UniqueIdentifier, activityId)
          .input("u", sql.UniqueIdentifier, spec.unit.unitId)
          .query(
            `UPDATE d SET equipment_type_id = fu.equipment_type_id, egi = fu.egi
             FROM dbo.installation_details d CROSS JOIN dbo.fleet_units fu WHERE d.activity_id = @act AND fu.unit_id = @u`
          );
      }
    }

    // Header text fields.
    const headerFields: [string, string, ReturnType<typeof sql.VarChar> | ReturnType<typeof sql.NVarChar>][] = [
      ["shift", "shift", sql.VarChar(10)],
      ["groupLeader", "group_leader", sql.NVarChar(120)],
      ["remarks", "remarks", sql.NVarChar(1000)],
    ];
    for (const [field, column, type_] of headerFields) {
      if (!changed.includes(field)) continue;
      sets.push(`${column} = @h_${field}`);
      rq.input(`h_${field}`, type_, norm(patch[field]));
    }
    const upd = await rq.query(
      `UPDATE dbo.activities SET ${sets.length ? sets.join(", ") + "," : ""} updated_at = SYSUTCDATETIME(), updated_by = @actor
       WHERE activity_id = @id AND row_version = @rv`
    );
    if (upd.rowsAffected[0] !== 1) throw err.conflict("STALE_VERSION", "The transaction was changed by someone else. Reload and try again.");

    // Detail columns (metadata and final condition).
    const dq = request(tx).input("act", sql.UniqueIdentifier, activityId);
    const dsets: string[] = [];
    for (const k of changed) {
      const def = DETAIL_COLUMNS[type][k];
      if (!def) continue;
      dsets.push(`${def.column} = @x_${k}`);
      const value = norm(patch[k]);
      if (def.kind === "status") dq.input(`x_${k}`, sql.Int, STATUS[String(value) as keyof typeof STATUS]);
      else dq.input(`x_${k}`, sql.NVarChar(1000), value);
    }
    if (dsets.length) await dq.query(`UPDATE dbo.${DETAIL_TABLE[type]} SET ${dsets.join(", ")} WHERE activity_id = @act`);

    const group = randomUUID();
    await writeAudit(tx, {
      actor: ctx.user,
      siteId,
      tableName: type as AuditTable,
      recordId: formNumber,
      entityId: activityId,
      operation: "UPDATE",
      action: "transaction_update",
      oldValues,
      newValues,
      changeGroupId: group,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    for (const d of deviceAudit) {
      await writeAudit(tx, {
        actor: ctx.user,
        siteId: d.siteId,
        tableName: "device",
        recordId: d.code,
        entityId: d.deviceId,
        operation: "UPDATE",
        action: "transaction_update",
        oldValues: d.old,
        newValues: d.next,
        changeGroupId: group,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
    }
  });
  const dto = await getActivity(ctx.user, activityId);
  if (!dto) throw err.notFound("Transaction not found.");
  return dto;
}
