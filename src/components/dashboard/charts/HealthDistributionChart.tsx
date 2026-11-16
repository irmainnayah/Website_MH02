// src/components/dashboard/charts/HealthDistributionChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { getHealthDistributionData } from "@/lib/mock-data";
import { AlertCircle } from "lucide-react";

export default function HealthDistributionChart() {
  const [isMounted, setIsMounted] = useState(false);
  const data = getHealthDistributionData();
  const totalInUse = data.reduce((acc, curr) => acc + curr.value, 0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[340px] flex items-center justify-center">
        <span className="text-xs text-slate-400">Memuat grafik status kesehatan...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Distribusi Health Check Perangkat
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Mock Data
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Kondisi kesehatan pada {totalInUse} perangkat terpasang (In Use)</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
            Aktif: {totalInUse} Unit
          </span>
        </div>

        <div className="h-64 w-full mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`health-cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any, item: any) => [
                  `${value} unit (${item.payload.percentage}%)`,
                  name,
                ]}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  borderColor: "#e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span className="text-xs text-slate-700 font-medium">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200/80 flex items-start gap-2 text-xs text-amber-900">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          <strong>Transparansi Protokol:</strong> Checklist 19 poin belum memiliki spesifikasi resmi teknis dari HO — visualisasi ini berstatus prototipe mockup.
        </span>
      </div>
    </div>
  );
}
