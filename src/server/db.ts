// SQL Server access (mssql). Parameterized queries only; one SQL transaction per business operation.
// Server-side only. Never import this from a client component.

import sql from "mssql";
import { ApiError, err } from "./errors.ts";
import { getConfig } from "./config.ts";

export type Db = sql.ConnectionPool | sql.Transaction;

const globalForPool = globalThis as unknown as { __mh02Pool?: Promise<sql.ConnectionPool> };

/** Shared pool (kept on globalThis so Next.js hot reload does not open a new pool every time). */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!globalForPool.__mh02Pool) {
    const { db } = getConfig();
    const pool = new sql.ConnectionPool({
      server: db.server,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password,
      connectionTimeout: 8000,
      requestTimeout: 20000,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: db.encrypt,
        trustServerCertificate: db.trustServerCertificate,
        enableArithAbort: true,
        useUTC: true,
      },
    });
    pool.on("error", () => {
      // A pool-level error invalidates the pool; the next request creates a new one.
      globalForPool.__mh02Pool = undefined;
    });
    globalForPool.__mh02Pool = pool.connect().catch((error: unknown) => {
      globalForPool.__mh02Pool = undefined;
      throw error;
    });
  }
  return globalForPool.__mh02Pool;
}

export function request(db: Db): sql.Request {
  // The type declarations only list overloads for each kind; both are accepted at runtime.
  return db instanceof sql.Transaction ? new sql.Request(db) : new sql.Request(db);
}

/** Thrown when COMMIT fails in a way that does not prove the transaction was rolled back. */
export class CommitOutcomeUnknownError extends Error {
  constructor() {
    super("The outcome of COMMIT is unknown.");
    this.name = "CommitOutcomeUnknownError";
  }
}

/** Errors with a server-side error number (EREQUEST) prove the statement failed; anything else is ambiguous. */
function isDefinitiveSqlError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "EREQUEST";
}

/**
 * Run `fn` in one READ COMMITTED transaction with XACT_ABORT ON.
 * - Any error rolls the transaction back and is re-thrown.
 * - A COMMIT failure that does not prove rollback (lost connection, timeout) throws
 *   CommitOutcomeUnknownError so the caller can resolve it (design 3.19) instead of assuming rollback.
 */
export async function withTransaction<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  let result: T;
  try {
    await request(tx).query("SET XACT_ABORT ON");
    result = await fn(tx);
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // The transaction may already be rolled back by the server.
    }
    throw error;
  }
  try {
    await tx.commit();
  } catch (error) {
    if (!isDefinitiveSqlError(error)) {
      throw new CommitOutcomeUnknownError();
    }
    try {
      await tx.rollback();
    } catch {
      // already gone
    }
    throw error;
  }
  return result;
}

/* ------------------------------------------------------------------ helpers */

export function sqlErrorNumber(error: unknown): number | undefined {
  const e = error as { number?: number; originalError?: { info?: { number?: number } } } | null;
  return e?.number ?? e?.originalError?.info?.number;
}

export function sqlErrorMessage(error: unknown): string {
  return (error as { message?: string } | null)?.message ?? "";
}

/** Map SQL Server errors to API errors; returns null when the error is not a mapped database error. */
export function mapSqlError(error: unknown): ApiError | null {
  const n = sqlErrorNumber(error);
  const msg = sqlErrorMessage(error);
  if (n === 2627 || n === 2601) {
    if (msg.includes("UQ_devices_device_code")) return err.conflict("DEVICE_CODE_EXISTS", "A device with this code already exists.");
    if (msg.includes("UX_devices_serial_number")) return err.conflict("SERIAL_EXISTS", "A device with this serial number already exists.");
    if (msg.includes("UX_devices_current_unit_id")) return err.unprocessable("UNIT_OCCUPIED", "That Unit already has a device installed.");
    if (msg.includes("UQ_activities_form_number")) return err.conflict("FORM_NUMBER_EXISTS", "That form number already exists; please retry.");
    return err.conflict("DUPLICATE", "A record with the same unique value already exists.");
  }
  if (n === 547) {
    return err.unprocessable("CONSTRAINT_VIOLATION", "The data violates a database rule.");
  }
  if (n === 1205) {
    return err.unavailable("DEADLOCK_RETRY", "The request conflicted with another one; please retry.", 1);
  }
  if (n === 1222) {
    return err.unavailable("LOCK_TIMEOUT", "The database was busy; please retry.", 1);
  }
  return null;
}

export const uuid = (v: unknown): string => String(v).toLowerCase();
export const rowVersionHex = (v: unknown): string => `0x${Buffer.from(v as Buffer).toString("hex")}`;
export function rowVersionBuffer(hex: string): Buffer {
  if (!/^0x[0-9a-fA-F]{16}$/.test(hex)) {
    throw err.badRequest("INVALID_ROW_VERSION", "rowVersion must look like 0x00000000000007D1.");
  }
  return Buffer.from(hex.slice(2), "hex");
}
export const toYmd = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

export { sql };
