// src/types/troubleshoot.ts
import { DistrictName, EquipmentType } from "./dashboard";

export type TroubleshootEquipmentType =
  | "MH02 Device"
  | "GPS/Antenna"
  | "Camera"
  | "Wiring"
  | "Speaker"
  | "SPM"
  | "CPE"
  | "Firmware";

export interface TroubleshootPhotos {
  beforeRepair?: string; // data URL or path
  afterRepair?: string;
}

export interface TroubleshootRecord {
  id: string; // Form Number, e.g. TRB-202610-001
  deviceId: string;
  unitNo: string;
  fleetEquipmentType?: EquipmentType; // Type armada/unit: Dump Truck, etc.
  egi?: string; // Model unit: HD785-7, etc.
  district: DistrictName;
  technicianName: string;
  technicianNrp?: string;
  activityDate: string; // YYYY-MM-DD
  dateTime?: string; // full ISO string or YYYY-MM-DD HH:mm
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  equipmentType: TroubleshootEquipmentType;
  issue: string; // Issue description / category
  actionTaken: string; // Action taken
  healthCheckStatus?: "Pass" | "Fail" | "Verified" | "Pending";
  photos?: TroubleshootPhotos;
  photoCaptions?: {
    beforeRepair?: string;
    afterRepair?: string;
  };
  remarks?: string;
  createdAt: string;
}

export interface TroubleshootFormData {
  deviceId: string;
  unitNo: string;
  fleetEquipmentType?: EquipmentType;
  egi?: string;
  district: DistrictName;
  technicianName: string;
  technicianNrp: string;
  activityDate: string;
  startTime: string;
  endTime: string;
  equipmentType: TroubleshootEquipmentType;
  issue: string;
  actionTaken: string;
  remarks: string;
  photos: {
    beforeRepair: string;
    afterRepair: string;
  };
  photoCaptions: {
    beforeRepair: string;
    afterRepair: string;
  };
}
