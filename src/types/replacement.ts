// src/types/replacement.ts
import { DistrictName, EquipmentType, DeviceStatus } from "./dashboard";
import { InstallationShift, SourcePowerType } from "./installation";

export type ReplacementPhotoSlotKey =
  | "mh02_new_installed"
  | "mh02_old_removed"
  | "camera_dashboard_angle"
  | "nodered_config"
  | "gps_antenna";

export interface ReplacementPhoto {
  slot: ReplacementPhotoSlotKey;
  slotLabel: string;
  url: string;
  caption: string;
}

export type OldDeviceFinalCondition = "in_stock_damaged" | "in_stock_ho" | "in_stock_rfu";

/** In-memory before-state captured by a successful Replacement transaction. */
export interface ReplacementMasterStateSnapshot {
  oldDevice: import("./dashboard").DeviceRecord;
  newDevice: import("./dashboard").DeviceRecord;
}

export interface ReplacementRecord {
  id: string; // e.g. "REP-202610-001"
  siteId?: number;
  timeZone?: string;
  rowVersion?: string;
  activityType: "Replacement";
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationFormatted: string; // e.g. "2 Jam 15 Menit"
  durationMinutes: number;
  shift: InstallationShift;
  district: DistrictName | string;

  // Device Lama (Yang diganti)
  oldDeviceId: string;
  oldDeviceSerialNumber: string;
  oldUnitNo: string;
  oldEquipmentType: EquipmentType;
  oldEgi?: string;
  oldDeviceFinalCondition: OldDeviceFinalCondition;
  oldDeviceFinalConditionLabel: string;

  // Device Baru (Pengganti)
  newDeviceId: string;
  newDeviceSerialNumber: string;
  unitNo: string; // Target unit
  equipmentType: EquipmentType;
  egi?: string;
  sourcePower: SourcePowerType;
  spmVersion: string;

  // Konfigurasi Jaringan
  ipAddress?: string; // IP Address SMARTD DISPLAY
  ipCpe?: string; // IP CPE
  ipVhms?: string; // IP VHMS

  // Personel
  technicianName: string;
  technicianNrp: string;
  groupLeaderName: string;

  // Catatan
  status: "completed" | "in_progress";
  remarks: string;

  // 5 Slot Foto Dokumentasi
  photos: ReplacementPhoto[];

  /** Optional for legacy records created before transaction snapshots were retained. */
  masterStateBefore?: ReplacementMasterStateSnapshot;

  createdAt: string;
}

export interface ReplacementFormData {
  date: string;
  activityType: "Replacement";
  district: string;
  shift: InstallationShift;
  startTime: string;
  endTime: string;

  oldDeviceId: string;
  oldDeviceFinalCondition: OldDeviceFinalCondition;

  newDeviceId: string;
  unitNo: string;
  equipmentType: EquipmentType;
  egi?: string;
  sourcePower: SourcePowerType;
  spmVersion: string;

  ipAddress: string;
  ipCpe: string;
  ipVhms: string;

  groupLeaderName: string;
  technicianName: string;
  technicianNrp: string;

  remarks: string;

  photos: {
    mh02_new_installed: string;
    mh02_old_removed: string;
    nodered_config: string;
    gps_antenna: string;
  };
  photoCaptions: {
    mh02_new_installed: string;
    mh02_old_removed: string;
    nodered_config: string;
    gps_antenna: string;
  };
}
