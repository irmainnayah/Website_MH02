"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wrench,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Clock,
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  User,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { navigationConfig } from "@/data/navigation";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Wrench,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Clock,
  FileText,
};

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser, switchRole, isSidebarOpen, toggleSidebar } = useAuth();

  return (
    <aside
      className={cn(
        "bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800 z-30 shrink-0",
        isSidebarOpen ? "w-64" : "w-20"
      )}
    >
      {/* Brand Header — SMARTD DISPLAY / ASSET REPORT */}
      <div
        className={cn(
          "h-16 flex items-center border-b border-slate-800 relative transition-all shrink-0",
          isSidebarOpen ? "justify-between px-4" : "justify-center px-2"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* Logo container: white square with rounded corners */}
          <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center p-1 shrink-0 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pama-logo.png"
              alt="PAMA Logo"
              className="h-full w-full object-contain"
            />
          </div>
          {isSidebarOpen && (
            <div className="min-w-0 leading-tight">
              <span className="font-bold text-white text-sm tracking-wide block truncate">
                SMARTD DISPLAY
              </span>
              <span className="text-xs font-medium text-slate-400 block truncate mt-0.5">
                ASSET REPORT
              </span>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className={cn(
            "rounded-md hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0",
            isSidebarOpen
              ? "h-8 w-8 ml-2"
              : "absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-slate-800 border border-slate-700 shadow-md hover:bg-slate-700 text-slate-300 z-40"
          )}
          title={isSidebarOpen ? "Ciutkan sidebar" : "Perluas sidebar"}
        >
          {isSidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {navigationConfig.map((group) => {
          // RBAC Check for Menu Group
          if (group.requiredRole && group.requiredRole !== currentUser.role) {
            return null;
          }

          return (
            <div key={group.title} className="space-y-1">
              {isSidebarOpen && (
                <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  {group.title}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  if (
                    item.requiredRole &&
                    item.requiredRole !== currentUser.role
                  ) {
                    return null;
                  }

                  const Icon = iconMap[item.iconName] || LayoutDashboard;
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname?.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors relative group",
                          isActive
                            ? "bg-blue-600 text-white font-semibold shadow-sm"
                            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                        )}
                        title={!isSidebarOpen ? item.name : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {isSidebarOpen && (
                          <span className="truncate flex-1">{item.name}</span>
                        )}
                        {isSidebarOpen && item.badge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Bottom: User Profile + Role Switcher + Logout */}
      <div className="border-t border-slate-800 shrink-0">
        {/* User Profile */}
        <div className="p-3 border-b border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
              {currentUser.role === "superadmin" ? (
                <Shield className="h-4 w-4 text-amber-400" />
              ) : (
                <User className="h-4 w-4 text-blue-400" />
              )}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {currentUser.nrp} · {currentUser.district}
                </p>
                <span
                  className={cn(
                    "inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                    currentUser.role === "superadmin"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}
                >
                  {currentUser.role}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Internal Demo Tool: Role Switcher */}
        <div className="p-3 bg-slate-950/60">
          {isSidebarOpen ? (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
                [DEMO ONLY] Role Switcher
              </span>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-md border border-slate-800">
                <button
                  type="button"
                  onClick={() => switchRole("superadmin")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded transition-colors",
                    currentUser.role === "superadmin"
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  Superadmin
                </button>
                <button
                  type="button"
                  onClick={() => switchRole("user")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded transition-colors",
                    currentUser.role === "user"
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  Teknisi / User
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() =>
                switchRole(currentUser.role === "superadmin" ? "user" : "superadmin")
              }
              title={`Switch to ${
                currentUser.role === "superadmin" ? "User" : "Superadmin"
              } (Demo)`}
              className="w-full py-1.5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            >
              ⇄
            </button>
          )}

          {/* Logout Link */}
          <div className="mt-2 pt-2 border-t border-slate-800/80">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-2 text-xs text-rose-400 hover:text-rose-300 py-1 px-2 rounded hover:bg-rose-950/30 transition-colors",
                !isSidebarOpen && "justify-center px-0"
              )}
              title="Keluar / Logout"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Keluar / Logout</span>}
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
