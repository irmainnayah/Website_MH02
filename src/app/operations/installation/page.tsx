"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Wrench,
  Search,
  Filter,
  Plus,
  Download,
  RotateCcw,
  Eye,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  HardDrive,
  X,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { matchesUnitNumberSearch } from "@/lib/utils";
import { InstallationRecord, InstallationShift, SourcePowerType } from "@/types/installation";
import { DistrictName, EquipmentType } from "@/types/dashboard";

interface InstallationListItem {
  activityId: string;
  formNumber: string;
  siteName: string;
  unitNo: string | null;
  startedAt: string;
  finishedAt: string;
  durationMinutes: number;
  technicianName: string | null;
  deviceCodes: string[];
  timeZone: string;
  equipmentType?: string | null;
  serialNumber?: string | null;
  technicianNrp?: string | null;
  groupLeader?: string | null;
  shift?: InstallationShift | null;
  remarks?: string | null;
  createdAt?: string;
  details?: { egi?: string | null; area?: string | null; location_detail?: string | null; ip_address?: string | null; ip_cpe?: string | null; ip_vhms?: string | null; source_power?: SourcePowerType | null; spm_version?: string | null; notes?: string | null };
}

interface InstallationPageResult { items: InstallationListItem[]; total: number }
type DisplayInstallation = InstallationRecord & { activityId: string; timeZone: string };

export default function InstallationPage() {
  const { currentUser } = useAuth();

  const [installations, setInstallations] = useState<DisplayInstallation[]>([]);
  const [rfuCount, setRfuCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const [mounted, setMounted] = useState(false);

  // Delete State & RBAC 5-Second Countdown
  const [deleteTarget, setDeleteTarget] = useState<DisplayInstallation | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  // Feedback Notification banner
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const showAlert = (
    text: string,
    type: "success" | "error" | "info" = "success"
  ) => {
    setAlertMessage({ type, text });
    setTimeout(() => {
      setAlertMessage(null);
    }, 6000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const all: InstallationListItem[] = [];
        let page = 1;
        let total: number;
        do {
          const response = await fetch(`/api/dotnet/installations?page=${page}&pageSize=100`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Data instalasi tidak dapat dimuat. Periksa API backend dan sesi login.");
          const result: InstallationPageResult = await response.json();
          if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error("Respons data instalasi tidak valid.");
          all.push(...result.items);
          total = result.total;
          if (result.items.length === 0 && all.length < total) throw new Error("Data instalasi belum dapat dimuat seluruhnya.");
          page++;
        } while (all.length < total);
        if (controller.signal.aborted) return;
        setInstallations(all.map((item) => {
          const hours = Math.floor(item.durationMinutes / 60);
          const minutes = item.durationMinutes % 60;
          return {
            activityId: item.activityId, id: item.formNumber, date: item.startedAt.slice(0, 10),
            startTime: item.startedAt.slice(11, 16), endTime: item.finishedAt.slice(11, 16),
            durationMinutes: item.durationMinutes, durationFormatted: `${hours} Jam ${minutes} Menit`,
            deviceId: item.deviceCodes.join(", "), serialNumber: item.serialNumber ?? "", unitNo: item.unitNo ?? "",
            equipmentType: (item.equipmentType ?? "") as EquipmentType, district: item.siteName as DistrictName,
            egi: item.details?.egi ?? undefined, area: item.details?.area ?? undefined,
            locationDetail: item.details?.location_detail ?? "", ipAddress: item.details?.ip_address ?? undefined,
            ipCpe: item.details?.ip_cpe ?? undefined, ipVhms: item.details?.ip_vhms ?? undefined,
            sourcePower: item.details?.source_power ?? undefined, spmVersion: item.details?.spm_version ?? undefined,
            notes: item.details?.notes ?? undefined, shift: item.shift ?? undefined, remarks: item.remarks ?? undefined,
            technicianName: item.technicianName ?? "", technicianNrp: item.technicianNrp ?? "", groupLeaderName: item.groupLeader ?? "",
            status: "completed", photos: [], createdAt: item.createdAt ?? "", timeZone: item.timeZone,
          };
        }));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setInstallations([]);
          setLoadError(reason instanceof Error ? reason.message : "Data instalasi tidak dapat dimuat.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const loadRfu = async () => {
      setRfuCount(null);
      try {
        const response = await fetch("/api/dotnet/devices?purpose=installable&page=1&pageSize=1", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const result: { total: number } = await response.json();
        if (!Number.isSafeInteger(result.total) || result.total < 0) throw new Error("invalid");
        if (!controller.signal.aborted) setRfuCount(result.total);
      } catch {
        if (!controller.signal.aborted) setRfuCount(null);
      }
    };
    void load();
    void loadRfu();
    return () => controller.abort();
  }, [refresh]);

  // Countdown timer for Delete
  useEffect(() => {
    if (!deleteTarget) return;
    const timer = window.setInterval(() => {
      setDeleteCountdown((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deleteTarget]);

  // Modal Escape key and overflow handling
  useEffect(() => {
    if (!deleteTarget) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (deleteTarget && !isDeletingRef.current) {
          setDeleteTarget(null);
          setDeleteCountdown(0);
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTarget]);

  const requestDelete = (record: DisplayInstallation) => {
    if (currentUser.role !== "superadmin" || isDeletingRef.current) return;
    setDeleteTarget(record);
    setDeleteCountdown(5);
  };

  const cancelDelete = () => {
    if (isDeletingRef.current) return;
    setDeleteTarget(null);
    setDeleteCountdown(0);
  };

  const confirmDelete = async () => {
    if (currentUser.role !== "superadmin" || !deleteTarget || deleteCountdown > 0 || isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/dotnet/installations/${encodeURIComponent(deleteTarget.activityId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Gagal menghapus instalasi.");
      }
      showAlert("Instalasi berhasil dihapus.", "success");
      setRefresh((value) => value + 1);
    } catch (reason) {
      showAlert(reason instanceof Error ? reason.message : "Gagal menghapus instalasi.", "error");
    } finally {
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Date Range Filter State
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateError, setDateError] = useState<string | null>(null);

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Handle Date Range changes with validation
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

  // Metrics Summary
  const metrics = useMemo(() => {
    const total = installations.length;
    const now = new Date();
    const months = new Map<string, string>();
    const thisMonth = installations.filter((item) => {
      const zone = item.timeZone || "UTC";
      if (!months.has(zone)) {
        try {
          const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit" }).formatToParts(now);
          months.set(zone, `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`);
        } catch { months.set(zone, ""); }
      }
      return item.date.startsWith(months.get(zone) || "no-match");
    }).length;
    const avgDurationMin =
      total > 0
        ? Math.round(
            installations.reduce((acc, curr) => acc + curr.durationMinutes, 0) /
              total
          )
        : 0;
    const avgHours = Math.floor(avgDurationMin / 60);
    const avgMins = avgDurationMin % 60;
    const avgDurationStr = `${avgHours}j ${avgMins}m`;

    return { total, thisMonth, avgDurationStr, rfuCount };
  }, [installations, rfuCount]);

  const districts = useMemo(() => Array.from(new Set(installations.map((item) => item.district).filter(Boolean))).sort(), [installations]);
  const equipmentTypes = useMemo(() => Array.from(new Set(installations.map((item) => item.equipmentType).filter(Boolean))).sort(), [installations]);

  // Filtered Installation Records
  const filteredInstallations = useMemo(() => {
    return installations.filter((item) => {
      // 1. Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = item.id.toLowerCase().includes(q);
        const matchDev = item.deviceId.toLowerCase().includes(q);
        const matchSn = item.serialNumber.toLowerCase().includes(q);
        const matchUnit = matchesUnitNumberSearch(item.unitNo, q);
        const matchIp = (item.ipAddress || "").toLowerCase().includes(q);
        const matchTech = item.technicianName.toLowerCase().includes(q);
        const matchGl = item.groupLeaderName.toLowerCase().includes(q);
        const matchArea = (item.area || "").toLowerCase().includes(q);

        if (
          !matchId &&
          !matchDev &&
          !matchSn &&
          !matchUnit &&
          !matchIp &&
          !matchTech &&
          !matchGl &&
          !matchArea
        ) {
          return false;
        }
      }

      // 2. District Filter
      if (districtFilter !== "all" && item.district !== districtFilter) {
        return false;
      }

      // 3. Equipment Type Filter
      if (
        equipmentFilter !== "all" &&
        item.equipmentType !== equipmentFilter
      ) {
        return false;
      }

      // 4. Status Filter
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      // 5. Date Range Filter
      if (startDate && !dateError) {
        if (item.date < startDate) return false;
      }
      if (endDate && !dateError) {
        if (item.date > endDate) return false;
      }

      return true;
    });
  }, [
    installations,
    searchQuery,
    districtFilter,
    equipmentFilter,
    statusFilter,
    startDate,
    endDate,
    dateError,
  ]);

  // Pagination Calculations
  const totalItems = filteredInstallations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedInstallations = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredInstallations.slice(start, start + pageSize);
  }, [filteredInstallations, safeCurrentPage, pageSize]);

  const isFiltered =
    searchQuery.trim() !== "" ||
    districtFilter !== "all" ||
    equipmentFilter !== "all" ||
    statusFilter !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const handleResetFilters = () => {
    setSearchQuery("");
    setDistrictFilter("all");
    setEquipmentFilter("all");
    setStatusFilter("all");
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setCurrentPage(1);
  };

  // Export to Excel-compatible CSV based on active Date Range and filters
  const handleExportCSV = () => {
    if (dateError) {
      showAlert(
        "Perbaiki rentang tanggal terlebih dahulu sebelum mengekspor.",
        "error"
      );
      return;
    }

    if (filteredInstallations.length === 0) {
      showAlert(
        "Tidak ada riwayat pemasangan yang sesuai dengan filter untuk diekspor.",
        "error"
      );
      return;
    }

    const headers = [
      "Form Number",
      "Device ID",
      "Serial Number",
      "Unit Number",
      "Tipe Alat Berat",
      "Distrik",
      "Area Operasional",
      "Lokasi Detail",
      "IP Address SMARTD DISPLAY",
      "IP CPE",
      "IP VHMS",
      "Shift",
      "Source Power",
      "SPM Version",
      "Tanggal Pemasangan",
      "Jam Mulai",
      "Jam Selesai",
      "Durasi Pengerjaan",
      "Teknisi Pelaksana",
      "NRP Teknisi",
      "Group Leader",
      "Status",
      "Remarks",
    ];

    const rows = filteredInstallations.map((i) => [
      i.id,
      i.deviceId,
      i.serialNumber,
      i.unitNo,
      i.equipmentType,
      i.district,
      i.area || "-",
      i.locationDetail || "-",
      i.ipAddress || "-",
      i.ipCpe || "-",
      i.ipVhms || "-",
      i.shift || "-",
      i.sourcePower || "-",
      i.spmVersion || "-",
      i.date,
      i.startTime,
      i.endTime,
      i.durationFormatted,
      i.technicianName,
      i.technicianNrp,
      i.groupLeaderName,
      i.status === "completed" ? "Selesai" : "Dalam Pengerjaan",
      i.remarks || i.notes || "",
    ]);

    const csvCell = (value: string) => {
      const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    // UTF-8 BOM prefix (\uFEFF) for Microsoft Excel compatibility
    const csvContent =
      "\uFEFF" +
      [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    const dateRangeSuffix =
      startDate && endDate
        ? `_${startDate}_sd_${endDate}`
        : startDate
        ? `_sejak_${startDate}`
        : endDate
        ? `_hingga_${endDate}`
        : `_${today}`;

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `smartd_installation_records${dateRangeSuffix}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const rangeInfo =
      startDate && endDate
        ? ` (Periode: ${startDate} s.d. ${endDate})`
        : startDate
        ? ` (Mulai: ${startDate})`
        : endDate
        ? ` (Sampai: ${endDate})`
        : "";

    showAlert(
      `Berhasil mengekspor ${filteredInstallations.length} riwayat pemasangan ke CSV${rangeInfo}.`,
      "success"
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Alert Notification */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn shadow-sm ${
            alertMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : alertMessage.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : alertMessage.type === "error" ? (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" />
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
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Installation
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Pencatatan registrasi dan riwayat pemasangan perangkat telematika
            SMARTD DISPLAY pada unit armada alat berat operasional.
          </p>
        </div>

        <div className="self-start sm:self-auto shrink-0">
          <Link
            href="/operations/installation/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Installation</span>
          </Link>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Instalasi</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {loading || loadError ? "—" : metrics.total}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Seluruh unit terpasang
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Wrench className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Instalasi Bulan Ini
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {loading || loadError ? "—" : metrics.thisMonth}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Periode bulan berjalan
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Calendar className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Rata-rata Durasi
            </p>
            <p className="text-2xl font-bold text-slate-800 mt-1">
              {loading || loadError ? "—" : metrics.avgDurationStr}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Waktu pengerjaan teknisi
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Perangkat Siap Pasang
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {metrics.rfuCount ?? "—"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Stok RFU &amp; Belum Pasang
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <HardDrive className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari Form No, Device, Unit, IP, Teknisi, GL..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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

            {/* Faceted Filters & Date Range Picker */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span>Filter:</span>
              </div>

              {/* District Filter */}
              <select
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Distrik</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {/* Equipment Type Filter */}
              <select
                value={equipmentFilter}
                onChange={(e) => {
                  setEquipmentFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Tipe Alat</option>
                {equipmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Status</option>
                <option value="completed">Selesai</option>
                <option value="in_progress">Dalam Pengerjaan</option>
              </select>
            </div>
          </div>

          {/* Date Range Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Rentang Tanggal:</span>
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {/* Start Date */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[11px] text-slate-400">Dari:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                  title="Tanggal Mulai Pemasangan"
                />
              </div>

              {/* End Date */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[11px] text-slate-400">Sampai:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                  title="Tanggal Selesai Pemasangan"
                />
              </div>

              {/* Quick Date Clear */}
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setDateError(null);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded transition font-medium"
                  title="Bersihkan filter tanggal"
                >
                  Clear Tanggal
                </button>
              )}

              {/* Reset All Filters Button */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  title="Reset seluruh filter kembali ke default"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Filter</span>
                </button>
              )}

              {/* Export CSV Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={loading || !!loadError || !!dateError || filteredInstallations.length === 0}
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

        {/* Table Content: 8 Columns Specification */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide">
                <th className="py-3 px-4">Form Number</th>
                <th className="py-3 px-4">Device ID</th>
                <th className="py-3 px-4">Unit Number</th>
                <th className="py-3 px-4">Site Location</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Installation Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading || loadError ? (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-600" role={loadError ? "alert" : "status"}>{loadError || "Memuat data instalasi..."}{loadError && <button type="button" onClick={() => setRefresh((value) => value + 1)} className="block mx-auto mt-3 text-xs font-semibold text-blue-700">Coba lagi</button>}</td></tr>
              ) : paginatedInstallations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Wrench className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Tidak ada riwayat pemasangan ditemukan
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Tidak ada data yang cocok dengan kriteria pencarian dan
                      filter saat ini.
                    </p>
                    {isFiltered && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
                      >
                        Reset Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedInstallations.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/75 transition-colors group"
                  >
                    {/* 1. Form Number */}
                    <td className="py-3 px-4 tabular-nums font-bold text-blue-600 whitespace-nowrap">
                      {item.id}
                    </td>

                    {/* 2. Device ID */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {item.deviceId}
                      </span>
                    </td>

                    {/* 3. Unit Number */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">
                        {item.unitNo || "—"}
                      </span>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.equipmentType || ""}
                      </div>
                    </td>

                    {/* 4. Site Location */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">
                        {item.district}
                      </div>
                      <span
                        className="text-[11px] text-slate-400 block truncate max-w-[150px]"
                        title={item.area || item.locationDetail}
                      >
                        {item.area || item.locationDetail}
                      </span>
                    </td>

                    {/* 5. IP Address */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="tabular-nums font-semibold text-slate-800">
                        {item.ipAddress || "—"}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums block">
                        CPE: {item.ipCpe || "—"}
                      </span>
                    </td>

                    {/* 6. Installation Date */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {item.date}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.durationFormatted || "—"}
                      </div>
                    </td>

                    {/* 7. Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Selesai
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" />
                          Dalam Pengerjaan
                        </span>
                      )}
                    </td>

                    {/* 8. Actions (Detail & Delete) */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Link
                        href={`/operations/installation/${encodeURIComponent(item.activityId)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-slate-600"
                        title={`Buka rincian formulir ${item.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detail</span>
                      </Link>

                      {currentUser.role === "superadmin" && (
                        <button
                          type="button"
                          onClick={() => requestDelete(item)}
                          className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition text-rose-600"
                          title={`Hapus formulir ${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Show Rows Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Menampilkan{" "}
              <strong className="text-slate-800">{paginatedInstallations.length}</strong>{" "}
              dari{" "}
              <strong className="text-slate-800">{filteredInstallations.length}</strong>{" "}
              data
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Pertama"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
              title="Halaman Terakhir"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal (5-second countdown & safety verification) */}
      {mounted && deleteTarget && createPortal(
        <div
          onClick={cancelDelete}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-installation-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 id="confirm-installation-delete-title" className="text-base font-bold text-slate-800">
              Hapus Laporan Installation?
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Anda akan menghapus laporan <strong className="text-slate-800">{deleteTarget.id}</strong> untuk unit <strong className="text-slate-800">{deleteTarget.unitNo}</strong>. Status perangkat <strong className="text-slate-800">{deleteTarget.deviceId}</strong> akan dipulihkan ke status In Stock (RFU) jika belum digunakan pada laporan lanjutan.
            </p>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Pemeriksaan Keamanan Konsistensi:</span>
              </div>
              <p>
                Jika perangkat sudah digunakan pada transaksi lanjutan atau kondisi master telah berubah, sistem akan membatalkan operasi tanpa mengubah data apa pun.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteCountdown > 0 || isDeleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {isDeleting
                    ? "Menghapus..."
                    : deleteCountdown > 0
                    ? `Konfirmasi Hapus (${deleteCountdown}s)`
                    : "Konfirmasi Hapus Sekarang"}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
