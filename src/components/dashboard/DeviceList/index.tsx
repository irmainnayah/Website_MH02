// src/components/dashboard/DeviceList/index.tsx
"use client";

import React, { useState, useMemo, useCallback } from "react";
import { devices as initialDevices, getLastActivityDateByDevice } from "@/lib/mock-data";
import { DeviceRecord } from "@/types/dashboard";
import FilterBar from "./FilterBar";
import DeviceTable from "./DeviceTable";
import Pagination from "./Pagination";
import DeviceDetailModal from "./DeviceDetailModal";
import { HardDrive } from "lucide-react";

export default function DeviceList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (endDate && val && val > endDate) {
      setDateError("Tanggal mulai tidak boleh lebih besar dari tanggal selesai.");
    } else {
      setDateError(null);
    }
    setCurrentPage(1);
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (startDate && val && val < startDate) {
      setDateError("Tanggal selesai tidak boleh lebih kecil dari tanggal mulai.");
    } else {
      setDateError(null);
    }
    setCurrentPage(1);
  };

  const handleClearDate = () => {
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setCurrentPage(1);
  };

  // Memoized map of last activity dates for all devices
  const deviceLastActivityMap = useMemo(() => {
    const map = new Map<string, string | null>();
    initialDevices.forEach((d) => {
      map.set(d.deviceId, getLastActivityDateByDevice(d.deviceId));
    });
    return map;
  }, []);

  const getLastActivity = useCallback(
    (deviceId: string) => deviceLastActivityMap.get(deviceId) ?? null,
    [deviceLastActivityMap]
  );

  // Filter devices
  const filteredDevices = useMemo(() => {
    return initialDevices.filter((device) => {
      // Search matches deviceId, serialNumber, or unitNo
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchId = device.deviceId.toLowerCase().includes(query);
        const matchSn = device.serialNumber.toLowerCase().includes(query);
        const matchUnit = device.unitNo ? device.unitNo.toLowerCase().includes(query) : false;
        if (!matchId && !matchSn && !matchUnit) return false;
      }

      // Status filter
      if (statusFilter !== "all" && device.status !== statusFilter) {
        return false;
      }

      // District filter
      if (districtFilter !== "all" && device.district !== districtFilter) {
        return false;
      }

      // Date Range filter (matches Tanggal Aktivitas Terakhir)
      if (startDate || endDate) {
        const lastActDate = deviceLastActivityMap.get(device.deviceId);
        if (!lastActDate) {
          return false;
        }
        if (startDate && lastActDate < startDate) {
          return false;
        }
        if (endDate && lastActDate > endDate) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, statusFilter, districtFilter, startDate, endDate, deviceLastActivityMap]);

  // Pagination calculation
  const totalItems = filteredDevices.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedDevices = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, safeCurrentPage, pageSize]);

  const isFiltered = Boolean(
    searchQuery ||
    statusFilter !== "all" ||
    districtFilter !== "all" ||
    startDate ||
    endDate
  );

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDistrictFilter("all");
    setStartDate("");
    setEndDate("");
    setDateError(null);
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    if (dateError) return;

    const statusLabels: Record<string, string> = {
      in_use: "In Use",
      in_stock_rfu: "In Stock – RFU",
      in_stock_damaged: "In Stock – Repair",
      in_stock_ho: "HO Repair",
    };

    const headers = [
      "Device ID",
      "Serial Number",
      "Status",
      "Unit No",
      "Tipe Alat",
      "Distrik",
      "Tanggal Aktivitas Terakhir",
    ];

    const rows = filteredDevices.map((d) => [
      d.deviceId,
      d.serialNumber,
      statusLabels[d.status] ?? d.status,
      d.unitNo ?? "-",
      d.equipmentType ?? "-",
      d.district ?? "-",
      deviceLastActivityMap.get(d.deviceId) ?? "-",
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
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
    link.setAttribute("download", `smartd_display_device_list${dateRangeSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                Daftar Inventaris Perangkat (SMARTD DISPLAY)
              </h3>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Mock Data
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola, pantau kondisi, dan lacak riwayat unit perangkat di seluruh distrik
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        statusFilter={statusFilter}
        onStatusChange={(s) => {
          setStatusFilter(s);
          setCurrentPage(1);
        }}
        districtFilter={districtFilter}
        onDistrictChange={(d) => {
          setDistrictFilter(d);
          setCurrentPage(1);
        }}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onClearDate={handleClearDate}
        dateError={dateError}
        onResetFilters={handleResetFilters}
        onExportCsv={handleExportCsv}
        totalFiltered={totalItems}
        isFiltered={isFiltered}
      />

      {/* Device Table */}
      <DeviceTable
        devices={paginatedDevices}
        onSelectDevice={(device) => setSelectedDevice(device)}
        onResetFilters={handleResetFilters}
        getLastActivityDate={getLastActivity}
      />

      {/* Pagination Controls */}
      <Pagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        paginatedCount={paginatedDevices.length}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* Detail Modal */}
      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  );
}
