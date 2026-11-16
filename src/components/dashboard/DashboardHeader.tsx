// src/components/dashboard/DashboardHeader.tsx
"use client";

import React from "react";
import { useAuth } from "@/features/auth/AuthContext";

/**
 * Header of the Dashboard page.
 * Displays a welcome message and current user info.
 */
export default function DashboardHeader() {
  const { currentUser } = useAuth();

  return (
    <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selamat datang, {currentUser?.name ?? "User"} — {currentUser?.role ?? "role"}
        </p>
      </div>
    </header>
  );
}
