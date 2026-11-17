import { itemRoutes } from "@/server/activityRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = itemRoutes("replacement");
export const GET = routes.GET;
// Deleting a transaction is Super Admin only; it restores the previous device state and is blocked by later activity.
// Editing (Super Admin): metadata edits touch no device; master edits revert, re-validate and re-apply atomically.
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
