// Role and Site scope (design 5). Role and Site ALWAYS come from the authenticated user record,
// never from the request. For role `user` a client-supplied siteId is ignored (or rejected when it
// contradicts the user's own Site). Pure functions.

import { err } from "./errors.ts";

export type Role = "superadmin" | "user";

export interface AuthUser {
  userId: string;
  nrp: string;
  name: string;
  role: Role;
  /** Assigned Site. Required for role `user`; optional for `superadmin` (global role). */
  siteId: number | null;
}

export type SiteScope = { all: true } | { all: false; siteId: number };

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === "superadmin";
}

export function buildScope(user: AuthUser): SiteScope {
  if (isSuperAdmin(user)) {
    return { all: true };
  }
  if (user.siteId === null) {
    // A regular user without a Site must never see data.
    throw err.forbidden("NO_SITE_ASSIGNED", "Your account has no Site assigned.");
  }
  return { all: false, siteId: user.siteId };
}

export function requireSuperAdmin(user: AuthUser): void {
  if (!isSuperAdmin(user)) {
    throw err.forbidden("SUPERADMIN_ONLY", "Only a Super Admin can do this.");
  }
}

/**
 * The Site a read is restricted to.
 * - user: always their own Site. An explicit different siteId is rejected (403), never honored.
 * - superadmin: the optional requested Site, or null meaning "all Sites".
 */
export function readSiteFilter(user: AuthUser, requestedSiteId?: number | null): number | null {
  if (!isSuperAdmin(user)) {
    const own = buildScope(user);
    if (!own.all && requestedSiteId !== undefined && requestedSiteId !== null && requestedSiteId !== own.siteId) {
      throw err.forbidden("SITE_FORBIDDEN", "You cannot access another Site.");
    }
    return own.all ? null : own.siteId;
  }
  return requestedSiteId ?? null;
}

/**
 * The Site a write belongs to.
 * - user: their own Site (a different explicit siteId is rejected).
 * - superadmin: the explicitly chosen Site is required.
 */
export function writeSiteId(user: AuthUser, requestedSiteId?: number | null): number {
  if (!isSuperAdmin(user)) {
    const own = buildScope(user);
    if (own.all) {
      throw err.forbidden("NO_SITE_ASSIGNED", "Your account has no Site assigned.");
    }
    if (requestedSiteId !== undefined && requestedSiteId !== null && requestedSiteId !== own.siteId) {
      throw err.forbidden("SITE_FORBIDDEN", "You cannot write to another Site.");
    }
    return own.siteId;
  }
  if (requestedSiteId === undefined || requestedSiteId === null) {
    throw err.badRequest("SITE_REQUIRED", "siteId is required for a Super Admin.");
  }
  return requestedSiteId;
}

export function canAccessSite(scope: SiteScope, siteId: number): boolean {
  return scope.all || scope.siteId === siteId;
}
