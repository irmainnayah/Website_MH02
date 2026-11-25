"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Activity, ArrowLeft, Calendar, Camera, Cpu, FileText, LayoutDashboard, Network, Pencil, Printer, User, Wrench, X, ZoomIn } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { useBreadcrumbLabel } from "@/components/layout/PageLabel";

interface Photo { photoId: string; slotKey: string; caption: string | null }
interface Device { deviceId: string; deviceCode: string; serialNumber: string }
interface Installation {
  formNumber: string; siteName: string; unitNo: string | null; startedAt: string; finishedAt: string;
  timeZoneLabel: string; durationMinutes: number; shift: string | null; equipmentType: string | null;
  technician: { name: string | null; nrp: string | null }; groupLeader: string | null; remarks: string | null;
  details: { egi?: string | null; source_power?: string | null; spm_version?: string | null; area?: string | null;
    location_detail?: string | null; ip_address?: string | null; ip_cpe?: string | null; ip_vhms?: string | null; notes?: string | null };
  devices: Device[]; photos: Photo[];
}

const labels: Record<string, string> = {
  mh02_installed: "MH02 terpasang", camera_dashboard_angle: "Sudut kamera dashboard",
  nodered_config: "Konfigurasi Node-RED", gps_antenna: "Antena GPS",
};

export default function InstallationDetailApi() {
  const params = useParams<{ id: string }>();
  const routeId = params?.id ?? "";
  const { currentUser } = useAuth();
  const [record, setRecord] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [zoomed, setZoomed] = useState<Photo | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  // The top bar shows the document number instead of the record id.
  useBreadcrumbLabel(record?.formNumber);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRecord(null); setUnavailable([]);
    fetch(`/api/dotnet/installations/${encodeURIComponent(routeId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "Instalasi tidak ditemukan." : "Detail instalasi tidak tersedia.");
        return response.json() as Promise<Installation>;
      }).then((result) => {
        if (!Array.isArray(result.devices) || !Array.isArray(result.photos) || !result.details) throw new Error("Data instalasi tidak valid.");
        setRecord(result);
      }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Detail instalasi tidak tersedia."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [routeId, reload]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomed]);

  const photoUrl = (photo: Photo) => `/api/dotnet/photos/${encodeURIComponent(photo.photoId)}`;
  const date = (value: string) => value.replace("T", " ").slice(0, 16);
  const display = (value: string | null | undefined) => value || "—";
  const card = "bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4";
  const heading = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">{icon}<h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{text}</h2></div>
  );
  const field = (label: string, value: string | null | undefined, strong = false) => (
    <div key={label} className="min-w-0"><dt className="text-[11px] font-medium text-slate-500">{label}</dt><dd className={`mt-0.5 break-words text-sm ${strong ? "font-bold text-blue-700" : "font-semibold text-slate-800"}`}>{display(value)}</dd></div>
  );
  const device = record?.devices[0];
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-sm";

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-16 print:p-0 print:m-0">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        <Link href="/operations/installation" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors shrink-0"><ArrowLeft className="h-4 w-4" />Kembali ke Riwayat Pemasangan</Link>
        {record && (
          <div className="flex flex-wrap items-center gap-2">
            {currentUser.role === "superadmin" && <Link href={`/operations/installation/new?edit=${encodeURIComponent(routeId)}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-sm"><Pencil className="h-3.5 w-3.5" />Edit Installation</Link>}
            <button type="button" onClick={() => window.print()} className={btn} title="Cetak salinan dokumen formulir ini"><Printer className="h-3.5 w-3.5 text-slate-500" />Cetak / Print</button>
            {device && <Link href={`/reports/timeline/${encodeURIComponent(device.deviceCode)}`} className={btn}><Activity className="h-3.5 w-3.5 text-blue-600" />View Device Timeline ({device.deviceCode})</Link>}
            <Link href="/" className={btn}><LayoutDashboard className="h-3.5 w-3.5 text-slate-500" />Back to Dashboard</Link>
          </div>
        )}
      </div>

      {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat detail...</p> : error || !record ? <div role="alert" className="space-y-3 text-sm text-rose-700"><p>{error || "Detail instalasi tidak tersedia."}</p><button type="button" className="font-semibold text-blue-700" onClick={() => setReload((value) => value + 1)}>Coba lagi</button></div> : <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 pb-5 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">Dokumen Pemasangan Perangkat (Installation)</span>
                <span className="text-[11px] font-medium text-slate-500">Site: {record.siteName}</span>
              </div>
              <h1 className="mt-2 text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">{record.formNumber}{record.unitNo && <><span className="text-slate-300 font-normal">|</span><span className="text-lg text-slate-700">Unit {record.unitNo}</span></>}</h1>
              <p className="mt-1 text-xs text-slate-500">Pencatatan pemasangan unit telematika SMARTD DISPLAY pada armada operasional.</p>
            </div>
            <div className="grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs md:text-right">
              <div><p className="text-[10px] text-slate-400 font-medium">Mulai</p><p className="font-bold text-slate-800">{date(record.startedAt)} {record.timeZoneLabel}</p></div>
              <div><p className="text-[10px] text-slate-400 font-medium">Selesai</p><p className="font-bold text-slate-800">{date(record.finishedAt)} {record.timeZoneLabel}</p></div>
              <div><p className="text-[10px] text-slate-400 font-medium">Durasi</p><p className="font-bold text-blue-700">{Math.floor(record.durationMinutes / 60)} jam {record.durationMinutes % 60} menit</p></div>
            </div>
          </div>

          <div className="space-y-3">
            {heading(<Cpu className="h-4 w-4 text-blue-600" />, "1. Informasi Perangkat & Armada")}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("Device ID (Dipasang)", record.devices.map((item) => item.deviceCode).join(", "), true)}
              {field("Nomor Seri", record.devices.map((item) => item.serialNumber).join(", "))}
              {field("Unit Number (Nomor Lambung)", record.unitNo)}
              {field("Tipe Alat Berat", record.equipmentType)}
              {field("EGI (Model Unit)", record.details.egi)}
              {field("Shift Operasional", record.shift)}
              {field("Area", record.details.area)}
              {field("Lokasi Detail", record.details.location_detail)}
              {field("Distrik / Site", record.siteName)}
            </dl>
          </div>

          <div className="space-y-3">
            {heading(<User className="h-4 w-4 text-blue-600" />, "2. Personel")}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("Teknisi Pelaksana", record.technician.name)}
              {field("NRP Teknisi", record.technician.nrp)}
              {field("Group Leader (GL)", record.groupLeader)}
              {field("Nomor Formulir Tercatat", record.formNumber)}
            </dl>
          </div>

          <div className="space-y-3">
            {heading(<Network className="h-4 w-4 text-blue-600" />, "3. Konfigurasi & Jaringan")}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("Source Power", record.details.source_power)}
              {field("SPM Version", record.details.spm_version)}
              {field("IP SMARTD", record.details.ip_address)}
              {field("IP CPE", record.details.ip_cpe)}
              {field("IP VHMS", record.details.ip_vhms)}
            </dl>
          </div>

          <div className="space-y-3">
            {heading(<FileText className="h-4 w-4 text-blue-600" />, "4. Catatan Teknis (Remarks)")}
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap break-words">{display(record.remarks || record.details.notes)}</p>
          </div>
        </div>

        {record.photos.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Dokumentasi Foto Pemasangan Resmi</h2>
              <p className="text-xs text-slate-500 mt-0.5">Bukti dokumentasi foto pemasangan unit telematika beserta konfigurasinya. Klik gambar untuk melihat tampilan resolusi penuh (Lightbox).</p>
            </div>
            <span className="text-xs tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">{record.photos.length} Foto Terlampir</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {record.photos.map((photo, index) => {
              const title = labels[photo.slotKey] ?? photo.slotKey;
              return (
                <div key={photo.photoId} className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-xs text-slate-800 line-clamp-1">{index + 1}. {title}</h3>
                    <span className="shrink-0 bg-slate-200/80 text-slate-600 tabular-nums text-[10px] px-2 py-0.5 rounded font-bold">SLOT {index + 1}</span>
                  </div>

                  {unavailable.includes(photo.photoId) ? (
                    <p className="flex h-48 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-rose-700">Foto tidak tersedia.</p>
                  ) : (
                    <div onClick={() => setZoomed(photo)} className="h-48 bg-slate-900 cursor-pointer relative overflow-hidden rounded-lg flex items-center justify-center border border-slate-200" title={`Klik untuk memperbesar ${title}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(photo)} alt={title} onError={() => setUnavailable((previous) => [...previous, photo.photoId])} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 select-none" />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-semibold text-xs">
                        <ZoomIn className="h-4 w-4" />
                        <span>Perbesar Foto</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1 flex-1 flex flex-col justify-between">
                    <div>{photo.caption?.trim() ? <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-slate-600">{photo.caption}</p> : null}</div>
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-blue-600 font-semibold">
                      <button type="button" onClick={() => setZoomed(photo)} className="flex items-center gap-1 hover:underline cursor-pointer"><ZoomIn className="h-3 w-3" />Klik untuk Zoom</button>
                      <span className="text-slate-400 font-normal">HD Preview</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        <div className="print:hidden bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Calendar className="h-3.5 w-3.5" />Navigasi Tindak Lanjut & Penelusuran</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/operations/installation" className={btn}><ArrowLeft className="h-3.5 w-3.5 text-slate-500" />Back to List</Link>
            {device && <Link href={`/reports/timeline/${encodeURIComponent(device.deviceCode)}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shadow-sm"><Wrench className="h-3.5 w-3.5" />View Device Timeline</Link>}
            <Link href="/reports/activity-log" className={btn}><Activity className="h-3.5 w-3.5 text-slate-500" />View All Activities</Link>
          </div>
        </div>
      </>}
      {zoomed && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(null)}><div role="dialog" aria-modal="true" aria-label={labels[zoomed.slotKey] ?? zoomed.slotKey} className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setZoomed(null)} title="Tutup" aria-label="Tutup" className="absolute right-2 top-2 rounded bg-white p-2 text-slate-800"><X className="h-4 w-4" /></button><img src={photoUrl(zoomed)} alt={labels[zoomed.slotKey] ?? zoomed.slotKey} className="max-h-[85vh] max-w-full object-contain" /></div></div>, document.body)}
    </div>
  );
}
