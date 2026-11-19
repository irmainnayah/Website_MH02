// src/components/dashboard/QuickActions.tsx
"use client";

import React from "react";
import Link from "next/link";
import {
  Wrench,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronRight,
  Zap,
} from "lucide-react";

export default function QuickActions() {
  const actions = [
    {
      label: "Catat Pemasangan",
      sublabel: "Registrasi & instalasi unit baru",
      href: "/operations/installation/new",
      icon: Wrench,
      accent: "hover:border-blue-300 hover:bg-blue-50/40 text-blue-700",
      iconBg: "bg-blue-100 text-blue-700",
    },
    {
      label: "Laporkan Troubleshoot",
      sublabel: "Input kendala & penanganan",
      href: "/support/troubleshoots/new",
      icon: AlertTriangle,
      accent: "hover:border-amber-300 hover:bg-amber-50/40 text-amber-700",
      iconBg: "bg-amber-100 text-amber-700",
    },
    {
      label: "Penggantian Unit",
      sublabel: "Swapping perangkat bermasalah",
      href: "/operations/replacement/new",
      icon: RefreshCw,
      accent: "hover:border-violet-300 hover:bg-violet-50/40 text-violet-700",
      iconBg: "bg-violet-100 text-violet-700",
    },
    {
      label: "Pelepasan Perangkat",
      sublabel: "Dismantle unit dari armada",
      href: "/operations/removal/new",
      icon: Trash2,
      accent: "hover:border-rose-300 hover:bg-rose-50/40 text-rose-700",
      iconBg: "bg-rose-100 text-rose-700",
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Aksi Cepat Operasional</h3>
            <p className="text-xs text-slate-500">Pintasan langsung ke formulir pelaporan teknisi di lapangan</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((action, idx) => {
          const Icon = action.icon;
          return (
            <Link
              key={idx}
              href={action.href}
              className={`group p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col justify-between transition-all duration-200 ${action.accent}`}
            >
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${action.iconBg} transition-transform group-hover:scale-105`}>
                  <Icon className="h-4 w-4" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
              </div>

              <div className="mt-3">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-slate-900">
                  {action.label}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {action.sublabel}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
