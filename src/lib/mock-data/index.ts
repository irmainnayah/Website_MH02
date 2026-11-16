// src/lib/mock-data/index.ts
import { devices } from "./devices";
import { activities, getAllEnrichedActivities } from "./activities";
import { DistrictName, KpiSummary, ActivityRecord } from "../../types/dashboard";

/**
 * ⚠️ DEMO / MOCK DATA ONLY — BUKAN PERIODE PRODUKSI
 * Konstanta periode aktif mock data acuan prototipe MH02 (Oktober 2026).
 * Memastikan perhitungan KPI dan Ringkasan Aktivitas Bulanan selalu konsisten
 * dengan dataset demo tanpa terpengaruh perbedaan waktu sistem lokal penguji.
 */
export const ACTIVE_MOCK_MONTH = "2026-10";

/**
 * Helper that calculates KPI summary based on the current mock data.
 * All calculations follow the definitions in `dashboard_implementation_plan.md`.
 * The function is pure and does **not** perform any network request.
 */
export function getKpiSummary(): KpiSummary {
  // Total Perangkat: seluruh perangkat unik pada dataset (tanpa duplikasi)
  const totalDevices = new Set(devices.map((d) => d.deviceId)).size;

  const totalInstalled = devices.filter((d) => d.status === "in_use").length;
  const hoRepair = devices.filter((d) => d.status === "in_stock_ho").length;

  const inStock = devices.filter((d) =>
    ["in_stock_rfu", "in_stock_damaged", "in_stock_ho"].includes(d.status),
  ).length;

  return {
    totalDevices,
    totalInstalled,
    hoRepair,
    inStock,
  } as KpiSummary;
}

export {
  FLEET_MASTER_DATA,
  getFleetMasterByUnit,
  getEquipmentTypeByUnit,
  getEgiByUnit,
  matchesUnitNumberSearch,
} from "./fleet";
export type { FleetUnitMaster } from "./fleet";

export { devices } from "./devices";
export { activities, getAllEnrichedActivities } from "./activities";
export { initialUsers } from "./users";
export {
  initialInstallations,
  GROUP_LEADERS,
  TECHNICIANS,
  SHIFT_OPTIONS,
  SOURCE_POWER_OPTIONS,
  SPM_VERSIONS,
  AREAS_BY_DISTRICT,
  DEMO_PHOTO_SLOTS,
  addInstallationRecord,
  createInstallationWithDevice,
  getInstallationRecords,
  subscribeToInstallationRecords,
  getInstallationById,
  getNextInstallationFormNumber,
  executeDeviceInstallationDelete,
  prepareDeviceInstallationEdit,
  executeDeviceInstallationEdit,
} from "./installations";
export {
  initialReplacements,
  getNextReplacementFormNumber,
  OLD_DEVICE_CONDITIONS,
  DEMO_REPLACEMENT_PHOTO_SLOTS,
  addReplacementRecord,
  getReplacementById,
  executeDeviceReplacement,
    getReplacementRecords,
    subscribeToReplacementRecords,
    prepareDeviceReplacementEdit,
    executeDeviceReplacementEdit,
    executeDeviceReplacementDelete,
} from "./replacement";
export {
  removalRecords,
  getRemovalRecords,
  executeDeviceRemoval,
  executeDeviceRemovalEdit,
  executeDeviceRemovalDelete,
  getNextRemovalFormNumber,
  getRemovalById,
  REMOVAL_DEVICE_CONDITIONS,
} from "./removal";

/**
 * Device Installation Status distribution (total: 55 devices).
 * Note: HO Repair is a subcategory of In Stock, shown distinctly here.
 * Kategori Not Installed telah dihapus dan dipetakan ke In Stock – RFU.
 */
export function getDeviceStatusData() {
  const total = devices.length || 1;
  const inUse = devices.filter((d) => d.status === "in_use").length;
  const rfu = devices.filter((d) => d.status === "in_stock_rfu").length;
  const damaged = devices.filter((d) => d.status === "in_stock_damaged").length;
  const ho = devices.filter((d) => d.status === "in_stock_ho").length;

  return [
    { name: "Active / In Use", value: inUse, color: "#10b981", percentage: Math.round((inUse / total) * 100) },
    { name: "In Stock – RFU", value: rfu, color: "#8b5cf6", percentage: Math.round((rfu / total) * 100) },
    { name: "In Stock – Repair", value: damaged, color: "#f59e0b", percentage: Math.round((damaged / total) * 100) },
    { name: "HO Repair", value: ho, color: "#ef4444", percentage: Math.round((ho / total) * 100), note: "Sub-kategori In Stock" },
  ];
}

/**
 * Distribusi Stok SMARTD DISPLAY per Lokasi (Total 21 unit perangkat In Stock).
 * Menampilkan rincian stok di Head Office (HO Repair) serta masing-masing Site tambang
 * (Sangatta, Bengalon, Wahau, Sangatta Utara).
 */
export function getStockDistributionData() {
  const stockDevices = devices.filter((d) =>
    ["in_stock_rfu", "in_stock_damaged", "in_stock_ho"].includes(d.status)
  );
  const totalStock = stockDevices.length || 1; // 21 unit

  // Lokasi Head Office: perangkat berstatus 'in_stock_ho' (4 unit)
  const hoCount = stockDevices.filter((d) => d.status === "in_stock_ho").length;

  // Lokasi Site (perangkat stok cadangan RFU & Repair di site):
  const bengalonCount = stockDevices.filter(
    (d) => d.status !== "in_stock_ho" && d.district === "Bengalon"
  ).length; // 6 unit (5 RFU + 1 Repair)

  const sangattaCount = stockDevices.filter(
    (d) => d.status !== "in_stock_ho" && d.district === "Sangatta"
  ).length; // 5 unit (4 RFU + 1 Repair)

  const wahauCount = stockDevices.filter(
    (d) => d.status !== "in_stock_ho" && d.district === "Wahau"
  ).length; // 5 unit (5 RFU)

  const sangattaUtaraCount = stockDevices.filter(
    (d) => d.status !== "in_stock_ho" && d.district === "Sangatta Utara"
  ).length; // 1 unit (1 RFU)

  return [
    {
      name: "Head Office",
      value: hoCount,
      color: "#ef4444",
      percentage: Math.round((hoCount / totalStock) * 100),
      note: "4 unit (HO Repair)",
    },
    {
      name: "Site Bengalon",
      value: bengalonCount,
      color: "#3b82f6",
      percentage: Math.round((bengalonCount / totalStock) * 100),
      note: "6 unit (5 RFU, 1 Repair)",
    },
    {
      name: "Site Sangatta",
      value: sangattaCount,
      color: "#10b981",
      percentage: Math.round((sangattaCount / totalStock) * 100),
      note: "5 unit (4 RFU, 1 Repair)",
    },
    {
      name: "Site Wahau",
      value: wahauCount,
      color: "#f59e0b",
      percentage: Math.round((wahauCount / totalStock) * 100),
      note: "5 unit (5 RFU)",
    },
    {
      name: "Site Sangatta Utara",
      value: sangattaUtaraCount,
      color: "#8b5cf6",
      percentage: Math.round((sangattaUtaraCount / totalStock) * 100),
      note: "1 unit (1 RFU)",
    },
  ];
}

export interface DeviceLocationDistributionItem {
  location: string;
  inUse: number;
  inStockRfu: number;
  inStockDamaged: number;
  hoRepair: number;
  total: number;
  note?: string;
}

/**
 * Distribusi Perangkat per Lokasi (55 unit inventaris aktif berdasarkan data mock saat ini).
 *
 * Aturan bisnis yang telah dikonfirmasi:
 * - in_use: `district` = site operasi armada → lokasi fisik valid.
 * - in_stock_ho (HO Repair): Kerusakan ringan, ditangani di site, TIDAK dikirim ke HO.
 *   `district` = lokasi fisik site tempat perangkat berada.
 * - in_stock_damaged: `district` = site tempat kerusakan terjadi → digunakan sebagai lokasi fisik.
 * - in_stock_rfu: RFU adalah status kondisi/pemakaian, BUKAN penentu lokasi.
 *   ⚠️ KETERBATASAN DATA: `DeviceRecord` hanya memiliki satu field lokasi (`district`).
 *   Tidak ada field yang membedakan "RFU baru stok di HO" vs "RFU idle di site".
 *   Field `district` digunakan sebagai proksi terbaik yang tersedia.
 *   Untuk akurasi penuh, diperlukan field tambahan, misalnya `currentLocation: DistrictName | "Head Office"`.
 *
 * Skenario yang belum terdapat dalam dataset:
 * - Perangkat rusak parah yang dikembalikan ke HO (tidak masuk inventaris aktif).
 *   Diperlukan status baru (misal `returned_to_ho`) atau flag `isActiveInventory: false`.
 * - Perangkat RFU baru yang berada di Head Office (stok awal).
 *   Diperlukan `currentLocation: "Head Office"` atau status tambahan.
 *
 * Perubahan data minimal yang diusulkan (untuk dibahas dengan Pak Tama):
 * 1. Tambahkan field `currentLocation: DistrictName | "Head Office" | null` ke `DeviceRecord`.
 * 2. Untuk perangkat rusak parah dikembalikan ke HO: gunakan `currentLocation: "Head Office"` + flag `isActiveInventory: false`.
 */
export function getDeviceLocationDistributionData(): DeviceLocationDistributionItem[] {
  // Group devices by their static `district` field (the four mining sites).
  const siteDistricts: DistrictName[] = ["Sangatta", "Bengalon", "Wahau", "Sangatta Utara", "Head Office"];

  const siteItems = siteDistricts.map((districtName) => {
    // All devices assigned to this district, regardless of status.
    const siteDevices = devices.filter((d) => d.district === districtName);
    const inUse = siteDevices.filter((d) => d.status === "in_use").length;
    const inStockRfu = siteDevices.filter((d) => d.status === "in_stock_rfu").length;
    const inStockDamaged = siteDevices.filter((d) => d.status === "in_stock_damaged").length;
    const hoRepair = siteDevices.filter((d) => d.status === "in_stock_ho").length;
    const total = siteDevices.length;

    const noteParts: string[] = [];
    if (inUse > 0) noteParts.push(`${inUse} In Use`);
    if (inStockRfu > 0) noteParts.push(`${inStockRfu} RFU`);
    if (inStockDamaged > 0) noteParts.push(`${inStockDamaged} In Stock–Repair`);
    if (hoRepair > 0) noteParts.push(`${hoRepair} HO Repair (di site)`);

    return {
      location: districtName === "Head Office" ? "Head Office" : `Site ${districtName}`,
      inUse,
      inStockRfu,
      inStockDamaged,
      hoRepair,
      total,
      note: `${total} unit (${noteParts.join(", ")})`,
    };
  });

  // Include Head Office entry when present.
  return siteItems;
}



/**
 * Device Health Distribution for In Use devices (34 devices).
 * (Dipertahankan untuk kompatibilitas data)
 */
export function getHealthDistributionData() {
  const inUseDevices = devices.filter((d) => d.status === "in_use");
  const totalInUse = inUseDevices.length || 1;
  const complete = inUseDevices.filter((d) => d.healthCheckStatus === "complete").length;
  const incomplete = inUseDevices.filter((d) => d.healthCheckStatus === "incomplete").length;
  const notChecked = inUseDevices.filter((d) => d.healthCheckStatus === "not_checked").length;

  return [
    { name: "Complete (19/19)", value: complete, color: "#10b981", percentage: Math.round((complete / totalInUse) * 100) },
    { name: "Incomplete", value: incomplete, color: "#f59e0b", percentage: Math.round((incomplete / totalInUse) * 100) },
    { name: "Not Checked", value: notChecked, color: "#94a3b8", percentage: Math.round((notChecked / totalInUse) * 100) },
  ];
}

/**
 * Indonesian Month Labels for dynamic period formatting
 */
export const MONTH_NAMES_ID: Record<string, string> = {
  "01": "Januari",
  "02": "Februari",
  "03": "Maret",
  "04": "April",
  "05": "Mei",
  "06": "Juni",
  "07": "Juli",
  "08": "Agustus",
  "09": "September",
  "10": "Oktober",
  "11": "November",
  "12": "Desember",
};

export const MONTH_SHORT_ID: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "Mei",
  "06": "Jun",
  "07": "Jul",
  "08": "Agu",
  "09": "Sep",
  "10": "Okt",
  "11": "Nov",
  "12": "Des",
};

/**
 * Returns formatted label for the current month, e.g. "November 2026".
 */
export function getCurrentMonthLabel(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${MONTH_NAMES_ID[m] || m} ${y}`;
}

/**
 * Get dynamic rolling 6-month array up to current date.
 * Returns array of objects with { key: "YYYY-MM", label: "Okt 2026" or "Okt" }
 */
export function getRollingSixMonths(date = new Date()): { key: string; label: string; yearMonth: string }[] {
  const result: { key: string; label: string; yearMonth: string }[] = [];
  const currentYear = date.getFullYear();
  const currentMonthIndex = date.getMonth(); // 0-based

  for (let i = 5; i >= 0; i--) {
    const target = new Date(currentYear, currentMonthIndex - i, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    const key = `${y}-${m}`;
    const shortLabel = MONTH_SHORT_ID[m] || m;
    result.push({
      key,
      label: shortLabel,
      yearMonth: `${shortLabel} ${y}`,
    });
  }

  return result;
}

/**
 * Monthly activities data (Dynamic rolling 6 months based on current system date) for grouped bar chart.
 */
export function getMonthlyActivityChartData(date = new Date()) {
  const months = getRollingSixMonths(date);
  const allActs: ActivityRecord[] = getAllEnrichedActivities();

  return months.map(({ key, label }) => {
    const list = allActs.filter((a: ActivityRecord) => a.month === key && a.status === "completed");
    return {
      month: label,
      installation: list.filter((a: ActivityRecord) => a.type === "installation").length,
      troubleshoot: list.filter((a: ActivityRecord) => a.type === "troubleshoot").length,
      replacement: list.filter((a: ActivityRecord) => a.type === "replacement").length,
      removal: list.filter((a: ActivityRecord) => a.type === "removal").length,
    };
  });
}

/**
 * Devices in use grouped by Equipment Type.
 */
export function getEquipmentTypeData() {
  const inUseDevices = devices.filter((d) => d.status === "in_use");
  const types = ["Dump Truck", "Water Truck", "Fuel Truck", "Loader", "Others"];

  return types.map((type) => ({
    type,
    count: inUseDevices.filter((d) => d.equipmentType === type).length,
  }));
}

/**
 * Summary of operational activities for current dynamic month based on system date.
 */
export function getCurrentMonthActivitiesSummary(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const currentMonthKey = `${y}-${m}`;
  const allActs: ActivityRecord[] = getAllEnrichedActivities();
  const list = allActs.filter((a: ActivityRecord) => a.month === currentMonthKey && a.status === "completed");

  return {
    installation: list.filter((a: ActivityRecord) => a.type === "installation").length,
    troubleshoot: list.filter((a: ActivityRecord) => a.type === "troubleshoot").length,
    replacement: list.filter((a: ActivityRecord) => a.type === "replacement").length,
    removal: list.filter((a: ActivityRecord) => a.type === "removal").length,
  };
}

/**
 * Get latest relevant activity date for a specific device from operational records
 * (Installation, Replacement, Removal, Troubleshoot).
 * Returns ISO date string "YYYY-MM-DD" or null if no relevant activity found.
 */
export function getLastActivityDateByDevice(deviceId: string): string | null {
  const allActs: ActivityRecord[] = getAllEnrichedActivities();
  const relevantActs = allActs.filter(
    (a: ActivityRecord) =>
      a.deviceId === deviceId &&
      a.date
  );

  if (relevantActs.length === 0) return null;

  relevantActs.sort((a: ActivityRecord, b: ActivityRecord) => {
    const dtA = `${a.date} ${a.time || "00:00"}`;
    const dtB = `${b.date} ${b.time || "00:00"}`;
    return dtB.localeCompare(dtA);
  });

  return relevantActs[0].date;
}

