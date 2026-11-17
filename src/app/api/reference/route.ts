import { api, json } from "@/server/http";
import { getReference } from "@/server/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api("user", async (c) => json(await getReference(c.user)));
