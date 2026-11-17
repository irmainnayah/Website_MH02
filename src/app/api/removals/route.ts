import { collectionRoutes } from "@/server/activityRoutes";
import { createRemoval } from "@/server/transactions";
import { removalSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = collectionRoutes("removal", removalSchema, createRemoval);
export const GET = routes.GET;
export const POST = routes.POST;
