import { collectionRoutes } from "@/server/activityRoutes";
import { createTroubleshoot } from "@/server/transactions";
import { troubleshootSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = collectionRoutes("troubleshoot", troubleshootSchema, createTroubleshoot);
export const GET = routes.GET;
export const POST = routes.POST;
