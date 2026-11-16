// src/lib/mock-data/activities.ts
// ⚠️  DEMO DATA — bukan data produksi
// ~80 record aktivitas: Mei–Okt 2026, 4 distrik, 4 jenis aktivitas (Installation, Troubleshoot, Replacement, Removal)
import { ActivityRecord, ActivityType } from "../../types/dashboard";
import { getTroubleshootRecords } from "./troubleshoots";
import { getRemovalRecords } from "./removal";

export const activities: ActivityRecord[] = [
  // ─── MEI 2026 ─────────────────────────────────────────────────────────────
  // Installation (3)
  { activityId: "A001", type: "installation", deviceId: "D001", unitNo: "DT-102", district: "Sangatta", date: "2026-05-03", technicianName: "Budi S.", status: "completed", month: "2026-05" },
  { activityId: "A002", type: "installation", deviceId: "D034", unitNo: "DT-103", district: "Bengalon", date: "2026-05-10", technicianName: "Fauzan A.", status: "completed", month: "2026-05" },
  { activityId: "A003", type: "installation", deviceId: "D044", unitNo: "DT-201", district: "Wahau", date: "2026-05-17", technicianName: "Rudi H.", status: "completed", month: "2026-05" },
  // Troubleshoot (4)
  { activityId: "A009", type: "troubleshoot", deviceId: "D003", unitNo: "FT-101", district: "Sangatta", date: "2026-05-08", technicianName: "Budi S.", status: "completed", month: "2026-05" },
  { activityId: "A010", type: "troubleshoot", deviceId: "D035", unitNo: "WT-201", district: "Bengalon", date: "2026-05-14", technicianName: "Rudi H.", status: "completed", month: "2026-05" },
  { activityId: "A011", type: "troubleshoot", deviceId: "D045", unitNo: "WT-301", district: "Wahau", date: "2026-05-20", technicianName: "Andi W.", status: "completed", month: "2026-05" },
  { activityId: "A012", type: "troubleshoot", deviceId: "D053", unitNo: "OT-401", district: "Sangatta Utara", date: "2026-05-24", technicianName: "Fikri D.", status: "completed", month: "2026-05" },
  // Replacement (2)
  { activityId: "A013", type: "replacement", deviceId: "D004", unitNo: "LD-02", district: "Sangatta", date: "2026-05-15", technicianName: "Fauzan A.", status: "completed", month: "2026-05" },
  { activityId: "A014", type: "replacement", deviceId: "D036", unitNo: "FT-201", district: "Bengalon", date: "2026-05-26", technicianName: "Rudi H.", status: "completed", month: "2026-05" },
  // Removal (1)
  { activityId: "A015", type: "removal", deviceId: "D005", unitNo: "OT-101", district: "Sangatta", date: "2026-05-28", technicianName: "Budi S.", status: "completed", month: "2026-05" },

  // ─── JUNI 2026 ────────────────────────────────────────────────────────────
  // Installation (4)
  { activityId: "A016", type: "installation", deviceId: "D006", unitNo: "DT-104", district: "Sangatta", date: "2026-06-02", technicianName: "Fauzan A.", status: "completed", month: "2026-06" },
  { activityId: "A017", type: "installation", deviceId: "D037", unitNo: "LD-201", district: "Bengalon", date: "2026-06-07", technicianName: "Rudi H.", status: "completed", month: "2026-06" },
  { activityId: "A018", type: "installation", deviceId: "D046", unitNo: "FT-301", district: "Wahau", date: "2026-06-14", technicianName: "Andi W.", status: "completed", month: "2026-06" },
  { activityId: "A019", type: "installation", deviceId: "D054", unitNo: "DT-401", district: "Sangatta Utara", date: "2026-06-21", technicianName: "Fikri D.", status: "completed", month: "2026-06" },
  // Troubleshoot (3)
  { activityId: "A026", type: "troubleshoot", deviceId: "D007", unitNo: "WT-103", district: "Sangatta", date: "2026-06-08", technicianName: "Fauzan A.", status: "completed", month: "2026-06" },
  { activityId: "A027", type: "troubleshoot", deviceId: "D038", unitNo: "OT-201", district: "Bengalon", date: "2026-06-15", technicianName: "Rudi H.", status: "completed", month: "2026-06" },
  { activityId: "A028", type: "troubleshoot", deviceId: "D047", unitNo: "LD-301", district: "Wahau", date: "2026-06-22", technicianName: "Andi W.", status: "completed", month: "2026-06" },
  // Replacement (1)
  { activityId: "A029", type: "replacement", deviceId: "D008", unitNo: "FT-102", district: "Sangatta", date: "2026-06-18", technicianName: "Fikri D.", status: "completed", month: "2026-06" },
  // Removal (2)
  { activityId: "A030", type: "removal", deviceId: "D009", unitNo: "LD-101", district: "Sangatta", date: "2026-06-24", technicianName: "Budi S.", status: "completed", month: "2026-06" },
  { activityId: "A031", type: "removal", deviceId: "D039", unitNo: "DT-203", district: "Bengalon", date: "2026-06-28", technicianName: "Rudi H.", status: "completed", month: "2026-06" },

  // ─── JULI 2026 ────────────────────────────────────────────────────────────
  // Installation (2)
  { activityId: "A032", type: "installation", deviceId: "D010", unitNo: "OT-102", district: "Sangatta", date: "2026-07-04", technicianName: "Fauzan A.", status: "completed", month: "2026-07" },
  { activityId: "A033", type: "installation", deviceId: "D040", unitNo: "WT-203", district: "Bengalon", date: "2026-07-10", technicianName: "Rudi H.", status: "completed", month: "2026-07" },
  // Troubleshoot (5)
  { activityId: "A041", type: "troubleshoot", deviceId: "D003", unitNo: "FT-101", district: "Sangatta", date: "2026-07-06", technicianName: "Fauzan A.", status: "completed", month: "2026-07" },
  { activityId: "A042", type: "troubleshoot", deviceId: "D011", unitNo: "DT-101", district: "Sangatta", date: "2026-07-12", technicianName: "Budi S.", status: "completed", month: "2026-07" },
  { activityId: "A043", type: "troubleshoot", deviceId: "D035", unitNo: "WT-201", district: "Bengalon", date: "2026-07-16", technicianName: "Rudi H.", status: "completed", month: "2026-07" },
  { activityId: "A044", type: "troubleshoot", deviceId: "D045", unitNo: "WT-301", district: "Wahau", date: "2026-07-22", technicianName: "Andi W.", status: "completed", month: "2026-07" },
  { activityId: "A045", type: "troubleshoot", deviceId: "D053", unitNo: "OT-401", district: "Sangatta Utara", date: "2026-07-28", technicianName: "Fikri D.", status: "completed", month: "2026-07" },
  // Replacement (3)
  { activityId: "A046", type: "replacement", deviceId: "D004", unitNo: "LD-02", district: "Sangatta", date: "2026-07-09", technicianName: "Fauzan A.", status: "completed", month: "2026-07" },
  { activityId: "A047", type: "replacement", deviceId: "D036", unitNo: "FT-201", district: "Bengalon", date: "2026-07-19", technicianName: "Rudi H.", status: "completed", month: "2026-07" },
  { activityId: "A048", type: "replacement", deviceId: "D046", unitNo: "FT-301", district: "Wahau", date: "2026-07-26", technicianName: "Andi W.", status: "completed", month: "2026-07" },
  // Removal (1)
  { activityId: "A049", type: "removal", deviceId: "D005", unitNo: "OT-101", district: "Sangatta", date: "2026-07-30", technicianName: "Budi S.", status: "completed", month: "2026-07" },

  // ─── AGUSTUS 2026 ─────────────────────────────────────────────────────────
  // Installation (5)
  { activityId: "A050", type: "installation", deviceId: "D007", unitNo: "WT-103", district: "Sangatta", date: "2026-08-03", technicianName: "Budi S.", status: "completed", month: "2026-08" },
  { activityId: "A051", type: "installation", deviceId: "D041", unitNo: "FT-202", district: "Bengalon", date: "2026-08-06", technicianName: "Rudi H.", status: "completed", month: "2026-08" },
  { activityId: "A052", type: "installation", deviceId: "D047", unitNo: "LD-301", district: "Wahau", date: "2026-08-12", technicianName: "Andi W.", status: "completed", month: "2026-08" },
  { activityId: "A053", type: "installation", deviceId: "D048", unitNo: "OT-301", district: "Wahau", date: "2026-08-18", technicianName: "Fikri D.", status: "completed", month: "2026-08" },
  { activityId: "A054", type: "installation", deviceId: "D055", unitNo: "WT-401", district: "Sangatta Utara", date: "2026-08-24", technicianName: "Fauzan A.", status: "completed", month: "2026-08" },
  // Troubleshoot (2)
  { activityId: "A059", type: "troubleshoot", deviceId: "D008", unitNo: "FT-102", district: "Sangatta", date: "2026-08-08", technicianName: "Fauzan A.", status: "completed", month: "2026-08" },
  { activityId: "A060", type: "troubleshoot", deviceId: "D042", unitNo: "LD-202", district: "Bengalon", date: "2026-08-20", technicianName: "Rudi H.", status: "completed", month: "2026-08" },
  // Replacement (2)
  { activityId: "A061", type: "replacement", deviceId: "D009", unitNo: "LD-101", district: "Sangatta", date: "2026-08-13", technicianName: "Budi S.", status: "completed", month: "2026-08" },
  { activityId: "A062", type: "replacement", deviceId: "D049", unitNo: "DT-301", district: "Wahau", date: "2026-08-27", technicianName: "Andi W.", status: "completed", month: "2026-08" },
  // Removal (2)
  { activityId: "A063", type: "removal", deviceId: "D010", unitNo: "OT-102", district: "Sangatta", date: "2026-08-16", technicianName: "Fikri D.", status: "completed", month: "2026-08" },
  { activityId: "A064", type: "removal", deviceId: "D043", unitNo: "OT-202", district: "Bengalon", date: "2026-08-29", technicianName: "Rudi H.", status: "completed", month: "2026-08" },

  // ─── SEPTEMBER 2026 ───────────────────────────────────────────────────────
  // Installation (3)
  { activityId: "A065", type: "installation", deviceId: "D011", unitNo: "DT-101", district: "Sangatta", date: "2026-09-03", technicianName: "Fauzan A.", status: "completed", month: "2026-09" },
  { activityId: "A066", type: "installation", deviceId: "D042", unitNo: "LD-202", district: "Bengalon", date: "2026-09-09", technicianName: "Rudi H.", status: "completed", month: "2026-09" },
  { activityId: "A067", type: "installation", deviceId: "D050", unitNo: "WT-302", district: "Wahau", date: "2026-09-15", technicianName: "Andi W.", status: "completed", month: "2026-09" },
  // Troubleshoot (6)
  { activityId: "A076", type: "troubleshoot", deviceId: "D003", unitNo: "FT-101", district: "Sangatta", date: "2026-09-05", technicianName: "Fauzan A.", status: "completed", month: "2026-09" },
  { activityId: "A077", type: "troubleshoot", deviceId: "D007", unitNo: "WT-103", district: "Sangatta", date: "2026-09-08", technicianName: "Budi S.", status: "completed", month: "2026-09" },
  { activityId: "A078", type: "troubleshoot", deviceId: "D035", unitNo: "WT-201", district: "Bengalon", date: "2026-09-12", technicianName: "Rudi H.", status: "completed", month: "2026-09" },
  { activityId: "A079", type: "troubleshoot", deviceId: "D041", unitNo: "FT-202", district: "Bengalon", date: "2026-09-16", technicianName: "Andi W.", status: "completed", month: "2026-09" },
  { activityId: "A080", type: "troubleshoot", deviceId: "D045", unitNo: "WT-301", district: "Wahau", date: "2026-09-22", technicianName: "Fikri D.", status: "completed", month: "2026-09" },
  { activityId: "A081", type: "troubleshoot", deviceId: "D053", unitNo: "OT-401", district: "Sangatta Utara", date: "2026-09-28", technicianName: "Fauzan A.", status: "completed", month: "2026-09" },
  // Replacement (2)
  { activityId: "A082", type: "replacement", deviceId: "D004", unitNo: "LD-02", district: "Sangatta", date: "2026-09-10", technicianName: "Budi S.", status: "completed", month: "2026-09" },
  { activityId: "A083", type: "replacement", deviceId: "D037", unitNo: "LD-201", district: "Bengalon", date: "2026-09-23", technicianName: "Rudi H.", status: "completed", month: "2026-09" },
  // Removal (1)
  { activityId: "A084", type: "removal", deviceId: "D012", unitNo: "WT-05", district: "Sangatta", date: "2026-09-30", technicianName: "Fikri D.", status: "completed", month: "2026-09" },

  // ─── OKTOBER 2026 (bulan berjalan) ────────────────────────────────────────
  // Installation (2)
  { activityId: "A085", type: "installation", deviceId: "D012", unitNo: "WT-05", district: "Sangatta", date: "2026-10-05", technicianName: "Budi S.", status: "completed", month: "2026-10" },
  { activityId: "A086", type: "installation", deviceId: "D043", unitNo: "OT-202", district: "Bengalon", date: "2026-10-07", technicianName: "Fauzan A.", status: "completed", month: "2026-10" },
  // Troubleshoot (2)
  { activityId: "A090", type: "troubleshoot", deviceId: "D002", unitNo: "WT-101", district: "Sangatta", date: "2026-10-08", technicianName: "Fauzan A.", status: "completed", month: "2026-10" },
  { activityId: "A091", type: "troubleshoot", deviceId: "D035", unitNo: "WT-201", district: "Bengalon", date: "2026-10-11", technicianName: "Rudi H.", status: "completed", month: "2026-10" },
  // Replacement (1)
  { activityId: "A092", type: "replacement", deviceId: "D003", unitNo: "FT-101", district: "Sangatta", date: "2026-10-14", technicianName: "Budi S.", status: "completed", month: "2026-10" },
];

import { initialInstallations } from "./installations";
import { initialReplacements } from "./replacement";

/**
 * Mengambil seluruh data aktivitas terintegrasi (aktivitas operasional + riwayat instalasi & penggantian)
 * terurut secara kronologis (aktivitas terbaru di urutan pertama)
 */
export function getAllEnrichedActivities(): ActivityRecord[] {
  const troubleshootRecords = getTroubleshootRecords();
  // 1. Enrich baseline activities
  const enrichedBaseline: ActivityRecord[] = activities.map((a) => {
    let summary = a.summary;
    let durationFormatted = a.durationFormatted;
    let durationMinutes = a.durationMinutes;
    let healthCheckScore = a.healthCheckScore;
    const time = a.time || undefined;

    if (!summary) {
      switch (a.type) {
        case "installation":
          summary = `Instalasi modul telematika MH02 pada armada unit ${a.unitNo || "-"}.`;
          durationFormatted = "2 Jam 15 Menit";
          durationMinutes = 135;
          break;
        case "troubleshoot":
          summary = `Pemeriksaan koneksi kabel power DC dan kalibrasi ulang modul GPS.`;
          durationFormatted = "1 Jam 15 Menit";
          durationMinutes = 75;
          break;
        case "replacement":
          summary = `Penggantian modul telematika MH02 pada unit ${a.unitNo || "-"}.`;
          durationFormatted = "2 Jam 00 Menit";
          durationMinutes = 120;
          break;
        case "removal":
          summary = `Pelepasan perangkat dari unit ${a.unitNo || "-"} untuk rekondisi workshop.`;
          durationFormatted = "1 Jam 00 Menit";
          durationMinutes = 60;
          break;
      }
    }

    return {
      ...a,
      time,
      summary,
      durationFormatted,
      durationMinutes,
      healthCheckScore,
      details: a.details || `Pemeriksaan operasional site ${a.district} oleh ${a.technicianName}.`,
    };
  });

  // 2. Map installation records from initialInstallations into activity log
  const mappedInstallations: ActivityRecord[] = initialInstallations.map((inst) => ({
    activityId: "ACT-" + inst.id,
    type: "installation" as ActivityType,
    deviceId: inst.deviceId,
    unitNo: inst.unitNo,
    equipmentType: inst.equipmentType,
    district: inst.district,
    date: inst.date,
    time: inst.startTime || undefined,
    technicianName: inst.technicianName,
    status: inst.status,
    month: inst.date.slice(0, 7),
    durationFormatted: inst.durationFormatted,
    durationMinutes: inst.durationMinutes,
    summary:
      inst.remarks ||
      `Instalasi unit telematika SMARTD DISPLAY baru pada unit ${inst.unitNo} (${inst.equipmentType}).`,
    details: `Form: ${inst.id}. GL: ${inst.groupLeaderName}. Lokasi: ${
      inst.area || inst.locationDetail
    }. IP SMARTD: ${inst.ipAddress || "-"}.`,
  }));

  // 3. Map replacement records from initialReplacements into activity log (both new and old devices)
  const mappedReplacements: ActivityRecord[] = [];
  initialReplacements.forEach((rep) => {
    // Event A: Pemasangan unit baru
    mappedReplacements.push({
      activityId: "ACT-REP-NEW-" + rep.id,
      type: "replacement" as ActivityType,
      deviceId: rep.newDeviceId,
      unitNo: rep.unitNo,
      equipmentType: rep.equipmentType,
      district: (rep.district as any) || "Sangatta",
      date: rep.date,
      time: rep.startTime || undefined,
      technicianName: rep.technicianName,
      status: rep.status,
      month: rep.date.slice(0, 7),
      durationFormatted: rep.durationFormatted,
      durationMinutes: rep.durationMinutes,
      summary: `Pemasangan unit baru SMARTD DISPLAY (${rep.newDeviceId}) menggantikan perangkat lama (${rep.oldDeviceId}) pada unit ${rep.unitNo}.`,
      details: `Form: ${rep.id}. Teknisi: ${rep.technicianName} (${rep.technicianNrp}). GL: ${rep.groupLeaderName}. Kondisi unit lama: ${rep.oldDeviceFinalConditionLabel}. IP SMARTD: ${rep.ipAddress || "-"}. Remarks: ${rep.remarks || "-"}`,
    });

    // Event B: Pelepasan unit lama
    mappedReplacements.push({
      activityId: "ACT-REP-OLD-" + rep.id,
      type: "replacement" as ActivityType,
      deviceId: rep.oldDeviceId,
      unitNo: rep.oldUnitNo || rep.unitNo,
      equipmentType: rep.oldEquipmentType || rep.equipmentType,
      district: (rep.district as any) || "Sangatta",
      date: rep.date,
      time: rep.startTime || undefined,
      technicianName: rep.technicianName,
      status: rep.status,
      month: rep.date.slice(0, 7),
      durationFormatted: rep.durationFormatted,
      durationMinutes: rep.durationMinutes,
      summary: `Pencopotan perangkat SMARTD DISPLAY (${rep.oldDeviceId}) dari unit ${rep.oldUnitNo || rep.unitNo}. Digantikan oleh unit ${rep.newDeviceId}. Kondisi akhir: ${rep.oldDeviceFinalConditionLabel}.`,
      details: `Form: ${rep.id}. Teknisi: ${rep.technicianName} (${rep.technicianNrp}). GL: ${rep.groupLeaderName}. Perangkat pengganti: ${rep.newDeviceId}.`,
    });
  });

  // 4. Map actual in-session Troubleshoot reports without mutating the baseline.
  // Each source record produces one derived activity on every aggregation call.
  const mappedTroubleshoots: ActivityRecord[] = troubleshootRecords.map((record) => {
    const hours = Math.floor(record.durationMinutes / 60);
    const minutes = record.durationMinutes % 60;
    const durationFormatted = [
      hours > 0 ? `${hours} Jam` : "",
      minutes > 0 || hours === 0 ? `${minutes} Menit` : "",
    ].filter(Boolean).join(" ");

    return {
      activityId: record.id,
      type: "troubleshoot" as ActivityType,
      deviceId: record.deviceId,
      unitNo: record.unitNo,
      district: record.district,
      date: record.activityDate,
      time: record.startTime,
      technicianName: record.technicianName,
      month: record.activityDate.slice(0, 7),
      durationFormatted,
      durationMinutes: record.durationMinutes,
      summary: record.issue,
      details: record.actionTaken,
    };
  });

  // 5. Map removal records dynamically from getRemovalRecords()
  const mappedRemovals: ActivityRecord[] = getRemovalRecords().map((record) => {
    const hours = Math.floor((record.durationMinutes || 0) / 60);
    const minutes = (record.durationMinutes || 0) % 60;
    const durationFormatted = [
      hours > 0 ? `${hours} Jam` : "",
      minutes > 0 || hours === 0 ? `${minutes} Menit` : "",
    ].filter(Boolean).join(" ");

    return {
      activityId: "ACT-" + record.id,
      type: "removal" as ActivityType,
      deviceId: record.deviceId,
      unitNo: record.unitNo,
      district: (record.district as any) || "Sangatta",
      date: record.removalDate,
      time: record.startTime || undefined,
      technicianName: record.technicianName,
      status: "completed",
      month: record.removalDate.slice(0, 7),
      durationFormatted,
      durationMinutes: record.durationMinutes || 0,
      summary: `Pelepasan perangkat SMARTD DISPLAY (${record.deviceId}) dari unit ${record.unitNo}. Alasan: ${record.reason}. Kondisi akhir: ${record.deviceFinalConditionLabel || record.deviceFinalCondition || "In Stock"}.`,
      details: `Form: ${record.id}. Alasan: ${record.reason}${record.reasonDetail ? ` (${record.reasonDetail})` : ""}. GL: ${record.groupLeaderName || "-"}. Catatan: ${record.remarks || "-"}`,
    };
  });

  // Combine and sort chronologically (most recent first)
  const combined = [
    ...mappedInstallations,
    ...mappedReplacements,
    ...mappedTroubleshoots,
    ...mappedRemovals,
    ...enrichedBaseline,
  ];
  combined.sort((a, b) => {
    const dateTimeA = `${a.date} ${a.time || "00:00"}`;
    const dateTimeB = `${b.date} ${b.time || "00:00"}`;
    return dateTimeB.localeCompare(dateTimeA);
  });

  return combined;
}


