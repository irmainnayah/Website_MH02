// src/lib/mock-data/users.ts
import { ManagedUser } from "@/types/user";

/**
 * ⚠️ DATA SIMULASI / MOCK DEMO ONLY
 * Data pengguna fiktif untuk evaluasi fungsionalitas User Management (RBAC).
 * Tidak memuat data pribadi atau data rahasia riil perusahaan.
 */
export const initialUsers: ManagedUser[] = [
  {
    id: "usr-001",
    name: "Budi Santoso",
    nrp: "NRP-884920",
    email: "budi.santoso@smartd.demo",
    phone: "0812-3456-0001",
    district: "Head Office",
    role: "superadmin",
    status: "active",
    lastLogin: "2026-10-19 08:30",
    createdAt: "2026-01-15",
  },
  {
    id: "usr-002",
    name: "Ahmad Rizki",
    nrp: "NRP-772104",
    email: "ahmad.rizki@smartd.demo",
    phone: "0812-3456-0002",
    district: "Sangatta",
    role: "user",
    status: "active",
    lastLogin: "2026-10-19 07:45",
    createdAt: "2026-02-10",
  },
  {
    id: "usr-003",
    name: "Dedi Supriyadi",
    nrp: "NRP-772188",
    email: "dedi.supriyadi@smartd.demo",
    phone: "0812-3456-0003",
    district: "Bengalon",
    role: "user",
    status: "active",
    lastLogin: "2026-10-18 16:20",
    createdAt: "2026-02-14",
  },
  {
    id: "usr-004",
    name: "Siti Rahmawati",
    nrp: "NRP-885102",
    email: "siti.rahmawati@smartd.demo",
    phone: "0812-3456-0004",
    district: "Head Office",
    role: "superadmin",
    status: "active",
    lastLogin: "2026-10-18 11:15",
    createdAt: "2026-01-20",
  },
  {
    id: "usr-005",
    name: "Hendro Wibowo",
    nrp: "NRP-773012",
    email: "hendro.wibowo@smartd.demo",
    phone: "0812-3456-0005",
    district: "Wahau",
    role: "user",
    status: "active",
    lastLogin: "2026-10-17 14:10",
    createdAt: "2026-03-01",
  },
  {
    id: "usr-006",
    name: "Fajar Pratama",
    nrp: "NRP-773409",
    email: "fajar.pratama@smartd.demo",
    phone: "0812-3456-0006",
    district: "Sangatta Utara",
    role: "user",
    status: "active",
    lastLogin: "2026-10-19 06:50",
    createdAt: "2026-03-12",
  },
  {
    id: "usr-007",
    name: "Rian Hidayat",
    nrp: "NRP-774115",
    email: "rian.hidayat@smartd.demo",
    phone: "0812-3456-0007",
    district: "Sangatta",
    role: "user",
    status: "inactive",
    lastLogin: "2026-09-28 10:05",
    createdAt: "2026-04-05",
  },
  {
    id: "usr-008",
    name: "Fauzan Aditya",
    nrp: "NRP-774520",
    email: "fauzan.aditya@smartd.demo",
    phone: "0812-3456-0008",
    district: "Bengalon",
    role: "user",
    status: "active",
    lastLogin: "2026-10-18 18:40",
    createdAt: "2026-04-18",
  },
  {
    id: "usr-009",
    name: "Tri Wahyuni",
    nrp: "NRP-886201",
    email: "tri.wahyuni@smartd.demo",
    phone: "0812-3456-0009",
    district: "Head Office",
    role: "superadmin",
    status: "inactive",
    lastLogin: "2026-08-15 09:22",
    createdAt: "2026-01-25",
  },
  {
    id: "usr-010",
    name: "Bambang Kurniawan",
    nrp: "NRP-775190",
    email: "bambang.kurniawan@smartd.demo",
    phone: "0812-3456-0010",
    district: "Wahau",
    role: "user",
    status: "active",
    lastLogin: "2026-10-19 08:10",
    createdAt: "2026-05-02",
  },
];

// Session-memory store. Updates persist across client-side navigation, but reset on refresh.
let managedUsersSnapshot: ManagedUser[] = initialUsers.map((user) => ({ ...user }));
const managedUserListeners = new Set<() => void>();

const isActiveSuperadmin = (user: ManagedUser) =>
  user.role === "superadmin" && user.status === "active";

const countActiveSuperadmins = (users: ManagedUser[]) =>
  users.filter(isActiveSuperadmin).length;

const normalizeNrp = (nrp: string) => nrp.trim().toUpperCase();

export const hasDuplicateManagedUserNrp = (nrp: string, exceptId?: string): boolean => {
  const normalizedNrp = normalizeNrp(nrp);
  return managedUsersSnapshot.some(
    (user) => user.id !== exceptId && normalizeNrp(user.nrp) === normalizedNrp
  );
};

const notifyManagedUserListeners = () => {
  managedUserListeners.forEach((listener) => listener());
};

export const getManagedUsers = (): ManagedUser[] => managedUsersSnapshot;

export const subscribeToManagedUsers = (listener: () => void): (() => void) => {
  managedUserListeners.add(listener);
  return () => managedUserListeners.delete(listener);
};

export const addManagedUser = (user: ManagedUser): boolean => {
  if (managedUsersSnapshot.some((existing) => existing.id === user.id)) return false;
  const normalizedUser = { ...user, nrp: normalizeNrp(user.nrp) };
  if (hasDuplicateManagedUserNrp(normalizedUser.nrp)) return false;

  managedUsersSnapshot = [normalizedUser, ...managedUsersSnapshot];
  notifyManagedUserListeners();
  return true;
};

export const updateManagedUser = (user: ManagedUser): boolean => {
  const index = managedUsersSnapshot.findIndex((existing) => existing.id === user.id);
  if (index === -1) return false;
  const normalizedUser = { ...user, nrp: normalizeNrp(user.nrp) };
  if (hasDuplicateManagedUserNrp(normalizedUser.nrp, normalizedUser.id)) return false;

  const existing = managedUsersSnapshot[index];
  const unchanged = (Object.keys(existing) as (keyof ManagedUser)[]).every(
    (key) => existing[key] === normalizedUser[key]
  );
  if (unchanged) return false;

  const nextUsers = managedUsersSnapshot.map((current) =>
    current.id === normalizedUser.id ? normalizedUser : current
  );
  if (countActiveSuperadmins(nextUsers) < 1) return false;

  managedUsersSnapshot = nextUsers;
  notifyManagedUserListeners();
  return true;
};

export const setManagedUserStatus = (id: string, status: ManagedUser["status"]): boolean => {
  const target = managedUsersSnapshot.find((user) => user.id === id);
  if (!target || target.status === status) return false;

  const nextUsers = managedUsersSnapshot.map((user) =>
    user.id === id ? { ...user, status } : user
  );
  if (countActiveSuperadmins(nextUsers) < 1) return false;

  managedUsersSnapshot = nextUsers;
  notifyManagedUserListeners();
  return true;
};

export const deleteManagedUser = (id: string): boolean => {
  const targetExists = managedUsersSnapshot.some((user) => user.id === id);
  if (!targetExists) return false;

  const nextUsers = managedUsersSnapshot.filter((user) => user.id !== id);
  if (countActiveSuperadmins(nextUsers) < 1) return false;

  managedUsersSnapshot = nextUsers;
  notifyManagedUserListeners();
  return true;
};
