// src/components/dashboard/charts/DeviceStatusChart.tsx
"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useDashboardData } from "../DashboardDataProvider";

const STATUS_COLORS: Record<string, string> = {
  in_use: "#2563eb",
  in_stock_rfu: "#16a34a",
  in_stock_damaged: "#f59e0b",
  in_stock_ho: "#e11d48",
};

export default function DeviceStatusChart() {
  const { summary } = useDashboardData();
  const statuses = summary?.statusDistribution ?? [];

  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  const data = statuses.map((status) => ({
    name: status.label,
    value: status.count,
    color: STATUS_COLORS[status.key] ?? "#64748b",
    percentage: total ? Math.round((status.count / total) * 100) : 0,
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Status Perangkat
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Distribusi status perangkat terdaftar</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
            Terdaftar: {total} Unit
          </span>
        </div>

        <div className="h-64 w-full mt-3">
          {total === 0 ? <div className="h-full flex items-center justify-center text-xs text-slate-500">Belum ada perangkat terdaftar.</div> : <ResponsiveContainer width="100%" height="100%">
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
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} unit (${total ? Math.round(Number(value) / total * 100) : 0}%)`,
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
          </ResponsiveContainer>}
        </div>
      </div>

    </div>
  );
}
