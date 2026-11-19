"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Clock,
  Search,
  Truck,
  MapPin,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Filter,
  X,
  RotateCcw,
  ChevronLeft,
} from "lucide-react";
import { DeviceStatus } from "@/types/dashboard";
import { getTimelineDirectory, TimelineDevice } from "@/lib/timeline-api";
import { useAuth } from "@/features/auth/AuthContext";

function renderStatusBadge(status: DeviceStatus) {
  switch (status) {
    case "in_use":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          In Use
        </span>
      );
    case "in_stock_rfu":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <HardDrive className="h-3 w-3" />
          RFU
        </span>
      );
    case "in_stock_damaged":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="h-3 w-3" />
          Repair
        </span>
      );
    case "in_stock_ho":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <RefreshCw className="h-3 w-3" />
          HO Repair
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <Clock className="h-3 w-3" />
          In Stock
        </span>
      );
  }
}

export default function TimelineDirectoryPage() {
  const { currentUser } = useAuth();
  const [allDevices, setAllDevices] = useState<TimelineDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const DISTRICTS = Array.from(new Set(allDevices.map((device) => device.district))).sort();
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(null); setAllDevices([]);
    getTimelineDirectory(archived).then((devices) => { if (active) setAllDevices(devices); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Gagal memuat perangkat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [archived]);
  useEffect(() => { setPage(1); }, [search, districtFilter, statusFilter, archived, pageSize]);

  const filteredDevices = useMemo(() => {
    return allDevices.filter((d) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchId = d.deviceId.toLowerCase().includes(q);
        const matchSn = d.serialNumber.toLowerCase().includes(q);
        const matchUnit = (d.unitNo || "").toLowerCase().includes(q);
        if (!matchId && !matchSn && !matchUnit) return false;
      }
      if (districtFilter !== "all" && d.district !== districtFilter) {
        return false;
      }
      if (statusFilter !== "all" && d.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [allDevices, search, districtFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedDevices = filteredDevices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {(loading || loadError) && <div role={loadError ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${loadError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{loadError ?? "Memuat directory perangkat..."}</div>}
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Device Timeline Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pilih perangkat untuk melihat rekam jejak kronologis siklus hidup,
            hasil inspeksi Health Check, dan riwayat aktivitas per unit.
          </p>
        </div>

        <Link
          href="/reports/activity-log"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
        >
          <span>Buka Activity Log (Semua Perangkat)</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari Device ID (contoh: D001, D011), No. Unit, Serial..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>Filter:</span>
            </div>

            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">Semua Distrik</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">Semua Status</option>
              <option value="in_use">In Use</option>
              <option value="in_stock_rfu">In Stock - RFU</option>
              <option value="in_stock_damaged">In Stock - Repair</option>
              <option value="in_stock_ho">HO Repair</option>
            </select>
            {currentUser.role === "superadmin" && <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Arsip</label>}
            <button type="button" title="Clear Filter" aria-label="Clear Filter" onClick={() => { setSearch(""); setDistrictFilter("all"); setStatusFilter("all"); setArchived(false); }} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Device Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedDevices.map((d) => (
          <Link
            key={d.deviceId}
            href={`/reports/timeline/${encodeURIComponent(d.deviceId)}`}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-violet-300 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <span className="font-bold text-sm text-violet-600 group-hover:text-violet-700">
                  {d.deviceId}
                </span>
                {renderStatusBadge(d.status)}
              </div>

              <div className="pt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Unit Lambung:</span>
                  <span className="font-bold text-slate-800">
                    {d.unitNo || "Tidak terpasang"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tipe Armada:</span>
                  <span className="text-slate-700">
                    {d.equipmentType || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Distrik:</span>
                  <span className="text-slate-700 flex items-center gap-1 font-medium">
                    <MapPin className="h-3 w-3 text-blue-500" />
                    {d.district || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Nomor Seri:</span>
                  <span className="text-slate-500 text-[11px]">
                    {d.serialNumber}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-violet-600 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Buka Timeline</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
      {!loading && !loadError && filteredDevices.length === 0 && <p role="status" className="py-8 text-center text-sm text-slate-500">Tidak ada perangkat yang sesuai filter.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <label className="flex items-center gap-2">Jumlah per halaman<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border border-slate-200 bg-white px-2 py-1"><option>12</option><option>24</option><option>48</option><option>100</option></select><span>{filteredDevices.length} perangkat</span></label>
        <div className="flex items-center gap-2"><button type="button" title="Halaman sebelumnya" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((previous) => Math.max(1, previous - 1))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>{currentPage} / {totalPages}</span><button type="button" title="Halaman berikutnya" aria-label="Halaman berikutnya" disabled={currentPage === totalPages} onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))} className="rounded border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
    </div>
  );
}
