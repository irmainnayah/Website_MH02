export type AuditLogTable = "installation" | "replacement" | "removal" | "troubleshoot" | "device" | "user_management";
export type AuditLogOperation = "INSERT" | "UPDATE" | "DELETE";
export type AuditValue = null | boolean | number | string | AuditValue[] | { [key: string]: AuditValue };

export interface AuditLogEntry {
  entryId: string;
  auditId: string;
  timestamp: string;
  table: AuditLogTable;
  operation: AuditLogOperation;
  recordId: string;
  entityId: string;
  actorUserId: string | null;
  changedBy: string | null;
  siteId: number | null;
  siteName: string | null;
  ipAddress: string | null;
  requestId: string | null;
  action: string;
  reason: string | null;
  changeGroupId: string;
  oldValues: AuditValue;
  newValues: AuditValue;
  recordPath: string | null;
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`[${body?.error?.code ?? response.status}] ${body?.error?.message ?? "Request failed."}${requestId ? ` (Request ID: ${requestId})` : ""}`);
  }
  if (body === null) throw new Error("Respons API Audit Log tidak valid.");
  return body as T;
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const records: AuditLogEntry[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: AuditLogEntry[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/audit-logs?page=${page}&pageSize=1000`, { cache: "no-store" })
    );
    records.push(...result.items);
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getAuditEntry(id: string): Promise<AuditLogEntry> {
  return responseBody<AuditLogEntry>(await fetch(`/api/dotnet/audit-logs/${encodeURIComponent(id)}`, { cache: "no-store" }));
}

export function auditDate(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function auditTimestamp(timestamp: string): string {
  return `${new Date(timestamp).toISOString().replace("T", " ").replace("Z", "")} UTC`;
}