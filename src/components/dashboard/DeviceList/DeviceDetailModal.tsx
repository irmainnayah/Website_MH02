// src/components/dashboard/DeviceList/DeviceDetailModal.tsx
"use client";

import React, { useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { DeviceRecord } from "@/types/dashboard";
import { getAllEnrichedActivities, getLastActivityDateByDevice } from "@/lib/mock-data";
import StatusBadge from "@/components/ui/StatusBadge";
import { X, Calendar, Shield, Truck, MapPin } from "lucide-react";

interface DeviceDetailModalProps {
  device: DeviceRecord | null;
  onClose: () => void;
}

export default function DeviceDetailModal({ device, onClose }: DeviceDetailModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!device) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [device, onClose]);

  // Prevent background scroll while open
  useEffect(() => {
    if (!device) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [device]);

  // Gather activities for this device
  const deviceActivities = useMemo(() => {
    if (!device) return [];
    const all = getAllEnrichedActivities();
    return all.filter((a) => a.deviceId === device.deviceId);
  }, [device]);

  const lastActivityDate = useMemo(() => {
    if (!device) return null;
    return getLastActivityDateByDevice(device.deviceId);
  }, [device]);

  if (!device) return null;

  const getActivityTypeBadge = (type: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      installation: { label: "Installation", cls: "bg-blue-50 text-blue-700 border-blue-200" },
      troubleshoot: { label: "Troubleshoot", cls: "bg-amber-50 text-amber-700 border-amber-200" },
      replacement: { label: "Replacement", cls: "bg-violet-50 text-violet-700 border-violet-200" },
      removal: { label: "Removal", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    };
    const info = map[type] || { label: type, cls: "bg-slate-100 text-slate-700 border-slate-200" };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${info.cls}`}>
        {info.label}
      </span>
    );
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      aria-modal="true"
      role="dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Perangkat {device.deviceId}
                </h3>
                <StatusBadge status={device.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Serial Number: <span className="font-medium text-slate-700">{device.serialNumber}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Tutup modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Specifications Grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Informasi Armada &amp; Distrik
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <span className="text-[11px] text-slate-500 font-medium">Unit Armada</span>
                <p className="text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-slate-400" />
                  {device.unitNo ?? "—"}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <span className="text-[11px] text-slate-500 font-medium">Tipe Alat</span>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  {device.equipmentType ?? "—"}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <span className="text-[11px] text-slate-500 font-medium">Distrik / Site</span>
                <p className="text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {device.district ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Last Activity Date Notice */}
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between text-xs text-blue-900">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                Tanggal Aktivitas Terakhir:{" "}
                <strong className="text-slate-900 tabular-nums">
                  {lastActivityDate ? lastActivityDate : "—"}
                </strong>
              </span>
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              Mock Record
            </span>
          </div>

          {/* Activity History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Riwayat Aktivitas ({deviceActivities.length})
              </h4>
              <span className="text-[11px] text-slate-500">Aktivitas terlacak di log</span>
            </div>
            {deviceActivities.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                Belum ada catatan aktivitas operasional untuk perangkat ini.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Jenis Aktivitas</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Teknisi</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deviceActivities.map((act) => (
                      <tr key={act.activityId} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 tabular-nums text-slate-700">{act.date}</td>
                        <td className="px-3 py-2">{getActivityTypeBadge(act.type)}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{act.unitNo ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{act.technicianName}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {act.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 italic">
            Data operasional tersinkronisasi dengan log aktivitas armada.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-sm transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
