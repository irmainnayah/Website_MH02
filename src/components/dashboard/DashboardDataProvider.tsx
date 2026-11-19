"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { DashboardDevice, DashboardSite, DashboardSummary, getDashboardDevices, getDashboardSites, getDashboardSummary } from "@/lib/dashboard-api";

interface DashboardState {
  summary: DashboardSummary | null;
  devices: DashboardDevice[];
  sites: DashboardSite[];
  siteId: number | null;
  setSiteId: (siteId: number | null) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [devices, setDevices] = useState<DashboardDevice[]>([]);
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setSummary(null); setDevices([]);
    Promise.all([getDashboardSummary(siteId, controller.signal), getDashboardDevices(siteId, controller.signal), getDashboardSites(controller.signal)])
      .then(([data, inventory, reference]) => {
        if (controller.signal.aborted) return;
        setSummary(data); setDevices(inventory); setSites(reference.sites);
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Gagal memuat Dashboard.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [siteId, attempt, isAuthenticated]);
  return <DashboardContext.Provider value={{ summary, devices, sites, siteId, setSiteId, loading, error, reload: () => setAttempt((previous) => previous + 1) }}>{children}</DashboardContext.Provider>;
}

export function useDashboardData() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("DashboardDataProvider is required.");
  return value;
}