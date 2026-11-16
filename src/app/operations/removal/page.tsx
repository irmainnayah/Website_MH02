// src/app/operations/removal/page.tsx
"use client";

import React, { useState, useMemo, useSyncExternalStore, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Trash2,
  Search,
  Filter,
  RotateCcw,
  Download,
  Eye,
  X,
  Plus,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import {
  getRemovalRecords,
  subscribeToRemovalRecords,
  executeDeviceRemovalDelete,
} from "@/lib/mock-data/removal";
import { matchesUnitNumberSearch } from "@/lib/mock-data/fleet";
import { RemovalRecord } from "@/types/removal";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import { formatDuration } from "@/lib/utils";

const DISTRICT_OPTIONS = ["Sangatta", "Bengalon", "Wahau", "Sangatta Utara"];
const REASON_OPTIONS = ["Kerusakan", "Upgrade", "Dismantle"];

export default function RemovalPage() {
  const { currentUser } = useAuth();
  const records = useSyncExternalStore(
    subscribeToRemovalRecords,
    getRemovalRecords,
    getRemovalRecords
  );

  const [mounted, setMounted] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Delete State & RBAC 5-Second Countdown
  const [deleteTarget, setDeleteTarget] = useState<RemovalRecord | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const dateError = Boolean(startDate && endDate && startDate > endDate);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !(
            rec.id.toLowerCase().includes(q) ||
            rec.deviceId.toLowerCase().includes(q) ||
            matchesUnitNumberSearch(rec.unitNo, q) ||
            rec.reason.toLowerCase().includes(q) ||
            (rec.technicianName && rec.technicianName.toLowerCase().includes(q)) ||
            (rec.district && rec.district.toLowerCase().includes(q))
          )
        )
          return false;
      }
      if (districtFilter !== "all" && rec.district !== districtFilter) return false;
      if (reasonFilter !== "all" && rec.reason !== reasonFilter) return false;
      if (startDate && rec.removalDate < startDate) return false;
      if (endDate && rec.removalDate > endDate) return false;
      return true;
    });
  }, [records, searchQuery, districtFilter, reasonFilter, startDate, endDate]);

  const totalItems = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safeCurrentPage, pageSize]);

  const isFiltered = Boolean(
    searchQuery.trim() ||
      districtFilter !== "all" ||
      reasonFilter !== "all" ||
      startDate ||
      endDate
  );

  const handleResetFilters = () => {
    setSearchQuery("");
    setDistrictFilter("all");
    setReasonFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (dateError) {
      setAlertMessage({ type: "error", text: "Perbaiki rentang tanggal terlebih dahulu." });
      return;
    }
    if (filteredRecords.length === 0) {
      setAlertMessage({ type: "error", text: "Tidak ada data untuk diekspor." });
      return;
    }
    const headers = [
      "Form Number",
      "Device ID",
      "Unit Number",
      "Reason",
      "Kondisi Akhir",
      "Removal Date",
      "Technician",
      "District",
      "Shift",
      "Start Time",
      "End Time",
      "Duration (menit)",
      "GL",
    ];
    const escapeCsvValue = (value: string | number | undefined | null) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = filteredRecords.map((r) => [
      r.id,
      r.deviceId,
      r.unitNo,
      r.reason,
      r.deviceFinalConditionLabel || r.deviceFinalCondition || "-",
      r.removalDate,
      r.technicianName || "-",
      r.district || "-",
      r.shift || "-",
      r.startTime || "-",
      r.endTime || "-",
      r.durationMinutes?.toString() || "-",
      r.groupLeaderName || "-",
    ]);

    const csv =
      "\uFEFF" +
      [
        headers.map(escapeCsvValue).join(","),
        ...rows.map((row) => row.map(escapeCsvValue).join(",")),
      ].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `removal_records_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const requestDelete = (record: RemovalRecord) => {
    setDeleteTarget(record);
    setDeleteCountdown(5);
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteCountdown(0);
  };

  const confirmDelete = () => {
    if (!deleteTarget || deleteCountdown > 0 || isDeleting) return;
    setIsDeleting(true);
    isDeletingRef.current = true;

    const result = executeDeviceRemovalDelete(deleteTarget.id, currentUser.role);

    if (result.success) {
      recordAuditAction({
        table: "removal",
        operation: "DELETE",
        recordId: deleteTarget.id,
      });
      setAlertMessage({ type: "success", text: result.message });
      setDeleteTarget(null);
      setDeleteCountdown(0);
    } else {
      setAlertMessage({ type: "error", text: result.message });
      setDeleteTarget(null);
      setDeleteCountdown(0);
    }

    setIsDeleting(false);
    isDeletingRef.current = false;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Pencabutan Perangkat (Removal)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Riwayat pelepasan unit telematika SMARTD DISPLAY dari armada operasional tambang.
          </p>
        </div>

        <div className="self-start sm:self-auto shrink-0">
          <Link
            href="/operations/removal/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Removal</span>
          </Link>
        </div>
      </div>

      {/* Alert Banner */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium shadow-sm animate-fadeIn ${
            alertMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{alertMessage.text}</span>
          <button
            type="button"
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* TOOLBAR POLA AUDIT LOGS (Baris 1 & Baris 2) */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/50 p-4">
          {/* Baris Pertama: Search & Filter Distrik, Alasan */}
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari Form No, Device ID, Unit No, Teknisi..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
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
                onChange={(event) => {
                  setDistrictFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Distrik</option>
                {DISTRICT_OPTIONS.map((dist) => (
                  <option key={dist} value={dist}>
                    {dist}
                  </option>
                ))}
              </select>

              <select
                value={reasonFilter}
                onChange={(event) => {
                  setReasonFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Alasan</option>
                {REASON_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Baris Kedua: Rentang Tanggal & Tombol Export CSV */}
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
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">
                Sampai:
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </label>

              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setCurrentPage(1);
                  }}
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
                disabled={dateError || filteredRecords.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-50 transition"
              >
                <Download className="h-3.5 w-3.5" /> Ekspor CSV
              </button>
            </div>
          </div>
        </div>

        {/* Tabel Records */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide">
                <th className="py-3 px-4">Form Number</th>
                <th className="py-3 px-4">Device ID</th>
                <th className="py-3 px-4">Unit Number</th>
                <th className="py-3 px-4">Alasan Pelepasan</th>
                <th className="py-3 px-4">Removal Date</th>

                <th className="py-3 px-4">Teknisi</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Trash2 className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Tidak ada data pencabutan</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Gunakan filter atau buat laporan baru.
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
                paginated.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4 tabular-nums font-bold text-rose-600 whitespace-nowrap">
                      {rec.id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{rec.deviceId}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{rec.unitNo}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {rec.reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">{rec.removalDate}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDuration(rec.durationMinutes)}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {rec.technicianName}
                    </td>
                    {/* ACTIONS KOLOM (DETAIL LANGSUNG BUKA ROUTE /operations/removal/[id], RATA TENGAH KONSISTEN DENGAN REPLACEMENT) */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Link
                        href={`/operations/removal/${encodeURIComponent(rec.id)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-slate-600"
                        title={`Buka rincian lengkap laporan ${rec.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Detail</span>
                      </Link>

                      {currentUser.role === "superadmin" && (
                        <button
                          type="button"
                          onClick={() => requestDelete(rec)}
                          className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition text-rose-600"
                          title={`Hapus laporan ${rec.id}`}
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

      {/* MODAL KONFIRMASI DELETE (RBAC 5-DETIK COUNTDOWN KONSISTEN DENGAN REPLACEMENT) */}
      {mounted && deleteTarget && createPortal(
        <div
          onClick={cancelDelete}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-removal-delete-title"
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 id="confirm-removal-delete-title" className="text-base font-bold text-slate-800">
              Hapus Laporan Removal?
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Anda akan menghapus laporan <strong className="text-slate-800">{deleteTarget.id}</strong> untuk unit <strong className="text-slate-800">{deleteTarget.unitNo}</strong>. Kondisi perangkat <strong className="text-slate-800">{deleteTarget.deviceId}</strong> akan dipulihkan ke status sebelum pelepasan hanya jika snapshot kondisi master tersedia.
            </p>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Pemeriksaan Keamanan Konsistensi:</span>
              </div>
              <p>
                Jika perangkat sudah digunakan pada transaksi lanjutan atau snapshot master tidak tersedia, sistem akan membatalkan operasi tanpa mengubah data apa pun.
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
