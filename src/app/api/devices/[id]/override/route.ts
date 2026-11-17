import { api, json, readJson } from "@/server/http";
import { err } from "@/server/errors";
import { overrideDevice } from "@/server/devices";
import { overrideDeviceSchema, uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Super Admin override of status/Unit: reason mandatory, audited, not a transaction (design 6).
export const POST = api("superadmin", async (c) => {
  const id = uuidParam.safeParse(c.params.id);
  if (!id.success) throw err.notFound();
  const input = await readJson(c.req, overrideDeviceSchema);
  return json(await overrideDevice({ user: c.user, requestId: c.requestId, ip: c.ip }, id.data, input));
});
