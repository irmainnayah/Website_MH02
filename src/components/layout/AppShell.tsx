"use client";

import React, { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AuthProvider } from "@/features/auth/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50/50">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
