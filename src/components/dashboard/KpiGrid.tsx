// src/components/dashboard/KpiGrid.tsx
"use client";

import React from "react";
import KpiCard from "@/components/ui/KpiCard";
import { useDashboardData } from "./DashboardDataProvider";
import { Boxes, MonitorCheck, Package, Wrench } from "lucide-react";

export default function KpiGrid() {
  const { summary } = useDashboardData();
  if (!summary) return null;
  const {
    registeredDevices,
    totalInstalled,
    hoRepair,
    inStock,
  } = summary.kpis;

  // Define the list of KPI cards – order follows confirmed business requirements.
  const kpis = [
    { title: "Perangkat Tercatat", value: registeredDevices, description: "Inventaris nonarsip", tone: "blue", icon: Boxes },
    { title: "Total Installed", value: totalInstalled, description: "In Use", tone: "green", icon: MonitorCheck },
    { title: "Butuh Repair ke HO", value: hoRepair, description: "Kondisi In Stock HO", tone: "rose", icon: Wrench },
    { title: "Device In Stock", value: inStock, description: "RFU, Rusak, dan Butuh Repair ke HO", tone: "amber", icon: Package },
  ] as const;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          description={kpi.description}
          tone={kpi.tone}
          icon={kpi.icon}
        />
      ))}
    </section>
  );
}
