// src/components/dashboard/charts/ActivityBarChart.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getMonthlyActivityChartData, getRollingSixMonths } from "@/lib/mock-data";

export default function ActivityBarChart() {
  const [isMounted, setIsMounted] = useState(false);
  const data = useMemo(() => getMonthlyActivityChartData(), []);
  const rollingMonths = useMemo(() => getRollingSixMonths(), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const periodLabel = useMemo(() => {
    if (!rollingMonths || rollingMonths.length === 0) return "";
    const first = rollingMonths[0].yearMonth;
    const last = rollingMonths[rollingMonths.length - 1].yearMonth;
    return `${first} – ${last}`;
  }, [rollingMonths]);

  if (!isMounted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[360px] flex items-center justify-center">
        <span className="text-xs text-slate-400">Memuat tren aktivitas operasional...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            Aktivitas Operasional Lapangan ({periodLabel})
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Mock Data
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Jumlah aktivitas selesai (completed) berdasarkan 4 modul operasional</p>
        </div>
      </div>

      <div className="h-72 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
            <Tooltip
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
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  installation: "Installation",
                  troubleshoot: "Troubleshoot",
                  replacement: "Replacement",
                  removal: "Removal",
                };
                return <span className="text-xs text-slate-700 font-medium">{labels[value] ?? value}</span>;
              }}
            />
            <Bar dataKey="installation" name="installation" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Bar dataKey="troubleshoot" name="troubleshoot" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="replacement" name="replacement" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="removal" name="removal" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
