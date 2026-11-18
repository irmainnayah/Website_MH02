// src/types/removal.ts
import { DeviceRecord, EquipmentType } from "./dashboard";

export type DeviceFinalCondition =
  | "in_stock_rfu"
  | "in_stock_damaged"
  | "in_stock_ho";

export interface RemovalMasterStateSnapshot {
  device: DeviceRecord;
}

export interface RemovalRecord {
  id: string; // Form Number e.g. REM-202610-001
  siteId?: number;
  timeZone?: string;
  rowVersion?: string;
  serialNumber?: string;
  deviceId: string;
  unitNo: string;
  equipmentType?: EquipmentType;
  egi?: string;
  reason: string;
  reasonDetail?: string;
  removalDate: string; // YYYY-MM-DD
  technicianName: string;
  technicianNrp?: string;
  district?: string;
  shift?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  deviceFinalCondition?: DeviceFinalCondition;
  deviceFinalConditionLabel?: string;
  photos?: {
    beforeDevice?: string; // uploaded image data URL
    componentSet?: string;
    beforeDeviceCaption?: string;
    componentSetCaption?: string;
  };
  groupLeaderName?: string;
  remarks?: string;
  masterStateBefore?: RemovalMasterStateSnapshot;
}
