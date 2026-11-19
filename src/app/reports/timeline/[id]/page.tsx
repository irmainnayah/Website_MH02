"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Download,
  RotateCcw,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DeviceStatus } from "@/types/dashboard";
import { deleteTimelineActivity, getDeviceTimeline, TimelineDevice, TimelineEntry } from "@/lib/timeline-api";
import { useAuth } from "@/features/auth/AuthContext";

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
        label: ({ registered: "Registrasi Perangkat", details_updated: "Data Perangkat Diperbarui", soft_deleted: "Perangkat Diarsipkan", transaction_deleted: "Transaksi Dihapus", device_override: "Koreksi Perangkat" } as Record<string, string>)[type] ?? type,
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
  const router = useRouter();
  const { currentUser } = useAuth();
  const rawId = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  const [device, setDevice] = useState<TimelineDevice | null>(null);
  const [deviceActivities, setDeviceActivities] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<TimelineEntry | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(null); setDevice(null); setDeviceActivities([]);
    getDeviceTimeline(rawId).then((result) => { if (active) { setDevice(result.device); setDeviceActivities(result.items); } })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Gagal memuat timeline perangkat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [rawId]);
  useEffect(() => { setPage(1); }, [search, typeFilter, dateFrom, dateTo, pageSize, rawId]);
  useEffect(() => {
    if (!deleteTarget) return;
    const timer = window.setInterval(() => setCountdown((previous) => Math.max(0, previous - 1)), 1000);
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !deleting) setDeleteTarget(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", close); document.body.style.overflow = previous; };
  }, [deleteTarget, deleting]);
  const dateError = dateFrom && dateTo && dateFrom > dateTo ? "Tanggal mulai tidak boleh melewati tanggal selesai." : null;
  const filtered = deviceActivities.filter((entry) => {
    const query = search.trim().toLowerCase();
    return (!query || `${entry.formNumber ?? ""} ${entry.summary} ${entry.details} ${entry.unitNo ?? ""} ${entry.technicianName}`.toLowerCase().includes(query)) &&
      (typeFilter === "all" || typeFilter === entry.type) && (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  async function confirmDelete() {
    if (!deleteTarget?.activityId || deleteTarget.entryType !== "activity" || deleting || countdown > 0 || currentUser.role !== "superadmin") return;
    setDeleting(true); setActionError(null);
    try {
      await deleteTimelineActivity(rawId, deleteTarget.activityId);
      setDeleteTarget(null);
      const updated = await getDeviceTimeline(rawId);
      setDevice(updated.device); setDeviceActivities(updated.items);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Gagal menghapus aktivitas."); setDeleteTarget(null); }
    finally { setDeleting(false); }
  }
  function exportCsv() {
    if (dateError || filtered.length === 0) { setActionError(dateError ?? "Tidak ada riwayat untuk diekspor."); return; }
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const rows = [["Key", "Form Number", "Kategori", "Jenis", "Tanggal", "Waktu", "Zona", "Unit Historis", "Ringkasan", "Pelaksana"],
      ...filtered.map((entry) => [entry.key, entry.formNumber ?? "", entry.entryType, getActivityVisuals(entry.type).label, entry.date, entry.time, entry.timeZoneLabel, entry.unitNo ?? "", entry.summary, entry.technicianName])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `timeline_${rawId}_${dateFrom || "awal"}_${dateTo || "akhir"}.csv`; link.click(); URL.revokeObjectURL(url);
  }

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
      total: deviceActivities.filter((entry) => entry.entryType === "activity").length,
      events: deviceActivities.filter((entry) => entry.entryType === "event").length,
    };
  }, [deviceActivities]);

  if (loading) return <div role="status" className="mx-auto max-w-5xl py-12 text-center text-sm text-slate-500">Memuat timeline perangkat...</div>;
  // Device not found view
  if (!device) {
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
          <h1 className="text-lg font-bold text-slate-800">Timeline Belum Dapat Dimuat</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {loadError ?? `Perangkat ${rawId} tidak ditemukan.`}
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

  const deviceId = device.deviceId;
  const unitNo = device.unitNo || "Tidak terpasang";
  const district = device.district;
  const equipmentType = device.equipmentType || "-";
  const serialNumber = device.serialNumber;
  const status = device.status;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
      {!device.isArchived && <div className="flex justify-end"><select aria-label="Tambah aktivitas" defaultValue="" onChange={(event) => { const paths: Record<string, string> = { installation: "/operations/installation/new", replacement: "/operations/replacement/new", removal: "/operations/removal/new", troubleshoot: "/support/troubleshoots/new" }; if (paths[event.target.value]) router.push(paths[event.target.value]); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><option value="" disabled>Tambah Aktivitas</option><option value="installation">Installation</option><option value="replacement">Replacement</option><option value="removal">Removal</option><option value="troubleshoot">Troubleshoot</option></select></div>}
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
        <Link href="/reports/timeline" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm">
          <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
          <span>Directory Timeline</span>
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
              {device.isArchived && <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Arsip</span>}
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
                {stats.total} aktivitas / {stats.events} event
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
            {deviceActivities.length} Entri Tercatat
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">Cari<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nomor form, unit, ringkasan..." className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-xs font-medium text-slate-600">Jenis<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="all">Semua</option>{Array.from(new Set(deviceActivities.map((entry) => entry.type))).map((type) => <option key={type} value={type}>{getActivityVisuals(type).label}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Dari<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-xs font-medium text-slate-600">Sampai<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <button type="button" title="Clear Filter" aria-label="Clear Filter" onClick={() => { setSearch(""); setTypeFilter("all"); setDateFrom(""); setDateTo(""); }} className="rounded-lg border border-slate-200 p-2 text-slate-600"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" disabled={Boolean(dateError) || filtered.length === 0} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
        </div>
        {dateError && <p role="alert" className="text-xs text-rose-700">{dateError}</p>}
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Activity className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Tidak ada riwayat yang sesuai
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {deviceActivities.length === 0 ? "Perangkat ini belum memiliki catatan aktivitas atau lifecycle event tersimpan." : "Tidak ada entri yang cocok dengan filter."}
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
              {paginated.map((act) => {
                const visuals = getActivityVisuals(act.type);
                const Icon = visuals.icon;

                return (
                  <div key={act.key} className="relative group">
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
                            {act.formNumber || act.key}
                          </span>
                          {act.role && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">{act.role}</span>}
                        </div>

                        {/* Timestamp & Duration */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span className="tabular-nums text-slate-700 font-semibold">{act.date}</span>
                            {act.time && (
                              <span className="text-slate-400 tabular-nums">({act.time} {act.timeZoneLabel})</span>
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
                        {(act.beforeStatus || act.afterStatus) && <p className="text-xs text-slate-600">Sebelum: {act.beforeStatus || "-"} / {act.beforeUnit || "Tanpa unit"} ; Sesudah: {act.afterStatus || "-"} / {act.afterUnit || "Tanpa unit"}</p>}
                        {act.sourceStartedAtLocal && <p className="text-xs text-slate-500">Waktu mulai transaksi asal: {act.sourceStartedAtLocal.replace("T", " ")} ({act.sourceTimeZone})</p>}
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
                              {act.unitNo || "Tanpa unit tercatat"}
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
                            <span className="text-slate-500">{act.entryType === "event" ? "Pelaksana:" : "Teknisi:"}</span>
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
                        {act.type === "installation" && act.detailPath && (
                          <Link
                            href={act.detailPath}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span>Buka Form Instalasi</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "replacement" && act.detailPath && (
                          <Link
                            href={act.detailPath}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                          >
                            <span>Buka Form Penggantian</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "removal" && act.detailPath && (
                          <Link
                            href={act.detailPath}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                          >
                            <span>Buka Form Pelepasan</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {act.type === "troubleshoot" && act.detailPath && (
                          <Link
                            href={act.detailPath}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <span>Buka Form Troubleshoot</span>
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Link>
                        )}
                        {currentUser.role === "superadmin" && !device.isArchived && act.entryType === "activity" && <div className="flex gap-3">
                          {act.editPath && <Link href={act.editPath} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"><Pencil className="h-3 w-3" />Edit</Link>}
                          <button type="button" disabled={deleting} onClick={() => { setCountdown(5); setDeleteTarget(act); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700"><Trash2 className="h-3 w-3" />Hapus</button>
                        </div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600"><label className="flex items-center gap-2">Jumlah per halaman<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border border-slate-200 bg-white px-2 py-1"><option>10</option><option>25</option><option>50</option><option>100</option></select><span>{filtered.length} entri</span></label><div className="flex items-center gap-2"><button type="button" title="Halaman sebelumnya" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((previous) => Math.max(1, previous - 1))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{currentPage} / {totalPages}</span><button type="button" title="Halaman berikutnya" aria-label="Halaman berikutnya" disabled={currentPage === totalPages} onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
      </div>
      {deleteTarget && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="timeline-delete-title" className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"><h2 id="timeline-delete-title" className="text-base font-bold text-slate-900">Hapus {deleteTarget.formNumber}?</h2><p className="text-sm text-slate-600">Transaksi asal ikut dihapus setelah pemeriksaan riwayat dan kondisi perangkat. Event penghapusan tetap disimpan.</p><div className="flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Batal</button><button type="button" disabled={deleting || countdown > 0} onClick={() => void confirmDelete()} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{deleting ? "Menghapus..." : countdown > 0 ? `Hapus (${countdown})` : "Hapus Transaksi"}</button></div></div></div>, document.body)}
    </div>
  );
}
