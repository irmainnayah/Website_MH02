import { collectionRoutes } from "@/server/activityRoutes";
import { createInstallation } from "@/server/transactions";
import { installationSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = collectionRoutes("installation", installationSchema, createInstallation);
export const GET = routes.GET;
export const POST = routes.POST;
