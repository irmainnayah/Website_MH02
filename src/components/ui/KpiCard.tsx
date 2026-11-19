// src/components/ui/KpiCard.tsx
import React from "react";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  /** Title of the KPI */
  title: string;
  /** Main metric value (string or number) */
  value: string | number;
  /** Optional unit (e.g., "perangkat") */
  unit?: string;
  /** Optional description shown under the value */
  description?: string;
  /** Optional icon component (React component) */
  icon?: React.ElementType;
  tone?: "neutral" | "blue" | "green" | "rose" | "amber";
};

const TONES = {
  neutral: { card: "border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white", icon: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200" },
  blue: { card: "border-blue-200 bg-blue-50 text-blue-950", icon: "bg-blue-100 text-blue-700" },
  green: { card: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: "bg-emerald-100 text-emerald-700" },
  rose: { card: "border-rose-200 bg-rose-50 text-rose-950", icon: "bg-rose-100 text-rose-700" },
  amber: { card: "border-amber-200 bg-amber-50 text-amber-950", icon: "bg-amber-100 text-amber-700" },
};

export default function KpiCard({
  title,
  value,
  unit,
  description,
  icon: Icon,
  tone = "neutral",
}: KpiCardProps) {
  const styles = TONES[tone];
  return (
    <div className={cn("rounded-lg border p-5 shadow-sm hover:shadow-md transition-shadow duration-200", styles.card)}>
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium opacity-80">{title}</h3>
        {Icon && (
          <div className={cn("ml-3 shrink-0 rounded-md p-2", styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline space-x-2">
        <p className="text-3xl font-bold tabular-nums">
          {value}
          {unit && <span className="text-base font-medium opacity-75"> {unit}</span>}
        </p>
      </div>
      {description && (
        <p className="mt-2 text-xs opacity-75">{description}</p>
      )}
    </div>
  );
}
