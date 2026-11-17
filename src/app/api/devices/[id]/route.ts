import { api, json, readJson } from "@/server/http";
import { err } from "@/server/errors";
import { getDevice, updateDevice } from "@/server/devices";
import { updateDeviceSchema, uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): string {
  const parsed = uuidParam.safeParse(raw);
  if (!parsed.success) throw err.notFound();
  return parsed.data;
}

export const GET = api("user", async (c) => {
  const device = await getDevice(c.user, parseId(c.params.id));
  if (!device) throw err.notFound();
  return json(device);
});

// Super Admin only; descriptive fields only (status, Unit and Site are rejected by the strict schema).
export const PATCH = api("superadmin", async (c) => {
  const input = await readJson(c.req, updateDeviceSchema);
  return json(await updateDevice({ user: c.user, requestId: c.requestId, ip: c.ip }, parseId(c.params.id), input));
});
