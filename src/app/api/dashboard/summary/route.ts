import { api, json, readQuery } from "@/server/http";
import { getDashboardSummary } from "@/server/dashboard";
import { dashboardQuery } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Role user: own Site aggregate (a different siteId is 403). Super Admin: all Sites, or ?siteId= for one.
export const GET = api("user", async (c) => json(await getDashboardSummary(c.user, readQuery(c.req, dashboardQuery))));
