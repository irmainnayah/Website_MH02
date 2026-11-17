import { api, readJson } from "@/server/http";
import { getConfig } from "@/server/config";
import { login } from "@/server/auth/session";
import { loginSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api("public", async (c) => {
  const body = await readJson(c.req, loginSchema);
  const { user, session } = await login(body.nrp, body.password, c.ip, c.userAgent);
  const cfg = getConfig();
  return {
    status: 200,
    body: { user: { nrp: user.nrp, name: user.name, role: user.role, siteId: user.siteId } },
    cookies: [
      {
        name: cfg.cookieName,
        value: session.token,
        options: { httpOnly: true, sameSite: "lax" as const, secure: cfg.cookieSecure, path: "/", expires: session.expiresAt },
      },
    ],
  };
});
