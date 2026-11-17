// Server configuration read from environment variables (.env.local in development).
// Server-side only: nothing here is ever sent to the browser, and the password is never logged.

import { resolve } from "node:path";

export interface ServerConfig {
  db: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
  cookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  /** Failed logins before the account is locked, and for how long. */
  lockoutThreshold: number;
  lockoutMinutes: number;
  /** Timeout for the per-key idempotency barrier at creation (step 0), design 3.19. */
  idempotencyLockTimeoutMs: number;
  /** Timeout for the barrier used to verify an ambiguous COMMIT, design 3.19. */
  idempotencyVerifyTimeoutMs: number;
  /** Tolerance when checking that finishedAt is not in the future. */
  clockSkewMs: number;
  trustProxy: boolean;
  photo: {
    /** Absolute directory for photo files (never under public/). */
    storageRoot: string;
    maxBytes: number;
    quarantineDays: number;
    stagingGraceMinutes: number;
    lockTimeoutMs: number;
    reconcileIntervalMinutes: number;
    integrityIntervalMinutes: number;
    integrityBatchSize: number;
    integrityVerifyHash: boolean;
    /** Start the background reconciler/integrity check with the application. */
    backgroundJobs: boolean;
  };
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function boolFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true";
}

let cached: ServerConfig | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (cached && env === process.env) return cached;
  const required = (key: string): string => {
    const v = env[key];
    if (!v) throw new Error(`Missing required environment variable ${key}.`);
    return v;
  };
  const user = required("DB_USER");
  if (/^(sa|sys)/i.test(user)) {
    throw new Error("DB_USER must be the least-privilege application login, never sa or a sysadmin.");
  }
  const config: ServerConfig = {
    db: {
      server: required("DB_SERVER"),
      port: intFromEnv(env, "DB_PORT", 1433, 1, 65535),
      database: required("DB_NAME"),
      user,
      password: required("DB_PASSWORD"),
      encrypt: boolFromEnv(env, "DB_ENCRYPT", true),
      trustServerCertificate: boolFromEnv(env, "DB_TRUST_SERVER_CERTIFICATE", false),
    },
    cookieName: "mh02_session",
    cookieSecure: boolFromEnv(env, "SESSION_COOKIE_SECURE", env.NODE_ENV === "production"),
    // Implementation defaults (documented in docs/BACKEND.md); change by environment variable.
    sessionTtlHours: intFromEnv(env, "SESSION_TTL_HOURS", 8, 1, 168),
    lockoutThreshold: intFromEnv(env, "LOGIN_LOCKOUT_THRESHOLD", 5, 3, 20),
    lockoutMinutes: intFromEnv(env, "LOGIN_LOCKOUT_MINUTES", 15, 1, 1440),
    idempotencyLockTimeoutMs: intFromEnv(env, "IDEMPOTENCY_LOCK_TIMEOUT_MS", 3000, 100, 60000),
    idempotencyVerifyTimeoutMs: intFromEnv(env, "IDEMPOTENCY_VERIFY_TIMEOUT_MS", 5000, 100, 60000),
    clockSkewMs: intFromEnv(env, "CLOCK_SKEW_SECONDS", 120, 0, 3600) * 1000,
    trustProxy: boolFromEnv(env, "TRUST_PROXY", false),
    photo: {
      // Decision P4 (Rev 11): 10 MB per photo, 90 days quarantine. The staging grace must exceed the longest request.
      storageRoot: resolve(env.PHOTO_STORAGE_ROOT || ".storage"),
      maxBytes: intFromEnv(env, "PHOTO_MAX_BYTES", 10_485_760, 1024, 104_857_600),
      quarantineDays: intFromEnv(env, "PHOTO_QUARANTINE_DAYS", 90, 1, 3650),
      stagingGraceMinutes: intFromEnv(env, "PHOTO_STAGING_GRACE_MINUTES", 60, 1, 1440),
      lockTimeoutMs: intFromEnv(env, "PHOTO_LOCK_TIMEOUT_MS", 3000, 100, 60000),
      reconcileIntervalMinutes: intFromEnv(env, "PHOTO_RECONCILE_INTERVAL_MINUTES", 10, 1, 1440),
      integrityIntervalMinutes: intFromEnv(env, "PHOTO_INTEGRITY_INTERVAL_MINUTES", 60, 1, 10080),
      integrityBatchSize: intFromEnv(env, "PHOTO_INTEGRITY_BATCH_SIZE", 200, 1, 10000),
      integrityVerifyHash: boolFromEnv(env, "PHOTO_INTEGRITY_VERIFY_HASH", false),
      backgroundJobs: boolFromEnv(env, "PHOTO_BACKGROUND_JOBS", true),
    },
  };
  if (env === process.env) cached = config;
  return config;
}
