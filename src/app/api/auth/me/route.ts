import { api, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Role and Site come from the users table on every request, never from the cookie.
export const GET = api("user", async (c) => json({ nrp: c.user.nrp, name: c.user.name, role: c.user.role, siteId: c.user.siteId }));
