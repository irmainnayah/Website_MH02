"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, RefreshCw, Save, Trash2, X, ZoomIn } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";

type PhotoSlot = "mh02_installed" | "camera_dashboard_angle" | "nodered_config" | "gps_antenna";
type PhotoFiles = Record<PhotoSlot, File | null>;
type PhotoText = Record<PhotoSlot, string>;

interface Site { siteId: number; name: string; timeZoneLabel: string }
interface Lookup { category: string; label: string; siteId: number | null }
interface Reference { sites: Site[]; lookups: Lookup[] }
interface Device { deviceId: string; deviceCode: string; serialNumber: string; siteId: number }
interface DevicePage { items: Device[]; total: number }
interface Unit { unitId: string; unitNo: string; siteId: number; equipmentType: string; egi: string | null }

const photoSlots: { key: PhotoSlot; label: string; required: boolean }[] = [
  { key: "mh02_installed", label: "MH02 terpasang", required: true },
  { key: "camera_dashboard_angle", label: "Sudut kamera dashboard", required: false },
  { key: "nodered_config", label: "Konfigurasi Node-RED", required: true },
  { key: "gps_antenna", label: "Antena GPS", required: true },
];
const emptyPhotos = (): PhotoFiles => ({ mh02_installed: null, camera_dashboard_angle: null, nodered_config: null, gps_antenna: null });
const emptyCaptions = (): PhotoText => ({ mh02_installed: "", camera_dashboard_angle: "", nodered_config: "", gps_antenna: "" });
const fieldClass = "mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100";
const labelClass = "block min-w-0 text-xs font-semibold text-slate-700";

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Data referensi tidak tersedia. Periksa sesi dan backend.");
  return response.json() as Promise<T>;
}

async function getDevices(signal: AbortSignal): Promise<Device[]> {
  const result: Device[] = [];
  let page = 1;
  let total = 0;
  do {
    const data = await getJson<DevicePage>(`/api/dotnet/devices?purpose=installable&page=${page}&pageSize=100`, signal);
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0)
      throw new Error("Data perangkat tidak valid.");
    result.push(...data.items);
    total = data.total;
    if (data.items.length === 0 && result.length < total) throw new Error("Data perangkat tidak dapat dimuat seluruhnya.");
    page++;
  } while (result.length < total);
  return result;
}

export default function InstallationCreateApi() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [reference, setReference] = useState<Reference | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [siteId, setSiteId] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [shift, setShift] = useState("");
  const [sourcePower, setSourcePower] = useState("");
  const [spmVersion, setSpmVersion] = useState("");
  const [area, setArea] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [ipCpe, setIpCpe] = useState("");
  const [ipVhms, setIpVhms] = useState("");
  const [groupLeader, setGroupLeader] = useState("");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<PhotoFiles>(emptyPhotos);
  const [captions, setCaptions] = useState<PhotoText>(emptyCaptions);
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [zoomed, setZoomed] = useState<PhotoSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [editRequested, setEditRequested] = useState(false);
  const keyRef = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setEditRequested(new URLSearchParams(window.location.search).has("edit"));
    keyRef.current = window.sessionStorage.getItem("mh02-installation-create-key");
    setLoading(true);
    setError("");
    Promise.all([
      getJson<Reference>("/api/dotnet/reference", controller.signal),
      getDevices(controller.signal),
      getJson<Unit[]>("/api/dotnet/fleet-units?available=true", controller.signal),
    ]).then(([nextReference, nextDevices, nextUnits]) => {
      if (!Array.isArray(nextReference.sites) || !Array.isArray(nextReference.lookups) || !Array.isArray(nextUnits))
        throw new Error("Data referensi tidak valid.");
      setReference(nextReference); setDevices(nextDevices); setUnits(nextUnits);
      setSiteId((previous) => previous || (nextReference.sites.length === 1 ? String(nextReference.sites[0].siteId) : ""));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setReference(null); setError(reason instanceof Error ? reason.message : "Data referensi tidak tersedia."); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const next: Partial<Record<PhotoSlot, string>> = {};
    for (const slot of photoSlots) if (photos[slot.key]) next[slot.key] = URL.createObjectURL(photos[slot.key]!);
    setPreviews(next);
    return () => { for (const url of Object.values(next)) if (url) URL.revokeObjectURL(url); };
  }, [photos]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomed]);

  const selectedSite = reference?.sites.find((site) => String(site.siteId) === siteId);
  const selectedUnit = units.find((unit) => unit.unitNo === unitNo && String(unit.siteId) === siteId);
  const availableDevices = devices.filter((device) => String(device.siteId) === siteId);
  const availableUnits = units.filter((unit) => String(unit.siteId) === siteId);
  const choices = (category: string) => (reference?.lookups ?? []).filter((entry) => entry.category === category && (entry.siteId === null || String(entry.siteId) === siteId));
  const duration = useMemo(() => {
    if (!startedAt || !finishedAt) return null;
    const minutes = (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000;
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }, [startedAt, finishedAt]);

  const maxFinishLocal = useMemo(() => {
    if (!selectedSite) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: selectedSite.timeZoneLabel === "WIB" ? "Asia/Jakarta" : selectedSite.timeZoneLabel === "WIT" ? "Asia/Jayapura" : "Asia/Makassar",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(Date.now() + 120_000));
    const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "00";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  }, [selectedSite]);

  const choosePhoto = (slot: PhotoSlot, file: File | undefined) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Foto harus berupa JPEG, PNG, atau WebP dengan ukuran maksimal 10 MB.");
      return;
    }
    setError(""); setPhotos((previous) => ({ ...previous, [slot]: file }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!selectedSite || !availableDevices.some((device) => device.deviceCode === deviceCode) || !selectedUnit || !duration) {
      setError("Periksa site, perangkat, unit, serta waktu mulai dan selesai."); return;
    }
    if (finishedAt > maxFinishLocal) {
      setError("Waktu selesai tidak boleh berada di masa depan pada zona waktu site."); return;
    }
    if (photoSlots.some((slot) => slot.required && !photos[slot.key])) {
      setError("Lengkapi foto MH02 terpasang, Node-RED, dan antena GPS."); return;
    }
    submitting.current = true; setSaving(true); setError("");
    try {
      if (!keyRef.current) {
        keyRef.current = crypto.randomUUID();
        window.sessionStorage.setItem("mh02-installation-create-key", keyRef.current);
      }
      const payload = {
        siteId: selectedSite.siteId, deviceCode, unitNo, startedAt, finishedAt,
        ...(shift && { shift }), ...(sourcePower && { sourcePower }), ...(spmVersion && { spmVersion }),
        ...(area && { area }), ...(locationDetail.trim() && { locationDetail: locationDetail.trim() }),
        ...(ipAddress.trim() && { ipAddress: ipAddress.trim() }), ...(ipCpe.trim() && { ipCpe: ipCpe.trim() }),
        ...(ipVhms.trim() && { ipVhms: ipVhms.trim() }), ...(groupLeader && { groupLeader }),
        ...(remarks.trim() && { remarks: remarks.trim() }),
      };
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      for (const slot of photoSlots) {
        const file = photos[slot.key];
        if (!file) continue;
        body.append(`photo:${slot.key}`, file);
        if (captions[slot.key].trim()) body.append(`caption:${slot.key}`, captions[slot.key].trim());
      }
      let response: Response;
      try {
        response = await fetch("/api/dotnet/installations", { method: "POST", headers: { "Idempotency-Key": keyRef.current }, body });
      } catch {
        throw new Error("Hasil penyimpanan belum dapat dipastikan. Periksa riwayat atau coba lagi tanpa mengubah formulir.");
      }
      if (!response.ok) {
        const result: { error?: { code?: string } } | null = await response.json().catch(() => null);
        const messages: Record<string, string> = {
          DEVICE_NOT_AVAILABLE: "Perangkat tidak lagi tersedia. Muat ulang data referensi.", UNIT_OCCUPIED: "Unit sudah memiliki perangkat.",
          DEVICE_NOT_FOUND: "Perangkat tidak ditemukan pada site ini.", UNIT_NOT_FOUND: "Unit tidak ditemukan pada site ini.",
          SITE_REQUIRED: "Pilih site sebelum menyimpan.", SITE_INACTIVE: "Site yang dipilih tidak aktif.",
          INVALID_TIME_ZONE: "Zona waktu site tidak didukung.", TIME_ZONE_UNAVAILABLE: "Zona waktu site tidak tersedia pada server.",
          INVALID_DATETIME: "Format waktu tidak valid atau waktunya ambigu.",
          FINISH_IN_FUTURE: "Waktu selesai tidak boleh di masa depan.", DATABASE_CONSTRAINT: "Database menolak kombinasi data. Periksa log backend dengan request ID.",
          CONFLICT: "Data bertabrakan dengan perubahan lain. Segarkan data dan coba lagi.",
          PHOTO_SIZE_INVALID: "Ukuran foto tidak valid.", PHOTO_TYPE_INVALID: "Format foto tidak valid.", PHOTO_STORAGE_UNAVAILABLE: "Penyimpanan foto tidak tersedia.",
          IDEMPOTENCY_KEY_REUSED: "Permintaan sebelumnya berbeda. Periksa riwayat instalasi sebelum memulai formulir baru.",
          COMMIT_OUTCOME_UNKNOWN: "Hasil penyimpanan belum dapat dipastikan. Coba lagi tanpa mengubah formulir.",
          BACKEND_UNAVAILABLE: "Hasil penyimpanan belum dapat dipastikan. Periksa riwayat atau coba lagi tanpa mengubah formulir.",
          UNAUTHENTICATED: "Sesi login berakhir. Masuk kembali dan periksa riwayat instalasi.",
          SITE_FORBIDDEN: "Akun tidak memiliki akses ke site ini.",
          REQUEST_TOO_LARGE: "Ukuran total foto terlalu besar.",
          UNSUPPORTED_MEDIA_TYPE: "Backend belum menerima format upload ini. Mulai ulang backend versi terbaru.",
          UNSUPPORTED_MEDIA_TYPE: "Format request tidak didukung. Muat ulang backend agar mendukung multipart foto.",
        };
        const code = result?.error?.code;
        const requestId = response.headers.get("x-request-id");
        const apiMessage = (result as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(messages[code ?? ""] ?? `${apiMessage ?? `Instalasi gagal (${code ?? response.status})`}${requestId ? ` [Request ID: ${requestId}]` : ""}`);
      }
      const result: { activityId?: string; formNumber?: string } = await response.json();
      if (!result.activityId || !result.formNumber) throw new Error("Hasil penyimpanan belum dapat dipastikan. Coba lagi tanpa mengubah formulir.");
      window.sessionStorage.removeItem("mh02-installation-create-key");
      keyRef.current = null;
      router.push("/operations/installation");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instalasi belum dapat disimpan.");
    } finally { submitting.current = false; setSaving(false); }
  };

  if (editRequested) return <div className="space-y-4 text-sm text-slate-700"><p>Edit instalasi belum tersedia.</p><Link className="text-blue-700" href="/operations/installation">Kembali</Link></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div className="flex items-center justify-between gap-3">
        <div><Link href="/operations/installation" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><ArrowLeft className="h-4 w-4" />Installation</Link><h1 className="mt-2 text-xl font-bold text-slate-800">New Installation</h1></div>
        {reference && <button type="button" disabled={saving || loading} onClick={() => setReload((value) => value + 1)} title="Segarkan referensi" aria-label="Segarkan referensi" className="rounded-md border border-slate-300 p-2 text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>}
      </div>
      {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat data referensi...</p> : !reference ? <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setReload((value) => value + 1)}>Coba lagi</button> : (
        <form onSubmit={submit} className="space-y-6">
          {reference.sites.length === 0 && <p role="status" className="text-sm text-amber-700">Belum ada site yang tersedia untuk akun ini.</p>}
          {siteId && availableDevices.length === 0 && <p role="status" className="text-sm text-amber-700">Tidak ada perangkat RFU pada site ini.</p>}
          {siteId && availableUnits.length === 0 && <p role="status" className="text-sm text-amber-700">Tidak ada unit tersedia pada site ini.</p>}
          <fieldset disabled={saving} className="space-y-6">
            <section className="border-b border-slate-200 pb-5"><h2 className="text-sm font-bold text-slate-800">Perangkat dan Unit</h2><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className={labelClass}>Site<select required value={siteId} onChange={(event) => { setSiteId(event.target.value); setDeviceCode(""); setUnitNo(""); setArea(""); setGroupLeader(""); setShift(""); setSourcePower(""); setSpmVersion(""); }} className={fieldClass}><option value="">Pilih site</option>{reference.sites.map((site) => <option key={site.siteId} value={site.siteId}>{site.name}</option>)}</select></label>
              <label className={labelClass}>Perangkat RFU<select required value={deviceCode} disabled={!siteId} onChange={(event) => setDeviceCode(event.target.value)} className={fieldClass}><option value="">Pilih perangkat</option>{availableDevices.map((device) => <option key={device.deviceId} value={device.deviceCode}>{device.deviceCode} - {device.serialNumber}</option>)}</select></label>
              <label className={labelClass}>Unit tersedia<select required value={unitNo} disabled={!siteId} onChange={(event) => setUnitNo(event.target.value)} className={fieldClass}><option value="">Pilih unit</option>{availableUnits.map((unit) => <option key={unit.unitId} value={unit.unitNo}>{unit.unitNo} - {unit.equipmentType}</option>)}</select></label>
              <label className={labelClass}>Tipe alat<input readOnly value={selectedUnit?.equipmentType ?? ""} className={fieldClass} /></label>
              <label className={labelClass}>EGI<input readOnly value={selectedUnit?.egi ?? ""} className={fieldClass} /></label>
              <label className={labelClass}>Teknisi<input readOnly value={`${currentUser.name} (${currentUser.nrp})`} className={fieldClass} /></label>
            </div></section>
            <section className="border-b border-slate-200 pb-5"><h2 className="text-sm font-bold text-slate-800">Waktu dan Lokasi</h2><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className={labelClass}>Waktu mulai {selectedSite?.timeZoneLabel && `(${selectedSite.timeZoneLabel})`}<input type="datetime-local" required value={startedAt} onChange={(event) => setStartedAt(event.target.value)} className={fieldClass} /></label>
              <label className={labelClass}>Waktu selesai {selectedSite?.timeZoneLabel && `(${selectedSite.timeZoneLabel})`}<input type="datetime-local" required value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} className={fieldClass} /></label>
              <label className={labelClass}>Durasi<input readOnly value={duration === null ? "" : `${Math.floor(duration / 60)} jam ${duration % 60} menit`} className={fieldClass} /></label>
              <label className={labelClass}>Shift<select value={shift} onChange={(event) => setShift(event.target.value)} className={fieldClass}><option value="">Pilih shift</option>{choices("shift").map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}</select></label>
              <label className={labelClass}>Area<select value={area} onChange={(event) => setArea(event.target.value)} className={fieldClass}><option value="">Pilih area</option>{choices("area").map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}</select></label>
              <label className={labelClass}>Lokasi detail<input maxLength={200} value={locationDetail} onChange={(event) => setLocationDetail(event.target.value)} className={fieldClass} /></label>
              <label className={labelClass}>Group Leader<select value={groupLeader} onChange={(event) => setGroupLeader(event.target.value)} className={fieldClass}><option value="">Pilih Group Leader</option>{choices("group_leader").map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}</select></label>
            </div></section>
            <section className="border-b border-slate-200 pb-5"><h2 className="text-sm font-bold text-slate-800">Konfigurasi</h2><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className={labelClass}>Source power<select value={sourcePower} onChange={(event) => setSourcePower(event.target.value)} className={fieldClass}><option value="">Pilih source power</option>{choices("source_power").map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}</select></label>
              <label className={labelClass}>SPM version<select value={spmVersion} onChange={(event) => setSpmVersion(event.target.value)} className={fieldClass}><option value="">Pilih versi</option>{choices("spm_version").map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}</select></label>
              <label className={labelClass}>IP SMARTD<input maxLength={45} value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} className={fieldClass} /></label>
              <label className={labelClass}>IP CPE<input maxLength={45} value={ipCpe} onChange={(event) => setIpCpe(event.target.value)} className={fieldClass} /></label>
              <label className={labelClass}>IP VHMS<input maxLength={45} value={ipVhms} onChange={(event) => setIpVhms(event.target.value)} className={fieldClass} /></label>
              <label className={`${labelClass} md:col-span-3`}>Catatan<textarea maxLength={1000} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} className={fieldClass} /></label>
            </div></section>
            <section><h2 className="text-sm font-bold text-slate-800">Dokumentasi Foto</h2><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {photoSlots.map((slot) => <div key={slot.key} className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">{slot.label}{slot.required ? " *" : ""}</p>
                {previews[slot.key] ? <button type="button" onClick={() => setZoomed(slot.key)} className="relative mt-2 block h-32 w-full overflow-hidden rounded border border-slate-200" title="Perbesar foto"><img src={previews[slot.key]} alt={slot.label} className="h-full w-full object-contain" /><ZoomIn className="absolute bottom-1 right-1 h-4 w-4 text-slate-700" /></button> : <div className="mt-2 flex h-32 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400"><Camera className="h-6 w-6" /></div>}
                <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700"><Camera className="h-4 w-4" />{photos[slot.key] ? "Ganti foto" : "Pilih foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { choosePhoto(slot.key, event.target.files?.[0]); event.target.value = ""; }} /></label>
                {photos[slot.key] && <button type="button" title="Hapus foto" aria-label={`Hapus ${slot.label}`} onClick={() => { setPhotos((previous) => ({ ...previous, [slot.key]: null })); setCaptions((previous) => ({ ...previous, [slot.key]: "" })); }} className="ml-3 text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                <label className={`${labelClass} mt-2`}>Keterangan<input maxLength={200} value={captions[slot.key]} onChange={(event) => setCaptions((previous) => ({ ...previous, [slot.key]: event.target.value }))} className={fieldClass} /></label>
              </div>)}
            </div></section>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" disabled={saving} onClick={() => router.push("/operations/installation")} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan"}</button></div>
          </fieldset>
        </form>
      )}
      {zoomed && previews[zoomed] && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(null)}><div role="dialog" aria-modal="true" aria-label={photoSlots.find((slot) => slot.key === zoomed)?.label} className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setZoomed(null)} title="Tutup" aria-label="Tutup" className="absolute right-2 top-2 rounded bg-white p-2 text-slate-800"><X className="h-4 w-4" /></button><img src={previews[zoomed]} alt={photoSlots.find((slot) => slot.key === zoomed)?.label} className="max-h-[85vh] max-w-full object-contain" /></div></div>}
    </div>
  );
}