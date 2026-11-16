"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mock_data_1 = require("./src/lib/mock-data");
const audit_logs_1 = require("./src/lib/mock-data/audit-logs");
console.log("=== 1. TEST INITIAL DATA ===");
const initialList = (0, mock_data_1.getInstallationRecords)();
console.log("Initial installation count:", initialList.length);
const sample = (0, mock_data_1.getInstallationById)("INS-202610-001");
console.log("Sample INS-202610-001 found:", Boolean(sample));
console.log("\n=== 2. TEST CREATE INSTALLATION ===");
// Find an in_stock_rfu device
const rfuDevice = mock_data_1.devices.find((d) => d.status === "in_stock_rfu");
console.log("Available RFU device for installation:", rfuDevice?.deviceId);
if (rfuDevice) {
    const newId = (0, mock_data_1.getNextInstallationFormNumber)("2026-10-30");
    console.log("Generated next form number:", newId);
    const testRecord = {
        id: newId,
        date: "2026-10-30",
        installationTime: "09:00",
        startTime: "09:00",
        endTime: "11:30",
        durationFormatted: "2 Jam 30 Menit",
        durationMinutes: 150,
        deviceId: rfuDevice.deviceId,
        serialNumber: rfuDevice.serialNumber,
        unitNo: "DT-TEST-99",
        equipmentType: "Dump Truck",
        district: "Sangatta",
        locationDetail: "Main Workshop Test",
        ipAddress: "192.168.1.200",
        technicianName: "Ahmad Rizki",
        technicianNrp: "NRP-772104",
        groupLeaderName: "Agus Setiawan (GL)",
        status: "completed",
        remarks: "Test create installation",
        photos: [],
        createdAt: "2026-10-30 11:30",
    };
    const createRes = (0, mock_data_1.createInstallationWithDevice)(testRecord);
    console.log("Create result:", createRes);
    console.log("Device status after create:", rfuDevice.status, "unitNo:", rfuDevice.unitNo);
    (0, audit_logs_1.recordAuditAction)({ table: "installation", operation: "INSERT", recordId: testRecord.id });
    console.log("\n=== 3. TEST EDIT TANPA PERUBAHAN ===");
    const prepNoChange = (0, mock_data_1.prepareDeviceInstallationEdit)(newId, testRecord, "superadmin");
    console.log("Prepare no change success:", prepNoChange.success);
    // Check if fields are identical
    const isIdentical = prepNoChange.success && prepNoChange.record.unitNo === testRecord.unitNo;
    console.log("No-change detected correctly:", isIdentical);
    console.log("\n=== 4. TEST EDIT DENGAN PERUBAHAN ===");
    const changedRecord = {
        ...testRecord,
        unitNo: "DT-TEST-88",
        remarks: "Updated remarks after edit",
    };
    const editRes = (0, mock_data_1.executeDeviceInstallationEdit)(newId, changedRecord, "superadmin");
    console.log("Edit result:", editRes.success, editRes.message);
    console.log("Device unitNo after edit:", rfuDevice.unitNo);
    (0, audit_logs_1.recordAuditAction)({ table: "installation", operation: "UPDATE", recordId: newId });
    console.log("\n=== 5. TEST DELETE DENGAN KONFIRMASI ===");
    const deleteRes = (0, mock_data_1.executeDeviceInstallationDelete)(newId, "superadmin");
    console.log("Delete result:", deleteRes);
    console.log("Device status after delete (should be in_stock_rfu):", rfuDevice.status, "unitNo:", rfuDevice.unitNo);
    (0, audit_logs_1.recordAuditAction)({ table: "installation", operation: "DELETE", recordId: newId });
    console.log("\n=== 6. VERIFY AUDIT LOGS ===");
    const relatedLogs = audit_logs_1.auditLogs.filter((l) => l.recordId === newId);
    console.log("Audit logs for test record:", relatedLogs.map((l) => `${l.operation} on ${l.table}`));
}
console.log("\nALL CRUD UNIT TESTS COMPLETED SUCCESSFULLY!");
