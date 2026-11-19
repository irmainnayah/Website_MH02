// src/app/page.tsx
"use client";

import React from "react";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import DeviceStatusChart from "@/components/dashboard/charts/DeviceStatusChart";
import DeviceLocationChart from "@/components/dashboard/charts/DeviceLocationChart";
import ActivityBarChart from "@/components/dashboard/charts/ActivityBarChart";
import EquipmentTypeChart from "@/components/dashboard/charts/EquipmentTypeChart";
import MonthlyActivitySummary from "@/components/dashboard/MonthlyActivitySummary";
import QuickActions from "@/components/dashboard/QuickActions";
import DeviceList from "@/components/dashboard/DeviceList";
import { DashboardDataProvider, useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { RotateCcw } from "lucide-react";

export default function DashboardPage() {
  return <DashboardDataProvider><DashboardContent /></DashboardDataProvider>;
}

function DashboardContent() {
  const { summary, loading, error, reload } = useDashboardData();
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header (Greeting, Site Badge, Current Period) */}
      <DashboardHeader />
      {loading ? <div role="status" className="min-h-64 flex items-center justify-center rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat data Dashboard...</div> : error || !summary ? <div role="alert" className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{error ?? "Data Dashboard belum tersedia."}</p><button type="button" onClick={reload} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold"><RotateCcw className="h-4 w-4" />Muat Ulang</button></div> : <>

      {/* 2. KPI Summary Cards Grid (6 Metric Cards) */}
      <KpiGrid />

      {/* 3. Charts Row 1: Device Status & Stock Distribution (Donuts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DeviceStatusChart />
        <DeviceLocationChart />
      </div>

      {/* 4. Charts Row 2: Operational Activity Trends & Devices by Equipment Type */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <ActivityBarChart />
        </div>
        <div className="lg:col-span-5">
          <EquipmentTypeChart />
        </div>
      </div>

      {/* 5. Monthly Operational Activity Summary (5 Cards) */}
      <MonthlyActivitySummary />

      {/* 6. Quick Action Shortcuts to Operational Logging Forms */}
      <QuickActions />

      {/* 7. Comprehensive Device Inventory List with Search, Filter & Detail Modal */}
      <DeviceList />
      </>}
    </div>
  );
}
