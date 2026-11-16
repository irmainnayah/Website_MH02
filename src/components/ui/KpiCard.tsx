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
};

/**
 * Reusable KPI card component.
 * Consistent with the premium design: white/gray card, dark‑mode, subtle shadow, hover elevation.
 */
export default function KpiCard({
  title,
  value,
  unit,
  description,
  icon: Icon,
}: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
        {Icon && (
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline space-x-2">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {value}
          {unit && <span className="text-base font-medium text-gray-500 dark:text-gray-400"> {unit}</span>}
        </p>
      </div>
      {description && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}
