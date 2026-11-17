import { api, json, readJson, readQuery } from "@/server/http";
import { createUser, listUsers } from "@/server/users";
import { createUserSchema, userListQuery } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User management is Super Admin only. Responses never contain a password or hash.
export const GET = api("superadmin", async (c) => json(await listUsers(readQuery(c.req, userListQuery))));

export const POST = api("superadmin", async (c) => {
  const input = await readJson(c.req, createUserSchema);
  return json(await createUser({ user: c.user, requestId: c.requestId, ip: c.ip }, input), 201);
});
