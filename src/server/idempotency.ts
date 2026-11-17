// Idempotency for creating transactions and devices (design 3.19). Keys are permanent, unique per user.
//
// Creation order inside ONE SQL transaction:
//   (0) transaction-owned sp_getapplock barrier on idem:{user}:{key}
//   (1) INSERT the key row with its resource columns NULL
//   (2..3) perform the business writes (form number, activity/device, audit, events, device updates)
//   (4) UPDATE the key row with the created resource id (and form number), @@ROWCOUNT must be 1
//   (5) verify, then COMMIT (done by withTransaction)
//
// Retry rules: a duplicate key (2627) means a COMMITTED row exists -> fresh locking read -> replay / 422 / 409.
// An applock timeout proves nothing -> 503 COMMIT_OUTCOME_UNKNOWN, nothing written. An ambiguous COMMIT is resolved
// only after the barrier is acquired and a READCOMMITTEDLOCK read completed.

import type { NextRequest } from "next/server";
import { getConfig } from "./config.ts";
import { ApiError, err } from "./errors.ts";
import { CommitOutcomeUnknownError, getPool, request, sql, uuid, withTransaction } from "./db.ts";
import type { Db } from "./db.ts";
import type { AuthUser } from "./scope.ts";

export type IdempotentKind = "installation" | "replacement" | "removal" | "troubleshoot" | "device";

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** The Idempotency-Key header is required on every creating POST. */
export function readIdempotencyKey(req: NextRequest): string {
  const key = req.headers.get("idempotency-key");
  if (!key || !KEY_PATTERN.test(key)) {
    throw err.badRequest("IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header of 16-64 characters (A-Z a-z 0-9 _ -) is required.");
  }
  return key;
}

export interface IdempotencyInput {
  user: AuthUser;
  key: string;
  kind: IdempotentKind;
  requestHash: string;
}

export interface Created {
  resourceId: string;
  /** Transaction keys only */
  formNumber?: string;
}

interface KeyRow {
  activityType: string;
  requestHash: string;
  activityId: string | null;
  formNumber: string | null;
  deviceId: string | null;
}

class DuplicateKeyError extends Error {
  constructor() {
    super("duplicate idempotency key");
    this.name = "DuplicateKeyError";
  }
}

const resourceName = (i: IdempotencyInput) => `idem:${i.user.userId}:${i.key}`;

/** Take the transaction-owned barrier. Returns false when it could not be acquired in time. */
export async function acquireApplock(db: Db, resource: string, timeoutMs: number): Promise<boolean> {
  const result = await request(db)
    .input("res", sql.NVarChar(255), resource)
    .input("t", sql.Int, timeoutMs)
    .output("rc", sql.Int)
    .query(
      `DECLARE @r INT;
       EXEC @r = sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @t;
       SET @rc = @r;`
    );
  return Number(result.output.rc) >= 0;
}

async function claimKey(tx: Db, i: IdempotencyInput): Promise<void> {
  try {
    await request(tx)
      .input("u", sql.UniqueIdentifier, i.user.userId)
      .input("k", sql.VarChar(64), i.key)
      .input("t", sql.VarChar(15), i.kind)
      .input("h", sql.Char(64), i.requestHash)
      .query(`INSERT INTO dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash) VALUES (@u, @k, @t, @h)`);
  } catch (error) {
    const n = (error as { number?: number }).number;
    if (n === 2627 || n === 2601) throw new DuplicateKeyError();
    throw error;
  }
}

async function populateKey(tx: Db, i: IdempotencyInput, created: Created): Promise<void> {
  const isDevice = i.kind === "device";
  const update = await request(tx)
    .input("u", sql.UniqueIdentifier, i.user.userId)
    .input("k", sql.VarChar(64), i.key)
    .input("id", sql.UniqueIdentifier, created.resourceId)
    .input("form", sql.NVarChar(30), created.formNumber ?? null)
    .query(
      isDevice
        ? `UPDATE dbo.idempotency_keys SET device_id = @id WHERE user_id = @u AND idempotency_key = @k`
        : `UPDATE dbo.idempotency_keys SET activity_id = @id, form_number = @form WHERE user_id = @u AND idempotency_key = @k`
    );
  if (update.rowsAffected[0] !== 1) {
    throw new Error("IDEMPOTENCY_POPULATE_FAILED");
  }
  // Verify, still inside the transaction, that the resource row exists and the key row is fully populated.
  const check = await request(tx)
    .input("u", sql.UniqueIdentifier, i.user.userId)
    .input("k", sql.VarChar(64), i.key)
    .query(
      isDevice
        ? `SELECT COUNT(*) AS n FROM dbo.idempotency_keys k JOIN dbo.devices d ON d.device_id = k.device_id
           WHERE k.user_id = @u AND k.idempotency_key = @k`
        : `SELECT COUNT(*) AS n FROM dbo.idempotency_keys k JOIN dbo.activities a ON a.activity_id = k.activity_id
           WHERE k.user_id = @u AND k.idempotency_key = @k AND k.form_number IS NOT NULL`
    );
  if (Number(check.recordset[0].n) !== 1) {
    throw new Error("IDEMPOTENCY_VERIFY_FAILED");
  }
}

/** Locking read of the key row (READCOMMITTEDLOCK: correct with or without RCSI). */
async function readKey(db: Db, i: IdempotencyInput): Promise<KeyRow | null> {
  const result = await request(db)
    .input("u", sql.UniqueIdentifier, i.user.userId)
    .input("k", sql.VarChar(64), i.key)
    .query(
      `SELECT activity_type, request_hash, activity_id, form_number, device_id
       FROM dbo.idempotency_keys WITH (READCOMMITTEDLOCK)
       WHERE user_id = @u AND idempotency_key = @k`
    );
  const r = result.recordset[0];
  if (!r) return null;
  return {
    activityType: String(r.activity_type),
    requestHash: String(r.request_hash).trim(),
    activityId: r.activity_id ? uuid(r.activity_id) : null,
    formNumber: r.form_number ? String(r.form_number) : null,
    deviceId: r.device_id ? uuid(r.device_id) : null,
  };
}

export interface IdempotentResult<R> {
  /** true when an earlier identical request is replayed (HTTP 200 + Idempotency-Replayed: true) */
  replayed: boolean;
  data: R;
}

export interface RunOptions<R> {
  input: IdempotencyInput;
  /** Writes everything inside the transaction and returns the created resource. */
  perform: (tx: import("mssql").Transaction) => Promise<Created>;
  /** Current representation of the resource, or null if it no longer exists / is not visible to the caller. */
  load: (resourceId: string) => Promise<R | null>;
  /** Error code when the original resource is gone or no longer visible. */
  goneCode: "ALREADY_PROCESSED_AND_DELETED" | "ALREADY_PROCESSED_AND_ARCHIVED";
}

async function replayFromRow<R>(row: KeyRow, opts: RunOptions<R>): Promise<IdempotentResult<R>> {
  if (row.activityType !== opts.input.kind || row.requestHash !== opts.input.requestHash) {
    throw err.unprocessable("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
  }
  const resourceId = opts.input.kind === "device" ? row.deviceId : row.activityId;
  if (!resourceId || (opts.input.kind !== "device" && !row.formNumber)) {
    // Invariant (e): a committed key row with unpopulated columns is an integrity incident.
    console.error("[mh02] IDEMPOTENCY_STATE_CORRUPT for a committed key row");
    throw new ApiError(500, "IDEMPOTENCY_STATE_CORRUPT", "The stored idempotency state is inconsistent.");
  }
  const data = await opts.load(resourceId);
  if (!data) {
    throw err.conflict(opts.goneCode, "The original request was processed, but its result no longer exists or is no longer visible.");
  }
  return { replayed: true, data };
}

/** Resolve a duplicate-key error: the other transaction COMMITTED, so the key row must exist. */
async function resolveDuplicate<R>(opts: RunOptions<R>): Promise<IdempotentResult<R>> {
  const pool = await getPool();
  const row = await readKey(pool, opts.input);
  if (!row) {
    // The row cannot have vanished unless someone deleted it (keys are permanent): integrity incident.
    console.error("[mh02] IDEMPOTENCY_OUTCOME_UNKNOWN: key missing after a duplicate-key error");
    throw err.conflict(
      "IDEMPOTENCY_OUTCOME_UNKNOWN",
      "The request may already have been processed. Check the Activity Log before submitting again."
    );
  }
  return replayFromRow(row, opts);
}

/** Resolve an ambiguous COMMIT: only after the barrier is held and a locking read completed may we decide. */
async function resolveAmbiguous<R>(opts: RunOptions<R>): Promise<IdempotentResult<R>> {
  const cfg = getConfig();
  const delays = [200, 600, 1500];
  let lastError: unknown;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    try {
      const row = await withTransaction(async (tx) => {
        const held = await acquireApplock(tx, resourceName(opts.input), cfg.idempotencyVerifyTimeoutMs);
        if (!held) {
          throw err.unavailable("COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed yet. Retry with the same Idempotency-Key.");
        }
        return readKey(tx, opts.input);
      });
      if (!row) {
        // The barrier proved the original transaction ended and no key row exists: it did NOT commit.
        throw err.unavailable("TRANSACTION_NOT_COMMITTED", "The request was not saved. You can retry with the same Idempotency-Key.", 1);
      }
      return await replayFromRow(row, opts);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  void lastError;
  throw err.unavailable("COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Retry with the same Idempotency-Key.");
}

export async function runIdempotent<R>(opts: RunOptions<R>): Promise<IdempotentResult<R>> {
  const cfg = getConfig();
  try {
    const created = await withTransaction(async (tx) => {
      const held = await acquireApplock(tx, resourceName(opts.input), cfg.idempotencyLockTimeoutMs);
      if (!held) {
        // An applock timeout proves nothing: do not read, do not conclude, write nothing.
        throw err.unavailable("COMMIT_OUTCOME_UNKNOWN", "Another request with the same Idempotency-Key is still running. Retry with the same key.");
      }
      await claimKey(tx, opts.input);
      const result = await opts.perform(tx);
      await populateKey(tx, opts.input, result);
      return result;
    });
    const data = await opts.load(created.resourceId);
    if (!data) throw new ApiError(500, "INTERNAL_ERROR", "The saved record could not be loaded.");
    return { replayed: false, data };
  } catch (error) {
    if (error instanceof DuplicateKeyError) return resolveDuplicate(opts);
    if (error instanceof CommitOutcomeUnknownError) return resolveAmbiguous(opts);
    throw error;
  }
}
