// src/components/dashboard/DeviceList/DeviceDetailModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { DashboardDevice, getDashboardDeviceHistory } from "@/lib/dashboard-api";
import { TimelineEntry } from "@/lib/timeline-api";
import StatusBadge from "@/components/ui/StatusBadge";
import { X, Calendar, Shield, Truck, MapPin } from "lucide-react";

interface DeviceDetailModalProps {
  device: DashboardDevice | null;
  onClose: () => void;
}

export default function DeviceDetailModal({ device, onClose }: DeviceDetailModalProps) {
  const [deviceActivities, setDeviceActivities] = useState<TimelineEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
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

  useEffect(() => {
    if (!device) return;
    const controller = new AbortController();
    setHistoryLoading(true); setHistoryError(null); setDeviceActivities([]); setHistoryTotal(0);
    getDashboardDeviceHistory(device.deviceId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setDeviceActivities(result.items); setHistoryTotal(result.total);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setHistoryError(failure instanceof Error ? failure.message : "Gagal memuat riwayat perangkat."); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [device]);
  const lastActivityDate = device?.lastActivityDate ?? null;

  if (!device) return null;

  const getActivityTypeBadge = (type: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      installation: { label: "Installation", cls: "bg-blue-50 text-blue-700 border-blue-200" },
      troubleshoot: { label: "Troubleshoot", cls: "bg-amber-50 text-amber-700 border-amber-200" },
      replacement: { label: "Replacement", cls: "bg-violet-50 text-violet-700 border-violet-200" },
      removal: { label: "Removal", cls: "bg-rose-50 text-rose-700 border-rose-200" },
      registered: { label: "Registrasi", cls: "bg-slate-100 text-slate-700 border-slate-200" },
      details_updated: { label: "Perubahan Data", cls: "bg-slate-100 text-slate-700 border-slate-200" },
      transaction_deleted: { label: "Transaksi Dihapus", cls: "bg-rose-50 text-rose-700 border-rose-200" },
      soft_deleted: { label: "Arsip", cls: "bg-slate-100 text-slate-700 border-slate-200" },
      device_override: { label: "Koreksi Perangkat", cls: "bg-amber-50 text-amber-700 border-amber-200" },
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
      aria-label={`Detail perangkat ${device.deviceId}`}
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
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70"><span className="text-[11px] text-slate-500 font-medium">EGI</span><p className="mt-0.5 text-sm font-semibold text-slate-800">{device.egi ?? "Belum diisi"}</p></div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70"><span className="text-[11px] text-slate-500 font-medium">Lokasi Fisik</span><p className="mt-0.5 text-sm font-semibold text-slate-800">{device.currentLocation ?? "Belum tercatat"}</p></div>
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
              Tersimpan
            </span>
          </div>

          {/* Activity History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Riwayat Terbaru ({deviceActivities.length} / {historyTotal})
              </h4>
              <Link href={`/reports/timeline/${encodeURIComponent(device.deviceId)}`} className="text-[11px] font-semibold text-blue-700">Timeline Lengkap</Link>
            </div>
            {historyLoading ? <p role="status" className="p-4 text-xs text-slate-500">Memuat riwayat perangkat...</p> : historyError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{historyError}</p> : deviceActivities.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                Belum ada riwayat tersimpan untuk perangkat ini.
              </div>
            ) : (
              <ol className="divide-y divide-slate-200">
                {deviceActivities.map((entry) => <li key={entry.key} className="space-y-2 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">{getActivityTypeBadge(entry.type)}<span className="text-slate-500">{entry.date} {entry.time} ({entry.timeZone})</span></div>
                  <p className="break-words font-medium text-slate-800">{entry.summary}</p>
                  <p className="text-slate-500">{entry.formNumber ?? "-"} / {entry.unitNo ?? "Tanpa unit tercatat"} / {entry.technicianName || "Tidak tercatat"}</p>
                  {entry.detailPath && <Link href={entry.detailPath} className="inline-block font-semibold text-blue-700">Detail Transaksi</Link>}
                </li>)}
              </ol>
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
