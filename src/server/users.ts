// User management (design 3.3, 5, 7): Super Admin only. Users are deactivated, never deleted. Every write audits
// in the same SQL transaction (table `user_management`); passwords and hashes never reach the audit log or a response.
// Rules: a regular user needs a Site; nobody changes their OWN role, Site or status; the last active Super Admin
// cannot be deactivated or demoted; deactivating or resetting a password revokes the user's sessions.

import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth/password.ts";
import { writeAudit } from "./audit.ts";
import { err } from "./errors.ts";
import { getPool, request, sql, uuid, withTransaction } from "./db.ts";
import type { Db } from "./db.ts";
import type { ServiceCtx } from "./devices.ts";
import { likePattern } from "./repo.ts";
import type { Role } from "./scope.ts";
import type { CreateUserInput, ResetPasswordInput, UpdateUserInput } from "./validators.ts";

export interface UserDto {
  userId: string;
  nrp: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  siteId: number | null;
  siteName: string | null;
  status: "active" | "inactive";
  isLocked: boolean;
  lastLoginAt: string | null;
  dataSource: string;
  createdAt: string;
}

const USER_SELECT = `
  SELECT u.user_id, u.nrp, u.name, u.email, u.phone, r.role_code, u.site_id, s.name AS site_name, u.status,
         CASE WHEN u.locked_until IS NOT NULL AND u.locked_until > SYSUTCDATETIME() THEN 1 ELSE 0 END AS is_locked,
         u.last_login_at, u.data_source, u.created_at
  FROM dbo.users u
  INNER JOIN dbo.roles r ON r.role_id = u.role_id
  LEFT JOIN dbo.sites s ON s.site_id = u.site_id`;

function toDto(r: Record<string, unknown>): UserDto {
  return {
    userId: uuid(r.user_id),
    nrp: String(r.nrp),
    name: String(r.name),
    email: r.email === null ? null : String(r.email),
    phone: r.phone === null ? null : String(r.phone),
    role: String(r.role_code) as Role,
    siteId: r.site_id === null ? null : Number(r.site_id),
    siteName: r.site_name === null ? null : String(r.site_name),
    status: String(r.status) as "active" | "inactive",
    isLocked: Boolean(r.is_locked),
    lastLoginAt: r.last_login_at ? (r.last_login_at as Date).toISOString() : null,
    dataSource: String(r.data_source),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function getUser(userId: string, db?: Db): Promise<UserDto | null> {
  const r = await request(db ?? (await getPool())).input("id", sql.UniqueIdentifier, userId).query(`${USER_SELECT} WHERE u.user_id = @id`);
  return r.recordset[0] ? toDto(r.recordset[0]) : null;
}

export interface UserListQuery {
  page: number;
  pageSize: number;
  q?: string;
  role?: Role;
  status?: "active" | "inactive";
  siteId?: number;
}

export async function listUsers(query: UserListQuery) {
  const pool = await getPool();
  const bind = (rq: ReturnType<typeof request>) =>
    rq
      .input("like", sql.NVarChar(200), query.q ? likePattern(query.q) : null)
      .input("role", sql.VarChar(30), query.role ?? null)
      .input("status", sql.VarChar(10), query.status ?? null)
      .input("site", sql.Int, query.siteId ?? null);
  const where = `WHERE (@like IS NULL OR u.nrp LIKE @like OR u.name LIKE @like OR u.email LIKE @like)
      AND (@role IS NULL OR r.role_code = @role) AND (@status IS NULL OR u.status = @status) AND (@site IS NULL OR u.site_id = @site)`;
  const total = await bind(request(pool)).query(
    `SELECT COUNT(*) AS n FROM dbo.users u INNER JOIN dbo.roles r ON r.role_id = u.role_id ${where}`
  );
  const rows = await bind(request(pool))
    .input("offset", sql.Int, (query.page - 1) * query.pageSize)
    .input("size", sql.Int, query.pageSize)
    .query(`${USER_SELECT} ${where} ORDER BY u.name, u.nrp OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`);
  return { items: rows.recordset.map(toDto), total: Number(total.recordset[0].n), page: query.page, pageSize: query.pageSize };
}

/* ------------------------------------------------------------------- rules */

/** The role/Site pair a user record may have (design 3.3): `user` needs a Site, `superadmin` may have none. */
export function checkRoleSite(role: Role, siteId: number | null): void {
  if (role === "user" && siteId === null) {
    throw err.unprocessable("SITE_REQUIRED", "A regular user must be assigned to a Site.");
  }
}

async function roleId(tx: Db, role: Role): Promise<number> {
  const r = await request(tx).input("c", sql.NVarChar(30), role).query(`SELECT role_id FROM dbo.roles WHERE role_code = @c`);
  if (!r.recordset[0]) throw err.unprocessable("ROLE_NOT_FOUND", "Unknown role.");
  return Number(r.recordset[0].role_id);
}

async function requireActiveSite(tx: Db, siteId: number | null): Promise<void> {
  if (siteId === null) return;
  const r = await request(tx).input("id", sql.Int, siteId).query(`SELECT is_active FROM dbo.sites WHERE site_id = @id`);
  if (!r.recordset[0]) throw err.unprocessable("SITE_NOT_FOUND", "The Site does not exist.");
  if (!r.recordset[0].is_active) throw err.unprocessable("SITE_INACTIVE", "The Site is not active.");
}

async function activeSuperAdminCount(tx: Db): Promise<number> {
  const r = await request(tx).query(
    `SELECT COUNT(*) AS n FROM dbo.users u INNER JOIN dbo.roles r ON r.role_id = u.role_id
     WHERE r.role_code = 'superadmin' AND u.status = 'active' AND u.password_hash <> N'!DEV_SEED_NO_LOGIN!'`
  );
  return Number(r.recordset[0].n);
}

async function revokeAllSessions(tx: Db, userId: string): Promise<void> {
  await request(tx)
    .input("id", sql.UniqueIdentifier, userId)
    .query(`UPDATE dbo.auth_sessions SET revoked_at = SYSUTCDATETIME() WHERE user_id = @id AND revoked_at IS NULL`);
}

/* ------------------------------------------------------------------ create */

export async function createUser(ctx: ServiceCtx, input: CreateUserInput): Promise<UserDto> {
  const siteId = input.siteId ?? null;
  checkRoleSite(input.role, siteId);
  const hash = await hashPassword(input.password); // before the transaction: bcrypt is slow and needs no locks
  const created = await withTransaction(async (tx) => {
    await requireActiveSite(tx, siteId);
    const dup = await request(tx).input("nrp", sql.NVarChar(30), input.nrp).query(`SELECT 1 AS x FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE nrp = @nrp`);
    if (dup.recordset[0]) throw err.conflict("NRP_EXISTS", "A user with this NRP already exists.");
    const rid = await roleId(tx, input.role);
    const ins = await request(tx)
      .input("nrp", sql.NVarChar(30), input.nrp)
      .input("name", sql.NVarChar(120), input.name)
      .input("email", sql.NVarChar(150), input.email ?? null)
      .input("phone", sql.NVarChar(30), input.phone ?? null)
      .input("role", sql.Int, rid)
      .input("site", sql.Int, siteId)
      .input("hash", sql.NVarChar(255), hash)
      .input("actor", sql.UniqueIdentifier, ctx.user.userId)
      .query(
        `INSERT INTO dbo.users (nrp, name, email, phone, role_id, site_id, password_hash, status, failed_login_count, data_source, created_by)
         OUTPUT INSERTED.user_id
         VALUES (@nrp, @name, @email, @phone, @role, @site, @hash, 'active', 0, 'app', @actor)`
      );
    const userId = uuid(ins.recordset[0].user_id);
    await writeAudit(tx, {
      actor: ctx.user,
      siteId,
      tableName: "user_management",
      recordId: input.nrp,
      entityId: userId,
      operation: "INSERT",
      action: "user_create",
      newValues: { nrp: input.nrp, name: input.name, email: input.email ?? null, phone: input.phone ?? null, role: input.role, site_id: siteId, status: "active" },
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return userId;
  });
  const dto = await getUser(created);
  if (!dto) throw err.notFound("User not found.");
  return dto;
}

/* ------------------------------------------------------------------ update */

export async function updateUser(ctx: ServiceCtx, userId: string, input: UpdateUserInput): Promise<UserDto> {
  await withTransaction(async (tx) => {
    const cur = await request(tx)
      .input("id", sql.UniqueIdentifier, userId)
      .query(
        `SELECT u.user_id, u.nrp, u.name, u.email, u.phone, r.role_code, u.site_id, u.status
         FROM dbo.users u WITH (UPDLOCK, ROWLOCK) INNER JOIN dbo.roles r ON r.role_id = u.role_id WHERE u.user_id = @id`
      );
    const row = cur.recordset[0];
    if (!row) throw err.notFound("User not found.");
    const isSelf = uuid(row.user_id) === ctx.user.userId.toLowerCase();
    const before = {
      name: String(row.name),
      email: row.email === null ? null : String(row.email),
      phone: row.phone === null ? null : String(row.phone),
      role: String(row.role_code) as Role,
      siteId: row.site_id === null ? null : Number(row.site_id),
      status: String(row.status) as "active" | "inactive",
    };
    const after = {
      name: input.name ?? before.name,
      email: input.email === undefined ? before.email : input.email === "" ? null : input.email,
      phone: input.phone === undefined ? before.phone : input.phone === "" ? null : input.phone,
      role: input.role ?? before.role,
      siteId: input.siteId === undefined ? before.siteId : input.siteId,
      status: input.status ?? before.status,
    };
    // A role change away from `user` does not require clearing the Site; a role `user` always needs one.
    checkRoleSite(after.role, after.siteId);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => after[k] !== before[k]);
    if (changed.length === 0) return; // nothing changed: no write, no audit row

    if (isSelf && (changed.includes("role") || changed.includes("siteId") || changed.includes("status"))) {
      throw err.forbidden("SELF_CHANGE_FORBIDDEN", "You cannot change your own role, Site or status.");
    }
    if (changed.includes("siteId")) await requireActiveSite(tx, after.siteId);
    const losesSuperAdmin =
      before.role === "superadmin" && before.status === "active" && (after.role !== "superadmin" || after.status !== "active");
    if (losesSuperAdmin && (await activeSuperAdminCount(tx)) <= 1) {
      throw err.conflict("LAST_SUPERADMIN", "The last active Super Admin cannot be deactivated or demoted.");
    }
    const rid = changed.includes("role") ? await roleId(tx, after.role) : null;

    await request(tx)
      .input("id", sql.UniqueIdentifier, userId)
      .input("name", sql.NVarChar(120), after.name)
      .input("email", sql.NVarChar(150), after.email)
      .input("phone", sql.NVarChar(30), after.phone)
      .input("role", sql.Int, rid)
      .input("site", sql.Int, after.siteId)
      .input("status", sql.VarChar(10), after.status)
      .input("actor", sql.UniqueIdentifier, ctx.user.userId)
      .query(
        `UPDATE dbo.users SET name = @name, email = @email, phone = @phone, role_id = ISNULL(@role, role_id), site_id = @site,
                status = @status, updated_at = SYSUTCDATETIME(), updated_by = @actor
         WHERE user_id = @id`
      );
    const deactivated = changed.includes("status") && after.status === "inactive";
    if (deactivated) await revokeAllSessions(tx, userId);

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const k of changed) {
      oldValues[k === "siteId" ? "site_id" : k] = before[k];
      newValues[k === "siteId" ? "site_id" : k] = after[k];
    }
    await writeAudit(tx, {
      actor: ctx.user,
      siteId: after.siteId,
      tableName: "user_management",
      recordId: String(row.nrp),
      entityId: userId,
      operation: "UPDATE",
      action: deactivated ? "user_deactivate" : "user_update",
      oldValues,
      newValues,
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });
  const dto = await getUser(userId);
  if (!dto) throw err.notFound("User not found.");
  return dto;
}

/* ---------------------------------------------------------- password reset */

export async function resetPassword(ctx: ServiceCtx, userId: string, input: ResetPasswordInput): Promise<{ reset: true }> {
  const hash = await hashPassword(input.password);
  await withTransaction(async (tx) => {
    const cur = await request(tx)
      .input("id", sql.UniqueIdentifier, userId)
      .query(`SELECT nrp, site_id, password_hash FROM dbo.users WITH (UPDLOCK, ROWLOCK) WHERE user_id = @id`);
    const row = cur.recordset[0];
    if (!row) throw err.notFound("User not found.");
    if (String(row.password_hash) === "!DEV_SEED_NO_LOGIN!") {
      throw err.unprocessable("NOT_LOGINABLE", "This placeholder account cannot have a password.");
    }
    await request(tx)
      .input("id", sql.UniqueIdentifier, userId)
      .input("hash", sql.NVarChar(255), hash)
      .input("actor", sql.UniqueIdentifier, ctx.user.userId)
      .query(
        `UPDATE dbo.users SET password_hash = @hash, failed_login_count = 0, locked_until = NULL,
                updated_at = SYSUTCDATETIME(), updated_by = @actor WHERE user_id = @id`
      );
    await revokeAllSessions(tx, userId); // an old session must not outlive a password reset
    await writeAudit(tx, {
      actor: ctx.user,
      siteId: row.site_id === null ? null : Number(row.site_id),
      tableName: "user_management",
      recordId: String(row.nrp),
      entityId: userId,
      operation: "UPDATE",
      action: "user_password_reset",
      newValues: { reset: true },
      changeGroupId: randomUUID(),
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });
  return { reset: true };
}
