import { api, json, readQuery } from "@/server/http";
import { listActivities } from "@/server/transactions";
import { activityListQuery } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Activity Log is the operational view of activities (all four types), scoped to the Site of the caller.
export const GET = api("user", async (c) => json(await listActivities(c.user, readQuery(c.req, activityListQuery))));
