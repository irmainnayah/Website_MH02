"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import {
  deleteTroubleshootRecord,
  getTroubleshootRecords,
  subscribeToTroubleshootRecords,
} from "@/lib/mock-data/troubleshoots";
import { matchesUnitNumberSearch } from "@/lib/mock-data/fleet";
import { TroubleshootEquipmentType } from "@/types/troubleshoot";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";

const EQUIPMENT_TYPES: TroubleshootEquipmentType[] = [
  "MH02 Device",
  "GPS/Antenna",
  "Camera",
  "Wiring",
  "Speaker",
  "SPM",
  "CPE",
  "Firmware",
];

export default function TroubleshootsPage() {
  const { currentUser } = useAuth();
  const records = useSyncExternalStore(
    subscribeToTroubleshootRecords,
    getTroubleshootRecords,
    getTroubleshootRecords
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof records)[number] | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [mounted, setMounted] = useState(false);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

    const main = document.querySelector("main");
    const previousMainOverflowY = main?.style.overflowY;
    const previousBodyOverflow = document.body.style.overflow;
    if (main) main.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      if (main) main.style.overflowY = previousMainOverflowY ?? "";
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [deleteTarget]);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteTarget(null);
        setDeleteCountdown(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget]);

  const requestDelete = (record: (typeof records)[number]) => {
    if (currentUser.role !== "superadmin") return;
    isDeletingRef.current = false;
    setDeleteCountdown(5);
    setDeleteTarget(record);
  };

  const cancelDelete = () => {
    if (isDeletingRef.current) return;
    setDeleteTarget(null);
    setDeleteCountdown(0);
  };

  const confirmDelete = () => {
    if (
      currentUser.role !== "superadmin" ||
      deleteCountdown > 0 ||
      !deleteTarget ||
      isDeletingRef.current
    ) return;

    isDeletingRef.current = true;
    const deleted = deleteTroubleshootRecord(deleteTarget.id);
    if (!deleted) {
      setAlert({ type: "error", text: `Laporan ${deleteTarget.id} tidak ditemukan. Tidak ada perubahan yang dilakukan.` });
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      return;
    }

    recordAuditAction({ table: "troubleshoot", operation: "DELETE", recordId: deleteTarget.id });
    setAlert({ type: "success", text: `Laporan ${deleteTarget.id} berhasil dihapus permanen dari mock data sesi ini.` });
    setDeleteTarget(null);
    setDeleteCountdown(0);
    isDeletingRef.current = false;
  };

  const districts = useMemo(
    () => Array.from(new Set(records.map((record) => record.district))).sort(),
    [records]
  );
  const dateError = startDate && endDate && startDate > endDate
    ? "Tanggal mulai tidak boleh melewati tanggal selesai."
    : null;

  const filteredRecords = useMemo(() => records.filter((record) => {
    const query = searchQuery.trim().toLowerCase();
    if (query && ![
      record.id,
      record.deviceId,
      record.district,
      record.equipmentType,
      record.issue,
      record.actionTaken,
      record.technicianName,
      record.technicianNrp ?? "",
      record.remarks ?? "",
    ].some((value) => value.toLowerCase().includes(query)) && !matchesUnitNumberSearch(record.unitNo, query)) return false;
    if (districtFilter !== "all" && record.district !== districtFilter) return false;
    if (equipmentFilter !== "all" && record.equipmentType !== equipmentFilter) return false;
    if (startDate && record.activityDate < startDate) return false;
    if (endDate && record.activityDate > endDate) return false;
    return true;
  }), [records, searchQuery, districtFilter, equipmentFilter, startDate, endDate]);

  const totalItems = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safeCurrentPage, pageSize]);
  const isFiltered = Boolean(searchQuery.trim() || districtFilter !== "all" || equipmentFilter !== "all" || startDate || endDate);

  const resetFilters = () => {
    setSearchQuery("");
    setDistrictFilter("all");
    setEquipmentFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const exportCsv = () => {
    if (dateError) {
      setAlert({ type: "error", text: dateError });
      return;
    }
    if (!filteredRecords.length) {
      setAlert({ type: "error", text: "Tidak ada data yang sesuai filter untuk diekspor." });
      return;
    }
    const headers = [
      "Nomor Laporan", "Device ID", "Unit Number", "Distrik", "Tanggal",
      "Waktu Mulai", "Waktu Selesai", "Durasi (Menit)", "Equipment Type",
      "Issue", "Action Taken", "Teknisi", "NRP", "Caption Foto Sebelum",
      "Caption Foto Sesudah", "Remarks",
    ];
    const escapeCsv = (value: string | number | undefined) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredRecords.map((record) => [
      record.id,
      record.deviceId,
      record.unitNo,
      record.district,
      record.activityDate,
      record.startTime,
      record.endTime,
      record.durationMinutes,
      record.equipmentType,
      record.issue,
      record.actionTaken,
      record.technicianName,
      record.technicianNrp,
      record.photoCaptions?.beforeRepair,
      record.photoCaptions?.afterRepair,
      record.remarks,
    ]);
    const csv = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartd_troubleshoot_records_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAlert({ type: "success", text: `${filteredRecords.length} record diekspor ke CSV.` });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {alert && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium shadow-sm animate-fadeIn ${alert.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
          <span className="flex items-center gap-2">{alert.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{alert.text}</span>
          <button type="button" onClick={() => setAlert(null)} aria-label="Tutup notifikasi"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* 1. Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Troubleshoots Records
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Laporan gangguan dan tindakan perbaikan perangkat SMARTD DISPLAY.
          </p>
        </div>
        <div className="self-start sm:self-auto shrink-0">
          <Link
            href="/support/troubleshoots/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Troubleshoot</span>
          </Link>
        </div>
      </div>

      {/* 2. Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar: Baris 1 & Baris 2 */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/50 p-4">
          {/* Baris 1: Search & Filter */}
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }}
                placeholder="Cari laporan, perangkat, unit, issue, teknisi..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Filter className="h-3.5 w-3.5" /> Filter:
              </span>
              <select
                value={districtFilter}
                onChange={(event) => { setDistrictFilter(event.target.value); setCurrentPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Distrik</option>
                {districts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
              <select
                value={equipmentFilter}
                onChange={(event) => { setEquipmentFilter(event.target.value); setCurrentPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Equipment Type</option>
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Baris 2: Rentang Tanggal & Tombol Export CSV */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calendar className="h-3.5 w-3.5" /> Rentang Tanggal:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">
                Dari:
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => { setStartDate(event.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">
                Sampai:
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => { setEndDate(event.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setCurrentPage(1); }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60"
                >
                  Clear Tanggal
                </button>
              )}
              {isFiltered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw className="h-3 w-3" /> Reset Filter
                </button>
              )}
              <button
                type="button"
                onClick={exportCsv}
                disabled={Boolean(dateError) || filteredRecords.length === 0}
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

        {/* Tabel Records */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 font-semibold tracking-wide text-slate-700">
                <th className="py-3 px-4">Form Number</th>
                <th className="py-3 px-4">Device ID</th>
                <th className="py-3 px-4">Unit Number</th>
                <th className="py-3 px-4">Distrik</th>
                <th className="py-3 px-4">Equipment Type</th>
                <th className="py-3 px-4">Issue</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{records.length ? "Tidak ada laporan yang sesuai" : "Belum ada laporan Troubleshoot"}</p>
                    <p className="mt-1 text-xs text-slate-400">{records.length ? "Ubah pencarian atau filter, atau buat laporan baru." : "Buat laporan Troubleshoot untuk mulai mengisi Records."}</p>
                    {isFiltered && (
                      <button type="button" onClick={resetFilters} className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700">
                        Reset Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.id} className="group transition-colors hover:bg-slate-50/75">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-bold text-orange-600">{record.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{record.deviceId}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.unitNo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{record.district}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{record.equipmentType}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-700"><span className="line-clamp-2">{record.issue}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{record.activityDate}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <Link
                        href={`/support/troubleshoots/${encodeURIComponent(record.id)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-slate-600"
                        title={`Buka rincian lengkap laporan ${record.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detail</span>
                      </Link>
                      {currentUser.role === "superadmin" && (
                        <button
                          type="button"
                          onClick={() => requestDelete(record)}
                          className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition text-rose-600"
                          title={`Hapus laporan ${record.id}`}
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
              onChange={(event) => {
                setPageSize(Number(event.target.value));
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
              <strong className="text-slate-800">{paginatedRecords.length}</strong>{" "}
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
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
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
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-troubleshoot-title"
          onClick={cancelDelete}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 id="delete-troubleshoot-title" className="text-base font-bold text-slate-800">
              Hapus Laporan Troubleshoot?
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
              Anda akan menghapus laporan <strong className="text-slate-800">{deleteTarget.id}</strong> untuk unit <strong className="text-slate-800">{deleteTarget.unitNo}</strong> (Device: <span>{deleteTarget.deviceId}</span>).
            </p>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Pemeriksaan Keamanan Konsistensi:</span>
              </div>
              <p>
                Aktivitas Troubleshoot terkait tidak lagi ditampilkan pada Activity Log dan Device Timeline. Aksi ini permanen untuk mock data sesi ini.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isDeletingRef.current}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteCountdown > 0 || currentUser.role !== "superadmin"}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 transition flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {deleteCountdown > 0
                    ? `Konfirmasi Hapus (${deleteCountdown}s)`
                    : "Konfirmasi Hapus Sekarang"}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Clock className="h-3.5 w-3.5" /> Data mock hanya tersedia selama sesi aplikasi dan tidak bertahan setelah refresh.
      </p>
    </div>
  );
}
