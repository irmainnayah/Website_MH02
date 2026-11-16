export type UserRole = "superadmin" | "user";

export interface UserProfile {
  name: string;
  nrp: string;
  district: string;
  role: UserRole;
}

export interface NavigationItem {
  name: string;
  href: string;
  iconName: string;
  requiredRole?: UserRole;
  badge?: string;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
  requiredRole?: UserRole;
}
