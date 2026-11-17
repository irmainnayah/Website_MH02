import { api, json, readQuery } from "@/server/http";
import { listAuditLogs } from "@/server/reference";
import { auditListQuery } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Append-only data-change log, scoped by audit_log.site_id (a regular user sees only their own Site).
export const GET = api("user", async (c) => json(await listAuditLogs(c.user, readQuery(c.req, auditListQuery))));
