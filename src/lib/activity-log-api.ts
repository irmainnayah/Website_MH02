import { ActivityType } from "@/types/dashboard";
import { formatDuration } from "@/lib/utils";

export interface ActivityLogItem {
  activityId: string;
  formNumber: string;
  type: ActivityType;
  siteId: number;
  district: string;
  unitNo: string;
  equipmentType: string | null;
  egi: string | null;
  date: string;
  time: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  timeZoneLabel: string;
  durationMinutes: number;
  durationFormatted: string;
  technicianName: string;
  technicianNrp: string;
  groupLeader: string;
  shift: string;
  remarks: string;
  rowVersion: string;
  summary: string;
  deviceCodes: string[];
  deviceId: string;
  status: string;
  transactionPath: string;
  editPath: string | null;
  details: Record<string, string | number | null> | null;
}

export interface ActivityLogDetail extends ActivityLogItem {
  devices: { deviceCode: string; serialNumber: string; role: string; beforeStatus: string; afterStatus: string;
    beforeUnit: string | null; afterUnit: string | null; beforeLocationSiteId: number | null; afterLocationSiteId: number | null;
    beforeMaintenanceDate: string | null; afterMaintenanceDate: string | null }[];
  photos: { photoId: string; slot: string; caption: string; url: string }[];
}

export interface ActivityMetadata { remarks: string; shift: string; groupLeader: string }

export async function getActivityMetadataOptions(siteId: number) {
  const reference = await responseBody<{ lookups: { category: string; label: string; siteId: number | null }[] }>(await fetch("/api/dotnet/reference", { cache: "no-store" }));
  const values = (category: string) => Array.from(new Set(reference.lookups.filter((item) => item.category === category && (item.siteId === null || item.siteId === siteId)).map((item) => item.label)));
  return { shifts: values("shift"), groupLeaders: values("group_leader") };
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`[${body?.error?.code ?? response.status}] ${body?.error?.message ?? "Request failed."}${requestId ? ` (Request ID: ${requestId})` : ""}`);
  }
  if (body === null) throw new Error("Respons API Activity Log tidak valid.");
  return body as T;
}

function normalized<T extends ActivityLogItem>(item: T): T {
  return { ...item, deviceId: item.deviceCodes.join(" / "), durationFormatted: formatDuration(item.durationMinutes), status: "completed" };
}

export async function getActivityLog(): Promise<ActivityLogItem[]> {
  const records: ActivityLogItem[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: ActivityLogItem[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/activity-log?page=${page}&pageSize=1000`, { cache: "no-store" })
    );
    records.push(...result.items.map(normalized));
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getActivity(id: string): Promise<ActivityLogDetail> {
  return normalized(await responseBody<ActivityLogDetail>(await fetch(`/api/dotnet/activity-log/${encodeURIComponent(id)}`, { cache: "no-store" })));
}

export async function createActivity(type: ActivityType, body: FormData | string, key: string) {
  return responseBody<{ activityId: string; formNumber: string }>(await fetch(`/api/dotnet/activity-log?activityType=${type}`, {
    method: "POST", body, headers: { "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
  }));
}

export async function updateActivityMetadata(record: ActivityLogDetail, draft: ActivityMetadata, endpoint = `/api/dotnet/activity-log/${encodeURIComponent(record.activityId)}`) {
  let body: string | FormData;
  const headers: Record<string, string> = {};
  if (record.type === "installation") {
    body = JSON.stringify({ rowVersion: record.rowVersion, remarks: draft.remarks, groupLeader: draft.groupLeader, ...(draft.shift ? { shift: draft.shift } : {}) });
    headers["Content-Type"] = "application/json";
  } else {
    const details = record.details ?? {};
    const finalCondition = (value: string | number | null | undefined) => ({ 2: "in_stock_rfu", 3: "in_stock_damaged", 4: "in_stock_ho" })[Number(value) as 2 | 3 | 4];
    const common = { siteId: record.siteId, startedAt: record.startTime, finishedAt: record.endTime, rowVersion: record.rowVersion, remarks: draft.remarks };
    const payload = record.type === "replacement" ? {
      ...common, shift: draft.shift, groupLeader: draft.groupLeader, oldFinalStatus: finalCondition(details.old_final_status_id),
      sourcePower: details.source_power ?? "", spmVersion: details.spm_version ?? "", ipAddress: details.ip_address ?? "", ipCpe: details.ip_cpe ?? "", ipVhms: details.ip_vhms ?? "",
    } : record.type === "removal" ? {
      ...common, deviceCode: record.deviceCodes[0], shift: draft.shift, groupLeader: draft.groupLeader,
      finalCondition: finalCondition(details.final_status_id), reason: details.reason, reasonDetail: details.reason_detail,
    } : {
      ...common, deviceCode: record.deviceCodes[0], componentType: details.component_type, issue: details.issue,
      actionTaken: details.action_taken, healthCheckStatus: details.health_check_result,
    };
    const photos = record.photos.filter((photo) => photo.slot !== "camera_dashboard_angle");
    body = new FormData();
    body.append("payload", JSON.stringify({ ...payload, keepPhotoSlots: photos.map((photo) => photo.slot), photoCaptions: Object.fromEntries(photos.map((photo) => [photo.slot, photo.caption])) }));
  }
  return responseBody<unknown>(await fetch(endpoint, { method: "PATCH", body, headers }));
}

export async function deleteActivity(id: string) {
  return responseBody<{ deleted: boolean }>(await fetch(`/api/dotnet/activity-log/${encodeURIComponent(id)}`, { method: "DELETE" }));
}