import { z } from "zod";
import { api, json, readQuery } from "@/server/http";
import { listFleetUnits } from "@/server/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ available: z.enum(["true", "false"]).optional(), siteId: z.coerce.number().int().positive().optional() });

export const GET = api("user", async (c) => {
  const q = readQuery(c.req, query);
  return json({ items: await listFleetUnits(c.user, { available: q.available === "true", siteId: q.siteId }) });
});
