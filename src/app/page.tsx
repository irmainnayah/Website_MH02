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

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header (Greeting, Site Badge, Current Period) */}
      <DashboardHeader />

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
    </div>
  );
}
