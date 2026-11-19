import { DeviceStatus, HealthCheckStatus, ActivityType } from "@/types/dashboard";
import { formatDuration } from "@/lib/utils";
import { ActivityLogDetail, ActivityMetadata, updateActivityMetadata } from "@/lib/activity-log-api";

export interface TimelineDevice {
  internalId: string;
  deviceId: string;
  serialNumber: string;
  status: DeviceStatus;
  statusLabel: string;
  siteId: number;
  district: string;
  unitNo: string | null;
  equipmentType: string | null;
  egi: string | null;
  currentLocation: string | null;
  healthCheckStatus: HealthCheckStatus;
  lastMaintenanceDate: string | null;
  isArchived: boolean;
  rowVersion: string;
}

export interface TimelineEntry {
  key: string;
  entryType: "activity" | "event";
  activityId: string | null;
  eventId?: string;
  type: string;
  formNumber: string | null;
  role: string | null;
  date: string;
  time: string;
  timeZone: string;
  timeZoneLabel: string;
  occurredAt: string;
  district: string;
  unitNo: string | null;
  equipmentType: string | null;
  technicianName: string;
  durationMinutes: number | null;
  durationFormatted: string;
  summary: string;
  details: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  beforeUnit: string | null;
  afterUnit: string | null;
  rowVersion?: string;
  detailPath: string | null;
  editPath: string | null;
  sourceActivityId?: string | null;
  sourceActivityType?: string | null;
  sourceStartedAtLocal?: string | null;
  sourceTimeZone?: string | null;
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`[${body?.error?.code ?? response.status}] ${body?.error?.message ?? "Request failed."}${requestId ? ` (Request ID: ${requestId})` : ""}`);
  }
  if (body === null) throw new Error("Respons API Timeline tidak valid.");
  return body as T;
}

export async function getTimelineDirectory(archived = false): Promise<TimelineDevice[]> {
  const records: TimelineDevice[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: TimelineDevice[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/timeline?page=${page}&pageSize=1000&archived=${archived}`, { cache: "no-store" })
    );
    records.push(...result.items);
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getDeviceTimeline(deviceCode: string): Promise<{ device: TimelineDevice; items: TimelineEntry[] }> {
  const items: TimelineEntry[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ device: TimelineDevice; items: TimelineEntry[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/timeline/${encodeURIComponent(deviceCode)}?page=${page}&pageSize=1000`, { cache: "no-store" })
    );
    items.push(...result.items.map((entry) => ({ ...entry,
      timeZoneLabel: ({ "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" } as Record<string, string>)[entry.timeZone] ?? entry.timeZone,
      durationFormatted: entry.durationMinutes === null ? "" : formatDuration(entry.durationMinutes),
    })));
    if (page * result.pageSize >= result.total) return { device: result.device, items };
  }
}

export async function createTimelineActivity(deviceCode: string, type: ActivityType, body: FormData | string, key: string) {
  return responseBody<{ activityId: string; formNumber: string }>(await fetch(`/api/dotnet/timeline/${encodeURIComponent(deviceCode)}?activityType=${type}`, {
    method: "POST", body, headers: { "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
  }));
}

export async function updateTimelineMetadata(deviceCode: string, record: ActivityLogDetail, draft: ActivityMetadata) {
  return updateActivityMetadata(record, draft, `/api/dotnet/timeline/${encodeURIComponent(deviceCode)}/activities/${encodeURIComponent(record.activityId)}`);
}

export async function deleteTimelineActivity(deviceCode: string, activityId: string) {
  return responseBody<{ deleted: boolean }>(await fetch(`/api/dotnet/timeline/${encodeURIComponent(deviceCode)}/activities/${encodeURIComponent(activityId)}`, { method: "DELETE" }));
}