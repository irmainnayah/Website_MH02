// src/components/dashboard/DeviceList/DeviceTable.tsx
"use client";

import React from "react";
import { DashboardDevice } from "@/lib/dashboard-api";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { Eye, HardDrive, RotateCcw } from "lucide-react";

export const DEVICE_COLUMNS = [
  { key: "deviceId", label: "Device ID" }, { key: "serialNumber", label: "Serial Number" }, { key: "status", label: "Status" },
  { key: "unitNo", label: "Unit No" }, { key: "equipmentType", label: "Tipe Alat" }, { key: "district", label: "Distrik" },
  { key: "lastActivityDate", label: "Tanggal Aktivitas Terakhir" },
] as const;
export type DeviceColumn = typeof DEVICE_COLUMNS[number]["key"];

interface DeviceTableProps {
  devices: DashboardDevice[];
  allDevices: DashboardDevice[];
  columnFilters: Partial<Record<DeviceColumn, string>>;
  onColumnFilterChange: (column: DeviceColumn, value: string) => void;
  onSelectDevice: (device: DashboardDevice) => void;
  onResetFilters: () => void;
  getLastActivityDate: (deviceId: string) => string | null;
}

export default function DeviceTable({
  devices,
  allDevices,
  columnFilters,
  onColumnFilterChange,
  onSelectDevice,
  onResetFilters,
  getLastActivityDate,
}: DeviceTableProps) {
  if (devices.length === 0) {
    return (
      <div className="py-8">
        <EmptyState
          icon={HardDrive}
          title="Tidak Ada Perangkat Ditemukan"
          description="Tidak ada data perangkat yang cocok dengan kriteria pencarian dan filter yang Anda pilih."
          action={
            <button
              onClick={onResetFilters}
              className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
            >
              Reset Semua Filter
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-xs text-left">
        <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
          <tr>
            <th className="py-3 px-3">Device ID</th>
            <th className="py-3 px-3">Serial Number</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-3">Unit No</th>
            <th className="py-3 px-3">Tipe Alat</th>
            <th className="py-3 px-3">Distrik</th>
            <th className="py-3 px-3">Tanggal Aktivitas Terakhir</th>
            <th className="py-3 px-3 text-right">Aksi</th>
          </tr>
          <tr className="border-t border-slate-200 bg-slate-50">
            {DEVICE_COLUMNS.map((column) => <th key={column.key} className="px-3 pb-2 font-normal"><select aria-label={`Filter ${column.label}`} value={columnFilters[column.key] ?? ""} onChange={(event) => onColumnFilterChange(column.key, event.target.value)} className="w-full max-w-40 rounded border border-slate-200 bg-white px-1 py-1 text-[11px] font-normal text-slate-600"><option value="">Semua</option>{Array.from(new Set(allDevices.map((device) => String(device[column.key] ?? "")))).filter(Boolean).sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></th>)}
            <th className="px-3 pb-2 text-right"><button type="button" title="Clear Filter" aria-label="Clear Filter" onClick={onResetFilters} className="rounded p-1 text-slate-500"><RotateCcw className="h-3.5 w-3.5" /></button></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {devices.map((device) => {
            const lastActivity = getLastActivityDate(device.deviceId);
            return (
              <tr
                key={device.deviceId}
                className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                onClick={() => onSelectDevice(device)}
              >
                <td className="py-3 px-3 font-semibold text-slate-800">
                  {device.deviceId}
                </td>
                <td className="py-3 px-3 text-slate-600">
                  {device.serialNumber}
                </td>
                <td className="py-3 px-3">
                  <StatusBadge status={device.status} />
                </td>
                <td className="py-3 px-3 font-medium text-slate-900">
                  {device.unitNo ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {device.equipmentType ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {device.district ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="py-3 px-3 tabular-nums text-slate-600">
                  {lastActivity ? lastActivity : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSelectDevice(device)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-md shadow-2xs transition"
                  >
                    <Eye className="h-3 w-3" />
                    <span>Detail</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
