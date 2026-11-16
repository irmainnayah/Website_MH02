"use client";

import React, { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity,
  Search,
  Filter,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Wrench,
  RefreshCw,
  Trash2,
  Calendar,
  ExternalLink,
  X,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { getAllEnrichedActivities, devices as allDevices } from "@/lib/mock-data";
import { getTroubleshootRecords, subscribeToTroubleshootRecords } from "@/lib/mock-data/troubleshoots";
import { getReplacementRecords, subscribeToReplacementRecords } from "@/lib/mock-data/replacement";
import { ActivityRecord, ActivityType, DistrictName } from "@/types/dashboard";

const DISTRICTS: DistrictName[] = [
  "Sangatta",
  "Bengalon",
  "Wahau",
  "Sangatta Utara",
];

const ACTIVITY_TYPES: { key: ActivityType | "all"; label: string }[] = [
  { key: "all", label: "Semua Jenis Aktivitas" },
  { key: "installation", label: "Installation (Pemasangan)" },
  { key: "troubleshoot", label: "Troubleshoot" },
  { key: "replacement", label: "Replacement (Penggantian)" },
  { key: "removal", label: "Removal (Pelepasan)" },
];

function activityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    installation: "Installation",
    troubleshoot: "Troubleshoot",
    replacement: "Replacement",
    removal: "Removal",
  };
  return labels[type] || type;
}

export default function ActivityLogPage() {
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

  // Map of deviceId to master unitNo for reliable fallback resolution
  const deviceUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    allDevices.forEach((d) => {
      if (d.unitNo) {
        map.set(d.deviceId.toLowerCase(), d.unitNo);
      }
    });
    return map;
  }, []);

  const resolveUnitNo = React.useCallback(
    (item: { unitNo: string | null; deviceId: string }): string => {
      if (item.unitNo && item.unitNo.trim() !== "" && item.unitNo !== "-") {
        return item.unitNo;
      }
      const fromMaster = deviceUnitMap.get(item.deviceId.toLowerCase());
      return fromMaster || "—";
    },
    [deviceUnitMap]
  );

  // 1. Operational activities
  const operationalActivities = useMemo(() => {
    // The two store snapshots are render dependencies for dynamically aggregated activities.
    void troubleshootRecords;
    void replacementRecords;
    return getAllEnrichedActivities();
  }, [troubleshootRecords, replacementRecords]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");

  // Date Range state
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateError, setDateError] = useState<string | null>(null);

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [troubleshootRecords, replacementRecords]);

  // Alert message for export
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showAlert = (text: string, type: "success" | "error" = "success") => {
    setAlertMessage({ type, text });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // Date handlers
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setCurrentPage(1);
    if (endDate && val && val > endDate) {
      setDateError("Tanggal mulai tidak boleh melewati tanggal selesai.");
    } else {
      setDateError(null);
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setCurrentPage(1);
    if (startDate && val && startDate > val) {
      setDateError("Tanggal mulai tidak boleh melewati tanggal selesai.");
    } else {
      setDateError(null);
    }
  };

  // Summary Metrics calculated dynamically from operational activities
  const metrics = useMemo(() => {
    const total = operationalActivities.length;
    const installCount = operationalActivities.filter(
      (a) => a.type === "installation"
    ).length;
    const troubleCount = operationalActivities.filter(
      (a) => a.type === "troubleshoot"
    ).length;
    const replacementCount = operationalActivities.filter(
      (a) => a.type === "replacement"
    ).length;
    const removalCount = operationalActivities.filter(
      (a) => a.type === "removal"
    ).length;
    return { total, installCount, troubleCount, replacementCount, removalCount };
  }, [operationalActivities]);

  // Filtered dataset derived strictly from operationalActivities
  const filteredActivities = useMemo(() => {
    return operationalActivities.filter((item) => {
      const resolvedUnit = resolveUnitNo(item);

      // 1. Text Search (Device ID or Unit Number or Technician or Summary)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDev = item.deviceId.toLowerCase().includes(q);
        const matchUnit = resolvedUnit.toLowerCase().includes(q);
        const matchTech = item.technicianName.toLowerCase().includes(q);
        const matchSummary = (item.summary || "").toLowerCase().includes(q);
        const matchActId = item.activityId.toLowerCase().includes(q);
        const matchDate = item.date.toLowerCase().includes(q);

        if (!matchDev && !matchUnit && !matchTech && !matchSummary && !matchActId && !matchDate) {
          return false;
        }
      }

      // 2. Activity Type Filter
      if (typeFilter !== "all" && item.type !== typeFilter) {
        return false;
      }

      // 3. District Filter
      if (districtFilter !== "all" && item.district !== districtFilter) {
        return false;
      }

      // 4. Date Range Filter
      if (startDate && !dateError && item.date < startDate) return false;
      if (endDate && !dateError && item.date > endDate) return false;

      return true;
    });
  }, [operationalActivities, searchQuery, typeFilter, districtFilter, startDate, endDate, dateError, resolveUnitNo]);

  // Pagination Calculations
  const totalItems = filteredActivities.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedActivities = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, safeCurrentPage, pageSize]);

  const isFiltered =
    searchQuery.trim() !== "" ||
    typeFilter !== "all" ||
    districtFilter !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const handleResetFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setDistrictFilter("all");
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setCurrentPage(1);
  };

  // Export to CSV (resolves Unit Number cleanly)
  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      showAlert("Tidak ada data aktivitas yang sesuai untuk diekspor.", "error");
      return;
    }

    const headers = [
      "Activity ID",
      "Timestamp",
      "Device ID",
      "Unit Number",
      "Activity Type",
      "Summary",
      "Performed By (Teknisi)",
      "Site Location (Distrik)",
      "Duration",
      "Status",
    ];

    const rows = filteredActivities.map((a) => [
      a.activityId,
      `"${a.date}${a.time ? ` ${a.time}` : ""}"`,
      a.deviceId,
      `"${resolveUnitNo(a)}"`,
      `"${activityTypeLabel(a.type)}"`,
      `"${(a.summary || "").replace(/"/g, '""')}"`,
      `"${a.technicianName.replace(/"/g, '""')}"`,
      a.district,
      `"${a.durationFormatted || "-"}"`,
      a.status || "-",
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];

    link.setAttribute("href", url);
    link.setAttribute("download", `smartd_device_activity_log_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showAlert(
      `Berhasil mengekspor ${filteredActivities.length} log aktivitas operasional ke CSV.`
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Alert Notification */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn shadow-sm ${
            alertMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Device Activity Log
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Pencatatan riwayat seluruh aktivitas operasional perangkat SMARTD DISPLAY
            lintas armada: instalasi, perbaikan (troubleshoot), penggantian (replacement), dan
            pelepasan unit (removal).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/operations/installation"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Riwayat Pemasangan</span>
          </Link>
        </div>
      </div>

      {/* Metrics Summary Cards (Total + 4 Operational Categories) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Aktivitas Operasional */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between md:col-span-4 lg:col-span-1">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Aktivitas</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {metrics.total}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Operasional telematika</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        {/* 1. Installation */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Installation</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {metrics.installCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pemasangan baru</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Wrench className="h-5 w-5" />
          </div>
        </div>

        {/* 2. Troubleshoot */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Troubleshoot</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {metrics.troubleCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Perbaikan &amp; diagnosa</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        {/* 3. Replacement */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Replacement</p>
            <p className="text-2xl font-bold text-violet-600 mt-1">
              {metrics.replacementCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Penggantian unit</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
            <RefreshCw className="h-5 w-5" />
          </div>
        </div>

        {/* 4. Removal */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Removal</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">
              {metrics.removalCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pelepasan unit</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <Trash2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          {/* Row 1: Search + Filters */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Search Input (Device ID or Unit Number) */}
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari Device ID (contoh: D001, D011) atau Unit Number (DT-101)..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span>Filter:</span>
              </div>

              {/* Activity Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>

              {/* District Filter */}
              <select
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="all">Semua Distrik</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Date Range + Export CSV */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Rentang Tanggal:</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[11px] text-slate-400">Dari:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                  title="Tanggal Mulai"
                />
              </div>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[11px] text-slate-400">Sampai:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                  title="Tanggal Selesai"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setDateError(null); setCurrentPage(1); }}
                  className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded transition font-medium"
                >
                  Clear Tanggal
                </button>
              )}
              {/* Reset Filter Button */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  title="Reset seluruh filter"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Filter</span>
                </button>
              )}
              {/* Export CSV at far right of this row */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={!!dateError || filteredActivities.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title="Ekspor data tabel ke CSV berdasarkan filter aktif"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Ekspor CSV</span>
              </button>
            </div>
          </div>

          {/* Date Validation Alert */}
          {dateError && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span>{dateError}</span>
            </div>
          )}
        </div>

        {/* Table Content: 8 Specified Columns (without equipment type badge beside Unit No) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Device</th>
                <th className="py-3 px-4">Unit Number</th>
                <th className="py-3 px-4">Activity Type</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4">Performed By</th>
                <th className="py-3 px-4">Site Location</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedActivities.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Activity className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Tidak ada aktivitas yang sesuai kriteria
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Tidak ditemukan riwayat telematika yang cocok dengan
                      pencarian Device ID / Unit atau filter yang dipilih.
                    </p>
                    {isFiltered && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-sm transition"
                      >
                        Reset Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedActivities.map((item, idx) => (
                  <tr
                    key={item.activityId + "-" + idx}
                    className="hover:bg-slate-50/75 transition-colors group"
                  >
                    {/* 1. Timestamp */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800 tabular-nums">
                        {item.date}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        {item.time ? `${item.time} WIB` : "—"}
                      </div>
                    </td>

                    {/* 2. Device */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Link
                        href={`/reports/timeline/${encodeURIComponent(
                          item.deviceId
                        )}`}
                        className="font-semibold text-slate-800 hover:text-violet-700 hover:underline"
                        title={`Buka Timeline Perangkat ${item.deviceId}`}
                      >
                        {item.deviceId}
                      </Link>
                    </td>

                    {/* 3. Unit Number (Clean text only, resolved via relationship) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900">
                        {resolveUnitNo(item)}
                      </span>
                    </td>

                    {/* 4. Activity Type (Clean plain text) */}
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium text-slate-800">
                      {activityTypeLabel(item.type)}
                    </td>

                    {/* 5. Summary */}
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-slate-800 font-medium leading-relaxed truncate">
                        {item.summary}
                      </p>
                    </td>

                    {/* 6. Performed By */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-slate-800 font-medium">{item.technicianName}</span>
                    </td>

                    {/* 7. Site Location */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700 font-medium">
                      {item.district}
                    </td>

                    {/* 8. Duration */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {item.durationFormatted || "—"}
                    </td>

                    {/* Actions: View Timeline */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Link
                        href={`/reports/timeline/${encodeURIComponent(
                          item.deviceId
                        )}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 text-slate-600 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition"
                        title={`Buka riwayat timeline ${item.deviceId}`}
                      >
                        <span>Timeline</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Menampilkan <strong className="text-slate-800">{totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}</strong>
              {" "}–{" "}
              <strong className="text-slate-800">{Math.min(safeCurrentPage * pageSize, totalItems)}</strong>
              {" "}dari <strong className="text-slate-800">{totalItems}</strong> data
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={safeCurrentPage <= 1 || totalItems === 0}
              className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Pertama"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1 || totalItems === 0}
              className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Sebelumnya"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              {totalItems === 0 ? 0 : safeCurrentPage} / {totalItems === 0 ? 0 : totalPages}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages || totalItems === 0}
              className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Selanjutnya"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage >= totalPages || totalItems === 0}
              className="inline-flex items-center px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Terakhir"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
