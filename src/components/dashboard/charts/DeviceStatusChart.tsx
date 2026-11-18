// src/components/dashboard/charts/DeviceStatusChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useAuth } from "@/features/auth/AuthContext";

interface StatusCount {
  key: string;
  label: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  in_use: "#2563eb",
  in_stock_rfu: "#16a34a",
  in_stock_damaged: "#f59e0b",
  in_stock_ho: "#e11d48",
};

export default function DeviceStatusChart() {
  const { isAuthenticated } = useAuth();
  const [statuses, setStatuses] = useState<StatusCount[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setStatuses([]);
    fetch("/api/dotnet/dashboard/status-distribution", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Sesi login diperlukan." : "Data status perangkat tidak tersedia.");
        return response.json() as Promise<StatusCount[]>;
      })
      .then((result) => {
        setStatuses(result);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Data status perangkat tidak tersedia.");
        setState("error");
      });
    return () => controller.abort();
  }, [attempt, isAuthenticated]);

  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  const data = statuses.map((status) => ({
    name: status.label,
    value: status.count,
    color: STATUS_COLORS[status.key] ?? "#64748b",
    percentage: total ? Math.round((status.count / total) * 100) : 0,
  }));

  if (state !== "ready") {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[340px] flex flex-col items-center justify-center gap-3" aria-live="polite">
        <span className="text-xs text-slate-500">{state === "loading" ? "Memuat grafik status perangkat..." : error}</span>
        {state === "error" && <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => setAttempt((value) => value + 1)}>Coba lagi</button>}
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
          </ResponsiveContainer>}
        </div>
      </div>

    </div>
  );
}
