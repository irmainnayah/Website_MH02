import { api, json, readJson } from "@/server/http";
import { err } from "@/server/errors";
import { getUser, updateUser } from "@/server/users";
import { updateUserSchema, uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): string {
  const parsed = uuidParam.safeParse(raw);
  if (!parsed.success) throw err.notFound();
  return parsed.data.toLowerCase();
}

export const GET = api("superadmin", async (c) => {
  const user = await getUser(parseId(c.params.id));
  if (!user) throw err.notFound();
  return json(user);
});

// Deactivate with { "status": "inactive" }; there is no delete endpoint.
export const PATCH = api("superadmin", async (c) => {
  const input = await readJson(c.req, updateUserSchema);
  return json(await updateUser({ user: c.user, requestId: c.requestId, ip: c.ip }, parseId(c.params.id), input));
});
