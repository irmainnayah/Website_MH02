"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { UserProfile, UserRole } from "@/types/navigation";

interface AuthContextType {
  currentUser: UserProfile;
  isAuthenticated: boolean;
  isSessionLoading: boolean;
  refreshSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const defaultUser: UserProfile = {
  name: "Budi Santoso",
  nrp: "NRP-884920",
  district: "Sangatta",
  role: "superadmin",
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(defaultUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/dotnet/auth/me", { cache: "no-store" });
      if (!response.ok) return false;
      const user: { nrp: string; name: string; role: UserRole; siteId: number | null } = await response.json();
      if (user.role !== "superadmin" && user.role !== "user") return false;
      let district = user.siteId === null ? "Semua Site" : `Site ${user.siteId}`;
      const references = await fetch("/api/dotnet/reference", { cache: "no-store" }).catch(() => null);
      if (references?.ok && user.siteId !== null) {
        const data: { sites?: { siteId: number; name: string }[] } | null = await references.json().catch(() => null);
        district = data?.sites?.find((site) => site.siteId === user.siteId)?.name ?? district;
      }
      setCurrentUser({ name: user.name, nrp: user.nrp, role: user.role, district });
      setIsAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => { void refreshSession().finally(() => setIsSessionLoading(false)); }, [refreshSession]);

  const signOut = async () => {
    const response = await fetch("/api/dotnet/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Tidak dapat keluar dari sesi.");
    setCurrentUser(defaultUser);
    setIsAuthenticated(false);
  };

  const switchRole = (role: UserRole) => {
    if (isAuthenticated) return;
    setCurrentUser((prev) => ({
      ...prev,
      role,
      name: role === "superadmin" ? "Budi Santoso (Admin HO)" : "Ahmad Rizki (Teknisi)",
      nrp: role === "superadmin" ? "NRP-884920" : "NRP-772104",
    }));
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        isSessionLoading,
        refreshSession,
        signOut,
        switchRole,
        isSidebarOpen,
        toggleSidebar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
