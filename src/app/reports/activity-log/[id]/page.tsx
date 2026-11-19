"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil, Save, Trash2, X, ZoomIn } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { ActivityLogDetail, ActivityMetadata, deleteActivity, getActivity, getActivityMetadataOptions, updateActivityMetadata } from "@/lib/activity-log-api";

const TYPE_LABELS = { installation: "Installation", replacement: "Replacement", removal: "Removal", troubleshoot: "Troubleshoot" };
const DETAIL_LABELS: Record<string, string> = {
  source_power: "Source Power", spm_version: "SPM Version", area: "Area", location_detail: "Lokasi",
  ip_address: "IP SMARTD DISPLAY", ip_cpe: "IP CPE", ip_vhms: "IP VHMS", notes: "Catatan pemasangan",
  reason: "Alasan pelepasan", reason_detail: "Detail alasan", component_type: "Komponen", issue: "Issue",
  action_taken: "Action Taken", health_check_result: "Hasil pada laporan", egi: "EGI",
};
const PHOTO_LABELS: Record<string, string> = {
  mh02_installed: "Perangkat terpasang", mh02_new_installed: "Perangkat baru terpasang", mh02_old_removed: "Perangkat lama dilepas",
  camera_dashboard_angle: "Posisi kamera", nodered_config: "Konfigurasi Node-RED", gps_antenna: "Antena GPS",
  before_device: "Sebelum pelepasan", component_set: "Komponen yang dilepas", before_repair: "Sebelum perbaikan", after_repair: "Sesudah perbaikan",
};

export default function ActivityLogDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { currentUser } = useAuth();
  const [record, setRecord] = useState<ActivityLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ActivityMetadata>({ remarks: "", shift: "", groupLeader: "" });
  const [metadataOptions, setMetadataOptions] = useState<{ shifts: string[]; groupLeaders: string[] }>({ shifts: [], groupLeaders: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [photo, setPhoto] = useState<ActivityLogDetail["photos"][number] | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setRecord(null); setError(null); setEditing(false);
    getActivity(id).then((result) => {
      if (!active) return;
      setRecord(result); setDraft({ remarks: result.remarks, shift: result.shift, groupLeader: result.groupLeader });
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Gagal memuat aktivitas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setInterval(() => setCountdown((previous) => Math.max(0, previous - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [confirmDelete]);
  useEffect(() => {
    if (!confirmDelete && !photo) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) { setPhoto(null); setConfirmDelete(false); } };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [confirmDelete, photo, saving]);

  async function beginEdit() {
    if (!record || saving || currentUser.role !== "superadmin") return;
    if (editing) { setEditing(false); return; }
    setSaving(true); setError(null);
    try {
      if (record.type !== "troubleshoot") setMetadataOptions(await getActivityMetadataOptions(record.siteId));
      setDraft({ remarks: record.remarks, shift: record.shift, groupLeader: record.groupLeader }); setEditing(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Gagal memuat opsi metadata."); }
    finally { setSaving(false); }
  }
  async function saveMetadata() {
    if (!record || saving || currentUser.role !== "superadmin") return;
    setSaving(true); setError(null);
    try {
      await updateActivityMetadata(record, draft);
      const updated = await getActivity(record.activityId);
      setRecord(updated); setEditing(false); setDraft({ remarks: updated.remarks, shift: updated.shift, groupLeader: updated.groupLeader });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Gagal menyimpan aktivitas."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!record || saving || countdown > 0 || currentUser.role !== "superadmin") return;
    setSaving(true); setError(null);
    try { await deleteActivity(record.activityId); router.push("/reports/activity-log"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Gagal menghapus aktivitas."); setConfirmDelete(false); setSaving(false); }
  }

  if (loading) return <div role="status" className="mx-auto max-w-5xl py-12 text-center text-sm text-slate-500">Memuat detail aktivitas...</div>;
  if (!record) return <div className="mx-auto max-w-5xl space-y-4 py-8"><Link href="/reports/activity-log" className="text-sm font-semibold text-blue-700">Kembali ke Activity Log</Link><p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error ?? "Aktivitas tidak ditemukan."}</p></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/reports/activity-log" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> Activity Log</Link>
        <div className="flex flex-wrap gap-2">
          <Link href={record.transactionPath} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><ExternalLink className="h-4 w-4" /> Transaksi Asal</Link>
          {currentUser.role === "superadmin" && <>
            {record.editPath && <Link href={record.editPath} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><Pencil className="h-4 w-4" /> Edit Transaksi</Link>}
            <button type="button" disabled={saving} onClick={() => void beginEdit()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><Pencil className="h-4 w-4" /> Edit Metadata</button>
            <button type="button" disabled={saving} onClick={() => { setCountdown(5); setConfirmDelete(true); }} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"><Trash2 className="h-4 w-4" /> Hapus</button>
          </>}
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase text-slate-500">{TYPE_LABELS[record.type]} / {record.district}</p>
        <h1 className="mt-2 break-words text-2xl font-bold text-slate-900">{record.formNumber}</h1>
        <p className="mt-2 text-sm text-slate-600">{record.summary}</p>
      </header>
      {editing && <form onSubmit={(event) => { event.preventDefault(); void saveMetadata(); }} className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-bold text-slate-800">Edit Metadata</h2>
        {record.type !== "troubleshoot" && <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Shift<select value={draft.shift} required={record.type !== "installation"} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, shift: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="" disabled>-</option>{Array.from(new Set([record.shift, ...metadataOptions.shifts])).filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Group Leader<select value={draft.groupLeader} required={record.type !== "installation"} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, groupLeader: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="" disabled>-</option>{Array.from(new Set([record.groupLeader, ...metadataOptions.groupLeaders])).filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>}
        <label className="block text-xs font-semibold text-slate-600">Remarks<textarea maxLength={1000} rows={3} value={draft.remarks} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, remarks: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="flex gap-2"><button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan"}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Batal</button></div>
      </form>}
      <section className="space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Informasi Aktivitas</h2>
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[["Unit Number", record.unitNo || "-"], ["Tipe Alat", record.equipmentType || "-"], ["EGI", record.egi || "-"], ["Mulai", `${record.startTime.replace("T", " ")} ${record.timeZoneLabel}`], ["Selesai", `${record.endTime.replace("T", " ")} ${record.timeZoneLabel}`], ["Durasi", record.durationFormatted], ["Teknisi", record.technicianName || "-"], ["NRP", record.technicianNrp || "-"], ["Group Leader", record.groupLeader || "-"], ["Shift", record.shift || "-"]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{value}</dd></div>)}
        </dl>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{record.remarks || "-"}</p>
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-bold text-slate-800">Detail Transaksi</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">{Object.entries(record.details ?? {}).filter(([key, value]) => DETAIL_LABELS[key] && value !== null && value !== "").map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs text-slate-500">{DETAIL_LABELS[key]}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-800">{String(value)}</dd></div>)}</dl>
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-bold text-slate-800">Perubahan Perangkat</h2>
        {record.devices.map((device) => <div key={`${device.deviceCode}-${device.role}`} className="space-y-2 border-b border-slate-100 pb-4">
          <h3 className="break-words text-sm font-semibold text-slate-800">{device.deviceCode} <span className="text-xs font-normal text-slate-500">({device.role})</span></h3>
          <p className="text-xs text-slate-500">{device.serialNumber}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Status Sebelum</dt><dd>{device.beforeStatus} / {device.beforeUnit || "Tanpa unit"}</dd></div><div><dt className="text-xs text-slate-500">Status Sesudah</dt><dd>{device.afterStatus} / {device.afterUnit || "Tanpa unit"}</dd></div></dl>
        </div>)}
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-bold text-slate-800">Dokumentasi Foto</h2>
        {record.photos.length === 0 ? <p className="text-sm text-slate-500">Tidak ada foto tersimpan.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{record.photos.map((item) => <figure key={item.photoId} className="min-w-0">
          <button type="button" onClick={() => setPhoto(item)} title="Perbesar foto" className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={PHOTO_LABELS[item.slot] ?? item.slot} className="h-full w-full object-contain" /><ZoomIn className="absolute bottom-2 right-2 h-5 w-5 rounded bg-white text-slate-700" />
          </button><figcaption className="mt-2 text-xs text-slate-600"><strong>{PHOTO_LABELS[item.slot] ?? item.slot}</strong>{item.caption && <p className="mt-1 whitespace-pre-wrap break-words">{item.caption}</p>}</figcaption>
        </figure>)}</div>}
      </section>
      {confirmDelete && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="activity-delete-title" className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"><h2 id="activity-delete-title" className="text-base font-bold text-slate-900">Hapus {record.formNumber}?</h2><p className="text-sm text-slate-600">Transaksi asal ikut dihapus. Status perangkat dan riwayat akan diperiksa sebelum operasi diproses.</p><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Batal</button><button type="button" disabled={saving || countdown > 0} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{saving ? "Menghapus..." : countdown > 0 ? `Hapus (${countdown})` : "Hapus Transaksi"}</button></div></div></div>, document.body)}
      {photo && createPortal(<div role="dialog" aria-modal="true" aria-label={PHOTO_LABELS[photo.slot] ?? photo.slot} className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4" onClick={() => setPhoto(null)}><button type="button" title="Tutup" aria-label="Tutup foto" onClick={() => setPhoto(null)} className="absolute right-4 top-4 rounded bg-white p-2"><X className="h-5 w-5" /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={PHOTO_LABELS[photo.slot] ?? photo.slot} className="max-h-[90vh] max-w-full object-contain" onClick={(event) => event.stopPropagation()} /></div>, document.body)}
    </div>
  );
}