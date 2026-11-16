"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { UserProfile, UserRole } from "@/types/navigation";

interface AuthContextType {
  currentUser: UserProfile;
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const switchRole = (role: UserRole) => {
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
