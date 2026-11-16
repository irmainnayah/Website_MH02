// src/types/installation.ts
import { DistrictName, EquipmentType, DeviceRecord } from "./dashboard";

export type InstallationShift = "Shift 1" | "Shift 2";

export type SourcePowerType = "Stand By" | "Acc On" | "Standby PDU";

export type PhotoSlotKey =
  | "mh02_installed"
  | "camera_dashboard_angle"
  | "nodered_config"
  | "gps_antenna"
  // Legacy aliases for backward compatibility
  | "unit_exterior"
  | "module_position"
  | "wiring_power";

export interface InstallationPhoto {
  slot: PhotoSlotKey;
  slotLabel: string;
  url: string;
  caption: string;
}

export interface InstallationRecord {
  id: string; // Auto-generated document number e.g. "INS-202610-001"
  date: string; // YYYY-MM-DD
  installationTime?: string; // HH:mm
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationFormatted: string; // e.g. "2 Jam 15 Menit"
  durationMinutes: number;
  deviceId: string;
  serialNumber: string;
  unitNo: string;
  equipmentType: EquipmentType;
  egi?: string;
  shift?: InstallationShift;
  sourcePower?: SourcePowerType;
  spmVersion?: string;
  district: DistrictName;
  area?: string;
  locationDetail: string;
  ipAddress?: string; // IP Address SMARTD DISPLAY
  ipCpe?: string; // IP CPE
  ipVhms?: string; // IP VHMS
  technicianName: string;
  technicianNrp: string;
  groupLeaderName: string;
  status: "completed" | "in_progress";
  remarks?: string;
  notes?: string;
  photos: InstallationPhoto[];
  createdAt: string;
  masterStateBefore?: {
    device?: DeviceRecord;
  };
}

export interface InstallationFormData {
  date: string;
  installationTime?: string;
  startTime: string;
  endTime: string;
  deviceId: string;
  unitNo: string;
  equipmentType: EquipmentType;
  egi?: string;
  shift?: InstallationShift;
  sourcePower?: SourcePowerType;
  spmVersion?: string;
  district: DistrictName;
  area?: string;
  locationDetail: string;
  ipAddress?: string;
  ipCpe?: string;
  ipVhms?: string;
  technicianName: string;
  technicianNrp: string;
  groupLeaderName: string;
  remarks?: string;
  notes: string;
  photos: {
    mh02_installed?: string;
    camera_dashboard_angle?: string;
    nodered_config?: string;
    gps_antenna?: string;
    // Legacy keys
    unit_exterior: string;
    module_position: string;
    wiring_power: string;
    [key: string]: string | undefined;
  };
}
