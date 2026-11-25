"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  FileText,
  Filter,
  RotateCcw,
  Search,
  X,
  Eye,
} from "lucide-react";
import {
  AuditLogEntry,
  AuditLogOperation,
  AuditLogTable,
  auditDate,
  auditTimestamp,
  getAuditEntry,
  getAuditLogs,
} from "@/lib/audit-log-api";

type AuditVal = Parameters<typeof JSON.stringify>[0];
const asRecord = (value: AuditVal): Record<string, AuditVal> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, AuditVal>) : null);
const normalizeKey = (key: string): string => key.replace(/[_\s-]/g, "").toLowerCase();
const NOISE_KEYS = new Set(["id", "rowversion", "updatedat", "updatedby", "createdat", "createdby", "sha256"]);
const compactItem = (item: AuditVal): string => {
  const record = asRecord(item);
  if (!record) return String(item);
  const slot = record.Slot ?? record.slot;
  const caption = record.Caption ?? record.caption;
  return slot ? `${slot}${caption ? ` (${caption})` : ""}` : JSON.stringify(record);
};
const showValue = (value: AuditVal): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length === 0 ? "(kosong)" : value.map(compactItem).join(", ");
  return String(value);
};
// Flattens a snapshot to { field name -> value }. Nested objects are walked, so only the field name (the last part of the
// path) is kept; arrays (photos) are summarised. The "before" and "after" snapshots of some transactions have different
// shapes, so fields are matched by name, not by position.
function flatten(value: AuditVal, out: Map<string, { label: string; value: AuditVal }> = new Map()): Map<string, { label: string; value: AuditVal }> {
  const record = asRecord(value);
  if (!record) return out;
  for (const [key, child] of Object.entries(record)) {
    if (asRecord(child)) flatten(child, out);
    else if (!NOISE_KEYS.has(normalizeKey(key)) && !out.has(normalizeKey(key))) out.set(normalizeKey(key), { label: key, value: child });
  }
  return out;
}
function summarizeChanges(before: AuditVal, after: AuditVal): { field: string; before: string; after: string }[] {
  const oldFields = flatten(before), newFields = flatten(after);
  const oneSided = !asRecord(before) || !asRecord(after);
  const rows: { field: string; before: string; after: string }[] = [];
  for (const key of new Set([...oldFields.keys(), ...newFields.keys()])) {
    const oldItem = oldFields.get(key), newItem = newFields.get(key);
    if (!oneSided && (!oldItem || !newItem)) continue; // present on one side only: the snapshot shapes differ, so it is not a change
    const oldText = showValue(oldItem?.value ?? null), newText = showValue(newItem?.value ?? null);
    if (!oneSided && oldText === newText) continue;
    rows.push({ field: (oldItem ?? newItem)!.label, before: oldText, after: newText });
  }
  return rows;
}

const TABLE_LABELS: Record<AuditLogTable, string> = {
  installation: "Installation",
  replacement: "Replacement",
  removal: "Removal",
  troubleshoot: "Troubleshoot",
  device: "Device",
  user_management: "User Management",
};

const FILTER_COLUMNS = [
  { key: "timestamp", label: "Timestamp" }, { key: "table", label: "Table" }, { key: "operation", label: "Operation" },
  { key: "recordId", label: "Record ID" }, { key: "changedBy", label: "Changed By" }, { key: "ipAddress", label: "IP Address" },
  { key: "action", label: "Action" }, { key: "siteName", label: "Site" },
] as const;
type FilterColumn = typeof FILTER_COLUMNS[number]["key"];

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(null); setEntries([]);
    getAuditLogs().then((items) => { if (active) setEntries(items); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Gagal memuat Audit Log."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setSelectedEntry(null); setDetailError(null);
    getAuditEntry(selectedId).then((entry) => { if (active) setSelectedEntry(entry); })
      .catch((error: unknown) => { if (active) setDetailError(error instanceof Error ? error.message : "Gagal memuat detail audit."); });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", close);
    return () => { active = false; document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [selectedId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState<AuditLogTable | "all">("all");
  const [operationFilter, setOperationFilter] = useState<AuditLogOperation | "all">("all");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterColumn, string>>>({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const tableOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.table))),
    [entries]
  );
  const operationOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.operation))),
    [entries]
  );
  const dateError = Boolean(startDate && endDate && startDate > endDate);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      for (const column of FILTER_COLUMNS) {
        if (columnFilters[column.key] && String(entry[column.key] ?? "") !== columnFilters[column.key]) return false;
      }
      if (query) {
        const searchableValues = [
          entry.recordId,
          TABLE_LABELS[entry.table],
          entry.table,
          entry.operation,
          entry.changedBy ?? "Tidak tersedia",
          entry.ipAddress ?? "Tidak tersedia",
          entry.action,
          entry.siteName ?? "",
          entry.requestId ?? "",
          entry.changeGroupId,
          entry.reason ?? "",
        ];
        if (!searchableValues.some((value) => value.toLocaleLowerCase().includes(query))) return false;
      }
      if (tableFilter !== "all" && entry.table !== tableFilter) return false;
      if (operationFilter !== "all" && entry.operation !== operationFilter) return false;
      const entryDate = auditDate(entry.timestamp);
      if (startDate && entryDate < startDate) return false;
      if (endDate && entryDate > endDate) return false;
      return true;
    });
  }, [entries, searchQuery, tableFilter, operationFilter, startDate, endDate, columnFilters]);

  const totalItems = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEntries = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, safeCurrentPage, pageSize]);
  const isFiltered = Boolean(
    searchQuery.trim() || tableFilter !== "all" || operationFilter !== "all" || startDate || endDate || Object.values(columnFilters).some(Boolean)
  );

  const resetFilters = () => {
    setSearchQuery("");
    setTableFilter("all");
    setOperationFilter("all");
    setColumnFilters({});
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const exportCsv = () => {
    if (dateError || filteredEntries.length === 0) return;
    const headers = ["Audit ID", "Timestamp UTC", "Table", "Operation", "Record ID", "Changed By", "IP Address", "Action", "Site", "Change Group", "Request ID", "Reason"];
    const escapeCsv = (value: string | number | undefined | null) => {
      const text = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = filteredEntries.map((entry) => [
      entry.auditId,
      auditTimestamp(entry.timestamp),
      TABLE_LABELS[entry.table],
      entry.operation,
      entry.recordId,
      entry.changedBy ?? "Tidak tersedia",
      entry.ipAddress ?? "Tidak tersedia",
      entry.action,
      entry.siteName ?? "Global / tidak tercatat",
      entry.changeGroupId,
      entry.requestId,
      entry.reason,
    ]);
    const csv = "\uFEFF" + [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartd_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {(loading || loadError) && <div role={loadError ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${loadError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{loadError ?? "Memuat Audit Log..."}</div>}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Audit Logs</h1>
          <p className="mt-1 text-xs text-slate-500">
            Riwayat perubahan data tersimpan.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5" /> UTC
        </span>
      </div>

      <div className="flex justify-end"><button type="button" title="Muat ulang" aria-label="Muat ulang Audit Log" disabled={loading} onClick={() => setRefresh((previous) => previous + 1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button></div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }}
                placeholder="Cari Record ID, Table, Operation..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setCurrentPage(1); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Filter className="h-3.5 w-3.5" /> Filter:</span>
              <select value={tableFilter} onChange={(event) => { setTableFilter(event.target.value as AuditLogTable | "all"); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                <option value="all">Semua Table</option>
                {tableOptions.map((table) => <option key={table} value={table}>{TABLE_LABELS[table]}</option>)}
              </select>
              <select value={operationFilter} onChange={(event) => { setOperationFilter(event.target.value as AuditLogOperation | "all"); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                <option value="all">Semua Operation</option>
                {operationOptions.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Calendar className="h-3.5 w-3.5" /> Rentang Tanggal:</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">Dari:<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setCurrentPage(1); }} className="bg-transparent text-xs text-slate-700" /></label>
              <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-400">Sampai:<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setCurrentPage(1); }} className="bg-transparent text-xs text-slate-700" /></label>
              {(startDate || endDate) && <button type="button" onClick={() => { setStartDate(""); setEndDate(""); setCurrentPage(1); }} className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60">Clear Tanggal</button>}
              {isFiltered && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"><RotateCcw className="h-3 w-3" /> Reset Filter</button>}
              <button type="button" onClick={exportCsv} disabled={dateError || filteredEntries.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Ekspor CSV</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 font-semibold tracking-wide text-slate-700">
                <th className="whitespace-nowrap px-4 py-3">Timestamp</th>
                <th className="whitespace-nowrap px-4 py-3">Table</th>
                <th className="whitespace-nowrap px-4 py-3">Operation</th>
                <th className="whitespace-nowrap px-4 py-3">Record ID</th>
                <th className="whitespace-nowrap px-4 py-3">Changed By</th>
                <th className="whitespace-nowrap px-4 py-3">IP Address</th>
                <th className="whitespace-nowrap px-4 py-3">Action</th>
                <th className="whitespace-nowrap px-4 py-3">Site</th>
                <th className="whitespace-nowrap px-4 py-3">Detail</th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50">
                {FILTER_COLUMNS.map((column) => <th key={column.key} className="px-4 pb-2 font-normal"><select aria-label={`Filter ${column.label}`} value={columnFilters[column.key] ?? ""} onChange={(event) => { setColumnFilters((previous) => ({ ...previous, [column.key]: event.target.value })); setCurrentPage(1); }} className="w-full max-w-40 rounded border border-slate-200 bg-white px-1 py-1 text-[11px] font-normal text-slate-600"><option value="">Semua</option>{Array.from(new Set(entries.map((entry) => String(entry[column.key] ?? "")))).filter(Boolean).sort().map((value) => <option key={value} value={value}>{column.key === "table" ? TABLE_LABELS[value as AuditLogTable] : column.key === "timestamp" ? auditTimestamp(value) : value}</option>)}</select></th>)}
                <th className="px-4 pb-2"><button type="button" title="Clear Filter" aria-label="Clear Filter" onClick={resetFilters} className="rounded p-1 text-slate-500"><RotateCcw className="h-3.5 w-3.5" /></button></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileText className="h-6 w-6" /></div>
                    <p className="text-sm font-semibold text-slate-700">{loading ? "Memuat Audit Log..." : loadError ? "Audit Log belum dapat dimuat" : entries.length ? "Tidak ada aksi yang sesuai" : "Belum ada audit tercatat"}</p>
                    <p className="mt-1 text-xs text-slate-400">{!loading && !loadError && entries.length ? "Tidak ada entri yang cocok dengan filter." : ""}</p>
                    {isFiltered && <button type="button" onClick={resetFilters} className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Reset Filter</button>}
                  </td>
                </tr>
              ) : paginatedEntries.map((entry) => {
                const recordHref = entry.recordPath;
                return (
                  <tr key={entry.entryId} className="transition-colors hover:bg-slate-50/75">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{auditTimestamp(entry.timestamp)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{TABLE_LABELS[entry.table]}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">{entry.operation}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-blue-700">{recordHref ? <Link href={recordHref} className="inline-flex items-center gap-1 hover:underline">{entry.recordId}<ArrowUpRight className="h-3 w-3" /></Link> : entry.recordId}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{entry.changedBy ?? "Tidak tersedia"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">{entry.ipAddress ?? "Tidak tersedia"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{entry.action}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{entry.siteName ?? "Global / tidak tercatat"}</td>
                    <td className="whitespace-nowrap px-4 py-3"><button type="button" title={`Detail audit ${entry.auditId}`} aria-label={`Detail audit ${entry.auditId}`} onClick={() => setSelectedId(entry.auditId)} className="rounded border border-slate-200 p-1.5 text-blue-700"><Eye className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Baris per halaman:</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="rounded border border-slate-300 px-1 py-0.5">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
            <span className="ml-2 text-xs text-slate-500">{totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, totalItems)} dari {totalItems}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1} title="Halaman pertama" className="rounded p-1 disabled:opacity-50"><ChevronsLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} disabled={safeCurrentPage === 1} className="rounded p-1 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm text-slate-700">{safeCurrentPage} / {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))} disabled={safeCurrentPage === totalPages} className="rounded p-1 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages} title="Halaman terakhir" className="rounded p-1 disabled:opacity-50"><ChevronsRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      {selectedId && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setSelectedId(null)}><div role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-5xl space-y-5 overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3"><h2 id="audit-detail-title" className="text-base font-bold text-slate-900">Detail Audit #{selectedId}</h2><button type="button" aria-label="Tutup detail audit" title="Tutup" onClick={() => setSelectedId(null)} className="rounded p-1 text-slate-500"><X className="h-5 w-5" /></button></div>
        {detailError ? <p role="alert" className="text-sm text-rose-700">{detailError}</p> : !selectedEntry ? <p role="status" className="text-sm text-slate-500">Memuat detail audit...</p> : <>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Waktu", auditTimestamp(selectedEntry.timestamp)], ["Table", TABLE_LABELS[selectedEntry.table]], ["Operation", selectedEntry.operation], ["Record", selectedEntry.recordId], ["Entity ID", selectedEntry.entityId], ["Changed By", selectedEntry.changedBy ?? "Tidak tersedia"], ["Site", selectedEntry.siteName ?? "Global / tidak tercatat"], ["Action", selectedEntry.action], ["IP", selectedEntry.ipAddress ?? "Tidak tersedia"], ["Request ID", selectedEntry.requestId ?? "Tidak tersedia"], ["Change Group", selectedEntry.changeGroupId], ["Reason", selectedEntry.reason ?? "-"]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-800">{value}</dd></div>)}</dl>
          {(() => {
            const changes = summarizeChanges(selectedEntry.oldValues as AuditVal, selectedEntry.newValues as AuditVal);
            const isUpdate = Boolean(asRecord(selectedEntry.oldValues as AuditVal) && asRecord(selectedEntry.newValues as AuditVal));
            return (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">{isUpdate ? `Ringkasan Perubahan (${changes.length} field berubah)` : "Data Tercatat"}</h3>
                {changes.length === 0 ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{isUpdate ? "Tidak ada nilai yang berubah." : "Tidak ada data nilai pada entri ini."}</p> : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Field</th>{(isUpdate || selectedEntry.oldValues) && <th className="px-3 py-2 font-medium">Sebelum</th>}{(isUpdate || selectedEntry.newValues) && <th className="px-3 py-2 font-medium">Sesudah</th>}</tr></thead>
                      <tbody className="divide-y divide-slate-100">{changes.map((row) => <tr key={row.field}><td className="px-3 py-2 font-medium text-slate-700">{row.field}</td>{(isUpdate || selectedEntry.oldValues) && <td className="break-all px-3 py-2 text-slate-600">{row.before}</td>}{(isUpdate || selectedEntry.newValues) && <td className="break-all px-3 py-2 text-slate-800">{row.after}</td>}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium">Lihat data lengkap (JSON)</summary>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">{JSON.stringify(selectedEntry.oldValues, null, 2)}</pre>
                    <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">{JSON.stringify(selectedEntry.newValues, null, 2)}</pre>
                  </div>
                </details>
              </section>
            );
          })()}
          {selectedEntry.recordPath && <Link href={selectedEntry.recordPath} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">Buka data asal<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
        </>}
      </div></div>, document.body)}
    </div>
  );
}
