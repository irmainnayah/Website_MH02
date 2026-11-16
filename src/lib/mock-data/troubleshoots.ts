import { TroubleshootRecord } from "@/types/troubleshoot";

// Prototype-only in-memory source. Records are lost when the application reloads.
let troubleshootRecords: TroubleshootRecord[] = [];
const troubleshootRecordListeners = new Set<() => void>();

export const getTroubleshootRecords = (): TroubleshootRecord[] => troubleshootRecords;

export const subscribeToTroubleshootRecords = (listener: () => void): (() => void) => {
  troubleshootRecordListeners.add(listener);
  return () => troubleshootRecordListeners.delete(listener);
};

export const addTroubleshootRecord = (record: TroubleshootRecord): boolean => {
  if (troubleshootRecords.some((existing) => existing.id === record.id)) return false;

  troubleshootRecords = [record, ...troubleshootRecords];
  troubleshootRecordListeners.forEach((listener) => listener());
  return true;
};

export const updateTroubleshootRecord = (record: TroubleshootRecord): boolean => {
  const index = troubleshootRecords.findIndex((item) => item.id === record.id);
  if (index === -1) return false;

  troubleshootRecords = troubleshootRecords.map((item) =>
    item.id === record.id ? record : item
  );
  troubleshootRecordListeners.forEach((listener) => listener());
  return true;
};

export const deleteTroubleshootRecord = (id: string): boolean => {
  const nextRecords = troubleshootRecords.filter((record) => record.id !== id);
  if (nextRecords.length === troubleshootRecords.length) return false;

  troubleshootRecords = nextRecords;
  troubleshootRecordListeners.forEach((listener) => listener());
  return true;
};

/** Prototype number only; final report numbering remains subject to business confirmation. */
export const getNextTroubleshootFormNumber = (date = new Date()): string => {
  const month = date.toISOString().slice(0, 7).replace("-", "");
  const prefix = `TRB-${month}-`;
  const nextSequence = troubleshootRecords.reduce((max, record) => {
    if (!record.id.startsWith(prefix)) return max;
    const sequence = Number(record.id.slice(prefix.length));
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0) + 1;

  return `${prefix}${String(nextSequence).padStart(3, "0")}`;
};
