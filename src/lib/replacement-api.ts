import { ReplacementRecord, ReplacementPhotoSlotKey } from "@/types/replacement";
import { DeviceRecord, DistrictName } from "@/types/dashboard";

export interface ReplacementLookup {
  category: string;
  code: string;
  label: string;
  siteId: number | null;
}

export interface ReplacementSite {
  siteId: number;
  name: string;
  timeZone: string;
  timeZoneLabel: string;
}

export type ReplacementDevice = DeviceRecord & { egi: string | null; siteId: number };

interface ReferenceResponse {
  sites: ReplacementSite[];
  equipmentTypes: { id: number; name: string }[];
  deviceStatuses: { id: number; code: string; label: string | null; isInStock: boolean }[];
  lookups: ReplacementLookup[];
}

export interface ReplacementPayload {
  startedAt: string;
  finishedAt: string;
  siteId: number;
  oldDeviceCode: string;
  newDeviceCode: string;
  oldFinalStatus: string;
  shift: string;
  groupLeader: string;
  remarks: string;
  sourcePower: string;
  spmVersion: string;
  ipAddress: string;
  ipCpe: string;
  ipVhms: string;
  rowVersion?: string;
  keepPhotoSlots?: string[];
  photoCaptions?: Record<string, string>;
}

export interface ReplacementPhotoInput {
  slot: Exclude<ReplacementPhotoSlotKey, "camera_dashboard_angle">;
  url: string;
  caption: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) {
    const message = body.error?.message ?? body.error?.code ?? `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function getReplacementList(): Promise<ReplacementRecord[]> {
  const response = await fetch("/api/dotnet/replacements?page=1&pageSize=1000", { cache: "no-store" });
  const result = await readResponse<{ items: ReplacementRecord[]; total: number; pageSize: number }>(response);
  const records = [...result.items];
  for (let pageNumber = 2; pageNumber <= Math.ceil(result.total / result.pageSize); pageNumber++) {
    const next = await readResponse<{ items: ReplacementRecord[] }>(await fetch(`/api/dotnet/replacements?page=${pageNumber}&pageSize=1000`, { cache: "no-store" }));
    records.push(...next.items);
  }
  return records;
}

export async function getReplacement(formNumber: string): Promise<ReplacementRecord> {
  const response = await fetch(`/api/dotnet/replacements/${encodeURIComponent(formNumber)}`, { cache: "no-store" });
  const record = await readResponse<ReplacementRecord>(response);
  return { ...record, photos: record.photos.map((photo) => ({ ...photo, url: photo.url.replace(/^\/api\/photos\//, "/api/dotnet/photos/") })) };
}

async function toMultipart(payload: ReplacementPayload, photos: ReplacementPhotoInput[]) {
  const form = new FormData();
  const keepPhotoSlots = photos.filter((photo) => photo.url.startsWith("/api/dotnet/photos/")).map((photo) => photo.slot);
  const photoCaptions = Object.fromEntries(photos.filter((photo) => keepPhotoSlots.includes(photo.slot)).map((photo) => [photo.slot, photo.caption]));
  const body: ReplacementPayload = { ...payload, keepPhotoSlots, photoCaptions };
  form.append("payload", JSON.stringify(body));
  for (const photo of photos) {
    if (!photo.url.startsWith("data:")) continue;
    const blob = await fetch(photo.url).then((response) => response.blob());
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    form.append(`photo:${photo.slot}`, blob, `${photo.slot}.${extension}`);
    form.append(`caption:${photo.slot}`, photo.caption);
  }
  return form;
}

export async function createReplacement(payload: ReplacementPayload, photos: ReplacementPhotoInput[], idempotencyKey: string) {
  const form = await toMultipart(payload, photos);
  const response = await fetch("/api/dotnet/replacements", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: form,
  });
  return readResponse<{ activityId: string; formNumber: string }>(response);
}

export async function updateReplacement(formNumber: string, payload: ReplacementPayload, photos: ReplacementPhotoInput[]) {
  const form = await toMultipart(payload, photos);
  const response = await fetch(`/api/dotnet/replacements/${encodeURIComponent(formNumber)}`, {
    method: "PATCH",
    body: form,
  });
  return readResponse<{ formNumber: string; rowVersion: string }>(response);
}

export async function deleteReplacement(formNumber: string) {
  const response = await fetch(`/api/dotnet/replacements/${encodeURIComponent(formNumber)}`, { method: "DELETE" });
  return readResponse<{ deleted: boolean; formNumber: string }>(response);
}

export async function getReplacementFormOptions() {
  const referenceResponse = await fetch("/api/dotnet/reference", { cache: "no-store" });
  const reference = await readResponse<ReferenceResponse>(referenceResponse);
  const devicePages = await Promise.all(reference.sites.map(async (site) => {
    const first = await readResponse<{ items: ApiDevice[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/devices?siteId=${site.siteId}&page=1&pageSize=100`, { cache: "no-store" })
    );
    const pages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / first.pageSize) - 1) }, (_, index) =>
      fetch(`/api/dotnet/devices?siteId=${site.siteId}&page=${index + 2}&pageSize=100`, { cache: "no-store" })
        .then((response) => readResponse<{ items: ApiDevice[] }>(response))
    ));
    return [...first.items, ...pages.flatMap((page) => page.items)];
  }));
  const devices = devicePages.flat().map((device): ReplacementDevice => ({
    deviceId: device.deviceCode,
    serialNumber: device.serialNumber,
    status: device.status.code as DeviceRecord["status"],
    unitNo: device.unit?.unitNo ?? null,
    equipmentType: device.unit?.equipmentType as DeviceRecord["equipmentType"] ?? null,
    district: device.siteName as DistrictName,
    currentLocation: device.siteName as DistrictName,
    healthCheckStatus: device.healthCheckStatus as DeviceRecord["healthCheckStatus"],
    lastMaintenanceDate: device.lastMaintenanceDate,
    egi: device.unit?.egi ?? null,
    siteId: device.siteId,
  }));
  return { ...reference, devices };
}

interface ApiDevice {
  deviceCode: string;
  serialNumber: string;
  status: { code: string };
  siteId: number;
  siteName: string;
  unit: { unitNo: string; equipmentType: string; egi: string | null } | null;
  healthCheckStatus: string;
  lastMaintenanceDate: string | null;
}