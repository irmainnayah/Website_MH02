// src/components/dashboard/charts/DeviceLocationChart.tsx
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
import { getDeviceLocationDistributionData } from "@/lib/mock-data";
// import { devices } from "@/lib/mock-data"; // removed: not needed for district aggregation
// import { DeviceRecord } from "@/types/dashboard"; // removed: not needed for district aggregation
import { MapPin, Info } from "lucide-react";

export default function DeviceLocationChart() {
  const [isMounted, setIsMounted] = useState(false);
  const data = getDeviceLocationDistributionData();
  // Semua entri dihitung (tidak ada kategori "Belum Dipastikan" lagi)
  const totalDevices = data.reduce((acc, curr) => acc + curr.total, 0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[360px] flex items-center justify-center">
        <span className="text-xs text-slate-400">Memuat distribusi lokasi perangkat...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Distribusi Perangkat per Lokasi
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Mock Data
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sebaran {totalDevices} unit inventaris aktif berdasarkan lokasi fisik saat ini
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
              Total: {totalDevices} Unit
            </span>
          </div>
        </div>

        <div className="h-72 w-full mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 10, right: 25, left: 20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                domain={[0, 20]}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <YAxis
                type="category"
                dataKey="location"
                width={125}
                tick={{ fontSize: 11, fill: "#334155", fontWeight: 500 }}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <Tooltip
                formatter={(value: any, name: any) => [`${value} unit`, name]}
                labelFormatter={(label) => {
                  const item = data.find((d) => d.location === label);
                  return `${label} (Total: ${item?.total ?? 0} unit)`;
                }}
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
              <Bar
                dataKey="inUse"
                name="Active / In Use"
                stackId="status"
                fill="#10b981"
              />
              <Bar
                dataKey="inStockRfu"
                name="In Stock – RFU"
                stackId="status"
                fill="#8b5cf6"
              />
              <Bar
                dataKey="inStockDamaged"
                name="In Stock – Repair"
                stackId="status"
                fill="#f59e0b"
              />
              <Bar
                dataKey="hoRepair"
                name="HO Repair (di Site)"
                stackId="status"
                fill="#ef4444"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/70 flex items-start gap-2 text-xs text-slate-600">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-800">Catatan Data: </span>
          <span>
            <em>HO Repair</em> (D022–D025) dikonfirmasi tetap di site — kerusakan ringan ditangani di site tanpa pengiriman ke Head Office.
            Lokasi <em>RFU</em> mengikuti field <code>district</code> sebagai proksi terbaik yang tersedia; data saat ini belum membedakan RFU stok baru di Head Office vs RFU idle di site.
          </span>

        </div>
      </div>
    </div>
  );
}
