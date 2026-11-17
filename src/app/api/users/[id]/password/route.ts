import { api, json, readJson } from "@/server/http";
import { err } from "@/server/errors";
import { resetPassword } from "@/server/users";
import { resetPasswordSchema, uuidParam } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Separate endpoint (design 7): sets a new password, clears the lockout and revokes the user's sessions.
export const POST = api("superadmin", async (c) => {
  const id = uuidParam.safeParse(c.params.id);
  if (!id.success) throw err.notFound();
  const input = await readJson(c.req, resetPasswordSchema);
  return json(await resetPassword({ user: c.user, requestId: c.requestId, ip: c.ip }, id.data.toLowerCase(), input));
});
