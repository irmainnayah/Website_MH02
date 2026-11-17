import { api, json, readJson, readQuery } from "@/server/http";
import { createDevice, listDevices } from "@/server/devices";
import { readIdempotencyKey } from "@/server/idempotency";
import { createDeviceSchema, deviceListQuery } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("user", async (c) => json(await listDevices(c.user, readQuery(c.req, deviceListQuery))));

// POST /devices is idempotent: a repeat of the same request replays the original response (design 3.19).
export const POST = api("user", async (c) => {
  const key = readIdempotencyKey(c.req);
  const input = await readJson(c.req, createDeviceSchema);
  const result = await createDevice({ user: c.user, requestId: c.requestId, ip: c.ip }, input, key);
  return json(result.data, result.replayed ? 200 : 201, result.replayed ? { "Idempotency-Replayed": "true" } : undefined);
});
