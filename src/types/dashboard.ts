// src/types/dashboard.ts
export type DeviceStatus =
  | "in_use"
  | "in_stock_rfu"
  | "in_stock_damaged"
  | "in_stock_ho";

export type HealthCheckStatus = "complete" | "incomplete" | "not_checked";

export type EquipmentType = "Dump Truck" | "Water Truck" | "Fuel Truck" | "Loader" | "Others";

export type DistrictName = "Sangatta" | "Bengalon" | "Wahau" | "Sangatta Utara" | "Head Office";

// Physical location yang dapat berupa salah satu distrik atau Head Office
export type PhysicalLocation = DistrictName | "Head Office";

export type ActivityType =
  | "installation"
  | "troubleshoot"
  | "replacement"
  | "removal";

export interface DeviceRecord {
  deviceId: string;
  serialNumber: string;
  status: DeviceStatus;
  unitNo: string | null;
  equipmentType: EquipmentType | null;
  district: DistrictName | null;
  // Lokasi fisik aktual, bila diketahui (Head Office atau distrik). Null = belum diketahui.
  currentLocation?: PhysicalLocation | null;
  healthCheckStatus: HealthCheckStatus;
  lastMaintenanceDate: string | null; // ISO date
}

export interface ActivityRecord {
  activityId: string;
  type: ActivityType;
  deviceId: string;
  unitNo: string | null;
  district: DistrictName;
  date: string; // ISO date
  technicianName: string;
  status?: "completed" | "in_progress";
  month: string; // "YYYY-MM" for grouping
  time?: string; // e.g. "08:30"
  summary?: string; // Technical summary of activity
  details?: string; // Additional technical details
  durationFormatted?: string; // e.g. "2 Jam 15 Menit"
  durationMinutes?: number;
  healthCheckScore?: string; // e.g. "19/19" (simulasi)
  equipmentType?: EquipmentType;
}

export interface MonthlyActivityData {
  monthLabel: string; // e.g., "May"
  installation: number;
  troubleshoot: number;
  replacement: number;
  removal: number;
}

export interface KpiSummary {
  totalDevices: number; // total perangkat unik
  totalInstalled: number; // in_use
  hoRepair: number; // in_stock_ho
  inStock: number; // rfu + damaged + ho
}
