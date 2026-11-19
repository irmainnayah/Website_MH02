// src/components/dashboard/charts/ActivityBarChart.tsx
"use client";

import React, { useState, useEffect } from "react";
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
import { useDashboardData } from "../DashboardDataProvider";

export default function ActivityBarChart() {
  const [isMounted, setIsMounted] = useState(false);
  const { summary } = useDashboardData();
  const data = summary?.monthlyActivities ?? [];
  const total = data.reduce((sum, month) => sum + month.installation + month.replacement + month.removal + month.troubleshoot, 0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const periodLabel = data.length ? `${data[0].yearMonth} - ${data[data.length - 1].yearMonth}` : "";

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
              6 Bulan
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Jumlah transaksi berdasarkan bulan lokal waktu mulai pengerjaan</p>
        </div>
      </div>

      <div className="h-72 w-full mt-4">
        {total === 0 ? <div className="flex h-full items-center justify-center text-xs text-slate-500">Belum ada transaksi pada periode ini.</div> : <ResponsiveContainer width="100%" height="100%">
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
        </ResponsiveContainer>}
      </div>
    </div>
  );
}
