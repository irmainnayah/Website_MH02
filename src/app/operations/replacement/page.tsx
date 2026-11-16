// src/app/operations/replacement/page.tsx
"use client";

import React, { useState, useMemo, useSyncExternalStore, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Wrench,
  Search,
  Filter,
  Plus,
  Download,
  Eye,
  RotateCcw,
  CheckCircle2,
  Calendar,
  AlertCircle,
  X,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import {
  executeDeviceReplacementDelete,
  getReplacementById,
  getReplacementRecords,
  subscribeToReplacementRecords,
} from "@/lib/mock-data/replacement";
import { getEgiByUnit, matchesUnitNumberSearch } from "@/lib/mock-data/fleet";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import { ReplacementRecord } from "@/types/replacement";
import { DistrictName } from "@/types/dashboard";
import { InstallationShift } from "@/types/installation";

const DISTRICTS: DistrictName[] = ["Sangatta", "Bengalon", "Wahau", "Sangatta Utara"];

export default function ReplacementPage() {
  const { currentUser } = useAuth();

  const replacements = useSyncExternalStore(
    subscribeToReplacementRecords,
    getReplacementRecords,
    getReplacementRecords
  );
  const [mounted, setMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReplacementRecord | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  useEffect(() => setMounted(true), []);

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

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeletingRef.current) {
        setDeleteTarget(null);
        setDeleteCountdown(0);
      }
    };
    const main = document.querySelector("main");
    const previousMainOverflowY = main?.style.overflowY;
    const previousBodyOverflow = document.body.style.overflow;
    if (main) main.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      if (main) main.style.overflowY = previousMainOverflowY ?? "";
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTarget]);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateError, setDateError] = useState<string | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Alert banner
  const [alertMessage, setAlertMessage] = useState<
    { type: "success" | "error" | "info"; text: string } | null
  >(null);

  const showAlert = (text: string, type: "success" | "error" | "info" = "success") => {
    setAlertMessage({ type, text });
    setTimeout(() => setAlertMessage(null), 6000);
  };

  const requestDelete = (record: ReplacementRecord) => {
    if (currentUser.role !== "superadmin" || isDeletingRef.current) return;
    const latestRecord = getReplacementById(record.id);
    if (!latestRecord) {
      showAlert("Laporan Replacement tidak lagi tersedia.", "error");
      return;
    }
    isDeletingRef.current = false;
    setIsDeleting(false);
    setDeleteCountdown(5);
    setDeleteTarget(latestRecord);
  };

  const cancelDelete = () => {
    if (isDeletingRef.current) return;
    setDeleteTarget(null);
    setDeleteCountdown(0);
  };

  const confirmDelete = () => {
    if (currentUser.role !== "superadmin" || !deleteTarget || deleteCountdown > 0 || isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    const result = executeDeviceReplacementDelete(deleteTarget.id, currentUser.role);
    if (!result.success) {
      showAlert(result.message, "error");
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      setIsDeleting(false);
      return;
    }

    recordAuditAction({ table: "replacement", operation: "DELETE", recordId: deleteTarget.id });
    showAlert(result.message, "success");
    setDeleteTarget(null);
    setDeleteCountdown(0);
    isDeletingRef.current = false;
    setIsDeleting(false);
  };

  // Date handling
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

  // Filtered data
  const filteredReplacements = useMemo(() => {
    return replacements.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = item.id.toLowerCase().includes(q);
        const matchOld = item.oldDeviceId.toLowerCase().includes(q) || item.oldDeviceSerialNumber.toLowerCase().includes(q);
        const matchNew = item.newDeviceId.toLowerCase().includes(q) || item.newDeviceSerialNumber?.toLowerCase().includes(q);
        const matchUnit = matchesUnitNumberSearch(item.unitNo, q) || matchesUnitNumberSearch(item.oldUnitNo, q);
        const matchEgi = matchesUnitNumberSearch(item.egi || item.oldEgi || getEgiByUnit(item.unitNo), q);
        const matchTech = item.technicianName.toLowerCase().includes(q);
        const matchGl = item.groupLeaderName.toLowerCase().includes(q);
        if (! (matchId || matchOld || matchNew || matchUnit || matchEgi || matchTech || matchGl) ) return false;
      }
      if (districtFilter !== "all" && item.district !== districtFilter) return false;
      if (shiftFilter !== "all" && item.shift !== shiftFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      return true;
    });
  }, [replacements, searchQuery, districtFilter, shiftFilter, statusFilter, startDate, endDate]);

  const totalItems = filteredReplacements.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredReplacements.slice(start, start + pageSize);
  }, [filteredReplacements, safeCurrentPage, pageSize]);

  const isFiltered =
    searchQuery.trim() !== "" ||
    districtFilter !== "all" ||
    shiftFilter !== "all" ||
    statusFilter !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const handleResetFilters = () => {
    setSearchQuery("");
    setDistrictFilter("all");
    setShiftFilter("all");
    setStatusFilter("all");
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (dateError) {
      showAlert("Perbaiki rentang tanggal terlebih dahulu.", "error");
      return;
    }
    if (filteredReplacements.length === 0) {
      showAlert("Tidak ada data untuk diekspor.", "error");
      return;
    }
    const headers = [
      "Form Number",
      "Old Device ID",
      "Old Serial",
      "New Device ID",
      "Unit Number",
      "District",
      "Shift",
      "Date",
      "Status",
    ];
    const rows = filteredReplacements.map((r) => [
      r.id,
      r.oldDeviceId,
      r.oldDeviceSerialNumber,
      r.newDeviceId,
      r.unitNo,
      r.district,
      r.shift,
      r.date,
      r.status,
    ]);
    const csv = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    const suffix = startDate && endDate ? `_${startDate}_sd_${endDate}` : startDate ? `_sejak_${startDate}` : endDate ? `_hingga_${endDate}` : `_${today}`;
    a.href = url;
    a.download = `smartd_replacement_records${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAlert(`Berhasil mengekspor ${filteredReplacements.length} data ke CSV.`, "success");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Alert */}
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
          <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Replacement
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Catatan riwayat penggantian perangkat SMARTD DISPLAY pada armada.
          </p>
        </div>
        <div className="self-start md:self-auto shrink-0">
          <Link
            href="/operations/replacement/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Replacement</span>
          </Link>
        </div>
      </div>

      {/* Filter & Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Cari Form No, Device, Unit Number, Teknisi, GL..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Faceted Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span>Filter:</span>
              </div>
              {/* District */}
              <select
                value={districtFilter}
                onChange={(e) => { setDistrictFilter(e.target.value); setCurrentPage(1); }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Distrik</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              {/* Shift */}
              <select
                value={shiftFilter}
                onChange={(e) => { setShiftFilter(e.target.value); setCurrentPage(1); }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Shift</option>
                <option value="Shift 1">Shift 1</option>
                <option value="Shift 2">Shift 2</option>
                <option value="Shift 3">Shift 3</option>
              </select>
              {/* Status */}
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Status</option>
                <option value="completed">Selesai</option>
                <option value="in_progress">Dalam Pengerjaan</option>
              </select>
            </div>
          </div>

          {/* Date Range Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calendar className="h-3.5 w-3.5" /> Rentang Tanggal:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">
                Dari:
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">
                Sampai:
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setDateError(null); setCurrentPage(1); }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60"
                >
                  Clear Tanggal
                </button>
              )}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw className="h-3 w-3" /> Reset Filter
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={Boolean(dateError) || filteredReplacements.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 transition"
              >
                <Download className="h-3.5 w-3.5" /> Ekspor CSV
              </button>
            </div>
          </div>
          {dateError && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span>{dateError}</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide">
                <th className="py-3 px-4">Form Number</th>
                <th className="py-3 px-4">Device ID</th>
                <th className="py-3 px-4">Unit Number</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">EGI</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Wrench className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Tidak ada riwayat penggantian</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Gunakan filter lain atau tambahkan data baru.</p>
                    {isFiltered && (
                      <button onClick={handleResetFilters} className="mt-3 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition">
                        Reset Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/75 transition-colors group">
                    {/* Form Number */}
                    <td className="py-3 px-4 tabular-nums font-bold text-blue-600 whitespace-nowrap">{item.id}</td>
                    {/* Device ID — new/replacement device */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{item.newDeviceId}</span>
                    </td>
                    {/* Unit Number */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{item.unitNo || "—"}</span>
                    </td>
                    {/* Type — equipment type of the target unit */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {item.equipmentType || "—"}
                    </td>
                    {/* EGI — model code of the unit (e.g. HD785-7) */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700 text-[11px]">
                      {item.egi || item.oldEgi || getEgiByUnit(item.unitNo) || "—"}
                    </td>
                    {/* Date */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{item.date}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.durationFormatted || "—"}
                      </div>
                    </td>
                    {/* Technician */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{item.technicianName}</div>
                      {item.technicianNrp && (
                        <div className="text-[11px] tabular-nums text-slate-400 mt-0.5">{item.technicianNrp}</div>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Link
                        href={`/operations/replacement/${item.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-slate-600"
                        title={`Buka rincian lengkap formulir penggantian ${item.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detail</span>
                      </Link>
                      {currentUser.role === "superadmin" && (
                        <button
                          type="button"
                          onClick={() => requestDelete(item)}
                          className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition text-rose-600"
                          title={`Hapus laporan ${item.id}`}
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
              <strong className="text-slate-800">{paginated.length}</strong>{" "}
              dari{" "}
              <strong className="text-slate-800">{totalItems}</strong>{" "}
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

      {mounted && deleteTarget && createPortal(
        <div
          onClick={cancelDelete}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-replacement-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 id="confirm-replacement-delete-title" className="text-base font-bold text-slate-800">
              Hapus Laporan Replacement?
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Anda akan menghapus laporan <strong className="text-slate-800">{deleteTarget.id}</strong>.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-700">
              <p><span className="font-semibold">Perangkat lama:</span> <span>{deleteTarget.oldDeviceId}</span> · {deleteTarget.oldUnitNo || "Unit tidak tercatat"}</p>
              <p className="mt-1"><span className="font-semibold">Perangkat baru:</span> <span>{deleteTarget.newDeviceId}</span> · {deleteTarget.unitNo}</p>
            </div>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Pemeriksaan Keamanan Konsistensi:</span>
              </div>
              <p>
                Jika snapshot dan kondisi master masih cocok, penghapusan akan memulihkan status kedua perangkat ke kondisi sebelum Replacement. Jika perangkat sudah digunakan pada transaksi lanjutan atau kondisi master telah berubah, sistem akan membatalkan operasi tanpa mengubah data apa pun.
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
                disabled={deleteCountdown > 0 || isDeleting || currentUser.role !== "superadmin"}
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
