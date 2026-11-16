// src/types/user.ts
import { UserRole, UserProfile } from "./navigation";
import { DistrictName } from "./dashboard";

export type { UserRole, UserProfile };

export type UserStatus = "active" | "inactive";

export type UserDistrict = DistrictName | "Head Office";

export interface ManagedUser {
  id: string;
  name: string;
  nrp: string;
  email: string;
  phone: string;
  district: UserDistrict;
  role: UserRole;
  status: UserStatus;
  lastLogin: string | null;
  createdAt: string;
}

export type ManagedUserInput = Omit<ManagedUser, "id" | "lastLogin" | "createdAt">;
