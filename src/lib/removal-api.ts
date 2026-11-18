import { RemovalRecord } from "@/types/removal";

export { getReplacementFormOptions as getRemovalFormOptions } from "@/lib/replacement-api";
export type { ReplacementDevice as RemovalDevice, ReplacementLookup as RemovalLookup, ReplacementSite as RemovalSite } from "@/lib/replacement-api";

export class RemovalApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId: string | null) {
    super(requestId ? `${message} (Request ID: ${requestId})` : message);
  }
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RemovalApiError(body?.error?.code ?? `HTTP_${response.status}`, body?.error?.message ?? `Request failed (${response.status}).`, response.headers.get("x-request-id"));
  if (body === null) throw new Error("Respons API Removal tidak valid.");
  return body as T;
}

export async function getRemovals(): Promise<RemovalRecord[]> {
  const records: RemovalRecord[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: RemovalRecord[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/removals?page=${page}&pageSize=1000`, { cache: "no-store" })
    );
    records.push(...result.items);
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getRemoval(formNumber: string): Promise<RemovalRecord> {
  return responseBody<RemovalRecord>(await fetch(`/api/dotnet/removals/${encodeURIComponent(formNumber)}`, { cache: "no-store" }));
}

const PHOTO_SLOTS = [
  { field: "beforeDevice", caption: "beforeDeviceCaption", slot: "before_device" },
  { field: "componentSet", caption: "componentSetCaption", slot: "component_set" },
] as const;

export async function saveRemoval(record: RemovalRecord, options: { edit: boolean; key?: string }) {
  if (!record.siteId) throw new Error("Site perangkat belum tersedia.");
  if (options.edit && !record.rowVersion) throw new Error("Versi laporan belum tersedia. Muat ulang halaman.");
  const keepPhotoSlots = PHOTO_SLOTS.filter((photo) => record.photos?.[photo.field]?.startsWith("/api/dotnet/photos/")).map((photo) => photo.slot);
  const photoCaptions = Object.fromEntries(PHOTO_SLOTS.filter((photo) => keepPhotoSlots.includes(photo.slot)).map((photo) => [photo.slot, record.photos?.[photo.caption] ?? ""]));
  const form = new FormData();
  form.append("payload", JSON.stringify({
    siteId: record.siteId, deviceCode: record.deviceId, startedAt: record.startTime, finishedAt: record.endTime,
    finalCondition: record.deviceFinalCondition, reason: record.reason, reasonDetail: record.reasonDetail,
    shift: record.shift, groupLeader: record.groupLeaderName, remarks: record.remarks ?? "",
    rowVersion: options.edit ? record.rowVersion : undefined, keepPhotoSlots, photoCaptions,
  }));
  for (const photo of PHOTO_SLOTS) {
    const url = record.photos?.[photo.field];
    if (!url?.startsWith("data:")) continue;
    const blob = await fetch(url).then((response) => response.blob());
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    form.append(`photo:${photo.slot}`, blob, `${photo.slot}.${extension}`);
    form.append(`caption:${photo.slot}`, record.photos?.[photo.caption] ?? "");
  }
  return responseBody<{ activityId: string; formNumber: string; rowVersion: string }>(await fetch(
    options.edit ? `/api/dotnet/removals/${encodeURIComponent(record.id)}` : "/api/dotnet/removals", {
      method: options.edit ? "PATCH" : "POST", body: form,
      headers: options.key ? { "Idempotency-Key": options.key } : undefined,
    }
  ));
}

export async function deleteRemoval(formNumber: string) {
  return responseBody<{ deleted: boolean; formNumber: string }>(await fetch(`/api/dotnet/removals/${encodeURIComponent(formNumber)}`, { method: "DELETE" }));
}