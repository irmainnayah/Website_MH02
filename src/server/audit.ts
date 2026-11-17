// Audit log and device events (design 3.15 and 3.18). Every write goes through these helpers INSIDE the
// same SQL transaction as the change it describes, so both commit or neither does.

import { request, sql } from "./db.ts";
import type { Db } from "./db.ts";
import type { AuthUser } from "./scope.ts";

export type AuditTable = "installation" | "replacement" | "removal" | "troubleshoot" | "device" | "user_management";
export type AuditOperation = "INSERT" | "UPDATE" | "DELETE";
export type AuditAction =
  | "device_register"
  | "device_update"
  | "device_override"
  | "device_archive"
  | "transaction_create"
  | "transaction_update"
  | "transaction_delete"
  | "user_create"
  | "user_update"
  | "user_deactivate"
  | "user_password_reset";

export interface AuditEntry {
  actor: AuthUser;
  siteId: number | null;
  tableName: AuditTable;
  /** Human-readable label only (form number, device code, NRP); never a join key. */
  recordId: string;
  /** Immutable internal id of the affected row. */
  entityId: string;
  operation: AuditOperation;
  action: AuditAction;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
  changeGroupId: string;
  requestId: string;
  ip?: string | null;
}

const SECRET_KEY = /pass(word)?|hash|secret|token/i;

/** Passwords, hashes and tokens must never reach the audit log: drop any such key, at any depth. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!SECRET_KEY.test(k)) out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function toJson(values: Record<string, unknown> | null | undefined): string | null {
  return values ? JSON.stringify(redact(values)) : null;
}

/** Insert one audit row and return its audit_id (needed by device_events.audit_id). */
export async function writeAudit(db: Db, e: AuditEntry): Promise<number> {
  const result = await request(db)
    .input("actor", sql.UniqueIdentifier, e.actor.userId)
    .input("actorName", sql.NVarChar(120), e.actor.name)
    .input("site", sql.Int, e.siteId)
    .input("table", sql.VarChar(30), e.tableName)
    .input("recordId", sql.NVarChar(60), e.recordId.slice(0, 60))
    .input("entity", sql.UniqueIdentifier, e.entityId)
    .input("op", sql.VarChar(6), e.operation)
    .input("oldV", sql.NVarChar(sql.MAX), toJson(e.oldValues))
    .input("newV", sql.NVarChar(sql.MAX), toJson(e.newValues))
    .input("group", sql.UniqueIdentifier, e.changeGroupId)
    .input("ip", sql.VarChar(45), e.ip ?? null)
    .input("req", sql.VarChar(64), e.requestId)
    .input("action", sql.VarChar(30), e.action)
    .input("reason", sql.NVarChar(500), e.reason ?? null).query(
    `INSERT INTO dbo.audit_log
       (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation,
        old_values, new_values, change_group_id, ip_address, request_id, action, reason)
     OUTPUT INSERTED.audit_id
     VALUES (@actor, @actorName, @site, @table, @recordId, @entity, @op,
             @oldV, @newV, @group, @ip, @req, @action, @reason)`
  );
  return Number(result.recordset[0].audit_id);
}

export type DeviceEventType = "registered" | "details_updated" | "soft_deleted" | "transaction_deleted" | "device_override";

export interface DeviceEventInput {
  deviceId: string;
  type: DeviceEventType;
  actor: AuthUser;
  siteId: number;
  auditId: number;
  summary?: string | null;
  reason?: string | null;
  override?: { beforeStatusId: number; afterStatusId: number; beforeUnitId: string | null; afterUnitId: string | null };
  deleted?: {
    activityId: string;
    activityType: string;
    formNumber: string;
    role: "subject" | "old" | "new";
    startedAtLocal: Date;
    timeZoneId: string;
  };
}

/** Insert one append-only device event, linked to its audit row. */
export async function writeDeviceEvent(db: Db, e: DeviceEventInput): Promise<void> {
  await request(db)
    .input("device", sql.UniqueIdentifier, e.deviceId)
    .input("type", sql.VarChar(30), e.type)
    .input("actor", sql.UniqueIdentifier, e.actor.userId)
    .input("actorName", sql.NVarChar(120), e.actor.name)
    .input("site", sql.Int, e.siteId)
    .input("audit", sql.BigInt, e.auditId)
    .input("summary", sql.NVarChar(200), e.summary ? e.summary.slice(0, 200) : null)
    .input("reason", sql.NVarChar(500), e.reason ?? null)
    .input("bs", sql.Int, e.override?.beforeStatusId ?? null)
    .input("as", sql.Int, e.override?.afterStatusId ?? null)
    .input("bu", sql.UniqueIdentifier, e.override?.beforeUnitId ?? null)
    .input("au", sql.UniqueIdentifier, e.override?.afterUnitId ?? null)
    .input("sAct", sql.UniqueIdentifier, e.deleted?.activityId ?? null)
    .input("sType", sql.VarChar(15), e.deleted?.activityType ?? null)
    .input("sForm", sql.NVarChar(30), e.deleted?.formNumber ?? null)
    .input("sRole", sql.VarChar(10), e.deleted?.role ?? null)
    .input("sStart", sql.DateTime2(0), e.deleted?.startedAtLocal ?? null)
    .input("sZone", sql.VarChar(50), e.deleted?.timeZoneId ?? null).query(
    `INSERT INTO dbo.device_events
       (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary, reason,
        before_status_id, after_status_id, before_unit_id, after_unit_id,
        source_activity_id, source_activity_type, source_form_number, source_role,
        source_started_at_local, source_time_zone_id)
     VALUES (@device, @type, @actor, @actorName, @site, @audit, @summary, @reason,
             @bs, @as, @bu, @au, @sAct, @sType, @sForm, @sRole, @sStart, @sZone)`
  );
}
