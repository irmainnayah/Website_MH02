import { collectionRoutes } from "@/server/activityRoutes";
import { createReplacement } from "@/server/transactions";
import { replacementSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = collectionRoutes("replacement", replacementSchema, createReplacement);
export const GET = routes.GET;
export const POST = routes.POST;
