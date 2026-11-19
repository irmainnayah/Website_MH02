// src/components/dashboard/DeviceList/FilterBar.tsx
"use client";

import React from "react";
import { Search, X, Download, Filter, Calendar, RotateCcw, AlertCircle } from "lucide-react";

interface FilterBarProps {
  districtOptions: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  districtFilter: string;
  onDistrictChange: (district: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearDate: () => void;
  dateError: string | null;
  onResetFilters: () => void;
  onExportCsv: () => void;
  totalFiltered: number;
  isFiltered: boolean;
}

export default function FilterBar({
  districtOptions,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  districtFilter,
  onDistrictChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearDate,
  dateError,
  onResetFilters,
  onExportCsv,
  totalFiltered,
  isFiltered,
}: FilterBarProps) {
  return (
    <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3 -mx-5 -mt-4 mb-4">
      {/* First Row: Search on left, Filters on right */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari Device ID, Serial No, atau Unit No..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Existing Filters: Status and District */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>Filter:</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="all">Semua Status</option>
            <option value="in_use">Active / In Use</option>
            <option value="in_stock_rfu">In Stock – RFU</option>
            <option value="in_stock_damaged">In Stock – Repair</option>
            <option value="in_stock_ho">HO Repair</option>
          </select>

          {/* District Filter */}
          <select
            value={districtFilter}
            onChange={(e) => onDistrictChange(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="all">Semua Distrik</option>
            {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
          </select>
        </div>
      </div>

      {/* Second Row: Date range controls and Export CSV button on far right */}
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
              onChange={(e) => onStartDateChange(e.target.value)}
              className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
              title="Tanggal Mulai Aktivitas Terakhir"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <span className="text-[11px] text-slate-400">Sampai:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
              title="Tanggal Selesai Aktivitas Terakhir"
            />
          </div>

          {/* Quick Date Clear */}
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={onClearDate}
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
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition font-medium"
              title="Reset seluruh filter kembali ke default"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Filter</span>
            </button>
          )}

          {/* Export CSV Button at far right */}
          <button
            type="button"
            onClick={onExportCsv}
            disabled={Boolean(dateError) || totalFiltered === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Ekspor data inventaris ke CSV berdasarkan filter aktif"
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
  );
}
