// src/components/dashboard/charts/DeviceStatusChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { getDeviceStatusData } from "@/lib/mock-data";
import { Info } from "lucide-react";

export default function DeviceStatusChart() {
  const [isMounted, setIsMounted] = useState(false);
  const data = getDeviceStatusData();
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  const hoUnit = data.find((d) => d.name === "HO Repair")?.value ?? 4;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[340px] flex items-center justify-center">
        <span className="text-xs text-slate-400">Memuat grafik status perangkat...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Status Pemasangan Perangkat
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Mock Data
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Distribusi kondisi fisik {total} unit perangkat</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
            Total: {total} Unit
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
                  <Cell key={`cell-${index}`} fill={entry.color} />
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

      <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/70 flex items-start gap-2 text-xs text-slate-600">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong className="text-slate-800">Catatan Validasi:</strong> HO Repair ({hoUnit} unit) merupakan sub-kategori dari <em>In Stock</em> dan tidak dihitung ganda pada total inventaris. Total seluruh inventaris: {total} unit.
        </span>
      </div>
    </div>
  );
}
