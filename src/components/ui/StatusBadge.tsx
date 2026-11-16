// src/components/ui/StatusBadge.tsx
import React from "react";
import { cn } from "@/lib/utils";

type DeviceStatusLabel = "In Use" | "In Stock – RFU" | "In Stock – Repair" | "HO Repair";
type RawDeviceStatus = "in_use" | "in_stock_rfu" | "in_stock_damaged" | "in_stock_ho";

type StatusBadgeProps = {
  /** Device status (raw or formatted label) */
  status: DeviceStatusLabel | RawDeviceStatus | string;
  /** Additional class names */
  className?: string;
};

const statusMapping: Record<string, DeviceStatusLabel> = {
  in_use: "In Use",
  in_stock_rfu: "In Stock – RFU",
  in_stock_damaged: "In Stock – Repair",
  in_stock_ho: "HO Repair",
  // Fallback pemetaan aman jika masih ada referensi lama
  not_installed: "In Stock – RFU",
  "In Stock – Damaged": "In Stock – Repair",
};

/**
 * Badge that visualizes a device status with a distinct color scheme.
 * Matches the premium design language used across the dashboard.
 */
export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const displayLabel: string =
    (status in statusMapping) ? statusMapping[status] : status;

  const base = "px-2.5 py-0.5 text-xs font-semibold rounded-full inline-flex items-center gap-1.5";
  const variants: Record<string, string> = {
    "In Use": "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
    "In Stock – RFU": "bg-violet-50 text-violet-700 border border-violet-200/80",
    "In Stock – Repair": "bg-amber-50 text-amber-700 border border-amber-200/80",
    "HO Repair": "bg-rose-50 text-rose-700 border border-rose-200/80",
  };
  const color = variants[displayLabel] ?? "bg-slate-100 text-slate-800 border border-slate-200";
  return <span className={cn(base, color, className)}>{displayLabel}</span>;
}
