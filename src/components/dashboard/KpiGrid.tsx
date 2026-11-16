// src/components/dashboard/KpiGrid.tsx
"use client";

import React from "react";
import KpiCard from "@/components/ui/KpiCard";
import { getKpiSummary } from "@/lib/mock-data";
import { Calendar } from "lucide-react";

/**
 * Grid of KPI cards displayed on the Dashboard.
 * Each card shows a numeric value and a small label "*Mock Data*" to indicate
 * that the numbers come from the local mock data set.
 */
export default function KpiGrid() {
  const {
    totalDevices,
    totalInstalled,
    hoRepair,
    inStock,
  } = getKpiSummary();

  // Define the list of KPI cards – order follows confirmed business requirements.
  const kpis = [
    { title: "Total Perangkat", value: totalDevices, description: "*Mock Data*" },
    { title: "Total Installed", value: totalInstalled, description: "*Mock Data*" },
    { title: "HO Repair", value: hoRepair, description: "*Mock Data*" },
    { title: "Device In Stock", value: inStock, description: "*Mock Data*" },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          description={kpi.description}
        />
      ))}
    </section>
  );
}
