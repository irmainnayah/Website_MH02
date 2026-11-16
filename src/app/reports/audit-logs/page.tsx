"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
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
} from "lucide-react";
import {
  AuditLogEntry,
  AuditLogOperation,
  AuditLogTable,
  getAuditLogEntries,
  subscribeToAuditLogEntries,
} from "@/lib/mock-data/audit-logs";

const TABLE_LABELS: Record<AuditLogTable, string> = {
  installation: "Installation (mock)",
  replacement: "Replacement (mock)",
  removal: "Removal (mock)",
  troubleshoot: "Troubleshoots (mock)",
  user_management: "User Management (mock)",
};

function getLocalDate(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecordHref(entry: AuditLogEntry): string | null {
  if (entry.operation === "DELETE") return null;
  const id = encodeURIComponent(entry.recordId);
  switch (entry.table) {
    case "installation":
      return `/operations/installation/${id}`;
    case "replacement":
      return `/operations/replacement/${id}`;
    case "removal":
      return `/operations/removal/${id}`;
    case "troubleshoot":
      return `/support/troubleshoots/${id}`;
    case "user_management":
      return null;
  }
}

export default function AuditLogsPage() {
  const entries = useSyncExternalStore(
    subscribeToAuditLogEntries,
    getAuditLogEntries,
    getAuditLogEntries
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState<AuditLogTable | "all">("all");
  const [operationFilter, setOperationFilter] = useState<AuditLogOperation | "all">("all");
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
      if (query) {
        const searchableValues = [
          entry.recordId,
          TABLE_LABELS[entry.table],
          entry.table,
          entry.operation,
          entry.changedBy ?? "Tidak tersedia",
          entry.ipAddress ?? "Tidak tersedia",
        ];
        if (!searchableValues.some((value) => value.toLocaleLowerCase().includes(query))) return false;
      }
      if (tableFilter !== "all" && entry.table !== tableFilter) return false;
      if (operationFilter !== "all" && entry.operation !== operationFilter) return false;
      const entryDate = getLocalDate(entry.timestamp);
      if (startDate && entryDate < startDate) return false;
      if (endDate && entryDate > endDate) return false;
      return true;
    });
  }, [entries, searchQuery, tableFilter, operationFilter, startDate, endDate]);

  const totalItems = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEntries = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, safeCurrentPage, pageSize]);
  const isFiltered = Boolean(
    searchQuery.trim() || tableFilter !== "all" || operationFilter !== "all" || startDate || endDate
  );

  const resetFilters = () => {
    setSearchQuery("");
    setTableFilter("all");
    setOperationFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const exportCsv = () => {
    if (dateError || filteredEntries.length === 0) return;
    const headers = ["Timestamp", "Table", "Operation", "Record ID", "Changed By", "IP Address"];
    const escapeCsv = (value: string | number | undefined | null) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredEntries.map((entry) => [
      entry.timestamp,
      TABLE_LABELS[entry.table],
      entry.operation,
      entry.recordId,
      entry.changedBy ?? "Tidak tersedia",
      entry.ipAddress ?? "Tidak tersedia",
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
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Audit Logs</h1>
          <p className="mt-1 text-xs text-slate-500">
            Riwayat aksi pada mock data aplikasi selama sesi ini.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5" /> Prototype action log
        </span>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
        INSERT dan UPDATE di sini adalah label aksi pada mock UI, bukan bukti operasi database. Changed By dan IP Address tidak tersedia dari sumber saat ini. Data log hanya tersimpan di memori sesi dan hilang setelah refresh.
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileText className="h-6 w-6" /></div>
                    <p className="text-sm font-semibold text-slate-700">{entries.length ? "Tidak ada aksi yang sesuai" : "Belum ada aksi tercatat"}</p>
                    <p className="mt-1 text-xs text-slate-400">{entries.length ? "Ubah pencarian atau filter." : "Aksi mock yang didukung akan muncul di sini setelah berhasil dilakukan."}</p>
                    {isFiltered && <button type="button" onClick={resetFilters} className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Reset Filter</button>}
                  </td>
                </tr>
              ) : paginatedEntries.map((entry) => {
                const recordHref = getRecordHref(entry);
                return (
                  <tr key={entry.entryId} className="transition-colors hover:bg-slate-50/75">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{new Date(entry.timestamp).toLocaleString("id-ID")}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{TABLE_LABELS[entry.table]}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">{entry.operation}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-blue-700">{recordHref ? <Link href={recordHref} className="inline-flex items-center gap-1 hover:underline">{entry.recordId}<ArrowUpRight className="h-3 w-3" /></Link> : entry.recordId}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{entry.changedBy ?? "Tidak tersedia"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500">{entry.ipAddress ?? "Tidak tersedia"}</td>
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
    </div>
  );
}
