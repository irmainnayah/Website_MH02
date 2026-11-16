"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";

export function Topbar() {
  const pathname = usePathname();
  const { currentUser, toggleSidebar } = useAuth();

  // Simple breadcrumb generator
  const segments = pathname?.split("/").filter(Boolean) || [];
  const breadcrumbText =
    segments.length === 0
      ? "Dashboard"
      : segments
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " "))
          .join(" / ");

  const todayStr = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-20 shrink-0 shadow-sm">
      {/* Left: Mobile toggle + Breadcrumb */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          aria-label="Toggle navigation sidebar"
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <nav className="text-xs text-slate-400 font-medium">Portal / Sistem</nav>
          <h1 className="text-sm font-semibold text-slate-800 capitalize">
            {breadcrumbText}
          </h1>
        </div>
      </div>

      {/* Right: Single compact 2-line site + date block */}
      <div className="hidden sm:block text-right">
        <p className="text-sm font-semibold text-slate-800 leading-tight">
          {currentUser.district}
        </p>
        <p className="text-xs text-slate-500 leading-tight mt-0.5">
          {todayStr}
        </p>
      </div>
    </header>
  );
}
