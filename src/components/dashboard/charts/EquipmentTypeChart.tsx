// src/components/dashboard/charts/EquipmentTypeChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getEquipmentTypeData } from "@/lib/mock-data";

export default function EquipmentTypeChart() {
  const [isMounted, setIsMounted] = useState(false);
  const data = getEquipmentTypeData();
  const total = data.reduce((acc, curr) => acc + curr.count, 0);

  const colors = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#8b5cf6"];

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[360px] flex items-center justify-center">
        <span className="text-xs text-slate-400">Memuat alokasi armada...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            Perangkat Berdasarkan Tipe Alat
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Mock Data
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Alokasi pada {total} unit terpasang aktif di armada</p>
        </div>
        <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-700 rounded-md">
          {total} Unit In Use
        </span>
      </div>

      <div className="h-72 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 35, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis
              type="category"
              dataKey="type"
              tick={{ fontSize: 11, fill: "#475569", fontWeight: 500 }}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <Tooltip
              formatter={(value: any) => [`${value} unit perangkat`, "Jumlah Unit"]}
              contentStyle={{
                backgroundColor: "#ffffff",
                borderColor: "#e2e8f0",
                borderRadius: "8px",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={`equip-cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
