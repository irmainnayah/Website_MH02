"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Activity, ArrowLeft, Camera, Cpu, ExternalLink, FileText, Pencil, Save, Trash2, User, Wrench, X, ZoomIn } from "lucide-react";
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
  const id = typeof params?.id === "string" ? params.id : "";
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

  const sectionHeading = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">{icon}<h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{text}</h2></div>
  );
  const field = (label: string, value: string | null | undefined, strong = false) => (
    <div key={label} className="min-w-0"><dt className="text-[11px] font-medium text-slate-500">{label}</dt><dd className={`mt-0.5 break-words text-sm ${strong ? "font-bold text-blue-700" : "font-semibold text-slate-800"}`}>{value || "—"}</dd></div>
  );

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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">Aktivitas {TYPE_LABELS[record.type]}</span>
          <span className="text-[11px] font-medium text-slate-500">Site: {record.district}</span>
        </div>
        <h1 className="mt-2 break-words text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">{record.formNumber}{record.unitNo && <><span className="text-slate-300 font-normal">|</span><span className="text-lg text-slate-700">Unit {record.unitNo}</span></>}</h1>
        <p className="mt-1 text-xs text-slate-500">{record.summary}</p>
      </div>
      {editing && <form onSubmit={(event) => { event.preventDefault(); void saveMetadata(); }} className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-bold text-slate-800">Edit Metadata</h2>
        {record.type !== "troubleshoot" && <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Shift<select value={draft.shift} required={record.type !== "installation"} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, shift: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="" disabled>-</option>{Array.from(new Set([record.shift, ...metadataOptions.shifts])).filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Group Leader<select value={draft.groupLeader} required={record.type !== "installation"} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, groupLeader: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="" disabled>-</option>{Array.from(new Set([record.groupLeader, ...metadataOptions.groupLeaders])).filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>}
        <label className="block text-xs font-semibold text-slate-600">Remarks<textarea maxLength={1000} rows={3} value={draft.remarks} disabled={saving} onChange={(event) => setDraft((previous) => ({ ...previous, remarks: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="flex gap-2"><button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan"}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Batal</button></div>
      </form>}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-3">
          {sectionHeading(<Cpu className="h-4 w-4 text-blue-600" />, "1. Informasi Aktivitas")}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field("Unit Number", record.unitNo)}
            {field("Tipe Alat", record.equipmentType)}
            {field("EGI", record.egi)}
            {field("Mulai", `${record.startTime.replace("T", " ")} ${record.timeZoneLabel}`)}
            {field("Selesai", `${record.endTime.replace("T", " ")} ${record.timeZoneLabel}`)}
            {field("Durasi", record.durationFormatted, true)}
          </dl>
        </div>

        <div className="space-y-3">
          {sectionHeading(<User className="h-4 w-4 text-blue-600" />, "2. Personel & Shift")}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field("Teknisi Pelaksana", record.technicianName)}
            {field("NRP Teknisi", record.technicianNrp)}
            {field("Group Leader (GL)", record.groupLeader)}
            {field("Shift", record.shift)}
          </dl>
        </div>

        <div className="space-y-3">
          {sectionHeading(<Wrench className="h-4 w-4 text-blue-600" />, "3. Detail Transaksi")}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(record.details ?? {}).filter(([key, value]) => DETAIL_LABELS[key] && value !== null && value !== "").map(([key, value]) => field(DETAIL_LABELS[key], String(value)))}
          </dl>
        </div>

        <div className="space-y-3">
          {sectionHeading(<Activity className="h-4 w-4 text-blue-600" />, "4. Perubahan Perangkat")}
          <div className="grid grid-cols-1 gap-3">
            {record.devices.map((device) => (
              <div key={`${device.deviceCode}-${device.role}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className="break-words text-sm font-bold text-blue-700">{device.deviceCode}</p><p className="text-[11px] text-slate-500">Serial: {device.serialNumber || "—"}</p></div>
                  <span className="shrink-0 bg-slate-200/80 text-slate-600 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{device.role}</span>
                </div>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {field("Status Sebelum", `${device.beforeStatus} / ${device.beforeUnit || "Tanpa unit"}`)}
                  {field("Status Sesudah", `${device.afterStatus} / ${device.afterUnit || "Tanpa unit"}`)}
                </dl>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {sectionHeading(<FileText className="h-4 w-4 text-blue-600" />, "5. Catatan Teknis (Remarks)")}
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap break-words">{record.remarks || "—"}</p>
        </div>
      </div>

      {record.photos.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Camera className="h-4 w-4 text-blue-600" />Dokumentasi Foto</h2>
              <p className="text-xs text-slate-500 mt-0.5">Klik gambar untuk melihat tampilan resolusi penuh (Lightbox).</p>
            </div>
            <span className="text-xs tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">{record.photos.length} Foto Terlampir</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {record.photos.map((item, index) => {
              const title = PHOTO_LABELS[item.slot] ?? item.slot;
              return (
                <div key={item.photoId} className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-xs text-slate-800 line-clamp-1">{index + 1}. {title}</h3>
                    <span className="shrink-0 bg-slate-200/80 text-slate-600 tabular-nums text-[10px] px-2 py-0.5 rounded font-bold">SLOT {index + 1}</span>
                  </div>
                  <div onClick={() => setPhoto(item)} className="h-48 bg-slate-900 cursor-pointer relative overflow-hidden rounded-lg flex items-center justify-center border border-slate-200" title={`Klik untuk memperbesar ${title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={title} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 select-none" />
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-semibold text-xs"><ZoomIn className="h-4 w-4" /><span>Perbesar Foto</span></div>
                  </div>
                  <div className="space-y-2 pt-1 flex-1 flex flex-col justify-between">
                    <div>{item.caption?.trim() ? <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-slate-600">{item.caption}</p> : null}</div>
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-blue-600 font-semibold">
                      <button type="button" onClick={() => setPhoto(item)} className="flex items-center gap-1 hover:underline cursor-pointer"><ZoomIn className="h-3 w-3" />Klik untuk Zoom</button>
                      <span className="text-slate-400 font-normal">HD Preview</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {confirmDelete && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="activity-delete-title" className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"><h2 id="activity-delete-title" className="text-base font-bold text-slate-900">Hapus {record.formNumber}?</h2><p className="text-sm text-slate-600">Transaksi asal ikut dihapus. Status perangkat dan riwayat akan diperiksa sebelum operasi diproses.</p><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">Batal</button><button type="button" disabled={saving || countdown > 0} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{saving ? "Menghapus..." : countdown > 0 ? `Hapus (${countdown})` : "Hapus Transaksi"}</button></div></div></div>, document.body)}
      {photo && createPortal(<div role="dialog" aria-modal="true" aria-label={PHOTO_LABELS[photo.slot] ?? photo.slot} className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4" onClick={() => setPhoto(null)}><button type="button" title="Tutup" aria-label="Tutup foto" onClick={() => setPhoto(null)} className="absolute right-4 top-4 rounded bg-white p-2"><X className="h-5 w-5" /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={PHOTO_LABELS[photo.slot] ?? photo.slot} className="max-h-[90vh] max-w-full object-contain" onClick={(event) => event.stopPropagation()} /></div>, document.body)}
    </div>
  );
}