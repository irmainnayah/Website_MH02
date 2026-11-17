import { api, json, readJson } from "@/server/http";
import { err } from "@/server/errors";
import { archiveDevice } from "@/server/devices";
import { archiveDeviceSchema, uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Device Archive (soft delete). There is no hard-delete and no restore endpoint.
export const POST = api("superadmin", async (c) => {
  const id = uuidParam.safeParse(c.params.id);
  if (!id.success) throw err.notFound();
  const input = await readJson(c.req, archiveDeviceSchema);
  return json(await archiveDevice({ user: c.user, requestId: c.requestId, ip: c.ip }, id.data, input));
});
