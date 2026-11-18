import { TroubleshootRecord } from "@/types/troubleshoot";

export { getReplacementFormOptions as getTroubleshootFormOptions } from "@/lib/replacement-api";
export type { ReplacementDevice as TroubleshootDevice, ReplacementSite as TroubleshootSite } from "@/lib/replacement-api";

export class TroubleshootApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId: string | null) {
    super(`[${code}] ${message}${requestId ? ` (Request ID: ${requestId})` : ""}`);
  }
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new TroubleshootApiError(body?.error?.code ?? `HTTP_${response.status}`, body?.error?.message ?? `Request failed (${response.status}).`, response.headers.get("x-request-id"));
  if (body === null) throw new Error("Respons API Troubleshoot tidak valid.");
  return body as T;
}

export async function getTroubleshoots(): Promise<TroubleshootRecord[]> {
  const records: TroubleshootRecord[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: TroubleshootRecord[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/troubleshoots?page=${page}&pageSize=1000`, { cache: "no-store" })
    );
    records.push(...result.items);
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getTroubleshoot(formNumber: string): Promise<TroubleshootRecord> {
  return responseBody<TroubleshootRecord>(await fetch(`/api/dotnet/troubleshoots/${encodeURIComponent(formNumber)}`, { cache: "no-store" }));
}

const PHOTO_SLOTS = [{ field: "beforeRepair", slot: "before_repair" }, { field: "afterRepair", slot: "after_repair" }] as const;

export async function saveTroubleshoot(record: TroubleshootRecord, options: { edit: boolean; key?: string }) {
  if (!record.siteId) throw new Error("Site perangkat belum tersedia.");
  if (options.edit && !record.rowVersion) throw new Error("Versi laporan belum tersedia. Muat ulang halaman.");
  const keepPhotoSlots = PHOTO_SLOTS.filter((photo) => record.photos?.[photo.field]?.startsWith("/api/dotnet/photos/")).map((photo) => photo.slot);
  const photoCaptions = Object.fromEntries(PHOTO_SLOTS.filter((photo) => keepPhotoSlots.includes(photo.slot)).map((photo) => [photo.slot, record.photoCaptions?.[photo.field] ?? ""]));
  const form = new FormData();
  form.append("payload", JSON.stringify({
    siteId: record.siteId, deviceCode: record.deviceId, startedAt: record.startTime, finishedAt: record.endTime,
    componentType: record.equipmentType, issue: record.issue, actionTaken: record.actionTaken,
    healthCheckStatus: record.healthCheckStatus ?? null, remarks: record.remarks ?? "",
    rowVersion: options.edit ? record.rowVersion : undefined, keepPhotoSlots, photoCaptions,
  }));
  for (const photo of PHOTO_SLOTS) {
    const url = record.photos?.[photo.field];
    if (!url?.startsWith("data:")) continue;
    const blob = await fetch(url).then((response) => response.blob());
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    form.append(`photo:${photo.slot}`, blob, `${photo.slot}.${extension}`);
    form.append(`caption:${photo.slot}`, record.photoCaptions?.[photo.field] ?? "");
  }
  return responseBody<{ activityId: string; formNumber: string; rowVersion?: string }>(await fetch(
    options.edit ? `/api/dotnet/troubleshoots/${encodeURIComponent(record.id)}` : "/api/dotnet/troubleshoots", {
      method: options.edit ? "PATCH" : "POST", body: form,
      headers: options.key ? { "Idempotency-Key": options.key } : undefined,
    }
  ));
}

export async function deleteTroubleshoot(formNumber: string) {
  return responseBody<{ deleted: boolean; formNumber: string }>(await fetch(`/api/dotnet/troubleshoots/${encodeURIComponent(formNumber)}`, { method: "DELETE" }));
}