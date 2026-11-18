import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes: Record<string, readonly string[]> = {
  "auth/login": ["POST"],
  "auth/logout": ["POST"],
  "auth/me": ["GET"],
  "auth/mfa/setup": ["GET"],
  "auth/mfa/verify": ["POST"],
  reference: ["GET"],
  "fleet-units": ["GET"],
  devices: ["GET"],
  installations: ["GET", "POST"],
  replacements: ["GET", "POST"],
  removals: ["GET", "POST"],
  "dashboard/status-distribution": ["GET"],
  users: ["GET", "POST"],
};

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Development API proxy is disabled." } }, { status: 503 });
  }

  const { path } = await context.params;
  const endpoint = path.join("/");
  const isDeviceDetail = path.length === 2 && path[0] === "devices" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]);
  const isUserDetail = path.length === 2 && path[0] === "users" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]);
  const isInstallationDetail = path.length === 2 && path[0] === "installations" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]);
  const isReplacementDetail = path.length === 2 && path[0] === "replacements" && /^REP-\d{6}-\d{3,}$/i.test(path[1]);
  const isRemovalDetail = path.length === 2 && path[0] === "removals" && /^REM-\d{6}-\d{3,}$/i.test(path[1]);
  const isPhoto = path.length === 2 && path[0] === "photos" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1]);
  if (!(routes[endpoint]?.includes(request.method) || (isDeviceDetail && request.method === "GET") || (isPhoto && request.method === "GET") || ((isInstallationDetail || isReplacementDetail || isRemovalDetail) && ["GET", "PATCH", "DELETE"].includes(request.method)) || (isUserDetail && ["GET", "PUT", "DELETE"].includes(request.method)))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }

  const origin = request.headers.get("origin");
  if (origin && request.method !== "GET") {
    try {
      if (new URL(origin).host !== request.headers.get("host")) throw new Error("origin mismatch");
    } catch {
      return NextResponse.json({ error: { code: "BAD_ORIGIN", message: "Cross-origin request refused." } }, { status: 403 });
    }
  }

  try {
    const backend = new URL(process.env.MH02_DOTNET_API_URL ?? "http://localhost:5000");
    if (backend.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname) || backend.username || backend.password || backend.pathname !== "/" || backend.search || backend.hash) {
      throw new Error("invalid development backend URL");
    }
    const target = new URL(`/api/${endpoint}${request.nextUrl.search}`, backend);
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    const contentType = request.headers.get("content-type");
    const idempotencyKey = request.headers.get("idempotency-key");
    if (cookie) headers.set("cookie", cookie);
    if (contentType) headers.set("content-type", contentType);
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
    if (origin) headers.set("origin", backend.origin);

    let body: ArrayBuffer | undefined;
    if (!["GET", "DELETE"].includes(request.method)) {
      const maxBodyBytes = 41 * 1024 * 1024;
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (declaredLength > maxBodyBytes) {
        return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } }, { status: 413 });
      }
      body = await request.arrayBuffer();
      if (body.byteLength > maxBodyBytes) {
        return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } }, { status: 413 });
      }
    }

    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout((endpoint === "installations" && request.method === "POST") || ((endpoint === "replacements" || isReplacementDetail || endpoint === "removals" || isRemovalDetail) && ["POST", "PATCH"].includes(request.method)) ? 120000 : 10000),
    });
    const result = new NextResponse(response.body, { status: response.status });
    result.headers.set("Cache-Control", "no-store");
    for (const header of ["content-type", "set-cookie", "retry-after", "x-request-id", "idempotency-replayed", "location"]) {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    }
    return result;
  } catch {
    return NextResponse.json({ error: { code: "BACKEND_UNAVAILABLE", message: "Development backend unavailable." } }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;