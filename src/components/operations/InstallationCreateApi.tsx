"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowLeft, Calendar, Camera, Clock, Cpu, FileText, Lock, Network, RefreshCw, Save, Trash2, Upload, User, Wrench, X, ZoomIn } from "lucide-react";
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
interface EditRecord {
  activityId: string; formNumber: string; siteId: number; siteName: string; unitNo: string | null; equipmentType: string | null;
  startedAt: string; finishedAt: string; shift: string | null; groupLeader: string | null; remarks: string | null; rowVersion: string;
  devices: { deviceId: string; deviceCode: string; serialNumber: string }[];
  details: { egi?: string | null; source_power?: string | null; spm_version?: string | null; area?: string | null; location_detail?: string | null; ip_address?: string | null; ip_cpe?: string | null; ip_vhms?: string | null };
  photos: { photoId: string; slotKey: string; caption: string | null }[];
}

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
  const [editId, setEditId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<EditRecord | null>(null);
  const isEdit = editId !== null;
  const keyRef = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const requestedEdit = new URLSearchParams(window.location.search).get("edit");
    setEditId(requestedEdit);
    keyRef.current = window.sessionStorage.getItem("mh02-installation-create-key");
    setLoading(true);
    setError("");
    Promise.all([
      getJson<Reference>("/api/dotnet/reference", controller.signal),
      getDevices(controller.signal),
      getJson<Unit[]>("/api/dotnet/fleet-units?available=true", controller.signal),
      requestedEdit ? getJson<EditRecord>(`/api/dotnet/installations/${encodeURIComponent(requestedEdit)}`, controller.signal) : Promise.resolve(null),
    ]).then(([nextReference, nextDevices, nextUnits, record]) => {
      if (!Array.isArray(nextReference.sites) || !Array.isArray(nextReference.lookups) || !Array.isArray(nextUnits))
        throw new Error("Data referensi tidak valid.");
      setReference(nextReference); setDevices(nextDevices); setUnits(nextUnits);
      setSiteId((previous) => previous || (nextReference.sites.length === 1 ? String(nextReference.sites[0].siteId) : ""));
      if (record) {
        // Edit mode: prefill the form from the stored installation (the Site and form number stay fixed).
        setEditRecord(record); setSiteId(String(record.siteId));
        setDeviceCode(record.devices[0]?.deviceCode ?? ""); setUnitNo(record.unitNo ?? "");
        setStartedAt(record.startedAt.slice(0, 16)); setFinishedAt(record.finishedAt.slice(0, 16));
        setShift(record.shift ?? ""); setGroupLeader(record.groupLeader ?? ""); setRemarks(record.remarks ?? "");
        setSourcePower(record.details.source_power ?? ""); setSpmVersion(record.details.spm_version ?? ""); setArea(record.details.area ?? "");
        setLocationDetail(record.details.location_detail ?? ""); setIpAddress(record.details.ip_address ?? "");
        setIpCpe(record.details.ip_cpe ?? ""); setIpVhms(record.details.ip_vhms ?? "");
      }
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
  // In edit mode the installed device and its Unit are not "available" any more, but they must stay selectable.
  const currentDevice = editRecord?.devices[0];
  const availableDevices: Device[] = [
    ...(editRecord && currentDevice && !devices.some((device) => device.deviceCode === currentDevice.deviceCode)
      ? [{ deviceId: currentDevice.deviceId, deviceCode: currentDevice.deviceCode, serialNumber: currentDevice.serialNumber, siteId: editRecord.siteId }] : []),
    ...devices.filter((device) => String(device.siteId) === siteId),
  ];
  const availableUnits: Unit[] = [
    ...(editRecord?.unitNo && !units.some((unit) => unit.unitNo === editRecord.unitNo)
      ? [{ unitId: "current", unitNo: editRecord.unitNo, siteId: editRecord.siteId, equipmentType: editRecord.equipmentType ?? "", egi: editRecord.details.egi ?? null }] : []),
    ...units.filter((unit) => String(unit.siteId) === siteId),
  ];
  const selectedUnit = availableUnits.find((unit) => unit.unitNo === unitNo && String(unit.siteId) === siteId);
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
    if (!isEdit && photoSlots.some((slot) => slot.required && !photos[slot.key])) {
      setError("Lengkapi foto MH02 terpasang, Node-RED, dan antena GPS."); return;
    }
    if (isEdit && editRecord) {
      // Only the fields that really changed are sent. The server re-validates device, Unit and times as a creation would.
      const original: Record<string, string> = {
        deviceCode: editRecord.devices[0]?.deviceCode ?? "", unitNo: editRecord.unitNo ?? "",
        startedAt: editRecord.startedAt.slice(0, 16), finishedAt: editRecord.finishedAt.slice(0, 16),
        shift: editRecord.shift ?? "", groupLeader: editRecord.groupLeader ?? "", remarks: editRecord.remarks ?? "",
        sourcePower: editRecord.details.source_power ?? "", spmVersion: editRecord.details.spm_version ?? "", area: editRecord.details.area ?? "",
        locationDetail: editRecord.details.location_detail ?? "", ipAddress: editRecord.details.ip_address ?? "",
        ipCpe: editRecord.details.ip_cpe ?? "", ipVhms: editRecord.details.ip_vhms ?? "",
      };
      const next: Record<string, string> = {
        deviceCode, unitNo, startedAt, finishedAt, shift, groupLeader, remarks: remarks.trim(), sourcePower, spmVersion, area,
        locationDetail: locationDetail.trim(), ipAddress: ipAddress.trim(), ipCpe: ipCpe.trim(), ipVhms: ipVhms.trim(),
      };
      const patch: Record<string, string> = {};
      for (const [field, value] of Object.entries(next)) {
        if (value !== original[field] && !(field === "shift" && value === "")) patch[field] = value;
      }
      if (Object.keys(patch).length === 0) { setError("Tidak ada perubahan untuk disimpan."); return; }
      submitting.current = true; setSaving(true); setError("");
      try {
        const response = await fetch(`/api/dotnet/installations/${encodeURIComponent(editRecord.activityId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowVersion: editRecord.rowVersion, ...patch }),
        });
        if (!response.ok) {
          const result: { error?: { code?: string } } | null = await response.json().catch(() => null);
          const messages: Record<string, string> = {
            STALE_VERSION: "Data sudah diubah orang lain. Muat ulang halaman lalu coba lagi.",
            LATER_ACTIVITY_EXISTS: "Tidak dapat diubah: sudah ada aktivitas yang lebih baru pada perangkat ini.",
            DEVICE_ARCHIVED: "Perangkat sudah diarsipkan; instalasi tidak dapat diubah.",
            DEVICE_STATE_CHANGED: "Kondisi perangkat sudah berubah setelah instalasi ini, sehingga tidak dapat dikembalikan dengan aman.",
            DEVICE_NOT_AVAILABLE: "Perangkat yang dipilih tidak berstatus RFU.", DEVICE_NOT_FOUND: "Perangkat tidak ditemukan pada site ini.",
            UNIT_OCCUPIED: "Unit sudah memiliki perangkat.", UNIT_NOT_FOUND: "Unit tidak ditemukan pada site ini.", UNIT_INACTIVE: "Unit tidak aktif.",
            FINISH_BEFORE_START: "Waktu selesai tidak boleh sebelum waktu mulai.", FINISH_IN_FUTURE: "Waktu selesai tidak boleh di masa depan.",
            INVALID_DATETIME: "Format waktu tidak valid atau waktunya ambigu.", SUPERADMIN_ONLY: "Hanya Superadmin yang dapat mengedit instalasi.",
            UNAUTHENTICATED: "Sesi login berakhir. Masuk kembali.", VALIDATION_FAILED: "Periksa kembali data yang diubah.",
            DATABASE_CONSTRAINT: "Database menolak kombinasi data.", CONFLICT: "Data bertabrakan dengan perubahan lain. Muat ulang dan coba lagi.",
            COMMIT_OUTCOME_UNKNOWN: "Hasil penyimpanan belum dapat dipastikan. Muat ulang halaman sebelum mencoba lagi.",
            BACKEND_UNAVAILABLE: "Backend tidak tersedia.", DATABASE_UNAVAILABLE: "Database tidak tersedia.",
          };
          throw new Error(messages[result?.error?.code ?? ""] ?? `Perubahan gagal disimpan (${result?.error?.code ?? response.status}).`);
        }
        router.push(`/operations/installation/${encodeURIComponent(editRecord.activityId)}`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Perubahan belum dapat disimpan.");
      } finally { submitting.current = false; setSaving(false); }
      return;
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

  if (isEdit && currentUser.role !== "superadmin") return <div className="space-y-4 text-sm text-slate-700"><p>Hanya Superadmin yang dapat mengedit instalasi.</p><Link className="text-blue-700" href="/operations/installation">Kembali</Link></div>;
  const backHref = isEdit && editId ? `/operations/installation/${encodeURIComponent(editId)}` : "/operations/installation";

  const sectionClass = "bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4";
  const sectionTitle = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">{icon}<h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{text}</h2></div>
  );
  const inputClass = "w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed";
  const readOnlyClass = "w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium cursor-not-allowed";
  const fieldLabel = "block text-xs font-semibold text-slate-700 mb-1";
  const required = <span className="text-rose-500">*</span>;
  const lookup = (category: string, value: string, set: (next: string) => void, placeholder: string) => (
    <select value={value} onChange={(event) => set(event.target.value)} className={inputClass}>
      <option value="">{placeholder}</option>
      {choices(category).map((entry) => <option key={`${entry.siteId}-${entry.label}`} value={entry.label}>{entry.label}</option>)}
    </select>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/operations/installation" className="hover:text-blue-600 transition flex items-center gap-1 font-medium"><ArrowLeft className="h-3.5 w-3.5" /><span>Riwayat Installation</span></Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">{isEdit ? `Edit Formulir (${editRecord?.formNumber ?? "..."})` : "Formulir Pemasangan Perangkat"}</span>
        </div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"><X className="h-3.5 w-3.5" /><span>Batal (Cancel)</span></Link>
      </div>

      {/* Title card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">Formulir Lapangan • Installation</span>
            {isEdit && <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">Mode Edit (Superadmin)</span>}
            <span className="text-[11px] font-medium text-slate-500">Site: {selectedSite?.name ?? "-"}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-2 flex items-center gap-2.5"><Wrench className="h-6 w-6 text-blue-600" />{isEdit ? "Edit Laporan Pemasangan Perangkat (Installation)" : "Formulir Pemasangan Perangkat (Installation)"}</h1>
          <p className="text-xs text-slate-500 mt-1">Pencatatan pemasangan unit telematika SMARTD DISPLAY pada armada, konfigurasi jaringan, dan dokumentasi foto.</p>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 justify-end"><Lock className="h-3 w-3 text-slate-400" />No. Dokumen Otomatis:</p>
            <p className="text-base font-bold tabular-nums text-blue-600 mt-0.5">{editRecord?.formNumber ?? "Dibuat saat disimpan"}</p>
          </div>
          {reference && <button type="button" disabled={saving || loading} onClick={() => setReload((value) => value + 1)} title="Segarkan referensi" aria-label="Segarkan referensi" className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>}
        </div>
      </div>

      {error && <div role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5"><AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /><span>{error}</span></div>}
      {loading ? <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Memuat data referensi...</p> : !reference ? <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setReload((value) => value + 1)}>Coba lagi</button> : (
        <form onSubmit={submit} className="space-y-6">
          {reference.sites.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Belum ada site yang tersedia untuk akun ini.</p>}
          {!isEdit && siteId && availableDevices.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Tidak ada perangkat RFU pada site ini.</p>}
          {!isEdit && siteId && availableUnits.length === 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Tidak ada unit tersedia pada site ini.</p>}
          <fieldset disabled={saving} className="space-y-6 min-w-0">
            {/* 1 */}
            <div className={sectionClass}>
              {sectionTitle(<Calendar className="h-4 w-4 text-blue-600" />, "1. Informasi Pemasangan & Jadwal")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={fieldLabel}>Site {required}</label>
                  <select required disabled={isEdit} value={siteId} onChange={(event) => { setSiteId(event.target.value); setDeviceCode(""); setUnitNo(""); setArea(""); setGroupLeader(""); setShift(""); setSourcePower(""); setSpmVersion(""); }} className={inputClass}><option value="">Pilih site</option>{reference.sites.map((site) => <option key={site.siteId} value={site.siteId}>{site.name}</option>)}</select></div>
                <div><label className={fieldLabel}>Shift Kerja</label>{lookup("shift", shift, setShift, "-- Pilih Shift --")}</div>
                <div><label className={fieldLabel}>Waktu Mulai {selectedSite?.timeZoneLabel && `(${selectedSite.timeZoneLabel})`} {required}</label><input type="datetime-local" required value={startedAt} onChange={(event) => setStartedAt(event.target.value)} className={inputClass} /></div>
                <div><label className={fieldLabel}>Waktu Selesai {selectedSite?.timeZoneLabel && `(${selectedSite.timeZoneLabel})`} {required}</label><input type="datetime-local" required value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} className={inputClass} /></div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><Clock className="h-4 w-4 text-blue-600" /><span className="font-semibold">Durasi Pengerjaan Otomatis:</span><span className="font-bold tabular-nums text-slate-800">{duration === null ? "-" : `${Math.floor(duration / 60)} jam ${duration % 60} menit`}</span></div>
            </div>

            {/* 2 */}
            <div className={sectionClass}>
              {sectionTitle(<Cpu className="h-4 w-4 text-blue-600" />, "2. Perangkat & Unit")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={fieldLabel}>{isEdit ? "Perangkat" : "Perangkat RFU"} {required}</label>
                  <select required value={deviceCode} disabled={!siteId} onChange={(event) => setDeviceCode(event.target.value)} className={inputClass}><option value="">Pilih perangkat</option>{availableDevices.map((device) => <option key={device.deviceId} value={device.deviceCode}>{device.deviceCode} - {device.serialNumber}</option>)}</select></div>
                <div><label className={fieldLabel}>Unit Number (Nomor Lambung) {required}</label>
                  <select required value={unitNo} disabled={!siteId} onChange={(event) => setUnitNo(event.target.value)} className={inputClass}><option value="">Pilih unit</option>{availableUnits.map((unit) => <option key={unit.unitId} value={unit.unitNo}>{unit.unitNo} - {unit.equipmentType}</option>)}</select></div>
                <div><label className={fieldLabel}>Tipe Alat Berat</label><input readOnly value={selectedUnit?.equipmentType ?? ""} placeholder="Otomatis mengikuti unit" className={readOnlyClass} /></div>
                <div><label className={fieldLabel}>EGI (Model Unit)</label><input readOnly value={selectedUnit?.egi ?? ""} placeholder="Otomatis mengikuti unit" className={readOnlyClass} /></div>
                <div><label className={fieldLabel}>Area</label>{lookup("area", area, setArea, "Pilih area")}</div>
                <div><label className={fieldLabel}>Lokasi Detail</label><input maxLength={200} value={locationDetail} onChange={(event) => setLocationDetail(event.target.value)} className={inputClass} /></div>
              </div>
            </div>

            {/* 3 */}
            <div className={sectionClass}>
              {sectionTitle(<User className="h-4 w-4 text-blue-600" />, "3. Informasi Personel")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={fieldLabel}>Teknisi Pelaksana</label><input readOnly value={`${currentUser.name} (${currentUser.nrp})`} className={readOnlyClass} /></div>
                <div><label className={fieldLabel}>Group Leader (GL) <span className="font-normal text-slate-400">(penanggung jawab)</span></label>{lookup("group_leader", groupLeader, setGroupLeader, "Pilih Group Leader")}</div>
              </div>
            </div>

            {/* 4 */}
            <div className={sectionClass}>
              {sectionTitle(<Network className="h-4 w-4 text-blue-600" />, "4. Konfigurasi & Jaringan")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={fieldLabel}>Source Power</label>{lookup("source_power", sourcePower, setSourcePower, "Pilih source power")}</div>
                <div><label className={fieldLabel}>SPM Version</label>{lookup("spm_version", spmVersion, setSpmVersion, "Pilih versi")}</div>
                <div><label className={fieldLabel}>IP SMARTD</label><input maxLength={45} value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} className={inputClass} /></div>
                <div><label className={fieldLabel}>IP CPE</label><input maxLength={45} value={ipCpe} onChange={(event) => setIpCpe(event.target.value)} className={inputClass} /></div>
                <div><label className={fieldLabel}>IP VHMS</label><input maxLength={45} value={ipVhms} onChange={(event) => setIpVhms(event.target.value)} className={inputClass} /></div>
              </div>
            </div>

            {/* 5 */}
            <div className={sectionClass}>
              {sectionTitle(<FileText className="h-4 w-4 text-blue-600" />, "5. Catatan Teknis (Remarks)")}
              <textarea maxLength={1000} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Catatan kondisi pemasangan, kendala, atau hal yang perlu ditindaklanjuti..." className={inputClass} />
            </div>

            {/* 6 */}
            {isEdit ? (
              <div className={sectionClass}>
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100"><Camera className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">6. Dokumentasi Foto</h2></div>
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Foto tidak dapat diubah dari form edit. Foto yang sudah tersimpan tetap utuh.</p>
                {(editRecord?.photos.length ?? 0) > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{editRecord?.photos.map((photo) => <div key={photo.photoId} className="rounded-lg border border-slate-200 p-2"><img src={`/api/dotnet/photos/${encodeURIComponent(photo.photoId)}`} alt={photo.slotKey} className="h-24 w-full object-contain" /><p className="mt-1 truncate text-[11px] text-slate-500">{photoSlots.find((slot) => slot.key === photo.slotKey)?.label ?? photo.slotKey}</p></div>)}</div>}
              </div>
            ) : (
            <div className={sectionClass}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">6. Dokumentasi Foto Pemasangan (4 Slot)</h2></div>
                <span className="text-[11px] text-slate-400 hidden sm:inline">JPEG / PNG / WebP, maks. 10 MB. Klik thumbnail untuk memperbesar.</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {photoSlots.map((slot, index) => (
                  <div key={slot.key} className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-700">{index + 1}. {slot.label} {slot.required ? required : <span className="font-normal text-slate-400">(opsional)</span>}</p>
                    {previews[slot.key]
                      ? <button type="button" onClick={() => setZoomed(slot.key)} className="relative block h-40 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50" title="Perbesar foto"><img src={previews[slot.key]} alt={slot.label} className="h-full w-full object-contain" /><ZoomIn className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded bg-white/90 p-0.5 text-slate-700" /></button>
                      : <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 text-slate-400"><div className="text-center"><Camera className="mx-auto h-6 w-6" /><p className="mt-1 text-[11px]">Pilih / Unggah Foto</p></div></div>}
                    <div className="flex items-center justify-between gap-2">
                      <label className="relative inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" />{photos[slot.key] ? "Ganti Foto" : "Unggah Foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { choosePhoto(slot.key, event.target.files?.[0]); event.target.value = ""; }} /></label>
                      {photos[slot.key] && <button type="button" title="Hapus foto" aria-label={`Hapus ${slot.label}`} onClick={() => { setPhotos((previous) => ({ ...previous, [slot.key]: null })); setCaptions((previous) => ({ ...previous, [slot.key]: "" })); }} className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    <input maxLength={200} value={captions[slot.key]} onChange={(event) => setCaptions((previous) => ({ ...previous, [slot.key]: event.target.value }))} placeholder="Keterangan foto (opsional)..." className={inputClass} />
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Actions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <Link href={backHref} className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition text-center">Batal (Cancel)</Link>
              <button type="submit" disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"><Save className="h-4 w-4" />{saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Instalasi"}</button>
            </div>
          </fieldset>
        </form>
      )}
      {zoomed && previews[zoomed] && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(null)}><div role="dialog" aria-modal="true" aria-label={photoSlots.find((slot) => slot.key === zoomed)?.label} className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setZoomed(null)} title="Tutup" aria-label="Tutup" className="absolute right-2 top-2 rounded bg-white p-2 text-slate-800"><X className="h-4 w-4" /></button><img src={previews[zoomed]} alt={photoSlots.find((slot) => slot.key === zoomed)?.label} className="max-h-[85vh] max-w-full object-contain" /></div></div>, document.body)}
    </div>
  );
}
