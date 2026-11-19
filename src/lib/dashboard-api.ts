import { DeviceRecord } from "@/types/dashboard";
import { TimelineEntry } from "@/lib/timeline-api";

export interface DashboardDevice extends Omit<DeviceRecord, "district" | "currentLocation" | "equipmentType"> {
  internalId: string;
  siteId: number;
  district: string;
  currentLocation: string | null;
  equipmentType: string | null;
  egi: string | null;
  lastActivityDate: string | null;
  rowVersion: string;
  createdAt: string | null;
}
export interface DashboardSite { siteId: number; name: string; timeZone: string; timeZoneLabel: string }
export interface DashboardSummary {
  siteId: number | null;
  generatedAt: string;
  currentMonth: string;
  periodTimeZone: string;
  activityGrouping: string;
  kpis: { registeredDevices: number; totalInstalled: number; hoRepair: number; inStock: number; officialAssetTotal: number | null };
  statusDistribution: { key: string; label: string; count: number }[];
  locationDistribution: { locationSiteId: number | null; location: string; total: number; inUse: number; inStockRfu: number; inStockDamaged: number; hoRepair: number }[];
  equipmentDistribution: { type: string; count: number }[];
  monthlyActivities: { yearMonth: string; month: string; installation: number; replacement: number; removal: number; troubleshoot: number }[];
  currentMonthActivities: { installation: number; replacement: number; removal: number; troubleshoot: number };
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`[${body?.error?.code ?? response.status}] ${body?.error?.message ?? "Request failed."}${requestId ? ` (Request ID: ${requestId})` : ""}`);
  }
  if (body === null) throw new Error("Respons API Dashboard tidak valid.");
  return body as T;
}

export async function getDashboardSummary(siteId: number | null, signal?: AbortSignal) {
  return responseBody<DashboardSummary>(await fetch(`/api/dotnet/dashboard${siteId === null ? "" : `?siteId=${siteId}`}`, { cache: "no-store", signal }));
}

export async function getDashboardDevices(siteId: number | null, signal?: AbortSignal): Promise<DashboardDevice[]> {
  const records: DashboardDevice[] = [];
  for (let page = 1; ; page++) {
    const result = await responseBody<{ items: DashboardDevice[]; total: number; pageSize: number }>(
      await fetch(`/api/dotnet/dashboard/devices?page=${page}&pageSize=1000${siteId === null ? "" : `&siteId=${siteId}`}`, { cache: "no-store", signal })
    );
    records.push(...result.items);
    if (page * result.pageSize >= result.total) return records;
  }
}

export async function getDashboardSites(signal?: AbortSignal) {
  return responseBody<{ sites: DashboardSite[] }>(await fetch("/api/dotnet/reference", { cache: "no-store", signal }));
}

export async function getDashboardDeviceHistory(code: string, signal?: AbortSignal) {
  return responseBody<{ items: TimelineEntry[]; total: number }>(await fetch(`/api/dotnet/timeline/${encodeURIComponent(code)}?page=1&pageSize=10`, { cache: "no-store", signal }));
}

export function dashboardMonthLabel(month: string) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}