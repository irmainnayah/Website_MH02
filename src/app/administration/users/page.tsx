"use client";

import React, { useState, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  Shield,
  UserCheck,
  UserX,
  Search,
  Filter,
  Plus,
  Download,
  RotateCcw,
  Edit2,
  Power,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  Clock,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import {
  addManagedUser,
  deleteManagedUser,
  getManagedUsers,
  hasDuplicateManagedUserNrp,
  initialUsers,
  setManagedUserStatus,
  subscribeToManagedUsers,
  updateManagedUser,
} from "@/lib/mock-data/users";
import { ManagedUser, UserRole, UserStatus, UserDistrict, UserProfile } from "@/types/user";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import UserManagementApi from "@/components/administration/UserManagementApi";

const DISTRICT_OPTIONS: UserDistrict[] = [
  "Head Office",
  "Sangatta",
  "Bengalon",
  "Wahau",
  "Sangatta Utara",
];

type EditableUserFields = Pick<
  ManagedUser,
  "name" | "nrp" | "email" | "phone" | "district" | "role" | "status"
>;

const formatPhoneNumber = (value: string): string => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  // Existing sample data establishes a 4-4-4 pattern for 12-digit local numbers.
  if (/^\d{12}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return trimmed;
};

const DUPLICATE_NRP_MESSAGE =
  "NRP sudah terdaftar. Silakan periksa kembali NRP yang dimasukkan.";

const isActiveSuperadmin = (user: Pick<ManagedUser, "role" | "status">) =>
  user.role === "superadmin" && user.status === "active";

const countActiveSuperadmins = (users: ManagedUser[]) =>
  users.filter(isActiveSuperadmin).length;

const EDITABLE_FIELD_LABELS: Record<keyof EditableUserFields, string> = {
  name: "Nama Lengkap",
  nrp: "NRP",
  email: "Email",
  phone: "Telepon",
  district: "Distrik Penugasan",
  role: "Role",
  status: "Status Akun",
};

function formatEditValue(field: keyof EditableUserFields, value: string): string {
  if (!value) return "(kosong)";
  if (field === "role") return value === "superadmin" ? "Superadmin" : "Teknisi / User";
  if (field === "status") return value === "active" ? "Aktif" : "Nonaktif";
  return value;
}

/**
 * Access Denied Fallback view for non-Superadmin roles.
 */
function AccessDeniedView({ currentUser }: { currentUser: UserProfile }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] gap-4 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shadow-sm">
        <ShieldCheck className="h-8 w-8 text-rose-500" />
      </div>
      <div className="max-w-md">
        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
          Akses Dibatasi
        </span>
        <h2 className="text-xl font-bold text-slate-800 mt-2 mb-1">
          Akses Ditolak
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Halaman <strong>User Management (RBAC)</strong> hanya dapat diakses
          oleh akun dengan hak akses <strong>Superadmin</strong>. Peran Anda saat
          ini adalah <strong>{currentUser.role}</strong> ({currentUser.district}).
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}

/**
 * Main User Management content view (Rendered strictly for Superadmin).
 */
function UserManagementContent({ currentUser }: { currentUser: UserProfile }) {
  // Shared client-side session-memory user store.
  const users = useSyncExternalStore(
    subscribeToManagedUsers,
    getManagedUsers,
    getManagedUsers
  );
  // Resolve the demo-auth identity once to its stable managed-user record ID.
  const currentUserManagedIdRef = useRef<string | null>(
    initialUsers.find((user) => user.nrp === currentUser.nrp)?.id ?? null
  );
  const currentUserManagedId =
    initialUsers.find((user) => user.nrp === currentUser.nrp)?.id ?? null;
  currentUserManagedIdRef.current = currentUserManagedId;

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal State: Add/Edit User
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    nrp: "",
    email: "",
    phone: "",
    district: "" as UserDistrict,
    role: "user" as UserRole,
    status: "active" as UserStatus,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formInfoMessage, setFormInfoMessage] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    userId: string;
    values: EditableUserFields;
    changes: Array<{
      field: keyof EditableUserFields;
      oldValue: string;
      newValue: string;
    }>;
  } | null>(null);
  const [isConfirmingEdit, setIsConfirmingEdit] = useState(false);
  const isApplyingEditRef = useRef(false);
  const cancelPendingEditRef = useRef<() => void>(() => {});

  // Modal State: Status Confirmation
  const [statusModalUser, setStatusModalUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const isDeletingRef = useRef(false);

  // Success Notification banner
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // SSR hydration guard for React Portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut: close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStatusModalUser(null);
        cancelPendingEditRef.current();
        if (!isDeletingRef.current) {
          setDeleteTarget(null);
          setDeleteCountdown(0);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    const timer = window.setInterval(() => {
      setDeleteCountdown((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deleteTarget]);

  useEffect(() => {
    if (!deleteTarget) return;
    const main = document.querySelector("main");
    const previousMainOverflowY = main?.style.overflowY;
    const previousBodyOverflow = document.body.style.overflow;
    if (main) main.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (main) main.style.overflowY = previousMainOverflowY ?? "";
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [deleteTarget]);

  const showAlert = (text: string, type: "success" | "error" | "info" = "success") => {
    setAlertMessage({ type, text });
    setTimeout(() => {
      setAlertMessage(null);
    }, 4000);
  };

  // Metrics Summary Calculations
  const metrics = useMemo(() => {
    const total = users.length;
    const superadmins = users.filter((u) => u.role === "superadmin").length;
    const activeUsers = users.filter((u) => u.role === "user" && u.status === "active").length;
    const inactiveUsers = users.filter((u) => u.status === "inactive").length;
    return { total, superadmins, activeUsers, inactiveUsers };
  }, [users]);

  // Filtered Users Calculation
  const filteredUsers = useMemo(() => {
    const orderedUsers = currentUserManagedId
      ? [
          ...users.filter((user) => user.id === currentUserManagedId),
          ...users.filter((user) => user.id !== currentUserManagedId),
        ]
      : users;

    return orderedUsers.filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.name.toLowerCase().includes(q);
        const matchNrp = u.nrp.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        if (!matchName && !matchNrp && !matchEmail) return false;
      }

      if (roleFilter !== "all" && u.role !== roleFilter) {
        return false;
      }

      if (districtFilter !== "all" && u.district !== districtFilter) {
        return false;
      }

      if (statusFilter !== "all" && u.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [users, currentUserManagedId, searchQuery, roleFilter, districtFilter, statusFilter]);

  // Pagination Calculations
  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedUsers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, safeCurrentPage, pageSize]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setDistrictFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    districtFilter !== "all" ||
    statusFilter !== "all";

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingUserId(null);
    setFormInfoMessage(null);
    setFormData({
      name: "",
      nrp: "",
      email: "",
      phone: "",
      district: "" as UserDistrict,
      role: "user",
      status: "active",
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (user: ManagedUser) => {
    if (currentUser.role !== "superadmin") return;
    setEditingUserId(user.id);
    setFormInfoMessage(null);
    setFormData({
      name: user.name,
      nrp: user.nrp,
      email: user.email,
      phone: formatPhoneNumber(user.phone || ""),
      district: user.district,
      role: user.role,
      status: user.status,
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Save User (Create or Update)
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role !== "superadmin") return;
    setFormInfoMessage(null);
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = "Nama lengkap wajib diisi.";
    if (!formData.nrp.trim()) {
      errors.nrp = "NRP wajib diisi.";
    } else if (!/^NRP-\d{4,8}$/i.test(formData.nrp.trim())) {
      errors.nrp = "Format NRP harus 'NRP-XXXXXX' (contoh: NRP-772104).";
    }
    if (!formData.email.trim()) {
      errors.email = "Email wajib diisi.";
    } else if (!/\S+@\S+\.\S+/.test(formData.email.trim())) {
      errors.email = "Format email tidak valid.";
    }
    if (!formData.district) errors.district = "Pilih distrik penugasan pengguna.";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const normalizedNrp = formData.nrp.trim().toUpperCase();
    if (hasDuplicateManagedUserNrp(normalizedNrp, editingUserId ?? undefined)) {
      setFormErrors({ nrp: DUPLICATE_NRP_MESSAGE });
      return;
    }

    if (editingUserId) {
      const originalUser = getManagedUsers().find((user) => user.id === editingUserId);
      if (!originalUser) {
        showAlert("Data pengguna tidak ditemukan. Perubahan tidak disimpan.", "error");
        return;
      }

      const values: EditableUserFields = {
        name: formData.name.trim(),
        nrp: formData.nrp.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        phone: formatPhoneNumber(formData.phone),
        district: formData.district,
        role:
          currentUser.role === "superadmin" && originalUser.id === currentUserManagedIdRef.current
            ? originalUser.role
            : formData.role,
        status:
          currentUser.role === "superadmin" && originalUser.id === currentUserManagedIdRef.current
            ? originalUser.status
            : formData.status,
      };
      const changes = (Object.keys(values) as (keyof EditableUserFields)[])
        .filter((field) => originalUser[field] !== values[field])
        .map((field) => ({
          field,
          oldValue: originalUser[field],
          newValue: values[field],
        }));

      if (changes.length === 0) {
        setPendingEdit(null);
        setFormInfoMessage(
          "Tidak ada data yang diubah. Semua nilai masih sama dengan data sebelumnya.",
        );
        return;
      }

      setPendingEdit({
        userId: editingUserId,
        values,
        changes,
      });
      return;
    } else {
      const newUser: ManagedUser = {
        id: `usr-${Date.now().toString().slice(-4)}`,
        name: formData.name.trim(),
        nrp: formData.nrp.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        phone: formatPhoneNumber(formData.phone) || "-",
        district: formData.district,
        role: formData.role,
        status: formData.status,
        lastLogin: null,
        createdAt: new Date().toISOString().split("T")[0],
      };
      if (!addManagedUser(newUser)) {
        if (hasDuplicateManagedUserNrp(newUser.nrp)) {
          setFormErrors({ nrp: DUPLICATE_NRP_MESSAGE });
          return;
        }
        showAlert("ID pengguna sudah digunakan. Pengguna tidak ditambahkan.", "error");
        return;
      }
      recordAuditAction({ table: "user_management", operation: "INSERT", recordId: newUser.id });
      showAlert(`Pengguna baru ${newUser.name} berhasil ditambahkan.`);
    }

    setIsFormModalOpen(false);
  };

  const handleConfirmProfileEdit = () => {
    if (currentUser.role !== "superadmin" || isApplyingEditRef.current || !pendingEdit) return;

    isApplyingEditRef.current = true;
    setIsConfirmingEdit(true);
    const latestUsers = getManagedUsers();
    const targetUser = latestUsers.find((user) => user.id === pendingEdit.userId);

    if (!targetUser) {
      showAlert("Data pengguna tidak ditemukan. Perubahan tidak disimpan.", "error");
      setPendingEdit(null);
      setIsFormModalOpen(false);
      setEditingUserId(null);
      setIsConfirmingEdit(false);
      isApplyingEditRef.current = false;
      return;
    }

    const isCurrentSuperadmin =
      currentUser.role === "superadmin" && targetUser.id === currentUserManagedIdRef.current;
    const changesToApply = pendingEdit.changes.filter(
      ({ field }) => !(isCurrentSuperadmin && (field === "role" || field === "status"))
    );
    if (changesToApply.length === 0) {
      setPendingEdit(null);
      setIsConfirmingEdit(false);
      isApplyingEditRef.current = false;
      return;
    }

    const changedValues = Object.fromEntries(
      changesToApply.map(({ field }) => [field, pendingEdit.values[field]])
    ) as Partial<EditableUserFields>;
    const updatedUser = { ...targetUser, ...changedValues };
    if (hasDuplicateManagedUserNrp(updatedUser.nrp, targetUser.id)) {
      setFormErrors({ nrp: DUPLICATE_NRP_MESSAGE });
      setPendingEdit(null);
      setIsConfirmingEdit(false);
      isApplyingEditRef.current = false;
      return;
    }
    const projectedActiveSuperadmins =
      countActiveSuperadmins(latestUsers) -
      Number(isActiveSuperadmin(targetUser)) +
      Number(isActiveSuperadmin(updatedUser));
    if (projectedActiveSuperadmins < 1 || !updateManagedUser(updatedUser)) {
      showAlert("Perubahan tidak dapat disimpan. Minimal harus ada satu akun Superadmin aktif.", "error");
      setPendingEdit(null);
      setIsConfirmingEdit(false);
      isApplyingEditRef.current = false;
      return;
    }
    recordAuditAction({
      table: "user_management",
      operation: "UPDATE",
      recordId: pendingEdit.userId,
    });
    showAlert(`Data pengguna ${pendingEdit.values.name} berhasil diperbarui.`);
    setPendingEdit(null);
    setIsFormModalOpen(false);
    setEditingUserId(null);
    setIsConfirmingEdit(false);
    isApplyingEditRef.current = false;
  };

  const handleCancelProfileEdit = () => {
    setPendingEdit(null);
    setIsFormModalOpen(false);
    setEditingUserId(null);
    setIsConfirmingEdit(false);
    isApplyingEditRef.current = false;
  };
  cancelPendingEditRef.current = handleCancelProfileEdit;

  // Toggle User Status (Activate/Deactivate)
  const handleToggleStatus = (targetUser: ManagedUser) => {
    if (currentUser.role !== "superadmin") {
      setStatusModalUser(null);
      return;
    }
    const latestUsers = getManagedUsers();
    const latestTarget = latestUsers.find((user) => user.id === targetUser.id);
    if (!latestTarget) {
      showAlert("Data pengguna tidak ditemukan. Status tidak diubah.", "error");
      setStatusModalUser(null);
      return;
    }
    if (latestTarget.id === currentUserManagedIdRef.current && latestTarget.status === "active") {
      showAlert("Anda tidak dapat menonaktifkan akun Superadmin Anda sendiri.", "error");
      setStatusModalUser(null);
      return;
    }

    const nextStatus: UserStatus = latestTarget.status === "active" ? "inactive" : "active";
    const updatedUser = { ...latestTarget, status: nextStatus };
    const projectedActiveSuperadmins =
      countActiveSuperadmins(latestUsers) -
      Number(isActiveSuperadmin(latestTarget)) +
      Number(isActiveSuperadmin(updatedUser));
    if (projectedActiveSuperadmins < 1 || !setManagedUserStatus(latestTarget.id, nextStatus)) {
      showAlert("Status tidak dapat diubah. Minimal harus ada satu akun Superadmin aktif.", "error");
      setStatusModalUser(null);
      return;
    }
    recordAuditAction({ table: "user_management", operation: "UPDATE", recordId: latestTarget.id });
    showAlert(
      `Akun ${latestTarget.name} berhasil di${nextStatus === "active" ? "aktifkan" : "nonaktifkan"}.`
    );
    setStatusModalUser(null);
  };

  const cancelDelete = () => {
    if (isDeletingRef.current) return;
    setDeleteTarget(null);
    setDeleteCountdown(0);
  };

  const requestDelete = (user: ManagedUser) => {
    if (currentUser.role !== "superadmin") return;
    if (user.id === currentUserManagedIdRef.current) {
      showAlert("Anda tidak dapat menghapus akun Superadmin Anda sendiri.", "error");
      return;
    }
    const latestUsers = getManagedUsers();
    if (!latestUsers.some((entry) => entry.id === user.id)) return;
    if (isActiveSuperadmin(user) && countActiveSuperadmins(latestUsers) <= 1) {
      showAlert("Akun Superadmin aktif terakhir tidak dapat dihapus.", "error");
      return;
    }
    isDeletingRef.current = false;
    setDeleteCountdown(5);
    setDeleteTarget(user);
  };

  const confirmDelete = () => {
    if (currentUser.role !== "superadmin" || !deleteTarget || deleteCountdown > 0 || isDeletingRef.current) return;
    isDeletingRef.current = true;
    const latestUsers = getManagedUsers();
    const latestTarget = latestUsers.find((user) => user.id === deleteTarget.id);
    if (!latestTarget) {
      showAlert("Data pengguna tidak ditemukan. Pengguna tidak dihapus.", "error");
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      return;
    }
    if (latestTarget.id === currentUserManagedIdRef.current) {
      showAlert("Anda tidak dapat menghapus akun Superadmin Anda sendiri.", "error");
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      return;
    }
    if (isActiveSuperadmin(latestTarget) && countActiveSuperadmins(latestUsers) <= 1) {
      showAlert("Akun Superadmin aktif terakhir tidak dapat dihapus.", "error");
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      return;
    }
    if (!deleteManagedUser(latestTarget.id)) {
      showAlert("Pengguna tidak dapat dihapus. Data mungkin sudah berubah.", "error");
      setDeleteTarget(null);
      setDeleteCountdown(0);
      isDeletingRef.current = false;
      return;
    }

    recordAuditAction({ table: "user_management", operation: "DELETE", recordId: latestTarget.id });
    if (statusModalUser?.id === latestTarget.id) setStatusModalUser(null);
    if (pendingEdit?.userId === latestTarget.id) setPendingEdit(null);
    if (editingUserId === latestTarget.id) {
      setIsFormModalOpen(false);
      setEditingUserId(null);
    }
    setDeleteTarget(null);
    setDeleteCountdown(0);
    isDeletingRef.current = false;
    showAlert(`Pengguna ${latestTarget.name} berhasil dihapus.`);
  };

  // Export Users to CSV
  const handleExportCSV = () => {
    const headers = [
      "ID",
      "Nama",
      "NRP",
      "Email",
      "Telepon",
      "Distrik",
      "Role",
      "Status",
      "Login Terakhir",
      "Dibuat",
    ];
    const rows = filteredUsers.map((u) => [
      u.id,
      `"${u.name.replace(/"/g, '""')}"`,
      u.nrp,
      u.email,
      u.phone || "-",
      u.district,
      u.role === "superadmin" ? "Superadmin" : "Teknisi / User",
      u.status === "active" ? "Aktif" : "Nonaktif",
      u.lastLogin || "Belum Pernah",
      u.createdAt,
    ]);

    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `smartd_users_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert(`Berhasil mengekspor ${filteredUsers.length} data pengguna ke CSV.`);
  };

  const editingUser = editingUserId
    ? users.find((user) => user.id === editingUserId)
    : undefined;
  const isEditingOwnAccount = Boolean(
    currentUser.role === "superadmin" &&
    editingUser &&
    editingUser.id === currentUserManagedIdRef.current
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Alert Notification */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn shadow-sm ${
            alertMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : alertMessage.type === "info"
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : alertMessage.type === "info" ? (
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            User Management (RBAC)
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Kelola akun pengguna portal, penetapan role Superadmin / Teknisi, dan
            akses otorisasi distrik site.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
            title="Ekspor data pengguna yang terfilter ke format CSV"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Ekspor CSV
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Pengguna
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Pengguna</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{metrics.total}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Seluruh akun terdaftar</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Superadmin (HO)</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{metrics.superadmins}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Akses penuh sistem</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Shield className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Teknisi / User Aktif</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{metrics.activeUsers}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Operasional site aktif</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Akun Nonaktif</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">{metrics.inactiveUsers}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Akses ditangguhkan</p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
            <UserX className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari berdasarkan nama, NRP, atau email..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="h-3.5 w-3.5" />
                <span>Filter:</span>
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">Superadmin</option>
                <option value="user">Teknisi / User</option>
              </select>

              {/* District Filter */}
              <select
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Distrik</option>
                <option value="Head Office">Head Office</option>
                <option value="Sangatta">Sangatta</option>
                <option value="Bengalon">Bengalon</option>
                <option value="Wahau">Wahau</option>
                <option value="Sangatta Utara">Sangatta Utara</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>

              {/* Reset Filter Button */}
              {isFiltered && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  title="Reset seluruh filter pencarian"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide">
                <th className="py-3 px-4">Pengguna</th>
                <th className="py-3 px-4">NRP</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Distrik</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Login Terakhir</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      <Users className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Tidak ada pengguna ditemukan
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Tidak ada data yang cocok dengan kriteria pencarian dan filter saat ini.
                    </p>
                    {isFiltered && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
                      >
                        Reset Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => {
                      const isCurrentSession = user.id === currentUserManagedId;
                  const cannotDelete =
                    isCurrentSession ||
                    (isActiveSuperadmin(user) && countActiveSuperadmins(users) <= 1);
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/75 transition-colors group"
                    >
                      {/* Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                              <span>{user.name}</span>
                              {isCurrentSession && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-blue-100 text-blue-700 border border-blue-200">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate flex items-center gap-2 mt-0.5">
                              <span>{user.email}</span>
                              {user.phone && user.phone !== "-" && (
                                <span className="text-slate-300">• {formatPhoneNumber(user.phone)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* NRP */}
                      <td className="py-3 px-4 tabular-nums font-medium text-slate-700">
                        {user.nrp}
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        {user.role === "superadmin" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Shield className="h-3 w-3" />
                            Superadmin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <UserCheck className="h-3 w-3" />
                            Teknisi / User
                          </span>
                        )}
                      </td>

                      {/* District */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          {user.district}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {user.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                            Nonaktif
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {user.lastLogin ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>{user.lastLogin}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Belum pernah</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 rounded-md hover:bg-slate-200/60 text-slate-600 hover:text-slate-900 transition"
                            title="Edit Data Pengguna"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setStatusModalUser(user)}
                            disabled={isCurrentSession && user.status === "active"}
                            className={`p-1.5 rounded-md transition ${
                              user.status === "active"
                                ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            }`}
                            title={
                              isCurrentSession
                                ? "Tidak dapat menonaktifkan akun sendiri"
                                : user.status === "active"
                                ? "Nonaktifkan Akun"
                                : "Aktifkan Akun"
                            }
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          {currentUser.role === "superadmin" && (
                            <button
                              onClick={() => requestDelete(user)}
                              disabled={cannotDelete}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                              title={
                                isCurrentSession
                                  ? "Tidak dapat menghapus akun sendiri"
                                  : cannotDelete
                                  ? "Superadmin aktif terakhir tidak dapat dihapus"
                                  : "Hapus Pengguna"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-slate-700"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              baris | Menampilkan{" "}
              <strong className="text-slate-800">
                {totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
              </strong>{" "}
              –{" "}
              <strong className="text-slate-800">
                {Math.min(safeCurrentPage * pageSize, totalItems)}
              </strong>{" "}
              dari <strong className="text-slate-800">{totalItems}</strong> pengguna
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Halaman Pertama"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              Hal {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Halaman Terakhir"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Form Modal: Tambah / Edit Pengguna */}
      {mounted && isFormModalOpen && createPortal(
        <div
          onClick={() => setIsFormModalOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {editingUserId ? "Edit Data Pengguna" : "Tambah Pengguna Baru"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingUserId
                      ? "Perbarui penetapan role dan otoritas distrik"
                      : "Daftarkan pengguna baru ke dalam portal SMARTD"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 text-xs">
              {formInfoMessage && (
                <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  {formInfoMessage}
                </div>
              )}
              {/* Nama Lengkap */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Andi Saputra"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    formErrors.name ? "border-rose-400 bg-rose-50/30" : "border-slate-200"
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.name && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* NRP & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NRP <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nrp}
                    onChange={(e) =>
                      setFormData({ ...formData, nrp: e.target.value.toUpperCase() })
                    }
                    placeholder="Contoh: NRP-773821"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      formErrors.nrp ? "border-rose-400 bg-rose-50/30" : "border-slate-200"
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.nrp && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.nrp}</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Perusahaan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="nama@smartd.demo"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      formErrors.email ? "border-rose-400 bg-rose-50/30" : "border-slate-200"
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {formErrors.email && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.email}</p>
                  )}
                </div>
              </div>

              {/* No. Telepon & Distrik */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Telepon / WA
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    onBlur={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.currentTarget.value) })}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Distrik Penugasan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.district}
                    onChange={(e) =>
                      setFormData({ ...formData, district: e.target.value as UserDistrict })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">-- Pilih Distrik --</option>
                    {DISTRICT_OPTIONS.map((dist) => (
                      <option key={dist} value={dist}>
                        {dist}
                      </option>
                    ))}
                  </select>
                  {formErrors.district && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.district}</p>
                  )}
                </div>
              </div>

              {/* Role & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Role Hak Akses <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    disabled={isEditingOwnAccount}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="user">Teknisi / User</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {isEditingOwnAccount
                      ? "Role tidak dapat diubah."
                      : "Superadmin memiliki akses menu User Management & konfigurasi."}
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status Akun <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.status}
                    disabled={isEditingOwnAccount}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as UserStatus })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {isEditingOwnAccount
                      ? "Status tidak dapat diubah."
                      : "Akun nonaktif tidak dapat login ke dalam portal."}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-sm"
                >
                  {editingUserId ? "Simpan Perubahan" : "Tambah Pengguna"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Modal: Save Profile Edit */}
      {mounted && pendingEdit && createPortal(
        <div
          onClick={handleCancelProfileEdit}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-profile-edit-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-blue-50 text-blue-600 border border-blue-100">
              <Edit2 className="h-6 w-6" />
            </div>
            <h3 id="confirm-profile-edit-title" className="text-base font-bold text-slate-800">
              Konfirmasi Perubahan Data Pengguna
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Apakah Anda yakin ingin menyimpan perubahan data pengguna ini?
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto text-left">
              {pendingEdit.changes.map((change) => (
                <div key={change.field} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">{EDITABLE_FIELD_LABELS[change.field]}</p>
                  <div className="mt-1 grid grid-cols-2 gap-3 text-[11px]">
                    <p className="break-words text-slate-500"><span className="font-medium text-slate-600">Lama: </span>{formatEditValue(change.field, change.oldValue)}</p>
                    <p className="break-words text-slate-700"><span className="font-medium">Baru: </span>{formatEditValue(change.field, change.newValue)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={handleCancelProfileEdit}
                disabled={isConfirmingEdit}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmProfileEdit}
                disabled={isConfirmingEdit}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ya, Simpan Perubahan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Modal: Toggle Status */}
      {mounted && statusModalUser && createPortal(
        <div
          onClick={() => setStatusModalUser(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                statusModalUser.status === "active"
                  ? "bg-rose-50 text-rose-500 border border-rose-100"
                  : "bg-emerald-50 text-emerald-500 border border-emerald-100"
              }`}
            >
              <Power className="h-6 w-6" />
            </div>

            <h3 className="text-base font-bold text-slate-800">
              {statusModalUser.status === "active"
                ? "Nonaktifkan Akun Pengguna?"
                : "Aktifkan Akun Pengguna?"}
            </h3>

            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Apakah Anda yakin ingin{" "}
              {statusModalUser.status === "active" ? "menonaktifkan" : "mengaktifkan"}{" "}
              akun <strong>{statusModalUser.name}</strong> ({statusModalUser.nrp})?
              {statusModalUser.status === "active" && (
                <span className="block mt-1 text-rose-600 font-medium">
                  Pengguna ini tidak akan dapat mengakses portal sampai diaktifkan kembali.
                </span>
              )}
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setStatusModalUser(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleToggleStatus(statusModalUser)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition shadow-sm ${
                  statusModalUser.status === "active"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {statusModalUser.status === "active"
                  ? "Ya, Nonaktifkan Akun"
                  : "Ya, Aktifkan Akun"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Modal: Permanent User Delete */}
      {mounted && deleteTarget && createPortal(
        <div
          onClick={cancelDelete}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-user-delete-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 id="confirm-user-delete-title" className="text-base font-bold text-slate-800">
              Hapus Pengguna Secara Permanen?
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Pengguna <strong>{deleteTarget.name}</strong> ({deleteTarget.nrp}) akan dihapus dari store demo sesi ini. Tindakan ini tidak dapat dibatalkan.
            </p>
            <p className="text-xs font-semibold text-rose-600 mt-3">
              {deleteCountdown > 0
                ? `Konfirmasi tersedia dalam ${deleteCountdown} detik.`
                : "Periksa kembali target sebelum melanjutkan."}
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isDeletingRef.current}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteCountdown > 0 || currentUser.role !== "superadmin"}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteCountdown > 0 ? `Tunggu ${deleteCountdown} detik` : "Ya, Hapus Pengguna"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Root User Management Page with Strict RBAC Guard.
 */
export default function UserManagementPage() {
  const { currentUser } = useAuth();

  // Strict RBAC Guard: non-Superadmin users cannot access the inner content or trigger its hooks
  if (currentUser.role !== "superadmin") {
    return <AccessDeniedView currentUser={currentUser} />;
  }

  return <UserManagementApi />;
}
