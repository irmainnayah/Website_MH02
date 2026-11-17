// Server-side sessions (design 3.4). Only the SHA-256 of the cookie token is stored. Role and Site are
// never kept in the session or the cookie: they are read from `users` on every request.

import { getConfig } from "../config.ts";
import { ApiError, err } from "../errors.ts";
import { randomToken, sha256Hex } from "../hash.ts";
import { getPool, request, sql, uuid } from "../db.ts";
import type { AuthUser, Role } from "../scope.ts";
import { verifyPassword } from "./password.ts";

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string, ip: string | null, userAgent: string | null): Promise<CreatedSession> {
  const cfg = getConfig();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 3_600_000);
  const pool = await getPool();
  await request(pool)
    .input("hash", sql.Char(64), sha256Hex(token))
    .input("userId", sql.UniqueIdentifier, userId)
    .input("expires", sql.DateTime2(0), expiresAt)
    .input("ip", sql.VarChar(45), ip ? ip.slice(0, 45) : null)
    .input("ua", sql.NVarChar(500), userAgent ? userAgent.slice(0, 500) : null)
    .query(
      `INSERT INTO dbo.auth_sessions (token_hash, user_id, expires_at, ip_address, user_agent)
       VALUES (@hash, @userId, @expires, @ip, @ua)`
    );
  return { token, expiresAt };
}

/** The authenticated user for a session token, or null. Role and Site come from the users table. */
export async function findSessionUser(token: string): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  const pool = await getPool();
  const result = await request(pool)
    .input("hash", sql.Char(64), sha256Hex(token))
    .query(
      `SELECT u.user_id, u.nrp, u.name, r.role_code, u.site_id
       FROM dbo.auth_sessions s
       INNER JOIN dbo.users u ON u.user_id = s.user_id
       INNER JOIN dbo.roles r ON r.role_id = u.role_id
       WHERE s.token_hash = @hash
         AND s.revoked_at IS NULL
         AND s.expires_at > SYSUTCDATETIME()
         AND u.status = 'active'`
    );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    userId: uuid(row.user_id),
    nrp: String(row.nrp),
    name: String(row.name),
    role: row.role_code as Role,
    siteId: row.site_id === null ? null : Number(row.site_id),
  };
}

export async function revokeSession(token: string): Promise<void> {
  const pool = await getPool();
  await request(pool)
    .input("hash", sql.Char(64), sha256Hex(token))
    .query(`UPDATE dbo.auth_sessions SET revoked_at = SYSUTCDATETIME() WHERE token_hash = @hash AND revoked_at IS NULL`);
}

/** Verify NRP + password with lockout. Never reveals whether an NRP exists. */
export async function login(
  nrp: string,
  password: string,
  ip: string | null,
  userAgent: string | null
): Promise<{ user: AuthUser; session: CreatedSession }> {
  const cfg = getConfig();
  const pool = await getPool();
  const found = await request(pool)
    .input("nrp", sql.NVarChar(30), nrp)
    .query(
      `SELECT u.user_id, u.nrp, u.name, u.password_hash, u.status, u.site_id, r.role_code,
              ISNULL(u.failed_login_count, 0) AS failed_count,
              CASE WHEN u.locked_until IS NOT NULL AND u.locked_until > SYSUTCDATETIME()
                   THEN DATEDIFF(SECOND, SYSUTCDATETIME(), u.locked_until) ELSE 0 END AS locked_seconds
       FROM dbo.users u INNER JOIN dbo.roles r ON r.role_id = u.role_id
       WHERE u.nrp = @nrp`
    );
  const row = found.recordset[0];
  const passwordOk = await verifyPassword(password, row ? String(row.password_hash) : null);

  if (!row || row.status !== "active") {
    throw new ApiError(401, "INVALID_CREDENTIALS", "NRP or password is incorrect.");
  }
  if (Number(row.locked_seconds) > 0) {
    throw new ApiError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.", undefined, {
      "Retry-After": String(Number(row.locked_seconds)),
    });
  }
  if (!passwordOk) {
    await request(pool)
      .input("id", sql.UniqueIdentifier, row.user_id)
      .input("threshold", sql.Int, cfg.lockoutThreshold)
      .input("minutes", sql.Int, cfg.lockoutMinutes)
      .query(
        `UPDATE dbo.users
         SET failed_login_count = ISNULL(failed_login_count, 0) + 1,
             locked_until = CASE WHEN ISNULL(failed_login_count, 0) + 1 >= @threshold
                                 THEN DATEADD(MINUTE, @minutes, SYSUTCDATETIME()) ELSE locked_until END
         WHERE user_id = @id`
      );
    throw new ApiError(401, "INVALID_CREDENTIALS", "NRP or password is incorrect.");
  }
  const role = row.role_code as Role;
  const siteId = row.site_id === null ? null : Number(row.site_id);
  if (role === "user" && siteId === null) {
    throw err.forbidden("NO_SITE_ASSIGNED", "Your account has no Site assigned.");
  }
  // Login bookkeeping (counter reset, last login) is not business data and is not written to audit_log.
  await request(pool)
    .input("id", sql.UniqueIdentifier, row.user_id)
    .query(`UPDATE dbo.users SET failed_login_count = 0, locked_until = NULL, last_login_at = SYSUTCDATETIME() WHERE user_id = @id`);
  const session = await createSession(uuid(row.user_id), ip, userAgent);
  return {
    user: { userId: uuid(row.user_id), nrp: String(row.nrp), name: String(row.name), role, siteId },
    session,
  };
}
