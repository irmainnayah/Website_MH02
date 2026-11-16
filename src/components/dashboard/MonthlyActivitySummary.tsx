// src/components/dashboard/MonthlyActivitySummary.tsx
"use client";

import React, { useMemo } from "react";
import { getCurrentMonthActivitiesSummary, getCurrentMonthLabel } from "@/lib/mock-data";
import {
  Wrench,
  AlertTriangle,
  RefreshCw,
  Trash2,
  CalendarDays,
} from "lucide-react";

export default function MonthlyActivitySummary() {
  const summary = useMemo(() => getCurrentMonthActivitiesSummary(), []);
  const monthLabel = useMemo(() => getCurrentMonthLabel(), []);

  const cards = [
    {
      title: "Installation",
      count: summary.installation,
      unit: "aktivitas",
      icon: Wrench,
      color: "text-blue-600 bg-blue-50 border-blue-100",
      description: "Pemasangan unit baru",
    },
    {
      title: "Troubleshoot",
      count: summary.troubleshoot,
      unit: "aktivitas",
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50 border-amber-100",
      description: "Penanganan kendala fisik",
    },
    {
      title: "Replacement",
      count: summary.replacement,
      unit: "aktivitas",
      icon: RefreshCw,
      color: "text-violet-600 bg-violet-50 border-violet-100",
      description: "Penggantian unit/komponen",
    },
    {
      title: "Removal",
      count: summary.removal,
      unit: "aktivitas",
      icon: Trash2,
      color: "text-rose-600 bg-rose-50 border-rose-100",
      description: "Pelepasan perangkat armada",
    },
  ];

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              Ringkasan Operasional Bulan Berjalan
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Mock Data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Akumulasi aktivitas teknisi lapangan yang telah selesai (Completed)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg">
          <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
          <span>{monthLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-shadow flex flex-col h-full"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600">{card.title}</span>
                <div className={`p-2 rounded-md ${card.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{card.count}</span>
                <span className="text-[11px] font-medium text-slate-500">{card.unit}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{card.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
