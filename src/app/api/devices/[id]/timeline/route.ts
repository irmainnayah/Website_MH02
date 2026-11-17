import { api, json } from "@/server/http";
import { err } from "@/server/errors";
import { deviceTimeline } from "@/server/devices";
import { uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("user", async (c) => {
  const id = uuidParam.safeParse(c.params.id);
  if (!id.success) throw err.notFound();
  return json({ items: await deviceTimeline(c.user, id.data) });
});
