import { api } from "@/server/http";
import { getConfig } from "@/server/config";
import { revokeSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("public", async (c) => {
  const cfg = getConfig();
  const token = c.req.cookies.get(cfg.cookieName)?.value;
  if (token) await revokeSession(token);
  return {
    status: 200,
    body: { loggedOut: true },
    cookies: [
      { name: cfg.cookieName, value: "", options: { httpOnly: true, sameSite: "lax" as const, secure: cfg.cookieSecure, path: "/", maxAge: 0 } },
    ],
  };
});
