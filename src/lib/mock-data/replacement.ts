// src/lib/mock-data/replacement.ts
import {
  ReplacementRecord,
  ReplacementPhotoSlotKey,
  OldDeviceFinalCondition,
} from "@/types/replacement";
import { DeviceRecord, DistrictName } from "@/types/dashboard";
import { devices } from "./devices";

export const OLD_DEVICE_CONDITIONS: {
  value: OldDeviceFinalCondition;
  label: string;
  description: string;
  mappedStatus: "in_stock_damaged" | "in_stock_ho" | "in_stock_rfu";
}[] = [
  {
    value: "in_stock_damaged",
    label: "Rusak di Site (In Stock Repair)",
    description: "Perangkat mengalami kerusakan fisik/komponen dan disimpan di gudang site menunggu keputusan.",
    mappedStatus: "in_stock_damaged",
  },
  {
    value: "in_stock_ho",
    label: "Butuh Repair ke HO (In Stock HO)",
    description: "Perangkat membutuhkan perbaikan tingkat lanjut dan disiapkan untuk dikirim ke Head Office.",
    mappedStatus: "in_stock_ho",
  },
  {
    value: "in_stock_rfu",
    label: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    description: "Penggantian preventif atau rotasi unit; perangkat lama masih berfungsi normal dan siap dipakai kembali.",
    mappedStatus: "in_stock_rfu",
  },
];

export const DEMO_REPLACEMENT_PHOTO_SLOTS: Record<
  ReplacementPhotoSlotKey,
  { slotLabel: string; defaultCaption: string; svgDataUri: string }
> = {
  mh02_new_installed: {
    slotLabel: "1. Foto SMARTD DISPLAY Baru Setelah Terpasang",
    defaultCaption: "Unit SMARTD DISPLAY baru terpasang kokoh pada braket kabin dengan penguncian anti-vibrasi.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <rect x="120" y="70" width="360" height="230" rx="16" fill="#1e293b" stroke="#3b82f6" stroke-width="3"/>
        <rect x="150" y="100" width="300" height="170" rx="10" fill="#0f172a" stroke="#1d4ed8" stroke-width="2"/>
        <circle cx="190" cy="140" r="10" fill="#22c55e"/>
        <text x="210" y="145" fill="#94a3b8" font-size="12" font-family="monospace">PWR OK</text>
        <circle cx="290" cy="140" r="10" fill="#3b82f6"/>
        <text x="310" y="145" fill="#94a3b8" font-size="12" font-family="monospace">GPS LOCK</text>
        <circle cx="390" cy="140" r="10" fill="#10b981"/>
        <text x="410" y="145" fill="#94a3b8" font-size="12" font-family="monospace">NEW UNIT</text>
        <rect x="160" y="190" width="280" height="50" rx="8" fill="#1e293b" stroke="#334155"/>
        <text x="300" y="222" fill="#38bdf8" font-size="13" font-weight="bold" font-family="monospace" text-anchor="middle">SMARTD-REPLACEMENT-NEW</text>
        <text x="300" y="340" fill="#64748b" font-size="13" font-family="sans-serif" text-anchor="middle">Unit Baru Terpasang &amp; Verifikasi Selesai</text>
      </svg>
      `),
  },
  mh02_old_removed: {
    slotLabel: "2. Foto SMARTD DISPLAY Lama yang Dilepas/Diganti",
    defaultCaption: "Unit SMARTD DISPLAY lama telah dilepas dari kabin untuk rekondisi/inspeksi lanjutan.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <rect x="120" y="70" width="360" height="230" rx="16" fill="#1e293b" stroke="#f43f5e" stroke-width="3"/>
        <rect x="150" y="100" width="300" height="170" rx="10" fill="#0f172a" stroke="#be123c" stroke-width="2"/>
        <circle cx="200" cy="140" r="10" fill="#f43f5e"/>
        <text x="220" y="145" fill="#94a3b8" font-size="12" font-family="monospace">DISCONNECTED</text>
        <circle cx="370" cy="140" r="10" fill="#eab308"/>
        <text x="390" y="145" fill="#94a3b8" font-size="12" font-family="monospace">OLD UNIT</text>
        <rect x="160" y="190" width="280" height="50" rx="8" fill="#1e293b" stroke="#334155"/>
        <text x="300" y="222" fill="#fb7185" font-size="13" font-weight="bold" font-family="monospace" text-anchor="middle">SMARTD-OLD-REMOVED</text>
        <text x="300" y="340" fill="#64748b" font-size="13" font-family="sans-serif" text-anchor="middle">Unit Lama Telah Dicopot &amp; Diberi Label</text>
      </svg>
      `),
  },
  camera_dashboard_angle: {
    slotLabel: "3. Foto Posisi Kamera Dashboard & Angle View",
    defaultCaption: "Posisi kamera pada dashboard terarah tepat ke blindspot & pandangan depan pengemudi.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <ellipse cx="300" cy="300" rx="260" ry="120" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        <rect x="250" y="130" width="100" height="60" rx="8" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
        <circle cx="300" cy="160" r="20" fill="#0f172a" stroke="#e0f2fe" stroke-width="3"/>
        <circle cx="300" cy="160" r="8" fill="#38bdf8"/>
        <polygon points="270,190 200,320 400,320 330,190" fill="#38bdf8" opacity="0.15"/>
        <text x="300" y="270" fill="#38bdf8" font-size="12" font-family="monospace" text-anchor="middle">ANGLE VIEW FOV 120°</text>
        <text x="300" y="350" fill="#64748b" font-size="13" font-family="sans-serif" text-anchor="middle">Kalibrasi Kamera Dashboard &amp; Blindspot Driver</text>
      </svg>
      `),
  },
  nodered_config: {
    slotLabel: "4. Foto Konfigurasi SMARTD DISPLAY & UI Node-RED",
    defaultCaption: "Konfigurasi Node-RED menunjukkan seluruh sensor terhubung dan parameter SPM normal.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <rect x="60" y="60" width="480" height="260" rx="12" fill="#1e293b" stroke="#8b5cf6" stroke-width="3"/>
        <rect x="90" y="90" width="120" height="40" rx="6" fill="#8b5cf6"/>
        <text x="150" y="115" fill="#ffffff" font-size="12" font-family="sans-serif" text-anchor="middle">VHMS Stream</text>
        <rect x="230" y="90" width="160" height="40" rx="6" fill="#0ea5e9"/>
        <text x="310" y="115" fill="#ffffff" font-size="12" font-family="sans-serif" text-anchor="middle">SMARTD Telemetry</text>
        <rect x="410" y="90" width="100" height="40" rx="6" fill="#10b981"/>
        <text x="460" y="115" fill="#ffffff" font-size="12" font-family="sans-serif" text-anchor="middle">MQTT Broker</text>
        <line x1="210" y1="110" x2="230" y2="110" stroke="#a78bfa" stroke-width="3" stroke-dasharray="4"/>
        <line x1="390" y1="110" x2="410" y2="110" stroke="#38bdf8" stroke-width="3" stroke-dasharray="4"/>
        <rect x="90" y="160" width="420" height="130" rx="6" fill="#0f172a" stroke="#334155"/>
        <text x="110" y="195" fill="#22c55e" font-size="12" font-family="monospace">&gt; [OK] Status: SPM v1.2.4 connected</text>
        <text x="110" y="225" fill="#38bdf8" font-size="12" font-family="monospace">&gt; [OK] IP SMARTD: 192.168.1.102 ping 2ms</text>
        <text x="110" y="255" fill="#eab308" font-size="12" font-family="monospace">&gt; [OK] Telemetry packet stream 10Hz</text>
        <text x="300" y="360" fill="#64748b" font-size="13" font-family="sans-serif" text-anchor="middle">Node-RED Flow Diagnostics: PASSED</text>
      </svg>
      `),
  },
  gps_antenna: {
    slotLabel: "5. Foto Posisi Antena GPS & GPS SMARTD DISPLAY",
    defaultCaption: "Posisi antena GPS terpasang pada roof bar dengan line-of-sight terbuka ke langit.",
    svgDataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
        <rect width="600" height="400" fill="#0f172a"/>
        <line x1="80" y1="280" x2="520" y2="280" stroke="#475569" stroke-width="8"/>
        <rect x="260" y="200" width="80" height="80" rx="6" fill="#1e293b" stroke="#64748b" stroke-width="3"/>
        <ellipse cx="300" cy="180" rx="60" ry="25" fill="#0284c7" stroke="#38bdf8" stroke-width="3"/>
        <path d="M 240,140 A 70,70 0 0,1 360,140" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6"/>
        <path d="M 220,110 A 100,100 0 0,1 380,110" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-dasharray="6"/>
        <circle cx="300" cy="60" r="10" fill="#eab308"/>
        <text x="300" y="85" fill="#fbbf24" font-size="11" font-family="monospace" text-anchor="middle">GNSS SAT</text>
        <text x="300" y="340" fill="#64748b" font-size="13" font-family="sans-serif" text-anchor="middle">Antena GNSS/GPS High-Gain Locked (12 Satelit)</text>
      </svg>
      `),
  },
};

/**
 * Dataset Awal Riwayat Penggantian Perangkat (Replacement)
 * Seluruh nama teknisi menggunakan nama fiktif netral.
 */
export let initialReplacements: ReplacementRecord[] = [
  {
    id: "REP-202610-001",
    activityType: "Replacement",
    date: "2026-10-14",
    startTime: "09:00",
    endTime: "11:15",
    durationFormatted: "2 Jam 15 Menit",
    durationMinutes: 135,
    shift: "Shift 1",
    district: "Sangatta",
    oldDeviceId: "D002",
    oldDeviceSerialNumber: "SN002",
    oldUnitNo: "WT-101",
    oldEquipmentType: "Water Truck",
    oldDeviceFinalCondition: "in_stock_damaged",
    oldDeviceFinalConditionLabel: "Rusak di Site (In Stock Repair)",
    newDeviceId: "D013",
    newDeviceSerialNumber: "SN013",
    unitNo: "WT-101",
    equipmentType: "Water Truck",
    sourcePower: "Standby PDU",
    spmVersion: "v1.2.4 (Stable)",
    ipAddress: "192.168.1.103",
    ipCpe: "192.168.1.1",
    ipVhms: "192.168.1.51",
    technicianName: "Fauzan Aditya",
    technicianNrp: "NRP-774520",
    groupLeaderName: "Agus Setiawan (GL)",
    status: "completed",
    remarks: "Penggantian unit SMARTD DISPLAY lama karena port konektor serial korosi. Unit baru terpasang dan komunikasi VHMS normal.",
    photos: [
      {
        slot: "mh02_new_installed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.svgDataUri,
        caption: "Unit baru D013 terpasang rapi pada Water Truck WT-101.",
      },
      {
        slot: "mh02_old_removed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.svgDataUri,
        caption: "Unit lama D002 telah dilepas dan disimpan di gudang site.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard sejajar dengan titik pandang kemudi.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Node-RED online dengan konfigurasi SPM v1.2.4.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS mengunci koordinat dengan deviasi minimal.",
      },
    ],
    createdAt: "2026-10-14 11:20",
  },
  {
    id: "REP-202609-002",
    activityType: "Replacement",
    date: "2026-09-22",
    startTime: "13:00",
    endTime: "15:00",
    durationFormatted: "2 Jam 00 Menit",
    durationMinutes: 120,
    shift: "Shift 2",
    district: "Bengalon",
    oldDeviceId: "D035",
    oldDeviceSerialNumber: "SN035",
    oldUnitNo: "WT-201",
    oldEquipmentType: "Water Truck",
    oldDeviceFinalCondition: "in_stock_ho",
    oldDeviceFinalConditionLabel: "Butuh Repair ke HO (In Stock HO)",
    newDeviceId: "D015",
    newDeviceSerialNumber: "SN015",
    unitNo: "WT-201",
    equipmentType: "Water Truck",
    sourcePower: "Acc On",
    spmVersion: "v1.2.4 (Stable)",
    ipAddress: "192.168.2.105",
    ipCpe: "192.168.2.1",
    ipVhms: "192.168.2.55",
    technicianName: "Dedi Supriyadi",
    technicianNrp: "NRP-772188",
    groupLeaderName: "Bambang Hermanto (GL)",
    status: "completed",
    remarks: "Penggantian modul karena kerusakan internal power board. Unit lama dikirim ke Head Office untuk perbaikan.",
    photos: [
      {
        slot: "mh02_new_installed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.svgDataUri,
        caption: "Unit baru D015 aktif pada Water Truck WT-201 Bengalon.",
      },
      {
        slot: "mh02_old_removed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.svgDataUri,
        caption: "Unit D035 dibungkus packing aman untuk kirim ke HO.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Sudut pandang kamera depan kabin optimal.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Parameter telematika terhubung ke server Bengalon.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Antena GPS terpasang kuat pada roof bracket.",
      },
    ],
    createdAt: "2026-09-22 15:10",
  },
  {
    id: "REP-202608-003",
    activityType: "Replacement",
    date: "2026-08-18",
    startTime: "08:15",
    endTime: "10:30",
    durationFormatted: "2 Jam 15 Menit",
    durationMinutes: 135,
    shift: "Shift 1",
    district: "Wahau",
    oldDeviceId: "D045",
    oldDeviceSerialNumber: "SN045",
    oldUnitNo: "WT-301",
    oldEquipmentType: "Water Truck",
    oldDeviceFinalCondition: "in_stock_rfu",
    oldDeviceFinalConditionLabel: "Kondisi Masih Baik / Cadangan (In Stock RFU)",
    newDeviceId: "D017",
    newDeviceSerialNumber: "SN017",
    unitNo: "WT-301",
    equipmentType: "Water Truck",
    sourcePower: "Standby PDU",
    spmVersion: "v2.0.1",
    ipAddress: "192.168.3.112",
    ipCpe: "192.168.3.1",
    ipVhms: "192.168.3.60",
    technicianName: "Hendro Wibowo",
    technicianNrp: "NRP-773012",
    groupLeaderName: "Hendra Wijaya (GL)",
    status: "completed",
    remarks: "Penggantian preventif untuk standarisasi SPM firmware v2.0.1. Unit lama masih berfungsi normal dan disimpan sebagai cadangan RFU.",
    photos: [
      {
        slot: "mh02_new_installed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_new_installed.svgDataUri,
        caption: "Unit baru D017 telah dipasang pada WT-301.",
      },
      {
        slot: "mh02_old_removed",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.mh02_old_removed.svgDataUri,
        caption: "Unit D045 dilepas dalam kondisi baik.",
      },
      {
        slot: "camera_dashboard_angle",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.camera_dashboard_angle.svgDataUri,
        caption: "Kamera dashboard terkalibrasi normal.",
      },
      {
        slot: "nodered_config",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.nodered_config.svgDataUri,
        caption: "Firmware v2.0.1 terverifikasi di Node-RED.",
      },
      {
        slot: "gps_antenna",
        slotLabel: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: DEMO_REPLACEMENT_PHOTO_SLOTS.gps_antenna.svgDataUri,
        caption: "Sinyal GNSS locked dengan SNR tinggi.",
      },
    ],
    createdAt: "2026-08-18 10:45",
  },
];

const replacementSequenceByMonth = new Map<string, number>();
const REPLACEMENT_FORM_NUMBER_PATTERN = /^REP-(\d{6})-(\d+)$/i;

function rememberReplacementFormNumber(id: string): void {
  const match = REPLACEMENT_FORM_NUMBER_PATTERN.exec(id);
  if (!match) return;
  const [, month, sequenceText] = match;
  const sequence = Number(sequenceText);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return;
  replacementSequenceByMonth.set(month, Math.max(replacementSequenceByMonth.get(month) ?? 0, sequence));
}

// Seed the in-memory high-water marks from all IDs available at module startup.
initialReplacements.forEach((record) => rememberReplacementFormNumber(record.id));

/** Returns the next visible Form Number without relying on active-record count. */
export function getNextReplacementFormNumber(date: string): string {
  const yearMonth = date.slice(0, 7).replace("-", "");
  const activeMaximum = initialReplacements.reduce((maximum, record) => {
    const match = REPLACEMENT_FORM_NUMBER_PATTERN.exec(record.id);
    if (!match || match[1] !== yearMonth) return maximum;
    const sequence = Number(match[2]);
    return Number.isSafeInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  const sequence = Math.max(replacementSequenceByMonth.get(yearMonth) ?? 0, activeMaximum) + 1;
  // Reserve the visible number in this session, even if the form is later cancelled.
  replacementSequenceByMonth.set(yearMonth, sequence);
  return `REP-${yearMonth}-${String(sequence).padStart(3, "0")}`;
}

const replacementListeners = new Set<() => void>();

export function getReplacementRecords(): ReplacementRecord[] {
  return initialReplacements;
}

export function subscribeToReplacementRecords(listener: () => void): () => void {
  replacementListeners.add(listener);
  return () => replacementListeners.delete(listener);
}

function notifyReplacementListeners(): void {
  replacementListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A subscriber failure must not roll back a committed in-memory transaction.
    }
  });
}

function publishReplacementRecords(records: ReplacementRecord[]): void {
  initialReplacements = records;
  notifyReplacementListeners();
}

/**
 * Menambahkan catatan Replacement baru ke dataset in-memory
 */
export function addReplacementRecord(record: ReplacementRecord): ReplacementRecord[] {
  if (!initialReplacements.some((r) => r.id === record.id)) {
    rememberReplacementFormNumber(record.id);
    publishReplacementRecords([record, ...initialReplacements]);
  }
  return initialReplacements;
}

/**
 * Mencari catatan Replacement berdasarkan ID
 */
export function getReplacementById(id: string): ReplacementRecord | undefined {
  return initialReplacements.find((r) => r.id.toLowerCase() === id.toLowerCase());
}

export type ReplacementCreationResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Validates and creates a Replacement record together with both device updates.
 * If any step fails, the in-memory record and device snapshots are restored.
 */
export function executeDeviceReplacement(
  record: ReplacementRecord
): ReplacementCreationResult {
  if (initialReplacements.some((existing) => existing.id.toLowerCase() === record.id.toLowerCase())) {
    return {
      success: false,
      message: `Nomor formulir ${record.id} sudah digunakan. Silakan periksa kembali nomor formulir.`,
    };
  }

  const oldDev = devices.find(
    (device) => device.deviceId.toLowerCase() === record.oldDeviceId.toLowerCase()
  );
  const newDev = devices.find(
    (device) => device.deviceId.toLowerCase() === record.newDeviceId.toLowerCase()
  );

  if (!oldDev) {
    return { success: false, message: `Perangkat lama ${record.oldDeviceId} tidak ditemukan dalam master perangkat.` };
  }
  if (!newDev) {
    return { success: false, message: `Perangkat baru ${record.newDeviceId} tidak ditemukan dalam master perangkat.` };
  }
  if (oldDev === newDev) {
    return { success: false, message: "Perangkat lama dan perangkat baru tidak boleh sama." };
  }
  if (oldDev.status !== "in_use") {
    return {
      success: false,
      message: `Perangkat lama ${record.oldDeviceId} tidak lagi berstatus In Use (status saat ini: ${oldDev.status}).`,
    };
  }
  if (newDev.status !== "in_stock_rfu") {
    return {
      success: false,
      message: `Perangkat baru ${record.newDeviceId} tidak memenuhi syarat kelayakan: hanya perangkat berstatus In Stock RFU yang dapat dipilih (status saat ini: ${newDev.status}).`,
    };
  }

  // Integrity constraint: Replacement changes telematics device, NOT vehicle identity.
  // Old unit/equipment and target unit/equipment must strictly match.
  if (oldDev.unitNo && record.unitNo && oldDev.unitNo.trim().toUpperCase() !== record.unitNo.trim().toUpperCase()) {
    return {
      success: false,
      message: `Integritas kendaraan dilanggar: Unit Number target (${record.unitNo}) harus sama dengan Unit Number perangkat lama (${oldDev.unitNo}).`,
    };
  }
  if (oldDev.equipmentType && record.equipmentType && oldDev.equipmentType !== record.equipmentType) {
    return {
      success: false,
      message: `Integritas kendaraan dilanggar: Tipe Alat Berat target (${record.equipmentType}) harus sama dengan Tipe Alat Berat perangkat lama (${oldDev.equipmentType}).`,
    };
  }

  const previousOldDevice = { ...oldDev };
  const previousNewDevice = { ...newDev };
  const previousRecords = initialReplacements;
  const recordWithSnapshot: ReplacementRecord = {
    ...record,
    masterStateBefore: { oldDevice: { ...oldDev }, newDevice: { ...newDev } },
  };

  try {
    if (initialReplacements.some((existing) => existing.id.toLowerCase() === record.id.toLowerCase())) {
      throw new Error(`Nomor formulir ${record.id} gagal disimpan.`);
    }
    initialReplacements = [recordWithSnapshot, ...initialReplacements];

    oldDev.status = record.oldDeviceFinalCondition;
    oldDev.unitNo = null;

    newDev.status = "in_use";
    newDev.unitNo = record.unitNo;
    newDev.equipmentType = record.equipmentType;
    newDev.district = record.district as DistrictName;
    newDev.lastMaintenanceDate = record.date;

    rememberReplacementFormNumber(record.id);
    notifyReplacementListeners();
    return { success: true, message: "Replacement dan pembaruan master perangkat berhasil disimpan." };
  } catch {
    initialReplacements = previousRecords;
    Object.assign(oldDev, previousOldDevice);
    Object.assign(newDev, previousNewDevice);
    return {
      success: false,
      message: "Replacement gagal disimpan. Data kedua perangkat dan laporan dikembalikan ke kondisi sebelumnya.",
    };
  }
}

export type ReplacementEditResult =
  | { success: true; record: ReplacementRecord }
  | { success: false; message: string };

const replacementMasterFields: (keyof ReplacementRecord)[] = [
  "oldDeviceId", "newDeviceId", "oldDeviceFinalCondition", "unitNo", "equipmentType", "district", "date",
];

function deviceStateMatches(current: DeviceRecord, expected: DeviceRecord): boolean {
  return current.deviceId === expected.deviceId &&
    current.serialNumber === expected.serialNumber &&
    current.status === expected.status &&
    current.unitNo === expected.unitNo &&
    current.equipmentType === expected.equipmentType &&
    current.district === expected.district &&
    current.currentLocation === expected.currentLocation &&
    current.healthCheckStatus === expected.healthCheckStatus &&
    current.lastMaintenanceDate === expected.lastMaintenanceDate;
}

function hasCompleteReplacementDeviceSnapshot(snapshot: DeviceRecord | undefined): snapshot is DeviceRecord {
  if (!snapshot || typeof snapshot.deviceId !== "string" || !snapshot.deviceId || typeof snapshot.serialNumber !== "string") return false;
  const has = (key: keyof DeviceRecord) => Object.prototype.hasOwnProperty.call(snapshot, key);
  return has("status") && has("unitNo") && has("equipmentType") && has("district") &&
    has("healthCheckStatus") && has("lastMaintenanceDate") &&
    ["in_use", "in_stock_rfu", "in_stock_damaged", "in_stock_ho"].includes(snapshot.status) &&
    ["complete", "incomplete", "not_checked"].includes(snapshot.healthCheckStatus) &&
    (snapshot.unitNo === null || typeof snapshot.unitNo === "string") &&
    (snapshot.equipmentType === null || typeof snapshot.equipmentType === "string") &&
    (snapshot.district === null || typeof snapshot.district === "string") &&
    (snapshot.lastMaintenanceDate === null || typeof snapshot.lastMaintenanceDate === "string");
}

/** Prepares an edit and validates its current master-data consequences without mutation. */
export function prepareDeviceReplacementEdit(
  recordId: string,
  proposed: ReplacementRecord,
  actorRole: string
): ReplacementEditResult {
  if (actorRole !== "superadmin") return { success: false, message: "Hanya Superadmin yang dapat mengubah laporan Replacement." };
  const original = getReplacementById(recordId);
  if (!original) return { success: false, message: "Laporan Replacement tidak lagi tersedia." };
  if (proposed.id !== original.id) return { success: false, message: "Nomor formulir tidak dapat diubah." };

  const masterChanged = replacementMasterFields.some((field) => proposed[field] !== original[field]);
  if (!masterChanged) {
    return { success: true, record: { ...original, ...proposed, id: original.id, masterStateBefore: original.masterStateBefore } };
  }

  const snapshot = original.masterStateBefore;
  if (!snapshot) {
    return { success: false, message: "Perubahan perangkat ditolak: snapshot kondisi master sebelum Replacement tidak tersedia pada laporan lama." };
  }
  const originalOld = devices.find((device) => device.deviceId === original.oldDeviceId);
  const originalNew = devices.find((device) => device.deviceId === original.newDeviceId);
  if (!originalOld || !originalNew) {
    return { success: false, message: "Perubahan perangkat ditolak: perangkat pada transaksi awal tidak ditemukan di master." };
  }

  const expectedOld: DeviceRecord = { ...snapshot.oldDevice, status: original.oldDeviceFinalCondition, unitNo: null };
  const expectedNew: DeviceRecord = {
    ...snapshot.newDevice,
    status: "in_use",
    unitNo: original.unitNo,
    equipmentType: original.equipmentType,
    district: original.district as DistrictName,
    lastMaintenanceDate: original.date,
  };
  if (!deviceStateMatches(originalOld, expectedOld) || !deviceStateMatches(originalNew, expectedNew)) {
    return { success: false, message: "Perubahan perangkat ditolak: kondisi master berubah setelah transaksi Replacement dan tidak aman untuk dipulihkan." };
  }

  const projected = new Map(devices.map((device) => [device.deviceId, { ...device }]));
  projected.set(snapshot.oldDevice.deviceId, { ...snapshot.oldDevice });
  projected.set(snapshot.newDevice.deviceId, { ...snapshot.newDevice });
  const nextOld = projected.get(proposed.oldDeviceId);
  const nextNew = projected.get(proposed.newDeviceId);
  if (!nextOld) return { success: false, message: `Perangkat lama ${proposed.oldDeviceId} tidak ditemukan dalam master perangkat.` };
  if (!nextNew) return { success: false, message: `Perangkat baru ${proposed.newDeviceId} tidak ditemukan dalam master perangkat.` };
  if (nextOld.deviceId === nextNew.deviceId) return { success: false, message: "Perangkat lama dan perangkat baru tidak boleh sama." };
  if (nextOld.status !== "in_use") return { success: false, message: `Perangkat lama ${nextOld.deviceId} tidak berstatus In Use setelah kondisi awal dipulihkan.` };
  if (nextNew.status !== "in_stock_rfu") return { success: false, message: `Perangkat baru ${nextNew.deviceId} tidak memenuhi syarat kelayakan: hanya perangkat berstatus In Stock RFU yang dapat dipilih (status: ${nextNew.status}).` };

  // Integrity constraint: vehicle identity cannot change during replacement
  const targetUnit = proposed.unitNo || nextOld.unitNo || "";
  const targetEquip = proposed.equipmentType || nextOld.equipmentType || "Dump Truck";
  if (nextOld.unitNo && targetUnit && nextOld.unitNo.trim().toUpperCase() !== targetUnit.trim().toUpperCase()) {
    return { success: false, message: `Integritas kendaraan dilanggar: Unit Number target (${targetUnit}) harus sama dengan Unit Number perangkat lama (${nextOld.unitNo}).` };
  }
  if (nextOld.equipmentType && targetEquip && nextOld.equipmentType !== targetEquip) {
    return { success: false, message: `Integritas kendaraan dilanggar: Tipe Alat Berat target (${targetEquip}) harus sama dengan Tipe Alat Berat perangkat lama (${nextOld.equipmentType}).` };
  }

  return {
    success: true,
    record: {
      ...original,
      ...proposed,
      id: original.id,
      oldDeviceSerialNumber: nextOld.serialNumber,
      newDeviceSerialNumber: nextNew.serialNumber,
      oldUnitNo: nextOld.unitNo ?? targetUnit,
      oldEquipmentType: nextOld.equipmentType ?? targetEquip,
      unitNo: nextOld.unitNo ?? targetUnit,
      equipmentType: nextOld.equipmentType ?? targetEquip,
      masterStateBefore: { oldDevice: { ...nextOld }, newDevice: { ...nextNew } },
    },
  };
}

/** Revalidates and applies an edit atomically across the report and affected devices. */
export function executeDeviceReplacementEdit(
  recordId: string,
  proposed: ReplacementRecord,
  actorRole: string
): ReplacementEditResult {
  const prepared = prepareDeviceReplacementEdit(recordId, proposed, actorRole);
  if (!prepared.success) return prepared;
  const original = getReplacementById(recordId);
  if (!original) return { success: false, message: "Laporan Replacement tidak lagi tersedia." };
  const index = initialReplacements.indexOf(original);
  if (index < 0) return { success: false, message: "Laporan Replacement tidak lagi tersedia." };

  const candidate = prepared.record;
  const masterChanged = replacementMasterFields.some((field) => candidate[field] !== original[field]);
  const previousRecords = initialReplacements;
  const originalOld = devices.find((device) => device.deviceId === original.oldDeviceId);
  const originalNew = devices.find((device) => device.deviceId === original.newDeviceId);
  const nextOld = masterChanged ? devices.find((device) => device.deviceId === candidate.oldDeviceId) : undefined;
  const nextNew = masterChanged ? devices.find((device) => device.deviceId === candidate.newDeviceId) : undefined;
  const affected = Array.from(new Set([originalOld, originalNew, nextOld, nextNew].filter((device): device is DeviceRecord => Boolean(device))));
  const deviceBackups = affected.map((device) => ({ device, state: { ...device } }));

  try {
    if (masterChanged) {
      const snapshot = original.masterStateBefore;
      if (!snapshot || !originalOld || !originalNew || !nextOld || !nextNew) {
        return { success: false, message: "Perubahan perangkat tidak dapat diterapkan karena master atau snapshot tidak tersedia." };
      }
      Object.assign(originalOld, snapshot.oldDevice);
      Object.assign(originalNew, snapshot.newDevice);
      nextOld.status = candidate.oldDeviceFinalCondition;
      nextOld.unitNo = null;
      nextNew.status = "in_use";
      nextNew.unitNo = candidate.unitNo;
      nextNew.equipmentType = candidate.equipmentType;
      nextNew.district = candidate.district as DistrictName;
      nextNew.lastMaintenanceDate = candidate.date;
    }

    const nextRecords = [...initialReplacements];
    nextRecords[index] = candidate;
    publishReplacementRecords(nextRecords);
    return { success: true, record: candidate };
  } catch {
    initialReplacements = previousRecords;
    deviceBackups.forEach(({ device, state }) => Object.assign(device, state));
    return { success: false, message: "Perubahan Replacement gagal diterapkan. Laporan dan master perangkat dikembalikan ke kondisi sebelumnya." };
  }
}

export type ReplacementDeletionResult =
  | { success: true; message: string }
  | { success: false; message: string };

/** Restores the pre-Replacement master state and removes the report as one in-memory operation. */
export function executeDeviceReplacementDelete(
  recordId: string,
  actorRole: string
): ReplacementDeletionResult {
  if (actorRole !== "superadmin") {
    return { success: false, message: "Hanya Superadmin yang dapat menghapus laporan Replacement." };
  }

  const record = getReplacementById(recordId);
  if (!record) return { success: false, message: "Laporan Replacement tidak ditemukan. Tidak ada data yang diubah." };
  const snapshot = record.masterStateBefore;
  if (!snapshot || !hasCompleteReplacementDeviceSnapshot(snapshot.oldDevice) || !hasCompleteReplacementDeviceSnapshot(snapshot.newDevice)) {
    return { success: false, message: "Laporan Replacement tidak dapat dihapus karena snapshot kondisi awal kedua perangkat tidak tersedia. Tidak ada data yang diubah." };
  }
  if (snapshot.oldDevice.deviceId !== record.oldDeviceId || snapshot.newDevice.deviceId !== record.newDeviceId) {
    return { success: false, message: "Laporan Replacement tidak dapat dihapus karena identitas perangkat pada snapshot tidak sesuai dengan laporan. Tidak ada data yang diubah." };
  }

  const oldDevice = devices.find((device) => device.deviceId === record.oldDeviceId);
  const newDevice = devices.find((device) => device.deviceId === record.newDeviceId);
  if (!oldDevice || !newDevice) {
    return { success: false, message: "Laporan Replacement tidak dapat dihapus karena salah satu perangkat tidak ditemukan pada master. Tidak ada data yang diubah." };
  }

  const expectedOld: DeviceRecord = { ...snapshot.oldDevice, status: record.oldDeviceFinalCondition, unitNo: null };
  const expectedNew: DeviceRecord = {
    ...snapshot.newDevice,
    status: "in_use",
    unitNo: record.unitNo,
    equipmentType: record.equipmentType,
    district: record.district as DistrictName,
    lastMaintenanceDate: record.date,
  };
  if (!deviceStateMatches(oldDevice, expectedOld) || !deviceStateMatches(newDevice, expectedNew)) {
    return { success: false, message: "Laporan Replacement tidak dapat dihapus karena kondisi master salah satu perangkat sudah berubah. Tidak ada data yang diubah." };
  }

  const followsTarget = (other: ReplacementRecord) =>
    other.date > record.date ||
    (other.date === record.date && other.startTime >= record.startTime);
  const affectedDeviceIds = new Set([record.oldDeviceId, record.newDeviceId].map((deviceId) => deviceId.toLowerCase()));
  const laterRelated = initialReplacements.find((other) =>
    other.id !== record.id &&
    followsTarget(other) &&
    [other.oldDeviceId, other.newDeviceId].some((deviceId) =>
      affectedDeviceIds.has(deviceId.toLowerCase())
    )
  );
  if (laterRelated) {
    return {
      success: false,
      message: `Laporan Replacement tidak dapat dihapus karena perangkat terkait digunakan kembali pada laporan ${laterRelated.id}. Tidak ada data yang diubah.`,
    };
  }

  const recordIndex = initialReplacements.indexOf(record);
  if (recordIndex < 0) return { success: false, message: "Laporan Replacement sudah tidak tersedia. Tidak ada data yang diubah." };
  const previousRecords = initialReplacements;
  const previousOldDevice = { ...oldDevice };
  const previousNewDevice = { ...newDevice };

  try {
    Object.assign(oldDevice, snapshot.oldDevice);
    Object.assign(newDevice, snapshot.newDevice);
    const nextRecords = [...initialReplacements];
    nextRecords.splice(recordIndex, 1);
    publishReplacementRecords(nextRecords);
    return { success: true, message: `Laporan ${record.id} dihapus dan kondisi kedua perangkat dipulihkan.` };
  } catch {
    initialReplacements = previousRecords;
    Object.assign(oldDevice, previousOldDevice);
    Object.assign(newDevice, previousNewDevice);
    return { success: false, message: "Penghapusan gagal. Laporan dan kondisi kedua perangkat dikembalikan ke kondisi sebelumnya." };
  }
}
