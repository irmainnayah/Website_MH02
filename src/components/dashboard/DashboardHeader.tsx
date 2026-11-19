// src/components/dashboard/DashboardHeader.tsx
"use client";

import React from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { useDashboardData } from "./DashboardDataProvider";
import { dashboardMonthLabel } from "@/lib/dashboard-api";
import { RotateCcw } from "lucide-react";

/**
 * Header of the Dashboard page.
 * Displays a welcome message and current user info.
 */
export default function DashboardHeader() {
  const { currentUser } = useAuth();
  const { summary, sites, siteId, setSiteId, loading, reload } = useDashboardData();

  return (
    <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selamat datang, {currentUser?.name ?? "User"} — {currentUser?.role ?? "role"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {summary && <span className="text-xs text-slate-500">{dashboardMonthLabel(summary.currentMonth)} / {summary.periodTimeZone}</span>}
        {currentUser.role === "superadmin" ? <select aria-label="Site Dashboard" value={siteId ?? ""} disabled={loading} onChange={(event) => setSiteId(event.target.value ? Number(event.target.value) : null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><option value="">Semua Site</option>{sites.map((site) => <option key={site.siteId} value={site.siteId}>{site.name}</option>)}</select> : <span className="text-xs font-semibold text-slate-600">{currentUser.district}</span>}
        <button type="button" title="Muat ulang Dashboard" aria-label="Muat ulang Dashboard" disabled={loading} onClick={reload} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>
      </div>
    </header>
  );
}
