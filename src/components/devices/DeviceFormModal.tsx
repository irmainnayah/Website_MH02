"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { createDevice, newIdempotencyKey, updateDevice, DeviceWriteResult } from "@/lib/device-api";

interface Site { siteId: number; name: string }

export interface EditableDevice {
  internalId: string;
  deviceId: string; // the device code shown in the UI
  serialNumber: string;
  rowVersion: string;
}

interface Props {
  /** null = register a new device; a device = edit its descriptive fields (Super Admin only). */
  device: EditableDevice | null;
  onClose: () => void;
  onSaved: (result: DeviceWriteResult) => void;
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

export default function DeviceFormModal({ device, onClose, onSaved }: Props) {
  const { currentUser } = useAuth();
  const isSuperAdmin = currentUser.role === "superadmin";
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [code, setCode] = useState(device?.deviceId ?? "");
  const [serial, setSerial] = useState(device?.serialNumber ?? "");
  const [notes, setNotes] = useState("");
  const [originalNotes, setOriginalNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(!device);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const key = useRef(newIdempotencyKey());

  // Only a Super Admin chooses the Site; a regular user always registers into their own Site (the server enforces it).
  useEffect(() => {
    if (device || !isSuperAdmin) return;
    const controller = new AbortController();
    fetch("/api/dotnet/reference", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Gagal memuat site."))))
      .then((data: { sites: Site[] }) => setSites(data.sites))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Gagal memuat site."); });
    return () => controller.abort();
  }, [device, isSuperAdmin]);

  // The timeline list does not carry the notes, so an edit loads the current notes first (the saved version token
  // stays the one the page already showed, so a concurrent change is still detected).
  useEffect(() => {
    if (!device) return;
    const controller = new AbortController();
    fetch(`/api/dotnet/devices/${encodeURIComponent(device.internalId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Gagal memuat data device."))))
      .then((data: { notes: string | null }) => { setNotes(data.notes ?? ""); setOriginalNotes(data.notes ?? ""); setNotesLoaded(true); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Gagal memuat data device."); });
    return () => controller.abort();
  }, [device]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, saving]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const trimmedCode = code.trim();
    const trimmedSerial = serial.trim();
    if (!CODE_PATTERN.test(trimmedCode)) { setError("Kode device 1-40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung."); return; }
    if (!trimmedSerial || trimmedSerial.length > 80) { setError("Nomor seri wajib diisi (maksimal 80 karakter)."); return; }
    if (!device && isSuperAdmin && !siteId) { setError("Site wajib dipilih."); return; }
    setSaving(true); setError("");
    try {
      const result = device
        ? await updateDevice(device.internalId, {
            rowVersion: device.rowVersion,
            ...(trimmedCode !== device.deviceId ? { deviceCode: trimmedCode } : {}),
            ...(trimmedSerial !== device.serialNumber ? { serialNumber: trimmedSerial } : {}),
            ...(notes.trim() !== originalNotes.trim() ? { notes: notes.trim() } : {}),
          })
        : await createDevice({ ...(isSuperAdmin ? { siteId: Number(siteId) } : {}), deviceCode: trimmedCode, serialNumber: trimmedSerial, ...(notes.trim() ? { notes: notes.trim() } : {}) }, key.current);
      onSaved(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan device.");
    } finally {
      setSaving(false);
    }
  };

  const title = device ? "Edit Device" : "Tambah Device Baru";
  // Rendered in document.body so the dimmed backdrop covers the whole window (sidebar and top bar included).
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => { if (!saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="device-form-title" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="device-form-title" className="text-base font-bold text-slate-800">{title}</h2>
          <button type="button" title="Tutup" aria-label="Tutup" disabled={saving} onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-800">{error}</p>}
          {!device && (
            <label className="block font-medium text-slate-700">Site
              {isSuperAdmin ? (
                <select required value={siteId} onChange={(event) => setSiteId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <option value="">Pilih site</option>
                  {sites.map((site) => <option key={site.siteId} value={site.siteId}>{site.name}</option>)}
                </select>
              ) : (
                <input readOnly value={currentUser.district} className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600" />
              )}
              <span className="mt-1 block font-normal text-slate-500">Device hanya tampil dan dapat dipakai pada site ini. Site tidak dapat dipindah setelah disimpan.</span>
            </label>
          )}
          <label className="block font-medium text-slate-700">Kode Device
            <input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Contoh: D017" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block font-medium text-slate-700">Nomor Seri
            <input required maxLength={80} value={serial} onChange={(event) => setSerial(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block font-medium text-slate-700">Catatan <span className="font-normal text-slate-400">(opsional)</span>
            <textarea maxLength={500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          {!device && <p className="rounded-lg bg-blue-50 p-2.5 text-blue-800">Status awal selalu <strong>In Stock - RFU</strong>. Device baru menjadi <em>In Use</em> hanya melalui Installation.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700">Batal</button>
            <button type="submit" disabled={saving || !notesLoaded} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
