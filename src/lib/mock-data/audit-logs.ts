export type AuditLogTable =
  | "installation"
  | "replacement"
  | "removal"
  | "troubleshoot"
  | "user_management";

export type AuditLogOperation = "INSERT" | "UPDATE" | "DELETE";

export interface AuditLogEntry {
  entryId: number;
  timestamp: string;
  table: AuditLogTable;
  operation: AuditLogOperation;
  recordId: string;
  changedBy: string | null;
  ipAddress: string | null;
}

// Prototype UI-action log only; no physical database operations are captured.
let auditLogEntries: AuditLogEntry[] = [];
let nextAuditEntryId = 1;
const auditLogListeners = new Set<() => void>();

export const getAuditLogEntries = (): AuditLogEntry[] => auditLogEntries;

export const subscribeToAuditLogEntries = (listener: () => void): (() => void) => {
  auditLogListeners.add(listener);
  return () => auditLogListeners.delete(listener);
};

export const recordAuditAction = (action: {
  table: AuditLogTable;
  operation: AuditLogOperation;
  recordId: string;
}): void => {
  auditLogEntries = [
    {
      entryId: nextAuditEntryId++,
      timestamp: new Date().toISOString(),
      table: action.table,
      operation: action.operation,
      recordId: action.recordId,
      changedBy: null,
      ipAddress: null,
    },
    ...auditLogEntries,
  ];
  auditLogListeners.forEach((listener) => listener());
};
