// src/components/ui/EmptyState.tsx
import React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** Optional icon React component */
  icon?: React.ElementType;
  /** Heading text */
  title: string;
  /** Description or supporting text */
  description?: string;
  /** Optional action element (e.g., a button) */
  action?: React.ReactNode;
  /** Additional class names for the root element */
  className?: string;
};

/**
 * Generic empty‑state component used across the dashboard when data is absent.
 * Mirrors the premium design language: centered layout, subtle background,
 * optional icon, and a call‑to‑action button slot.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 bg-gray-50 dark:bg-gray-900 rounded-xl",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 text-indigo-500 dark:text-indigo-400">
          <Icon className="h-12 w-12" />
        </div>
      )}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
