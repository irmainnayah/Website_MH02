"use client";

import React, { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { PageLabelProvider } from "./PageLabel";

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const isLoginPage = usePathname() === "/login";
  const router = useRouter();
  const { isAuthenticated, isSessionLoading } = useAuth();

  useEffect(() => {
    if (!isLoginPage && !isSessionLoading && !isAuthenticated) router.replace("/login");
  }, [isLoginPage, isSessionLoading, isAuthenticated, router]);

  if (isLoginPage) return <>{children}</>;
  if (isSessionLoading || !isAuthenticated) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-slate-500" aria-live="polite">Memeriksa sesi...</main>;
  }

  return (
      <div className="relative flex h-screen w-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50/50">
            {children}
          </main>
        </div>
      </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <AuthProvider><PageLabelProvider><AuthenticatedShell>{children}</AuthenticatedShell></PageLabelProvider></AuthProvider>;
}
