// src/lib/mock-data/fleet.ts
import { EquipmentType } from "@/types/dashboard";

/**
 * ⚠️ MASTER DATA ARMADA & EGI (EQUIPMENT MODEL CODE)
 *
 * Catatan Arsitektur & Sumber Data:
 * - Mengacu pada klarifikasi revisi mentor (9 Nov 2026):
 *   1. Setiap Unit Number memiliki keterikatan langsung dengan Equipment Type dan EGI model.
 *   2. EGI merupakan kode model unit pabrikan (contoh terkonfirmasi: HD785-7 untuk unit tertentu).
 *   3. Untuk unit yang belum memiliki kode EGI spesifik resmi dari Pak Tama / tim PAMA,
 *      digunakan kode sementara berformat `DUMMY-EGI-[UNIT]` atau model standar industri pertambangan.
 *   4. Struktur data ini dirancang terpusat agar saat database resmi terhubung,
 *      pembaruan EGI cukup dilakukan pada file/tabel ini tanpa mengubah logika form.
 */

export interface FleetUnitMaster {
  unitNo: string;
  equipmentType: EquipmentType;
  egi: string;
  isConfirmedEgi?: boolean;
}

/**
 * Master catalog seluruh armada MH02
 */
export const FLEET_MASTER_DATA: FleetUnitMaster[] = [
  // ─── DUMP TRUCK (DT-xxx) ──────────────────────────────────────────────────
  // Contoh terkonfirmasi: HD785-7 (Komatsu Dump Truck 91-ton class)
  { unitNo: "DT-101", equipmentType: "Dump Truck", egi: "HD785-7", isConfirmedEgi: true },
  { unitNo: "DT-102", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-102", isConfirmedEgi: false },
  { unitNo: "DT-103", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-103", isConfirmedEgi: false },
  { unitNo: "DT-104", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-104", isConfirmedEgi: false },
  { unitNo: "DT-105", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-105", isConfirmedEgi: false },
  { unitNo: "DT-201", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-201", isConfirmedEgi: false },
  { unitNo: "DT-202", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-202", isConfirmedEgi: false },
  { unitNo: "DT-203", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-203", isConfirmedEgi: false },
  { unitNo: "DT-301", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-301", isConfirmedEgi: false },
  { unitNo: "DT-305", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-305", isConfirmedEgi: false },
  { unitNo: "DT-401", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-401", isConfirmedEgi: false },
  { unitNo: "DT-404", equipmentType: "Dump Truck", egi: "DUMMY-EGI-DT-404", isConfirmedEgi: false },

  // ─── FUEL TRUCK (FT-xxx) ──────────────────────────────────────────────────
  { unitNo: "FT-101", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-101", isConfirmedEgi: false },
  { unitNo: "FT-102", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-102", isConfirmedEgi: false },
  { unitNo: "FT-201", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-201", isConfirmedEgi: false },
  { unitNo: "FT-202", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-202", isConfirmedEgi: false },
  { unitNo: "FT-301", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-301", isConfirmedEgi: false },
  { unitNo: "FT-302", equipmentType: "Fuel Truck", egi: "DUMMY-EGI-FT-302", isConfirmedEgi: false },

  // ─── WATER TRUCK (WT-xxx) ─────────────────────────────────────────────────
  { unitNo: "WT-05",  equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-05",  isConfirmedEgi: false },
  { unitNo: "WT-101", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-101", isConfirmedEgi: false },
  { unitNo: "WT-102", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-102", isConfirmedEgi: false },
  { unitNo: "WT-103", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-103", isConfirmedEgi: false },
  { unitNo: "WT-201", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-201", isConfirmedEgi: false },
  { unitNo: "WT-202", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-202", isConfirmedEgi: false },
  { unitNo: "WT-203", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-203", isConfirmedEgi: false },
  { unitNo: "WT-301", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-301", isConfirmedEgi: false },
  { unitNo: "WT-302", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-302", isConfirmedEgi: false },
  { unitNo: "WT-303", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-303", isConfirmedEgi: false },
  { unitNo: "WT-401", equipmentType: "Water Truck", egi: "DUMMY-EGI-WT-401", isConfirmedEgi: false },

  // ─── LOADER (LD-xxx) ──────────────────────────────────────────────────────
  { unitNo: "LD-02",  equipmentType: "Loader", egi: "DUMMY-EGI-LD-02",  isConfirmedEgi: false },
  { unitNo: "LD-101", equipmentType: "Loader", egi: "DUMMY-EGI-LD-101", isConfirmedEgi: false },
  { unitNo: "LD-201", equipmentType: "Loader", egi: "DUMMY-EGI-LD-201", isConfirmedEgi: false },
  { unitNo: "LD-202", equipmentType: "Loader", egi: "DUMMY-EGI-LD-202", isConfirmedEgi: false },
  { unitNo: "LD-301", equipmentType: "Loader", egi: "DUMMY-EGI-LD-301", isConfirmedEgi: false },
  { unitNo: "LD-305", equipmentType: "Loader", egi: "DUMMY-EGI-LD-305", isConfirmedEgi: false },
  { unitNo: "LD-410", equipmentType: "Loader", egi: "DUMMY-EGI-LD-410", isConfirmedEgi: false },
  { unitNo: "LD-511", equipmentType: "Loader", egi: "DUMMY-EGI-LD-511", isConfirmedEgi: false },

  // ─── OTHERS (OT-xxx) ──────────────────────────────────────────────────────
  { unitNo: "OT-101", equipmentType: "Others", egi: "DUMMY-EGI-OT-101", isConfirmedEgi: false },
  { unitNo: "OT-102", equipmentType: "Others", egi: "DUMMY-EGI-OT-102", isConfirmedEgi: false },
  { unitNo: "OT-201", equipmentType: "Others", egi: "DUMMY-EGI-OT-201", isConfirmedEgi: false },
  { unitNo: "OT-202", equipmentType: "Others", egi: "DUMMY-EGI-OT-202", isConfirmedEgi: false },
  { unitNo: "OT-301", equipmentType: "Others", egi: "DUMMY-EGI-OT-301", isConfirmedEgi: false },
  { unitNo: "OT-401", equipmentType: "Others", egi: "DUMMY-EGI-OT-401", isConfirmedEgi: false },
];

/**
 * Normalized lookup map (e.g. "dt101", "dt-101" -> record)
 */
const FLEET_MAP_BY_NORMALIZED = new Map<string, FleetUnitMaster>();
FLEET_MASTER_DATA.forEach((item) => {
  const normWithHyphen = item.unitNo.toLowerCase();
  const normWithoutHyphen = item.unitNo.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  FLEET_MAP_BY_NORMALIZED.set(normWithHyphen, item);
  FLEET_MAP_BY_NORMALIZED.set(normWithoutHyphen, item);
});

/**
 * Ambil master data armada berdasarkan Unit Number
 */
export function getFleetMasterByUnit(unitNo: string | null | undefined): FleetUnitMaster | undefined {
  if (!unitNo) return undefined;
  const trimmed = unitNo.trim().toLowerCase();
  const direct = FLEET_MAP_BY_NORMALIZED.get(trimmed);
  if (direct) return direct;
  const stripped = trimmed.replace(/[^a-zA-Z0-9]/g, "");
  return FLEET_MAP_BY_NORMALIZED.get(stripped);
}

/**
 * Ambil Equipment Type otomatis berdasarkan Unit Number
 */
export function getEquipmentTypeByUnit(unitNo: string | null | undefined, fallback: EquipmentType = "Dump Truck"): EquipmentType {
  const master = getFleetMasterByUnit(unitNo);
  if (master) return master.equipmentType;

  // Fallback prefix jika unit baru belum terdaftar di master
  if (unitNo) {
    const clean = unitNo.trim().toUpperCase();
    if (clean.startsWith("DT")) return "Dump Truck";
    if (clean.startsWith("WT")) return "Water Truck";
    if (clean.startsWith("FT")) return "Fuel Truck";
    if (clean.startsWith("LD")) return "Loader";
    if (clean.startsWith("OT")) return "Others";
  }
  return fallback;
}

/**
 * Ambil EGI otomatis berdasarkan Unit Number
 */
export function getEgiByUnit(unitNo: string | null | undefined): string {
  const master = getFleetMasterByUnit(unitNo);
  if (master) return master.egi;
  if (!unitNo || !unitNo.trim()) return "";
  const clean = unitNo.trim().toUpperCase();
  return `DUMMY-EGI-${clean.replace(/[^A-Z0-9]/g, "-")}`;
}

/**
 * Helper pencarian Unit Number yang akurat:
 * - Menjaga urutan karakter (FT102 !== TF102)
 * - Mengabaikan tanda hubung dan spasi sehingga "FT102" cocok dengan "FT-102"
 * - Tidak menggunakan fuzzy-matching yang membuat unit berbeda tertukar
 */
export function matchesUnitNumberSearch(unitNo: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!unitNo) return false;

  const q = query.trim().toUpperCase();
  const u = unitNo.trim().toUpperCase();

  // 1. Direct substring match (case-insensitive)
  if (u.includes(q)) return true;

  // 2. Alphanumeric normalized comparison (FT102 -> FT-102)
  const qClean = q.replace(/[^A-Z0-9]/g, "");
  const uClean = u.replace(/[^A-Z0-9]/g, "");

  if (qClean.length > 0 && uClean.includes(qClean)) {
    return true;
  }

  return false;
}

