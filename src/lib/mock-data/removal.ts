// src/lib/mock-data/removal.ts
import {
  RemovalRecord,
  DeviceFinalCondition,
  RemovalMasterStateSnapshot,
} from "@/types/removal";
import { DeviceRecord } from "@/types/dashboard";
import { devices } from "./devices";

export const REMOVAL_DEVICE_CONDITIONS: {
  value: DeviceFinalCondition;
  label: string;
  description: string;
  mappedStatus: "in_stock_rfu" | "in_stock_damaged" | "in_stock_ho";
}[] = [
  {
    value: "in_stock_rfu",
    label: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    description:
      "Pelepasan karena rotasi armada atau upgrade; perangkat masih berfungsi normal dan siap dipakai kembali.",
    mappedStatus: "in_stock_rfu",
  },
  {
    value: "in_stock_damaged",
    label: "Rusak di Site (In Stock Repair)",
    description:
      "Perangkat mengalami kerusakan fisik/fungsi dan disimpan di gudang site menunggu keputusan teknis.",
    mappedStatus: "in_stock_damaged",
  },
  {
    value: "in_stock_ho",
    label: "Butuh Repair ke HO (In Stock HO)",
    description:
      "Perangkat mengalami kendala berat dan disiapkan untuk dikirim ke Head Office untuk rekondisi/perbaikan.",
    mappedStatus: "in_stock_ho",
  },
];

// Initial mock dataset (10 records)
export let removalRecords: RemovalRecord[] = [
  {
    id: "REM-202310-001",
    deviceId: "D061",
    unitNo: "DT-101",
    reason: "Kerusakan",
    reasonDetail: "Sensor GPS tidak berfungsi",
    removalDate: "2023-10-01",
    technicianName: "Budi Setiawan",
    technicianNrp: "123456",
    district: "Sangatta",
    shift: "Shift 1",
    startTime: "08:00",
    endTime: "10:00",
    durationMinutes: 120,
    deviceFinalCondition: "in_stock_damaged",
    deviceFinalConditionLabel: "Rusak di Site (In Stock Repair)",
    photos: {
      beforeDevice: "https://via.placeholder.com/150",
      componentSet: "https://via.placeholder.com/150",
    },
    groupLeaderName: "Slamet",
    remarks: "Perlu penggantian unit baru",
  },
  {
    id: "REM-202310-002",
    deviceId: "D062",
    unitNo: "WT-202",
    reason: "Upgrade",
    removalDate: "2023-10-03",
    technicianName: "Andi Pratama",
    district: "Bengalon",
    shift: "Shift 2",
    startTime: "13:00",
    endTime: "15:30",
    durationMinutes: 150,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {
      beforeDevice: "https://via.placeholder.com/150",
      componentSet: "https://via.placeholder.com/150",
    },
    groupLeaderName: "Rudi",
    remarks: "Upgrade firmware selesai",
  },
  {
    id: "REM-202310-003",
    deviceId: "D063",
    unitNo: "LD-305",
    reason: "Dismantle",
    removalDate: "2023-10-05",
    technicianName: "Siti Aminah",
    district: "Wahau",
    shift: "Shift 1",
    startTime: "09:15",
    endTime: "11:45",
    durationMinutes: 150,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {
      beforeDevice: "https://via.placeholder.com/150",
      componentSet: "https://via.placeholder.com/150",
    },
    groupLeaderName: "Indra",
    remarks: "Unit dipindah ke depot",
  },
  {
    id: "REM-202310-004",
    deviceId: "D064",
    unitNo: "DT-202",
    reason: "Kerusakan",
    removalDate: "2023-10-07",
    technicianName: "Budi Setiawan",
    district: "Sangatta Utara",
    shift: "Shift 2",
    startTime: "08:30",
    endTime: "10:00",
    durationMinutes: 90,
    deviceFinalCondition: "in_stock_damaged",
    deviceFinalConditionLabel: "Rusak di Site (In Stock Repair)",
    photos: {},
    groupLeaderName: "Slamet",
    remarks: "Komponen diganti",
  },
  {
    id: "REM-202310-005",
    deviceId: "D065",
    unitNo: "WT-303",
    reason: "Upgrade",
    removalDate: "2023-10-09",
    technicianName: "Andi Pratama",
    district: "Bengalon",
    shift: "Shift 1",
    startTime: "14:00",
    endTime: "16:00",
    durationMinutes: 120,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {},
    groupLeaderName: "Rudi",
    remarks: "Versi firmware terbaru",
  },
  {
    id: "REM-202310-006",
    deviceId: "D066",
    unitNo: "LD-410",
    reason: "Dismantle",
    removalDate: "2023-10-11",
    technicianName: "Siti Aminah",
    district: "Wahau",
    shift: "Shift 2",
    startTime: "11:00",
    endTime: "13:30",
    durationMinutes: 150,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {},
    groupLeaderName: "Indra",
    remarks: "Unit armada ditarik dari pit",
  },
  {
    id: "REM-202310-007",
    deviceId: "D067",
    unitNo: "DT-105",
    reason: "Kerusakan",
    removalDate: "2023-10-13",
    technicianName: "Budi Setiawan",
    district: "Sangatta",
    shift: "Shift 1",
    startTime: "07:30",
    endTime: "09:30",
    durationMinutes: 120,
    deviceFinalCondition: "in_stock_ho",
    deviceFinalConditionLabel: "Butuh Repair ke HO (In Stock HO)",
    photos: {},
    groupLeaderName: "Slamet",
    remarks: "Kerusakan modul internal",
  },
  {
    id: "REM-202310-008",
    deviceId: "D068",
    unitNo: "WT-102",
    reason: "Upgrade",
    removalDate: "2023-10-15",
    technicianName: "Andi Pratama",
    district: "Sangatta",
    shift: "Shift 2",
    startTime: "15:00",
    endTime: "16:30",
    durationMinutes: 90,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {},
    groupLeaderName: "Rudi",
    remarks: "Hardware tambahan dipasang",
  },
  {
    id: "REM-202310-009",
    deviceId: "D069",
    unitNo: "LD-511",
    reason: "Dismantle",
    removalDate: "2023-10-17",
    technicianName: "Siti Aminah",
    district: "Wahau",
    shift: "Shift 1",
    startTime: "10:15",
    endTime: "12:45",
    durationMinutes: 150,
    deviceFinalCondition: "in_stock_rfu",
    deviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    photos: {},
    groupLeaderName: "Indra",
    remarks: "Dikembalikan ke vendor",
  },
  {
    id: "REM-202310-010",
    deviceId: "D070",
    unitNo: "DT-404",
    reason: "Kerusakan",
    removalDate: "2023-10-19",
    technicianName: "Budi Setiawan",
    district: "Sangatta Utara",
    shift: "Shift 2",
    startTime: "08:00",
    endTime: "10:30",
    durationMinutes: 150,
    deviceFinalCondition: "in_stock_damaged",
    deviceFinalConditionLabel: "Rusak di Site (In Stock Repair)",
    photos: {},
    groupLeaderName: "Slamet",
    remarks: "Unit diganti baru",
  },
];

// High-water mark state per month
const REMOVAL_FORM_NUMBER_PATTERN = /^REM-(\d{6})-(\d+)$/i;
const removalSequenceByMonth = new Map<string, number>();

function rememberRemovalFormNumber(id: string): void {
  const match = REMOVAL_FORM_NUMBER_PATTERN.exec(id);
  if (!match) return;
  const [, month, sequenceText] = match;
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return;
  removalSequenceByMonth.set(
    month,
    Math.max(removalSequenceByMonth.get(month) ?? 0, sequence)
  );
}

// Seed the in-memory high-water marks from all IDs at module startup
removalRecords.forEach((record) => rememberRemovalFormNumber(record.id));

export function getNextRemovalFormNumber(date: string): string {
  const yearMonth = date.slice(0, 7).replace("-", "");
  const activeMaximum = removalRecords.reduce((maximum, record) => {
    const match = REMOVAL_FORM_NUMBER_PATTERN.exec(record.id);
    if (!match || match[1] !== yearMonth) return maximum;
    const sequence = Number(match[2]);
    return Number.isSafeInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  const sequence = Math.max(removalSequenceByMonth.get(yearMonth) ?? 0, activeMaximum) + 1;
  removalSequenceByMonth.set(yearMonth, sequence);
  return `REM-${yearMonth}-${String(sequence).padStart(3, "0")}`;
}

const removalRecordListeners = new Set<() => void>();

export const getRemovalRecords = (): RemovalRecord[] => removalRecords;

export const subscribeToRemovalRecords = (listener: () => void): (() => void) => {
  removalRecordListeners.add(listener);
  return () => removalRecordListeners.delete(listener);
};

function notifyRemovalListeners(): void {
  removalRecordListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Subscriber failure must not roll back a committed in-memory transaction
    }
  });
}

function publishRemovalRecords(records: RemovalRecord[]): void {
  removalRecords = records;
  notifyRemovalListeners();
}

export function getRemovalById(id: string): RemovalRecord | undefined {
  return removalRecords.find((r) => r.id.toLowerCase() === id.toLowerCase());
}

export type RemovalCreationResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Creates a Removal record and updates master device as one atomic in-memory transaction.
 */
export function executeDeviceRemoval(record: RemovalRecord): RemovalCreationResult {
  if (removalRecords.some((existing) => existing.id.toLowerCase() === record.id.toLowerCase())) {
    return {
      success: false,
      message: `Nomor formulir ${record.id} sudah digunakan. Silakan periksa kembali.`,
    };
  }

  const dev = devices.find(
    (device) => device.deviceId.toLowerCase() === record.deviceId.toLowerCase()
  );

  if (!dev) {
    return {
      success: false,
      message: `Perangkat ${record.deviceId} tidak ditemukan dalam master perangkat.`,
    };
  }

  if (dev.status !== "in_use") {
    return {
      success: false,
      message: `Perangkat ${record.deviceId} tidak lagi berstatus In Use (status saat ini: ${dev.status}).`,
    };
  }

  if (dev.unitNo && record.unitNo && dev.unitNo.toLowerCase() !== record.unitNo.toLowerCase()) {
    return {
      success: false,
      message: `Nomor lambung unit ${record.unitNo} tidak cocok dengan nomor unit pada master (${dev.unitNo}).`,
    };
  }

  if (!record.deviceFinalCondition) {
    return {
      success: false,
      message: "Kondisi akhir perangkat wajib dipilih.",
    };
  }

  const previousDevice = { ...dev };
  const previousRecords = removalRecords;
  const recordWithSnapshot: RemovalRecord = {
    ...record,
    masterStateBefore: { device: { ...dev } },
  };

  try {
    // 1. Mutasi Master Device
    dev.status = record.deviceFinalCondition;
    dev.unitNo = null;
    dev.equipmentType = null;
    // Semantik lastMaintenanceDate adalah tanggal pemeliharaan terakhir; pelepasan unit dicatat sebagai event servis
    dev.lastMaintenanceDate = record.removalDate;

    // 2. Simpan Record
    rememberRemovalFormNumber(record.id);
    publishRemovalRecords([recordWithSnapshot, ...removalRecords]);

    return {
      success: true,
      message: `Pelepasan perangkat ${record.deviceId} berhasil dicatat. Status perangkat kini ${record.deviceFinalCondition}.`,
    };
  } catch {
    removalRecords = previousRecords;
    Object.assign(dev, previousDevice);
    return {
      success: false,
      message: "Gagal menyimpan pelepasan. Perubahan master dan laporan dikembalikan ke kondisi sebelumnya.",
    };
  }
}

export type RemovalEditResult =
  | { success: true; record: RemovalRecord }
  | { success: false; message: string };

function removalDeviceMatches(current: DeviceRecord, expected: DeviceRecord): boolean {
  return (
    current.deviceId === expected.deviceId &&
    current.status === expected.status &&
    current.unitNo === expected.unitNo &&
    current.equipmentType === expected.equipmentType
  );
}

/**
 * Validates and applies an edit to a Removal record.
 * Superadmin only. Allows editing metadata or correcting deviceFinalCondition if safe.
 */
export function executeDeviceRemovalEdit(
  recordId: string,
  proposed: RemovalRecord,
  actorRole: string
): RemovalEditResult {
  if (actorRole !== "superadmin") {
    return { success: false, message: "Hanya Superadmin yang dapat mengubah laporan Removal." };
  }

  const original = getRemovalById(recordId);
  if (!original) {
    return { success: false, message: "Laporan Removal tidak lagi tersedia." };
  }

  if (proposed.id !== original.id) {
    return { success: false, message: "Nomor formulir tidak dapat diubah." };
  }

  const dev = devices.find((d) => d.deviceId.toLowerCase() === original.deviceId.toLowerCase());
  if (!dev) {
    return { success: false, message: `Perangkat ${original.deviceId} tidak ditemukan di master.` };
  }

  const conditionChanged =
    proposed.deviceFinalCondition &&
    proposed.deviceFinalCondition !== original.deviceFinalCondition;

  const previousDevice = { ...dev };
  const previousRecords = removalRecords;
  const index = removalRecords.indexOf(original);
  if (index < 0) {
    return { success: false, message: "Laporan Removal tidak lagi tersedia di daftar." };
  }

  try {
    if (conditionChanged) {
      // Pastikan status perangkat saat ini masih sesuai dengan kondisi pasca-Removal semula
      if (original.deviceFinalCondition && dev.status !== original.deviceFinalCondition) {
        return {
          success: false,
          message: `Perubahan kondisi akhir ditolak: status perangkat ${dev.deviceId} di master telah berubah (${dev.status}) dan tidak aman untuk diperbarui.`,
        };
      }
      dev.status = proposed.deviceFinalCondition!;
    }

    const updatedRecord: RemovalRecord = {
      ...original,
      ...proposed,
      id: original.id,
      deviceId: original.deviceId, // Device target pelepasan dipertahankan
      unitNo: original.unitNo,
      masterStateBefore: original.masterStateBefore,
    };

    const nextRecords = [...removalRecords];
    nextRecords[index] = updatedRecord;
    publishRemovalRecords(nextRecords);

    return { success: true, record: updatedRecord };
  } catch {
    removalRecords = previousRecords;
    Object.assign(dev, previousDevice);
    return {
      success: false,
      message: "Perubahan Removal gagal disimpan. Data dikembalikan ke kondisi sebelumnya.",
    };
  }
}

export type RemovalDeletionResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Restores pre-removal master device state and deletes removal record atomically.
 * Superadmin only.
 */
export function executeDeviceRemovalDelete(
  recordId: string,
  actorRole: string
): RemovalDeletionResult {
  if (actorRole !== "superadmin") {
    return { success: false, message: "Hanya Superadmin yang dapat menghapus laporan Removal." };
  }

  const record = getRemovalById(recordId);
  if (!record) {
    return { success: false, message: "Laporan Removal tidak ditemukan. Tidak ada data yang diubah." };
  }

  const snapshot = record.masterStateBefore;
  if (!snapshot || !snapshot.device) {
    return {
      success: false,
      message:
        "Laporan Removal tidak dapat dihapus karena snapshot kondisi master sebelum pelepasan tidak tersedia pada data lama. Tidak ada data yang diubah.",
    };
  }

  const dev = devices.find(
    (d) => d.deviceId.toLowerCase() === record.deviceId.toLowerCase()
  );
  if (!dev) {
    return {
      success: false,
      message: "Perangkat terkait tidak ditemukan pada master. Tidak ada data yang diubah.",
    };
  }

  // Cek apakah kondisi master saat ini masih cocok dengan pasca-Removal (status sama dengan kondisi akhir, unitNo null)
  const expectedCurrentStatus = record.deviceFinalCondition || "in_stock_rfu";
  if (dev.status !== expectedCurrentStatus || dev.unitNo !== null) {
    return {
      success: false,
      message: `Laporan Removal tidak dapat dihapus karena kondisi perangkat ${dev.deviceId} di master sudah berubah atau telah dipasang ke unit lain. Tidak ada data yang diubah.`,
    };
  }

  // Cek apakah ada aktivitas transaksi lanjutan untuk perangkat ini
  const followsTarget = (other: RemovalRecord) =>
    other.removalDate > record.removalDate ||
    (other.removalDate === record.removalDate &&
      (other.startTime || "") >= (record.startTime || ""));
  const laterRelated = removalRecords.find(
    (other) =>
      other.id !== record.id &&
      followsTarget(other) &&
      other.deviceId.toLowerCase() === record.deviceId.toLowerCase()
  );
  if (laterRelated) {
    return {
      success: false,
      message: `Laporan Removal tidak dapat dihapus karena terdapat laporan lanjutan ${laterRelated.id} untuk perangkat ini. Tidak ada data yang diubah.`,
    };
  }

  const recordIndex = removalRecords.indexOf(record);
  if (recordIndex < 0) {
    return { success: false, message: "Laporan Removal sudah tidak tersedia." };
  }

  const previousRecords = removalRecords;
  const previousDevice = { ...dev };

  try {
    // Pulihkan status master device ke snapshot sebelum Removal
    Object.assign(dev, snapshot.device);

    const nextRecords = [...removalRecords];
    nextRecords.splice(recordIndex, 1);
    publishRemovalRecords(nextRecords);

    return {
      success: true,
      message: `Laporan ${record.id} berhasil dihapus dan kondisi perangkat ${record.deviceId} telah dipulihkan.`,
    };
  } catch {
    removalRecords = previousRecords;
    Object.assign(dev, previousDevice);
    return {
      success: false,
      message: "Penghapusan gagal. Laporan dan master perangkat dikembalikan ke kondisi sebelumnya.",
    };
  }
}
