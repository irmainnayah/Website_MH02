"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, X, ZoomIn } from "lucide-react";

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
  const [record, setRecord] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [zoomed, setZoomed] = useState<Photo | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRecord(null); setUnavailable([]);
    fetch(`/api/dotnet/installations/${encodeURIComponent(params.id)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "Instalasi tidak ditemukan." : "Detail instalasi tidak tersedia.");
        return response.json() as Promise<Installation>;
      }).then((result) => {
        if (!Array.isArray(result.devices) || !Array.isArray(result.photos) || !result.details) throw new Error("Data instalasi tidak valid.");
        setRecord(result);
      }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Detail instalasi tidak tersedia."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params.id, reload]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomed]);

  const photoUrl = (photo: Photo) => `/api/dotnet/photos/${encodeURIComponent(photo.photoId)}`;
  const date = (value: string) => value.replace("T", " ").slice(0, 16);
  const display = (value: string | null | undefined) => value || "—";

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <Link href="/operations/installation" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><ArrowLeft className="h-4 w-4" />Installation</Link>
      {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat detail...</p> : error || !record ? <div role="alert" className="space-y-3 text-sm text-rose-700"><p>{error || "Detail instalasi tidak tersedia."}</p><button type="button" className="font-semibold text-blue-700" onClick={() => setReload((value) => value + 1)}>Coba lagi</button></div> : <>
        <div><h1 className="text-xl font-bold text-slate-800">{record.formNumber}</h1><p className="mt-1 text-xs text-slate-500">{record.siteName}</p></div>
        <section className="border-b border-slate-200 pb-5"><h2 className="text-sm font-bold text-slate-800">Pemasangan</h2><dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Perangkat", record.devices.map((device) => device.deviceCode).join(", ")],
            ["Nomor seri", record.devices.map((device) => device.serialNumber).join(", ")],
            ["Unit", record.unitNo], ["Tipe alat", record.equipmentType], ["EGI", record.details.egi],
            ["Mulai", `${date(record.startedAt)} ${record.timeZoneLabel}`], ["Selesai", `${date(record.finishedAt)} ${record.timeZoneLabel}`],
            ["Durasi", `${Math.floor(record.durationMinutes / 60)} jam ${record.durationMinutes % 60} menit`],
            ["Shift", record.shift], ["Area", record.details.area], ["Lokasi", record.details.location_detail],
            ["Teknisi", record.technician.name], ["NRP teknisi", record.technician.nrp], ["Group Leader", record.groupLeader],
          ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{display(value)}</dd></div>)}
        </dl></section>
        <section className="border-b border-slate-200 pb-5"><h2 className="text-sm font-bold text-slate-800">Konfigurasi</h2><dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[["Source power", record.details.source_power], ["SPM version", record.details.spm_version], ["IP SMARTD", record.details.ip_address], ["IP CPE", record.details.ip_cpe], ["IP VHMS", record.details.ip_vhms], ["Catatan", record.remarks || record.details.notes]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{display(value)}</dd></div>)}
        </dl></section>
        <section><h2 className="text-sm font-bold text-slate-800">Dokumentasi Foto</h2>{record.photos.length === 0 ? <p className="mt-3 text-sm text-slate-500">Tidak ada foto.</p> : <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{record.photos.map((photo) => <div key={photo.photoId} className="rounded-md border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-700">{labels[photo.slotKey] ?? photo.slotKey}</p>{unavailable.includes(photo.photoId) ? <p className="mt-2 flex h-32 items-center justify-center text-xs text-rose-700">Foto tidak tersedia.</p> : <button type="button" onClick={() => setZoomed(photo)} title="Perbesar foto" className="relative mt-2 block h-32 w-full overflow-hidden rounded border border-slate-200"><img src={photoUrl(photo)} alt={labels[photo.slotKey] ?? photo.slotKey} onError={() => setUnavailable((previous) => [...previous, photo.photoId])} className="h-full w-full object-contain" /><ZoomIn className="absolute bottom-1 right-1 h-4 w-4 text-slate-700" /></button>}{photo.caption && <p className="mt-2 break-words text-xs text-slate-500">{photo.caption}</p>}</div>)}</div>}</section>
      </>}
      {zoomed && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(null)}><div role="dialog" aria-modal="true" aria-label={labels[zoomed.slotKey] ?? zoomed.slotKey} className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setZoomed(null)} title="Tutup" aria-label="Tutup" className="absolute right-2 top-2 rounded bg-white p-2 text-slate-800"><X className="h-4 w-4" /></button><img src={photoUrl(zoomed)} alt={labels[zoomed.slotKey] ?? zoomed.slotKey} className="max-h-[85vh] max-w-full object-contain" /></div></div>}
    </div>
  );
}