"use client";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Edit2, Plus, Power, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";

type Role = "superadmin" | "user";
type Status = "active" | "inactive";
interface User {
  userId: string;
  nrp: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  siteId: number | null;
  siteName: string | null;
  status: Status;
  lastLoginAt: string | null;
  createdAt: string | null;
}
interface Site { siteId: number; name: string }
interface UserPage { items: User[]; total: number; page: number; pageSize: number }
interface FormData { nrp: string; name: string; email: string; phone: string; role: Role; siteId: string; status: Status }
const emptyForm: FormData = { nrp: "", name: "", email: "", phone: "", role: "user", siteId: "", status: "active" };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<string, string> = {
      UNAUTHENTICATED: "Sesi login diperlukan.", SUPERADMIN_ONLY: "Hanya Superadmin yang dapat mengelola pengguna.",
      NRP_EXISTS: "NRP sudah terdaftar.", LAST_SUPERADMIN: "Superadmin aktif terakhir tidak dapat dinonaktifkan.",
      SELF_CHANGE_FORBIDDEN: "Role, site, dan status akun sendiri tidak dapat diubah.",
      SITE_INACTIVE: "Site tidak tersedia atau sudah nonaktif.", VALIDATION_FAILED: "Periksa kembali data pengguna.",
      BACKEND_UNAVAILABLE: "Backend tidak tersedia.", DATABASE_UNAVAILABLE: "Database tidak tersedia.",
    };
    throw new Error(messages[data?.error?.code] ?? "Permintaan gagal. Silakan coba lagi.");
  }
  return data as T;
}

export default function UserManagementApi() {
  const { currentUser, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);

  const parameters = useCallback((requestedPage: number, size: number) => {
    const query = new URLSearchParams({ page: String(requestedPage), pageSize: String(size) });
    if (search.trim()) query.set("q", search.trim());
    if (role) query.set("role", role);
    if (site) query.set("siteId", site);
    if (status) query.set("status", status);
    return query;
  }, [search, role, site, status]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== "superadmin") { setUsers([]); setTotal(0); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    request<UserPage>(`/api/dotnet/users?${parameters(page, pageSize)}`, { signal: controller.signal })
      .then((result) => { setUsers(result.items); setTotal(result.total); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setUsers([]); setTotal(0); setError(reason instanceof Error ? reason.message : "Gagal memuat pengguna."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isAuthenticated, currentUser.role, page, pageSize, parameters, refresh]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== "superadmin") { setSites([]); return; }
    const controller = new AbortController();
    request<{ sites: Site[] }>("/api/dotnet/reference", { signal: controller.signal })
      .then((data) => setSites(data.sites))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Gagal memuat site."); });
    return () => controller.abort();
  }, [isAuthenticated, currentUser.role]);

  const openForm = (user?: User) => {
    setEditing(user ?? null);
    setForm(user ? { nrp: user.nrp, name: user.name, email: user.email ?? "", phone: user.phone ?? "", role: user.role, siteId: user.siteId?.toString() ?? "", status: user.status } : emptyForm);
    setError("");
    setFormOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!editing && !/^[A-Za-z0-9._-]{3,29}$/.test(form.nrp.trim())) { setError("NRP harus 3-29 karakter berupa huruf, angka, titik, garis bawah, atau tanda hubung."); return; }
    if (form.role === "user" && !form.siteId) { setError("Site wajib dipilih untuk pengguna."); return; }
    const common = { name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, role: form.role, siteId: form.siteId ? Number(form.siteId) : null };
    const body = editing ? { ...common, status: form.status } : { ...common, nrp: form.nrp.trim() };
    setSaving(true); setError(""); setMessage("");
    try {
      await request(`/api/dotnet/users${editing ? `/${editing.userId}` : ""}`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setFormOpen(false); setForm(emptyForm); setMessage(editing ? "Pengguna diperbarui." : "Pengguna ditambahkan."); setRefresh((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menyimpan pengguna."); }
    finally { setSaving(false); }
  };

  const deactivate = async (user: User) => {
    if (!window.confirm(`Nonaktifkan akun ${user.name}?`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await request(`/api/dotnet/users/${user.userId}`, { method: "DELETE" });
      setMessage("Akun dinonaktifkan."); setRefresh((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menonaktifkan akun."); }
    finally { setSaving(false); }
  };

  const exportCsv = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) { setError("Tanggal mulai tidak boleh melebihi tanggal selesai."); return; }
    setExporting(true); setError("");
    try {
      const all: User[] = [];
      let requestedPage = 1;
      let expected: number;
      do {
        const result = await request<UserPage>(`/api/dotnet/users?${parameters(requestedPage, 100)}`);
        all.push(...result.items); expected = result.total; requestedPage++;
        if (result.items.length === 0) break;
      } while (all.length < expected);
      const selected = all.filter((user) => {
        const date = user.createdAt?.slice(0, 10);
        return (!dateFrom && !dateTo) || (date && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo));
      });
      const csvCell = (value: string | null) => {
        const text = value ?? "";
        const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const rows = [["NRP", "Nama", "Email", "Telepon", "Role", "Site", "Status", "Dibuat"], ...selected.map((user) => [user.nrp, user.name, user.email, user.phone, user.role, user.siteName, user.status, user.createdAt])];
      const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "pengguna.csv"; link.click(); URL.revokeObjectURL(url);
      setMessage(`${selected.length} pengguna diekspor.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal mengekspor pengguna."); }
    finally { setExporting(false); }
  };

  if (!isAuthenticated) return <div className="p-6 text-sm text-slate-700">Sesi login diperlukan. <Link className="text-blue-700 underline" href="/login">Login</Link></div>;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const self = editing?.nrp === currentUser.nrp;

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-800">User Management (RBAC)</h1><p className="text-xs text-slate-500 mt-1">{total} pengguna</p></div>
        <button type="button" onClick={() => openForm()} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" />Tambah Pengguna</button>
      </div>
      {message && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && !formOpen && <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-4 space-y-3 border-b border-slate-200 bg-slate-50/50">
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Cari pengguna" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={80} placeholder="Cari nama, NRP, email" className="min-w-52 flex-1 border border-slate-300 rounded px-3 py-2 text-xs" />
          <select aria-label="Filter role" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} className="border border-slate-300 rounded px-2 py-2 text-xs"><option value="">Semua Role</option><option value="superadmin">Superadmin</option><option value="user">User</option></select>
          <select aria-label="Filter site" value={site} onChange={(event) => { setSite(event.target.value); setPage(1); }} className="border border-slate-300 rounded px-2 py-2 text-xs"><option value="">Semua Site</option>{sites.map((entry) => <option key={entry.siteId} value={entry.siteId}>{entry.name}</option>)}</select>
          <select aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="border border-slate-300 rounded px-2 py-2 text-xs"><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select>
          <button type="button" title="Reset filter" aria-label="Reset filter" onClick={() => { setSearch(""); setRole(""); setSite(""); setStatus(""); setPage(1); }} className="p-2 rounded border border-slate-300"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Calendar className="h-3.5 w-3.5 text-slate-400" /><span>Rentang Tanggal (tanggal dibuat):</span></span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm"><span className="text-[11px] text-slate-400">Dari:</span><input type="date" aria-label="Tanggal dibuat dari" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium" /></div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm"><span className="text-[11px] text-slate-400">Sampai:</span><input type="date" aria-label="Tanggal dibuat sampai" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="text-xs text-slate-700 bg-transparent focus:outline-none font-medium" /></div>
            {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded transition font-medium" title="Bersihkan filter tanggal">Clear Tanggal</button>}
            <button type="button" disabled={exporting} onClick={() => void exportCsv()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"><Download className="h-4 w-4 text-slate-500" />Ekspor CSV</button>
          </div>
        </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-700"><tr>{["Pengguna", "NRP", "Role", "Site", "Status", "Login Terakhir", "Aksi"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200">{loading ? <tr><td colSpan={7} className="p-6 text-center">Memuat...</td></tr> : users.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">Tidak ada pengguna.</td></tr> : users.map((user) => <tr key={user.userId}>
            <td className="px-4 py-3"><strong>{user.name}</strong><div className="text-slate-500">{user.email ?? "-"}</div></td><td className="px-4 py-3">{user.nrp}</td><td className="px-4 py-3">{user.role}</td><td className="px-4 py-3">{user.siteName ?? "-"}</td><td className="px-4 py-3">{user.status === "active" ? "Aktif" : "Nonaktif"}</td><td className="px-4 py-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("id-ID") : "-"}</td>
            <td className="px-4 py-3 whitespace-nowrap"><button type="button" title="Edit pengguna" aria-label={`Edit ${user.name}`} onClick={() => openForm(user)} className="p-2 text-blue-700"><Edit2 className="h-4 w-4" /></button><button type="button" title="Nonaktifkan pengguna" aria-label={`Nonaktifkan ${user.name}`} disabled={saving || user.status === "inactive" || user.nrp === currentUser.nrp} onClick={() => void deactivate(user)} className="p-2 text-rose-700 disabled:opacity-30"><Power className="h-4 w-4" /></button></td>
          </tr>)}</tbody></table></div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Baris per halaman:</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500">{[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <span>Menampilkan <strong className="text-slate-800">{users.length}</strong> dari <strong className="text-slate-800">{total}</strong> data</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(1)} disabled={page <= 1} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium" title="Halaman Pertama"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium" title="Halaman Sebelumnya"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="px-3 py-1 font-semibold text-slate-700">{page} / {pages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium" title="Halaman Selanjutnya"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setPage(pages)} disabled={page >= pages} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium" title="Halaman Terakhir"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
      {formOpen && createPortal(<div className="fixed inset-0 z-[120] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => { if (!saving) setFormOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="user-form-title" onClick={(event) => event.stopPropagation()} className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg p-5"><div className="flex justify-between items-center"><h2 id="user-form-title" className="font-bold text-slate-800">{editing ? "Edit Pengguna" : "Tambah Pengguna"}</h2><button type="button" title="Tutup" aria-label="Tutup" disabled={saving} onClick={() => setFormOpen(false)}><X className="h-4 w-4" /></button></div>
        <form onSubmit={save} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">{error && <p role="alert" className="sm:col-span-2 text-rose-700">{error}</p>}
          <label>Nama<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="block w-full mt-1 border rounded p-2" /></label><label>NRP<input required maxLength={29} disabled={!!editing} value={form.nrp} onChange={(event) => setForm({ ...form, nrp: event.target.value })} className="block w-full mt-1 border rounded p-2 disabled:bg-slate-100" /></label>
          <label>Email<input type="email" maxLength={150} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="block w-full mt-1 border rounded p-2" /></label><label>Telepon<input maxLength={30} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="block w-full mt-1 border rounded p-2" /></label>
          <label>Role<select disabled={self} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })} className="block w-full mt-1 border rounded p-2 disabled:bg-slate-100"><option value="user">User</option><option value="superadmin">Superadmin</option></select></label><label>Site<select disabled={self} value={form.siteId} onChange={(event) => setForm({ ...form, siteId: event.target.value })} className="block w-full mt-1 border rounded p-2 disabled:bg-slate-100"><option value="">Tanpa site</option>{sites.map((entry) => <option key={entry.siteId} value={entry.siteId}>{entry.name}</option>)}</select></label>
          {editing && <label>Status<select disabled={self} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Status })} className="block w-full mt-1 border rounded p-2 disabled:bg-slate-100"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2"><button type="button" disabled={saving} onClick={() => setFormOpen(false)} className="border rounded px-3 py-2">Batal</button><button type="submit" disabled={saving} className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-40">{saving ? "Menyimpan..." : "Simpan"}</button></div>
        </form></div></div>, document.body)}
    </div>
  );
}