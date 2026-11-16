// src/lib/mock-data/devices.ts
import { DeviceRecord, DeviceStatus, EquipmentType, DistrictName, HealthCheckStatus } from "../../types/dashboard";

export const devices: DeviceRecord[] = [
  // Sangatta (20 devices)
  { deviceId: "D001", serialNumber: "SN001", status: "in_use" as DeviceStatus, unitNo: "DT-102", equipmentType: "Dump Truck" as EquipmentType, district: "Sangatta" as DistrictName, currentLocation: "Sangatta", healthCheckStatus: "complete" as HealthCheckStatus, lastMaintenanceDate: "2026-09-15" },
  { deviceId: "D002", serialNumber: "SN002", status: "in_use", unitNo: "WT-101", equipmentType: "Water Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-08-20" },
  { deviceId: "D003", serialNumber: "SN003", status: "in_use", unitNo: "FT-101", equipmentType: "Fuel Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D004", serialNumber: "SN004", status: "in_use", unitNo: "LD-02", equipmentType: "Loader", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-10-01" },
  { deviceId: "D005", serialNumber: "SN005", status: "in_use", unitNo: "OT-101", equipmentType: "Others", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-07-30" },
  { deviceId: "D006", serialNumber: "SN006", status: "in_use", unitNo: "DT-104", equipmentType: "Dump Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-06-12" },
  { deviceId: "D007", serialNumber: "SN007", status: "in_use", unitNo: "WT-103", equipmentType: "Water Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-03-22" },
  { deviceId: "D008", serialNumber: "SN008", status: "in_use", unitNo: "FT-102", equipmentType: "Fuel Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D009", serialNumber: "SN009", status: "in_use", unitNo: "LD-101", equipmentType: "Loader", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-02-10" },
  { deviceId: "D010", serialNumber: "SN010", status: "in_use", unitNo: "OT-102", equipmentType: "Others", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-01-05" },
  { deviceId: "D011", serialNumber: "SN011", status: "in_use", unitNo: "DT-101", equipmentType: "Dump Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-09-28" },
  { deviceId: "D012", serialNumber: "SN012", status: "in_use", unitNo: "WT-05", equipmentType: "Water Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "complete", lastMaintenanceDate: "2026-08-18" },
  // In Stock RFU (7 devices)
  { deviceId: "D013", serialNumber: "SN013", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D014", serialNumber: "SN014", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D015", serialNumber: "SN015", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D016", serialNumber: "SN016", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D017", serialNumber: "SN017", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D018", serialNumber: "SN018", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D019", serialNumber: "SN019", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  // In Stock Damaged (2 devices)
  { deviceId: "D020", serialNumber: "SN020", status: "in_stock_damaged", unitNo: null, equipmentType: null, district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D021", serialNumber: "SN021", status: "in_stock_damaged", unitNo: null, equipmentType: null, district: "Bengalon", currentLocation: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  // In Stock HO Repair (4 devices)
  { deviceId: "D022", serialNumber: "SN022", status: "in_stock_ho", unitNo: null, equipmentType: null, district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D023", serialNumber: "SN023", status: "in_stock_ho", unitNo: null, equipmentType: null, district: "Bengalon", currentLocation: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D024", serialNumber: "SN024", status: "in_stock_ho", unitNo: null, equipmentType: null, district: "Wahau", currentLocation: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D025", serialNumber: "SN025", status: "in_stock_ho", unitNo: null, equipmentType: null, district: "Sangatta Utara", currentLocation: "Sangatta Utara", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  // In Stock RFU (sebelumnya Not Installed, 8 devices)
  { deviceId: "D026", serialNumber: "SN026", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D027", serialNumber: "SN027", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D028", serialNumber: "SN028", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D029", serialNumber: "SN029", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D030", serialNumber: "SN030", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D031", serialNumber: "SN031", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D032", serialNumber: "SN032", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D033", serialNumber: "SN033", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Sangatta Utara", healthCheckStatus: "not_checked", lastMaintenanceDate: null },

  // Additional In Use (22 devices)

  // Bengalon (10 devices)
  { deviceId: "D034", serialNumber: "SN034", status: "in_use" as DeviceStatus, unitNo: "DT-103", equipmentType: "Dump Truck" as EquipmentType, district: "Bengalon" as DistrictName, healthCheckStatus: "complete" as HealthCheckStatus, lastMaintenanceDate: "2026-09-10" },
  { deviceId: "D035", serialNumber: "SN035", status: "in_use", unitNo: "WT-201", equipmentType: "Water Truck", district: "Bengalon", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-08-14" },
  { deviceId: "D036", serialNumber: "SN036", status: "in_use", unitNo: "FT-201", equipmentType: "Fuel Truck", district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D037", serialNumber: "SN037", status: "in_use", unitNo: "LD-201", equipmentType: "Loader", district: "Bengalon", healthCheckStatus: "complete", lastMaintenanceDate: "2026-07-01" },
  { deviceId: "D038", serialNumber: "SN038", status: "in_use", unitNo: "OT-201", equipmentType: "Others", district: "Bengalon", healthCheckStatus: "complete", lastMaintenanceDate: "2026-06-20" },
  { deviceId: "D039", serialNumber: "SN039", status: "in_use", unitNo: "DT-203", equipmentType: "Dump Truck", district: "Bengalon", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-05-30" },
  { deviceId: "D040", serialNumber: "SN040", status: "in_use", unitNo: "WT-203", equipmentType: "Water Truck", district: "Bengalon", healthCheckStatus: "complete", lastMaintenanceDate: "2026-04-12" },
  { deviceId: "D041", serialNumber: "SN041", status: "in_use", unitNo: "FT-202", equipmentType: "Fuel Truck", district: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D042", serialNumber: "SN042", status: "in_use", unitNo: "LD-202", equipmentType: "Loader", district: "Bengalon", healthCheckStatus: "complete", lastMaintenanceDate: "2026-03-05" },
  { deviceId: "D043", serialNumber: "SN043", status: "in_use", unitNo: "OT-202", equipmentType: "Others", district: "Bengalon", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-02-22" },

  // Wahau (8 devices)
  { deviceId: "D044", serialNumber: "SN044", status: "in_use", unitNo: "DT-201", equipmentType: "Dump Truck", district: "Wahau", healthCheckStatus: "complete", lastMaintenanceDate: "2026-09-08" },
  { deviceId: "D045", serialNumber: "SN045", status: "in_use", unitNo: "WT-301", equipmentType: "Water Truck", district: "Wahau", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-08-22" },
  { deviceId: "D046", serialNumber: "SN046", status: "in_use", unitNo: "FT-301", equipmentType: "Fuel Truck", district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D047", serialNumber: "SN047", status: "in_use", unitNo: "LD-301", equipmentType: "Loader", district: "Wahau", healthCheckStatus: "complete", lastMaintenanceDate: "2026-07-15" },
  { deviceId: "D048", serialNumber: "SN048", status: "in_use", unitNo: "OT-301", equipmentType: "Others", district: "Wahau", healthCheckStatus: "complete", lastMaintenanceDate: "2026-06-09" },
  { deviceId: "D049", serialNumber: "SN049", status: "in_use", unitNo: "DT-301", equipmentType: "Dump Truck", district: "Wahau", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-05-03" },
  { deviceId: "D050", serialNumber: "SN050", status: "in_use", unitNo: "WT-302", equipmentType: "Water Truck", district: "Wahau", healthCheckStatus: "complete", lastMaintenanceDate: "2026-04-27" },
  { deviceId: "D051", serialNumber: "SN051", status: "in_use", unitNo: "FT-302", equipmentType: "Fuel Truck", district: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },

  // Sangatta Utara (4 devices)
  { deviceId: "D052", serialNumber: "SN052", status: "in_use", unitNo: "DT-305", equipmentType: "Dump Truck", district: "Sangatta Utara", healthCheckStatus: "complete", lastMaintenanceDate: "2026-09-12" },
  { deviceId: "D053", serialNumber: "SN053", status: "in_use", unitNo: "OT-401", equipmentType: "Others", district: "Sangatta Utara", healthCheckStatus: "incomplete", lastMaintenanceDate: "2026-08-18" },
  { deviceId: "D054", serialNumber: "SN054", status: "in_use", unitNo: "DT-401", equipmentType: "Dump Truck", district: "Sangatta Utara", healthCheckStatus: "complete", lastMaintenanceDate: "2026-07-25" },
  { deviceId: "D055", serialNumber: "SN055", status: "in_use", unitNo: "WT-401", equipmentType: "Water Truck", district: "Sangatta Utara", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  // Dummy Head Office devices (In Stock – RFU) for testing
  { deviceId: "D056", serialNumber: "SN056", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Head Office", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D057", serialNumber: "SN057", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Head Office", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D058", serialNumber: "SN058", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Head Office", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D059", serialNumber: "SN059", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Head Office", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D060", serialNumber: "SN060", status: "in_stock_rfu", unitNo: null, equipmentType: null, district: "Head Office", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  // Historical De-installed Devices (from REM-202310 records)
  { deviceId: "D061", serialNumber: "SN061", status: "in_stock_damaged", unitNo: null, equipmentType: "Dump Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D062", serialNumber: "SN062", status: "in_stock_rfu", unitNo: null, equipmentType: "Water Truck", district: "Bengalon", currentLocation: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D063", serialNumber: "SN063", status: "in_stock_rfu", unitNo: null, equipmentType: "Loader", district: "Wahau", currentLocation: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D064", serialNumber: "SN064", status: "in_stock_damaged", unitNo: null, equipmentType: "Dump Truck", district: "Sangatta Utara", currentLocation: "Sangatta Utara", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D065", serialNumber: "SN065", status: "in_stock_rfu", unitNo: null, equipmentType: "Water Truck", district: "Bengalon", currentLocation: "Bengalon", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D066", serialNumber: "SN066", status: "in_stock_rfu", unitNo: null, equipmentType: "Loader", district: "Wahau", currentLocation: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D067", serialNumber: "SN067", status: "in_stock_ho", unitNo: null, equipmentType: "Dump Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D068", serialNumber: "SN068", status: "in_stock_rfu", unitNo: null, equipmentType: "Water Truck", district: "Sangatta", currentLocation: "Sangatta", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D069", serialNumber: "SN069", status: "in_stock_rfu", unitNo: null, equipmentType: "Loader", district: "Wahau", currentLocation: "Wahau", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
  { deviceId: "D070", serialNumber: "SN070", status: "in_stock_damaged", unitNo: null, equipmentType: "Dump Truck", district: "Sangatta Utara", currentLocation: "Sangatta Utara", healthCheckStatus: "not_checked", lastMaintenanceDate: null },
];
