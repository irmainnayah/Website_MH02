// Form numbers (design 3.14): <PREFIX>-<YYYYMM>-<NNN>, e.g. INS-202610-001. The month is the LOCAL
// month of started_at in the activity's Site zone. The counter lives in dbo.form_sequences.

export type ActivityType = "installation" | "replacement" | "removal" | "troubleshoot";

export const ACTIVITY_TYPES: readonly ActivityType[] = ["installation", "replacement", "removal", "troubleshoot"];

const PREFIX: Record<ActivityType, string> = {
  installation: "INS",
  replacement: "REP",
  removal: "REM",
  troubleshoot: "TRB",
};

export function formatFormNumber(type: ActivityType, yearMonth: string, sequence: number): string {
  if (!/^\d{6}$/.test(yearMonth)) {
    throw new Error("yearMonth must be YYYYMM");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("sequence must be a positive integer");
  }
  return `${PREFIX[type]}-${yearMonth}-${String(sequence).padStart(3, "0")}`;
}
