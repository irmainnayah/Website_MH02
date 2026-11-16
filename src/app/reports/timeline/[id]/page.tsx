"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Clock,
  ArrowLeft,
  Truck,
  MapPin,
  Activity,
  CheckCircle2,
  AlertCircle,
  Wrench,
  RefreshCw,
  Trash2,
  Calendar,
  HardDrive,
  User,
  Shield,
  FileText,
} from "lucide-react";
import {
  devices as allDevices,
  getAllEnrichedActivities,
} from "@/lib/mock-data";
import { DeviceRecord, ActivityRecord, DeviceStatus } from "@/types/dashboard";
import { getTroubleshootRecords, subscribeToTroubleshootRecords } from "@/lib/mock-data/troubleshoots";
import { getReplacementRecords, subscribeToReplacementRecords } from "@/lib/mock-data/replacement";

// Status Badge Helper
function renderDeviceStatusBadge(status: DeviceStatus) {
  switch (status) {
    case "in_use":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" /> In Use (Aktif)
        </span>
      );
    case "in_stock_rfu":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <HardDrive className="h-3.5 w-3.5" /> In Stock - RFU
        </span>
      );
    case "in_stock_damaged":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="h-3.5 w-3.5" /> In Stock - Repair
        </span>
      );
    case "in_stock_ho":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <RefreshCw className="h-3.5 w-3.5" /> HO Repair
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Clock className="h-3.5 w-3.5" /> In Stock
        </span>
      );
  }
}

// Activity Visual Helper (icon & badge class)
function getActivityVisuals(type: string) {
  switch (type) {
    case "installation":
      return {
        label: "Installation",
        icon: Wrench,
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        indicatorBg: "bg-blue-600 text-white shadow-blue-200",
        ringClass: "ring-4 ring-blue-50 border-white",
        cardBorder: "border-slate-200 hover:border-blue-200",
        lineColor: "bg-blue-200",
      };
    case "troubleshoot":
      return {
        label: "Troubleshoot",
        icon: AlertCircle,
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
        indicatorBg: "bg-amber-600 text-white shadow-amber-200",
        ringClass: "ring-4 ring-amber-50 border-white",
        cardBorder: "border-slate-200 hover:border-amber-200",
        lineColor: "bg-amber-200",
      };
    case "replacement":
      return {
        label: "Replacement",
        icon: RefreshCw,
        badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
        indicatorBg: "bg-violet-600 text-white shadow-violet-200",
        ringClass: "ring-4 ring-violet-50 border-white",
        cardBorder: "border-slate-200 hover:border-violet-200",
        lineColor: "bg-violet-200",
      };
    case "removal":
      return {
        label: "Removal",
        icon: Trash2,
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        indicatorBg: "bg-rose-600 text-white shadow-rose-200",
        ringClass: "ring-4 ring-rose-50 border-white",
        cardBorder: "border-slate-200 hover:border-rose-200",
        lineColor: "bg-rose-200",
      };
    default:
      return {
        label: type,
        icon: Activity,
        badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
        indicatorBg: "bg-slate-600 text-white shadow-slate-200",
        ringClass: "ring-4 ring-slate-50 border-white",
        cardBorder: "border-slate-200 hover:border-slate-300",
        lineColor: "bg-slate-200",
      };
  }
}

export default function DeviceTimelinePage() {
  const params = useParams();
  const rawId = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  const troubleshootRecords = useSyncExternalStore(
    subscribeToTroubleshootRecords,
    getTroubleshootRecords,
    getTroubleshootRecords
  );
  const replacementRecords = useSyncExternalStore(
    subscribeToReplacementRecords,
    getReplacementRecords,
    getReplacementRecords
  );

  // Find Device Record
  const device: DeviceRecord | null = useMemo(() => {
    if (!rawId) return null;
    return allDevices.find((d) => d.deviceId.toLowerCase() === rawId.toLowerCase()) || null;
  }, [rawId]);

  // Gather activities for this device
  const deviceActivities: ActivityRecord[] = useMemo(() => {
    if (!rawId) return [];
    // Ensure external stores trigger recompute
    void troubleshootRecords;
    void replacementRecords;
    const all = getAllEnrichedActivities();
    return all
      .filter((a) => a.deviceId.toLowerCase() === rawId.toLowerCase())
      .sort((a, b) => {
        const dateTimeA = `${a.date} ${a.time || "00:00"}`;
        const dateTimeB = `${b.date} ${b.time || "00:00"}`;
        return dateTimeB.localeCompare(dateTimeA);
      });
  }, [rawId, troubleshootRecords, replacementRecords]);

  // Compute statistics
  const stats = useMemo(() => {
    const installations = deviceActivities.filter((a) => a.type === "installation").length;
    const removals = deviceActivities.filter((a) => a.type === "removal").length;
    const troubleshoots = deviceActivities.filter((a) => a.type === "troubleshoot").length;
    const replacements = deviceActivities.filter((a) => a.type === "replacement").length;
    return {
      installations,
      removals,
      troubleshoots,
      replacements,
      total: deviceActivities.length,
    };
  }, [deviceActivities]);

  // Device not found view
  if (!device && deviceActivities.length === 0) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/reports/activity-log" className="hover:text-blue-600 transition flex items-center gap-1 font-medium">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Activity Log</span>
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Device Timeline</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Perangkat Tidak Ditemukan</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Perangkat dengan ID <strong className="text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{rawId || "KOSONG"}</strong> tidak terdaftar dalam sistem master perangkat operasional.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Link href="/operations/installation" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition">
              <ArrowLeft className="h-4 w-4" />
              <span>Riwayat Pemasangan</span>
            </Link>
            <Link href="/reports/activity-log" className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm">
              <Activity className="h-4 w-4 text-slate-500" />
              <span>Device Activity Log</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const deviceId = device?.deviceId || rawId;
  const unitNo = device?.unitNo || deviceActivities[0]?.unitNo || "Belum Terpasang";
  const district = device?.district || deviceActivities[0]?.district || "Sangatta";
  const equipmentType = device?.equipmentType || deviceActivities[0]?.equipmentType || "Dump Truck";
  const serialNumber = device?.serialNumber || `SN-${deviceId}`;
  const status = device?.status || "in_use";

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/reports/activity-log" className="hover:text-blue-600 transition flex items-center gap-1 font-medium">
            <Activity className="h-3.5 w-3.5" />
            <span>Activity Log</span>
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Device Timeline ({deviceId})</span>
        </div>
        <Link href="/operations/installation" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm">
          <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
          <span>Kembali ke Riwayat Instalasi</span>
        </Link>
      </div>

      {/* Main Device Identity Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md border border-violet-200">
                Device Lifecycle Timeline
              </span>
              <span className="text-[11px] font-medium text-slate-500">Site: {district}</span>
              {renderDeviceStatusBadge(status)}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 flex items-center gap-3">
              <span className="text-violet-600">{deviceId}</span>
              <span className="text-slate-300 font-normal">|</span>
              <span className="flex items-center gap-2 text-slate-800">
                <Truck className="h-6 w-6 text-slate-600" /> Unit {unitNo}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Rekam jejak kronologis lengkap siklus hidup operasional perangkat SMARTD DISPLAY, pemeliharaan, serta pergantian modul.
            </p>
          </div>

          {/* Quick Specifications Metadata */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 shrink-0 text-xs">
            <div className="px-3 py-1">
              <span className="text-[10px] text-slate-400 font-medium block">Serial Number</span>
              <span className="font-bold text-slate-800">{serialNumber}</span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="px-3 py-1">
              <span className="text-[10px] text-slate-400 font-medium block">Tipe Alat</span>
              <span className="font-semibold text-blue-700">{equipmentType}</span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="px-3 py-1">
              <span className="text-[10px] text-slate-400 font-medium block">Total Aktivitas</span>
              <span className="font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200 inline-block tabular-nums">
                {stats.total} Record{stats.total !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Operational Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-6">
          {/* 1. Installation */}
          <div className="p-4 rounded-xl border border-slate-200 bg-blue-50/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Installation</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {stats.installations} <span className="text-xs font-normal text-slate-500">kali</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Registrasi &amp; komisioning unit</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <Wrench className="h-5 w-5" />
            </div>
          </div>

          {/* 2. Removal */}
          <div className="p-4 rounded-xl border border-slate-200 bg-rose-50/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Removal</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">
                {stats.removals} <span className="text-xs font-normal text-slate-500">kali</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Pelepasan unit untuk rekondisi</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
              <Trash2 className="h-5 w-5" />
            </div>
          </div>

          {/* 3. Replacement */}
          <div className="p-4 rounded-xl border border-slate-200 bg-violet-50/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Replacement</p>
              <p className="text-2xl font-bold text-violet-700 mt-1">
                {stats.replacements} <span className="text-xs font-normal text-slate-500">kali</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Penggantian modul atau komponen</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>

          {/* 4. Troubleshoot */}
          <div className="p-4 rounded-xl border border-slate-200 bg-amber-50/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Troubleshoot</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">
                {stats.troubleshoots} <span className="text-xs font-normal text-slate-500">kali</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Diagnostik &amp; perbaikan</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Chronological Vertical Activity Timeline */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-600" />
              <span>Kronologi Aktivitas Perangkat</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Urutan riwayat aktivitas operasional perangkat dari yang paling baru
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            {deviceActivities.length} Aktivitas Tercatat
          </span>
        </div>

        {deviceActivities.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Activity className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Belum Ada Riwayat Aktivitas Operasional
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Perangkat ini belum memiliki catatan aktivitas pemasangan, perbaikan, penggantian, atau pelepasan.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 sm:pl-8 py-2">
            {/* Continuous vertical connecting line */}
            <div
              className="absolute left-3 sm:left-4 top-4 bottom-6 w-0.5 bg-slate-200 -translate-x-1/2"
              aria-hidden="true"
            />

            <div className="space-y-6">
              {deviceActivities.map((act, index) => {
                const visuals = getActivityVisuals(act.type);
                const Icon = visuals.icon;

                return (
                  <div key={act.activityId + "-" + index} className="relative group">
                    {/* Circular timeline indicator positioned along the line */}
                    <div
                      className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 transition-transform group-hover:scale-110 ${visuals.indicatorBg} ${visuals.ringClass}`}
                    >
                      <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </div>

                    {/* Detailed Activity Card Layout */}
                    <div
                      className={`ml-3 sm:ml-4 bg-white rounded-xl border p-4 sm:p-5 shadow-sm transition-all hover:shadow-md ${visuals.cardBorder}`}
                    >
                      {/* Top Row: Type Badge, Activity ID, Timestamp */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${visuals.badgeClass}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {visuals.label}
                          </span>
                          <span className="text-xs text-slate-400">
                            {act.activityId}
                          </span>
                          {act.status && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">
                              {act.status}
                            </span>
                          )}
                        </div>

                        {/* Timestamp & Duration */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span className="tabular-nums text-slate-700 font-semibold">{act.date}</span>
                            {act.time && (
                              <span className="text-slate-400 tabular-nums">({act.time} WIB)</span>
                            )}
                          </div>
                          {act.durationFormatted && (
                            <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-600 text-[11px]">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>{act.durationFormatted}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Main Summary & Description */}
                      <div className="pt-3 space-y-2">
                        {act.summary && (
                          <p className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
                            {act.summary}
                          </p>
                        )}
                        {act.details && (
                          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
                            {act.details}
                          </p>
                        )}
                      </div>

                      {/* Bottom Metadata: Unit Number, Technician, District */}
                      <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-4 text-slate-600">
                          {/* Unit Number */}
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-500">Unit:</span>
                            <span className="font-bold text-slate-800">
                              {act.unitNo || unitNo || "—"}
                            </span>
                            {act.equipmentType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {act.equipmentType}
                              </span>
                            )}
                          </div>

                          {/* Technician */}
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-500">Teknisi:</span>
                            <span className="font-medium text-slate-800">
                              {act.technicianName}
                            </span>
                          </div>

                          {/* Site / District */}
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-slate-500">Site:</span>
                            <span className="font-medium text-slate-800">
                              {act.district}
                            </span>
                          </div>
                        </div>

                        {/* Navigation link to related form if applicable */}
                        {act.type === "installation" && (
                          <Link
                            href="/operations/installation"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span>Buka Form Instalasi</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "replacement" && (
                          <Link
                            href="/operations/replacement"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                          >
                            <span>Buka Form Penggantian</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "removal" && (
                          <Link
                            href="/operations/removal"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                          >
                            <span>Buka Form Pelepasan</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "troubleshoot" && (
                          <Link
                            href="/support/troubleshoots"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <span>Buka Form Troubleshoot</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
