// HTTP layer for Route Handlers: authentication, CSRF origin check, JSON bodies, error mapping.
// Responses are never cacheable and always carry the request id.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import type { ZodType } from "zod";
import { ApiError, constraintNameFromMessage, err } from "./errors.ts";
import { getConfig } from "./config.ts";
import { findSessionUser } from "./auth/session.ts";
import { mapSqlError, sqlErrorMessage, sqlErrorNumber, CommitOutcomeUnknownError } from "./db.ts";
import { isSuperAdmin } from "./scope.ts";
import type { AuthUser } from "./scope.ts";

export type AuthMode = "public" | "user" | "superadmin";

export interface RouteContext {
  req: NextRequest;
  requestId: string;
  user: AuthUser | null;
  ip: string | null;
  userAgent: string | null;
  params: Record<string, string>;
}

export interface AuthedRouteContext extends RouteContext {
  user: AuthUser;
}

export interface JsonResult {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
  /** Cookie mutations for the response (login/logout). */
  cookies?: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[];
}

type Handler<C> = (ctx: C) => Promise<JsonResult | Response>;
// Next.js always passes a context object (with an empty params promise for static routes).
type NextRouteArgs = [NextRequest, { params: Promise<Record<string, string | string[] | undefined>> }];

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clientIp(req: NextRequest): string | null {
  if (!getConfig().trustProxy) return null;
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim().slice(0, 45) : null;
}

/** CSRF defense in depth next to SameSite=Lax: a browser-sent Origin must match the Host. */
function checkOrigin(req: NextRequest): void {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw err.forbidden("BAD_ORIGIN", "Invalid Origin header.");
  }
  if (originHost !== req.headers.get("host")) {
    throw err.forbidden("BAD_ORIGIN", "Cross-origin request refused.");
  }
}

function buildResponse(result: JsonResult | Response, requestId: string): Response {
  if (result instanceof Response) {
    result.headers.set("Cache-Control", "no-store");
    result.headers.set("X-Request-Id", requestId);
    return result;
  }
  const res = NextResponse.json(result.body, { status: result.status ?? 200 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(result.headers ?? {})) res.headers.set(k, v);
  for (const c of result.cookies ?? []) res.cookies.set(c.name, c.value, c.options);
  return res;
}

function errorResponse(error: unknown, requestId: string): Response {
  let api: ApiError | null = null;
  let fields: unknown;
  if (error instanceof ApiError) {
    api = error;
  } else if (error instanceof ZodError) {
    api = err.badRequest("VALIDATION_FAILED", "The request is not valid.");
    fields = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (error instanceof CommitOutcomeUnknownError) {
    api = err.unavailable("COMMIT_OUTCOME_UNKNOWN", "The outcome could not be confirmed. Retry with the same Idempotency-Key.");
  } else {
    api = mapSqlError(error);
    if (api) {
      // The client gets a generic message; the server log names the violated rule (never the values).
      const rule = constraintNameFromMessage(sqlErrorMessage(error));
      console.error(`[mh02] request ${requestId} database rule ${sqlErrorNumber(error) ?? ""}${rule ? ` (${rule})` : ""} -> ${api.code}`);
    }
  }
  if (!api) {
    // Unknown failure: log a short, secret-free line and return a generic message.
    const name = (error as { name?: string } | null)?.name ?? "Error";
    const code = (error as { code?: string } | null)?.code ?? "";
    console.error(`[mh02] request ${requestId} failed: ${name} ${code}`.trim());
    api = new ApiError(500, "INTERNAL_ERROR", "Something went wrong.");
  }
  const res = NextResponse.json(
    { error: { code: api.code, message: api.message, ...(fields || api.details ? { details: fields ?? api.details } : {}) } },
    { status: api.status }
  );
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(api.headers)) res.headers.set(k, v);
  return res;
}

/** Wrap a handler for a Next.js Route Handler export (GET/POST/...). */
export function api(mode: "public", fn: Handler<RouteContext>): (...args: NextRouteArgs) => Promise<Response>;
export function api(mode: "user" | "superadmin", fn: Handler<AuthedRouteContext>): (...args: NextRouteArgs) => Promise<Response>;
export function api(mode: AuthMode, fn: Handler<never>): (...args: NextRouteArgs) => Promise<Response> {
  return async (req, routeArgs) => {
    const requestId = crypto.randomUUID();
    try {
      checkOrigin(req);
      const rawParams = (await routeArgs?.params) ?? {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v[0] : (v ?? "");

      let user: AuthUser | null = null;
      if (mode !== "public") {
        const token = req.cookies.get(getConfig().cookieName)?.value;
        user = token ? await findSessionUser(token) : null;
        if (!user) throw err.unauthorized();
        if (mode === "superadmin" && !isSuperAdmin(user)) {
          throw err.forbidden("SUPERADMIN_ONLY", "Only a Super Admin can do this.");
        }
      }
      const ctx: RouteContext = {
        req,
        requestId,
        user,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        params,
      };
      const result = await (fn as unknown as Handler<RouteContext>)(ctx);
      return buildResponse(result, requestId);
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

/** Parse and validate a JSON body. Unknown keys are rejected by strict schemas. */
export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw err.badRequest("INVALID_JSON", "The request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** Validate query-string parameters with a schema. */
export function readQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const raw: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  return schema.parse(raw);
}

export function json(body: unknown, status = 200, headers?: Record<string, string>): JsonResult {
  return { status, body, headers };
}
