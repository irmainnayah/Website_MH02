"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Info,
  Lock,
  Save,
  Upload,
  X,
  ChevronDown,
} from "lucide-react";
import { devices } from "@/lib/mock-data/devices";
import { getEquipmentTypeByUnit, getEgiByUnit, getFleetMasterByUnit, matchesUnitNumberSearch } from "@/lib/mock-data/fleet";
import { useAuth } from "@/features/auth/AuthContext";
import { TECHNICIANS } from "@/lib/mock-data/installations";
import {
  addTroubleshootRecord,
  getTroubleshootRecords,
  getNextTroubleshootFormNumber,
  subscribeToTroubleshootRecords,
  updateTroubleshootRecord,
} from "@/lib/mock-data/troubleshoots";
import {
  TroubleshootEquipmentType,
  TroubleshootFormData,
  TroubleshootRecord,
} from "@/types/troubleshoot";
import { DistrictName } from "@/types/dashboard";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import {
  calculateWorkDuration,
  normalizeToDateTimeString,
  scrollToErrorSummary,
} from "@/lib/utils";

const EQUIPMENT_TYPES: TroubleshootEquipmentType[] = [
  "MH02 Device",
  "GPS/Antenna",
  "Camera",
  "Wiring",
  "Speaker",
  "SPM",
  "CPE",
  "Firmware",
];

const EMPTY_FORM: TroubleshootFormData = {
  deviceId: "",
  unitNo: "",
  district: "" as DistrictName,
  technicianName: "",
  technicianNrp: "",
  activityDate: new Date().toISOString().slice(0, 10),
  startTime: "",
  endTime: "",
  equipmentType: "" as TroubleshootEquipmentType,
  issue: "",
  actionTaken: "",
  remarks: "",
  photos: { beforeRepair: "", afterRepair: "" },
  photoCaptions: { beforeRepair: "", afterRepair: "" },
};

interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableDropdownProps {
  id: string;
  value: string;
  options: SearchableOption[];
  placeholder: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  inputClassName?: string;
  displayValue?: string;
}

function SearchableDropdown({
  id,
  value,
  options,
  placeholder,
  onChange,
  error = false,
  disabled = false,
  inputClassName = "",
  displayValue,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) => {
    if (!query.trim()) return true;
    if (id.includes("unit") || id.includes("unit-no")) {
      return matchesUnitNumberSearch(option.value, query) || matchesUnitNumberSearch(option.label, query);
    }
    return `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, []);

  const openDropdown = () => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
  };

  const selectOption = (option: SearchableOption) => {
    onChange(option.value);
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return (
    <div ref={rootRef} className={`relative ${isOpen ? "z-30" : ""}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        value={isOpen ? query : displayValue ?? selectedOption?.label ?? value}
        onClick={() => {
          if (!isOpen) openDropdown();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) openDropdown();
            else if (filteredOptions.length)
              setActiveIndex((index) => (index + 1) % filteredOptions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) openDropdown();
            else if (filteredOptions.length)
              setActiveIndex(
                (index) => (index - 1 + filteredOptions.length) % filteredOptions.length
              );
          } else if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            const option = filteredOptions[activeIndex];
            if (option) selectOption(option);
          }
        }}
        onBlur={(event) => {
          if (event.relatedTarget && rootRef.current?.contains(event.relatedTarget as Node))
            return;
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery("");
          }, 0);
        }}
        placeholder={placeholder}
        className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 pr-9 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${error ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
          } ${inputClassName}`}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={`Tampilkan opsi ${placeholder}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            setQuery("");
          } else {
            openDropdown();
          }
        }}
        className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-slate-500 hover:text-slate-700 disabled:opacity-60"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {isOpen && (
        <div
          id={`${id}-options`}
          role="listbox"
          ref={listRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-[220px] w-full overflow-y-auto overscroll-y-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${id}-option-${index}`}
                data-option-index={index}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={`block w-full px-3 py-2 text-left text-xs text-slate-700 ${index === activeIndex ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50"
                  }`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">Tidak ada hasil</p>
          )}
        </div>
      )}
    </div>
  );
}

type PhotoSlot = keyof TroubleshootFormData["photos"];
type AlertState = { type: "success" | "error" | "info"; text: string } | null;
type TroubleshootEditChange = { field: string; oldValue: string; newValue: string };
type PendingTroubleshootEdit = { record: TroubleshootRecord; changes: TroubleshootEditChange[] };

function editChanges(original: TroubleshootRecord, proposed: TroubleshootRecord): TroubleshootEditChange[] {
  const photoValue = (value: string | undefined, version: "lama" | "usulan") =>
    value ? `Foto tersedia (${version})` : "Tidak ada foto";
  const fields: Array<{ field: string; oldRaw: string; newRaw: string; oldValue?: string; newValue?: string }> = [
    { field: "Device ID", oldRaw: original.deviceId, newRaw: proposed.deviceId },
    { field: "Unit Number", oldRaw: original.unitNo, newRaw: proposed.unitNo },
    { field: "Distrik", oldRaw: original.district, newRaw: proposed.district },
    { field: "Teknisi", oldRaw: original.technicianName, newRaw: proposed.technicianName },
    { field: "NRP", oldRaw: original.technicianNrp ?? "", newRaw: proposed.technicianNrp ?? "" },
    { field: "Tanggal", oldRaw: original.activityDate, newRaw: proposed.activityDate },
    { field: "Waktu mulai", oldRaw: original.startTime, newRaw: proposed.startTime },
    { field: "Waktu selesai", oldRaw: original.endTime, newRaw: proposed.endTime },
    { field: "Durasi", oldRaw: String(original.durationMinutes), newRaw: String(proposed.durationMinutes), oldValue: `${original.durationMinutes} menit`, newValue: `${proposed.durationMinutes} menit` },
    { field: "Equipment type", oldRaw: original.equipmentType, newRaw: proposed.equipmentType },
    { field: "Issue", oldRaw: original.issue, newRaw: proposed.issue },
    { field: "Action taken", oldRaw: original.actionTaken, newRaw: proposed.actionTaken },
    { field: "Remarks", oldRaw: original.remarks ?? "", newRaw: proposed.remarks ?? "" },
    { field: "Foto sebelum perbaikan", oldRaw: original.photos?.beforeRepair ?? "", newRaw: proposed.photos?.beforeRepair ?? "", oldValue: photoValue(original.photos?.beforeRepair, "lama"), newValue: photoValue(proposed.photos?.beforeRepair, "usulan") },
    { field: "Caption foto sebelum", oldRaw: original.photoCaptions?.beforeRepair ?? "", newRaw: proposed.photoCaptions?.beforeRepair ?? "" },
    { field: "Foto sesudah perbaikan", oldRaw: original.photos?.afterRepair ?? "", newRaw: proposed.photos?.afterRepair ?? "", oldValue: photoValue(original.photos?.afterRepair, "lama"), newValue: photoValue(proposed.photos?.afterRepair, "usulan") },
    { field: "Caption foto sesudah", oldRaw: original.photoCaptions?.afterRepair ?? "", newRaw: proposed.photoCaptions?.afterRepair ?? "" },
  ];

  return fields
    .filter(({ oldRaw, newRaw }) => oldRaw !== newRaw)
    .map(({ field, oldRaw, newRaw, oldValue, newValue }) => ({
      field,
      oldValue: oldValue ?? (oldRaw || "(kosong)"),
      newValue: newValue ?? (newRaw || "(kosong)"),
    }));
}

// Real-time duration calculation handled via calculateWorkDuration from @/lib/utils

export default function NewTroubleshootPage() {
  return <React.Suspense fallback={<div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Memuat form Troubleshoot...</div>}><TroubleshootFormPage /></React.Suspense>;
}

function TroubleshootFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get("edit");
  const isEditMode = Boolean(editId);
  const { currentUser } = useAuth();
  const records = useSyncExternalStore(
    subscribeToTroubleshootRecords,
    getTroubleshootRecords,
    getTroubleshootRecords
  );
  const editingRecord = editId ? records.find((record) => record.id === editId) : undefined;
  const eligibleDevices = useMemo(() => {
    const available = devices.filter((device) => device.status === "in_use");
    if (editingRecord && !available.some((device) => device.deviceId === editingRecord.deviceId)) {
      const historicalDevice = devices.find((device) => device.deviceId === editingRecord.deviceId);
      if (historicalDevice) return [...available, historicalDevice];
    }
    return available;
  }, [editingRecord]);
  const [formData, setFormData] = useState<TroubleshootFormData>(EMPTY_FORM);
  const [formNumber, setFormNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<AlertState>(null);
  const [submitted, setSubmitted] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingTroubleshootEdit | null>(null);
  const [showNoChangesModal, setShowNoChangesModal] = useState(false);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const initializedEditIdRef = useRef<string | null>(null);
  const isApplyingEditRef = useRef(false);
  const isCreatingRef = useRef(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<{ title: string; url: string; caption: string } | null>(null);
  const duration = calculateWorkDuration(formData.startTime, formData.endTime, formData.activityDate);
  const selectedDevice = eligibleDevices.find((device) => device.deviceId === formData.deviceId);
  const selectedDeviceExists = devices.find((device) => device.deviceId === formData.deviceId);

  const deviceOptions: SearchableOption[] = useMemo(() => {
    return eligibleDevices.map((device) => {
      const unit = device.unitNo ?? (editingRecord?.deviceId === device.deviceId ? editingRecord.unitNo : "-");
      const dist = device.district ?? (editingRecord?.deviceId === device.deviceId ? editingRecord.district : "-");
      return {
        value: device.deviceId,
        label: `${device.deviceId} (${device.serialNumber}) · Unit: ${unit} [${dist}]`,
      };
    });
  }, [eligibleDevices, editingRecord]);

  const technicianOptions: SearchableOption[] = useMemo(() => {
    return TECHNICIANS.map((technician) => ({
      value: technician.name,
      label: `${technician.name} (${technician.nrp})`,
    }));
  }, []);

  const equipmentTypeOptions: SearchableOption[] = useMemo(() => {
    return EQUIPMENT_TYPES.map((type) => ({
      value: type,
      label: type,
    }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showNoChangesModal) {
        setShowNoChangesModal(false);
      } else if (pendingEdit) {
        setPendingEdit(null);
      } else {
        setZoomedPhoto(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingEdit, showNoChangesModal, router]);

  useEffect(() => {
    if (!createdRecordId) return;
    const main = document.querySelector("main");
    const previousMainOverflowY = main?.style.overflowY;
    const previousBodyOverflow = document.body.style.overflow;
    if (main) main.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (main) main.style.overflowY = previousMainOverflowY ?? "";
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [createdRecordId]);

  useEffect(() => {
    if (!editId) {
      initializedEditIdRef.current = null;
      setFormNumber(getNextTroubleshootFormNumber());
      setIsFormReady(true);
      return;
    }
    if (initializedEditIdRef.current === editId) return;
    initializedEditIdRef.current = editId;

    if (currentUser.role !== "superadmin") {
      router.replace(`/support/troubleshoots/${encodeURIComponent(editId)}`);
      return;
    }
    if (!editingRecord) {
      router.replace(`/support/troubleshoots/${encodeURIComponent(editId)}`);
      return;
    }

    setFormNumber(editingRecord.id);
    setFormData({
      deviceId: editingRecord.deviceId,
      unitNo: editingRecord.unitNo,
      district: editingRecord.district,
      technicianName: editingRecord.technicianName,
      technicianNrp: editingRecord.technicianNrp ?? "",
      activityDate: editingRecord.activityDate,
      startTime: normalizeToDateTimeString(editingRecord.startTime, editingRecord.activityDate),
      endTime: normalizeToDateTimeString(editingRecord.endTime, editingRecord.activityDate),
      equipmentType: editingRecord.equipmentType,
      issue: editingRecord.issue,
      actionTaken: editingRecord.actionTaken,
      remarks: editingRecord.remarks ?? "",
      photos: {
        beforeRepair: editingRecord.photos?.beforeRepair ?? "",
        afterRepair: editingRecord.photos?.afterRepair ?? "",
      },
      photoCaptions: {
        beforeRepair: editingRecord.photoCaptions?.beforeRepair ?? "",
        afterRepair: editingRecord.photoCaptions?.afterRepair ?? "",
      },
    });
    setIsFormReady(true);
  }, [currentUser.role, editId, editingRecord, router]);

  const update = <K extends keyof TroubleshootFormData>(key: K, value: TroubleshootFormData[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const selectDevice = (deviceId: string) => {
    const device = eligibleDevices.find((item) => item.deviceId === deviceId);
    const historicalSelection = isEditMode && editingRecord?.deviceId === deviceId;
    setFormData((current) => ({
      ...current,
      deviceId,
      unitNo: device?.unitNo ?? (historicalSelection ? editingRecord?.unitNo : "") ?? "",
      district: (device?.district ?? (historicalSelection ? editingRecord?.district : "")) as DistrictName,
    }));
  };

  const selectTechnician = (name: string) => {
    const technician = TECHNICIANS.find((item) => item.name === name);
    setFormData((current) => ({
      ...current,
      technicianName: name,
      technicianNrp: technician?.nrp ?? "",
    }));
  };

  const handlePhoto = (slot: PhotoSlot, file?: File) => {
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setAlert({ type: "error", text: "Pilih file gambar PNG atau JPG." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAlert({ type: "error", text: "Ukuran foto maksimal 5 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFormData((current) => ({
          ...current,
          photos: { ...current.photos, [slot]: reader.result as string },
        }));
        setAlert(null);
      }
    };
    reader.onerror = () => setAlert({ type: "error", text: "Foto tidak dapat dibaca." });
    reader.readAsDataURL(file);
  };

  const removePhoto = (slot: PhotoSlot) => {
    const captionKey = slot;
    setFormData((current) => ({
      ...current,
      photos: { ...current.photos, [slot]: "" },
      photoCaptions: { ...current.photoCaptions, [captionKey]: "" },
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isEditMode) {
      if (submitted || isCreatingRef.current) return;
      isCreatingRef.current = true;
    }
    if (isEditMode && currentUser.role !== "superadmin") return;
    const originalRecord = isEditMode
      ? getTroubleshootRecords().find((record) => record.id === editId)
      : undefined;
    if (isEditMode && !originalRecord) {
      setAlert({ type: "error", text: "Laporan tidak ditemukan. Perubahan tidak disimpan." });
      if (editId) router.push(`/support/troubleshoots/${encodeURIComponent(editId)}`);
      return;
    }

    const nextErrors: Record<string, string> = {};
    const usingOriginalDeviceSnapshot = Boolean(isEditMode && originalRecord?.deviceId === formData.deviceId);
    const validDevice = usingOriginalDeviceSnapshot
      ? Boolean(selectedDeviceExists && formData.unitNo.trim() && formData.district)
      : Boolean(selectedDevice?.status === "in_use" && selectedDevice.unitNo && selectedDevice.district);
    if (!validDevice) nextErrors.deviceId = "Pilih perangkat aktif dari master perangkat.";
    if (!formData.technicianName) nextErrors.technicianName = "Pilih teknisi pelaksana.";
    if (!formData.activityDate) nextErrors.activityDate = "Tanggal aktivitas wajib diisi.";
    if (!formData.startTime || !formData.endTime) nextErrors.time = "Start Date & Time dan Finish Date & Time wajib diisi.";
    else if (!duration.isValid) nextErrors.time = duration.formatted;
    if (!formData.equipmentType) nextErrors.equipmentType = "Pilih equipment type.";
    if (!formData.issue.trim()) nextErrors.issue = "Deskripsi issue wajib diisi.";
    if (!formData.actionTaken.trim()) nextErrors.actionTaken = "Action taken wajib diisi.";

    // Validasi foto perbaikan wajib
    if (!formData.photos.beforeRepair) {
      nextErrors.photo_beforeRepair = "Foto sebelum perbaikan wajib diunggah.";
    }
    if (!formData.photos.afterRepair) {
      nextErrors.photo_afterRepair = "Foto sesudah perbaikan wajib diunggah.";
    }

    if (Object.keys(nextErrors).length) {
      if (!isEditMode) isCreatingRef.current = false;
      setErrors(nextErrors);
      setAlert({ type: "error", text: "Periksa kembali field wajib pada form." });
      scrollToErrorSummary();
      return;
    }

    const id = isEditMode ? originalRecord!.id : (formNumber || getNextTroubleshootFormNumber());
    const cleanUnit = formData.unitNo.trim();
    const troubleshootMaster = getFleetMasterByUnit(cleanUnit);
    const normalizedRecord: TroubleshootRecord = {
      ...(originalRecord ?? {} as TroubleshootRecord),
      id,
      deviceId: formData.deviceId,
      unitNo: cleanUnit,
      fleetEquipmentType: troubleshootMaster?.equipmentType,
      egi: troubleshootMaster?.egi ?? "",
      district: formData.district,
      technicianName: formData.technicianName.trim(),
      technicianNrp: formData.technicianNrp.trim() || undefined,
      activityDate: formData.activityDate,
      dateTime: `${formData.activityDate} ${formData.startTime}`,
      startTime: formData.startTime,
      endTime: formData.endTime,
      durationMinutes: duration.minutes,
      equipmentType: formData.equipmentType,
      issue: formData.issue.trim(),
      actionTaken: formData.actionTaken.trim(),
      photos: {
        beforeRepair: formData.photos.beforeRepair || undefined,
        afterRepair: formData.photos.afterRepair || undefined,
      },
      photoCaptions: {
        beforeRepair: formData.photoCaptions.beforeRepair.trim() || undefined,
        afterRepair: formData.photoCaptions.afterRepair.trim() || undefined,
      },
      remarks: formData.remarks.trim() || undefined,
      createdAt: originalRecord?.createdAt ?? new Date().toISOString(),
    };

    if (isEditMode && originalRecord) {
      const changes = editChanges(originalRecord, normalizedRecord);
      if (changes.length === 0) {
        setPendingEdit(null);
        setShowNoChangesModal(true);
        setAlert(null);
        setErrors({});
        return;
      }
      setShowNoChangesModal(false);
      setPendingEdit({ record: normalizedRecord, changes });
      setAlert(null);
      setErrors({});
      return;
    }

    const record = normalizedRecord;
    const added = addTroubleshootRecord(record);
    if (!added) {
      isCreatingRef.current = false;
      setAlert({ type: "error", text: `Laporan ${record.id} tidak dapat disimpan karena nomor laporan sudah digunakan.` });
      return;
    }
    recordAuditAction({ table: "troubleshoot", operation: "INSERT", recordId: record.id });
    setSubmitted(true);
    setErrors({});
    setAlert(null);
    setCreatedRecordId(record.id);
  };

  const cancelPendingEdit = () => {
    if (!pendingEdit || isApplyingEditRef.current) return;
    setPendingEdit(null);
  };

  const confirmPendingEdit = () => {
    if (currentUser.role !== "superadmin" || isApplyingEditRef.current || !pendingEdit) return;
    isApplyingEditRef.current = true;
    setIsApplyingEdit(true);
    const currentRecord = getTroubleshootRecords().find((record) => record.id === pendingEdit.record.id);
    if (!currentRecord) {
      const id = pendingEdit.record.id;
      setPendingEdit(null);
      setAlert({ type: "error", text: "Laporan tidak ditemukan. Perubahan tidak disimpan." });
      setIsApplyingEdit(false);
      isApplyingEditRef.current = false;
      router.push(`/support/troubleshoots/${encodeURIComponent(id)}`);
      return;
    }

    const saved = updateTroubleshootRecord({
      ...pendingEdit.record,
      createdAt: currentRecord.createdAt,
    });
    if (!saved) {
      setPendingEdit(null);
      setAlert({ type: "error", text: "Laporan gagal diperbarui. Tidak ada perubahan yang disimpan." });
      setIsApplyingEdit(false);
      isApplyingEditRef.current = false;
      router.push(`/support/troubleshoots/${encodeURIComponent(pendingEdit.record.id)}`);
      return;
    }

    recordAuditAction({ table: "troubleshoot", operation: "UPDATE", recordId: pendingEdit.record.id });
    const id = pendingEdit.record.id;
    setPendingEdit(null);
    setIsApplyingEdit(false);
    isApplyingEditRef.current = false;
    router.push(`/support/troubleshoots/${encodeURIComponent(id)}`);
  };

  const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const readOnlyClass = "w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600";

  if (isEditMode && !isFormReady) {
    return <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Memuat laporan Troubleshoot...</div>;
  }
  if (isEditMode && currentUser.role !== "superadmin") {
    return <div className="mx-auto max-w-5xl rounded-xl border border-rose-200 bg-white p-8 text-center"><h1 className="text-base font-bold text-slate-800">Akses ditolak</h1><p className="mt-2 text-xs text-slate-500">Hanya Superadmin yang dapat mengubah laporan Troubleshoot.</p><Link href={editId ? `/support/troubleshoots/${encodeURIComponent(editId)}` : "/support/troubleshoots"} className="mt-4 inline-flex rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Kembali</Link></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <Link href={isEditMode && editId ? `/support/troubleshoots/${encodeURIComponent(editId)}` : "/support/troubleshoots"} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Troubleshoots
        </Link>
        {!submitted && <Link href={isEditMode && editId ? `/support/troubleshoots/${encodeURIComponent(editId)}` : "/support/troubleshoots"} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><X className="h-3.5 w-3.5" /> Batal</Link>}
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <span className="rounded-md border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">SMARTD DISPLAY • Troubleshoot</span>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-800"><Cpu className="h-5 w-5 text-orange-500" /> {isEditMode ? "Edit Troubleshoot" : "New Troubleshoot"}</h1>
          <p className="mt-1 text-xs text-slate-500">{isEditMode ? "Perbarui data laporan Troubleshoot yang tersimpan." : "Catat gangguan dan tindakan perbaikan pada perangkat SMARTD DISPLAY."}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
          <p className="flex items-center justify-end gap-1 text-[11px] font-medium text-slate-500"><Lock className="h-3 w-3" /> No. Laporan</p>
          <p className="mt-0.5 tabular-nums text-base font-bold text-orange-600">{formNumber || "TRB-..."}</p>
          <p className="text-[10px] text-slate-400">Format prototipe; menunggu konfirmasi.</p>
        </div>
      </div>

      {alert && <div className={`flex items-center gap-2 rounded-xl border p-4 text-xs font-medium ${alert.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : alert.type === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
        {alert.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : alert.type === "info" ? <Info className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{alert.text}
      </div>}
      {Object.keys(errors).length > 0 && <div data-error-summary="true" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"><b>Mohon periksa field wajib:</b><ul className="mt-1 list-inside list-disc">{Object.values(errors).map((error) => <li key={error}>{error}</li>)}</ul></div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-800"><FileText className="h-4 w-4 text-blue-600" /> 1. Informasi Laporan</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">No. Laporan</label>
              <input value={formNumber} readOnly className={`${readOnlyClass} mt-1 tabular-nums`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Tanggal <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.activityDate}
                onChange={(event) => update("activityDate", event.target.value)}
                className={`${inputClass} mt-1 ${errors.activityDate ? "border-rose-300 bg-rose-50/50" : ""}`}
              />
              {errors.activityDate && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.activityDate}</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Cpu className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">2. Perangkat</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Perangkat <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="troubleshoot-device-select"
                value={formData.deviceId}
                options={deviceOptions}
                placeholder="Pilih atau cari Device ID..."
                error={Boolean(errors.deviceId)}
                onChange={selectDevice}
              />
              {errors.deviceId && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.deviceId}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Number</label>
              <input value={formData.unitNo} readOnly placeholder="Mengikuti perangkat terpilih" className={`${readOnlyClass} font-bold uppercase placeholder-slate-400 cursor-not-allowed`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Alat Berat</label>
              <input value={getFleetMasterByUnit(formData.unitNo)?.equipmentType ?? ""} readOnly placeholder="Mengikuti unit terpilih" className={`${readOnlyClass} font-semibold cursor-not-allowed`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">EGI (Model Unit)</label>
              <input value={getFleetMasterByUnit(formData.unitNo)?.egi ?? ""} readOnly placeholder="Mengikuti unit terpilih" className={`${readOnlyClass} font-semibold cursor-not-allowed`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Distrik</label>
              <input value={formData.district ?? ""} readOnly placeholder="Mengikuti perangkat terpilih" className={`${readOnlyClass} font-medium cursor-not-allowed`} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">3. Personel &amp; Waktu</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teknisi Pelaksana <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="troubleshoot-tech-select"
                value={formData.technicianName}
                options={technicianOptions}
                placeholder="Pilih Teknisi..."
                error={Boolean(errors.technicianName)}
                onChange={selectTechnician}
              />
              {errors.technicianName && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.technicianName}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NRP</label>
              <input value={formData.technicianNrp} readOnly placeholder="Terisi dari pilihan teknisi" className={`${readOnlyClass} cursor-not-allowed`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date & Time <span className="text-rose-500">*</span></label>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(event) => {
                  const val = event.target.value;
                  update("startTime", val);
                  if (val && !formData.activityDate) {
                    update("activityDate", val.slice(0, 10));
                  }
                }}
                className={`${inputClass} ${errors.time ? "border-rose-300 bg-rose-50/50" : ""}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Finish Date & Time <span className="text-rose-500">*</span></label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                className={`${inputClass} ${errors.time ? "border-rose-300 bg-rose-50/50" : ""}`}
              />
            </div>
          </div>
          {errors.time && (
            <p className="text-[11px] text-rose-600">{errors.time}</p>
          )}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5"><span className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Clock className="h-4 w-4 text-violet-600" /> Durasi otomatis</span><span className={`text-xs font-bold ${duration.isValid ? "text-violet-700" : "text-slate-500"}`}>{duration.formatted}{duration.isValid ? ` (${duration.minutes} Menit)` : ""}</span></div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">4. Gangguan &amp; Tindakan</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Equipment type <span className="text-rose-500">*</span>
            </label>
            <SearchableDropdown
              id="troubleshoot-equipment-select"
              value={formData.equipmentType}
              options={equipmentTypeOptions}
              placeholder="Pilih equipment type..."
              error={Boolean(errors.equipmentType)}
              onChange={(val) => update("equipmentType", val as TroubleshootEquipmentType)}
            />
            {errors.equipmentType && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.equipmentType}</p>
            )}
          </div>
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800"><Info className="h-4 w-4 shrink-0" />Delapan opsi equipment type mengikuti tipe data prototipe dan masih menunggu konfirmasi kebutuhan bisnis.</div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Issue <span className="text-rose-500">*</span></label>
            <textarea rows={3} value={formData.issue} onChange={(event) => update("issue", event.target.value)} className={`${inputClass} mt-1 ${errors.issue ? "border-rose-300 bg-rose-50/50" : ""}`} placeholder="Deskripsikan gangguan yang ditemukan." />
            {errors.issue && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.issue}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Action taken <span className="text-rose-500">*</span></label>
            <textarea rows={3} value={formData.actionTaken} onChange={(event) => update("actionTaken", event.target.value)} className={`${inputClass} mt-1 ${errors.actionTaken ? "border-rose-300 bg-rose-50/50" : ""}`} placeholder="Catat tindakan perbaikan yang dilakukan." />
            {errors.actionTaken && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.actionTaken}</p>
            )}
          </div>
          <label className="block text-xs font-semibold text-slate-700">Remarks<textarea rows={2} value={formData.remarks} onChange={(event) => update("remarks", event.target.value)} className={`${inputClass} mt-1`} placeholder="Opsional" /></label>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-800"><Camera className="h-4 w-4 text-blue-600" /> 5. Foto Perbaikan</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["beforeRepair", "afterRepair"] as const).map((slot) => {
              const title = slot === "beforeRepair" ? "Sebelum perbaikan" : "Sesudah perbaikan";
              const photo = formData.photos[slot];
              const photoErrorKey = `photo_${slot}`;
              const hasPhotoError = Boolean(errors[photoErrorKey]);
              return <div key={slot} className={`space-y-3 rounded-xl border p-4 ${hasPhotoError ? "border-rose-400 bg-rose-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                <h3 className="text-xs font-bold text-slate-800">Foto {title} <span className="text-rose-500">*</span></h3>
                {photo ? <button type="button" onClick={() => setZoomedPhoto({ title: `Foto ${title}`, url: photo, caption: formData.photoCaptions[slot] })} className="group relative h-44 w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-900"><img src={photo} alt={`Foto ${title}`} className="h-full w-full object-contain transition-transform group-hover:scale-105" /><span className="absolute inset-0 flex items-center justify-center bg-slate-900/40 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">Perbesar foto</span></button> : <label className="flex h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-center hover:border-blue-400"><Camera className="mb-2 h-5 w-5 text-slate-400" /><span className="text-xs font-semibold text-slate-700">Pilih foto</span><span className="mt-1 text-[10px] text-slate-400">PNG, JPG · Maksimal 5 MB</span><input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => { handlePhoto(slot, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}
                {photo && <div className="flex items-center justify-between text-[11px]"><label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-blue-600"><Upload className="h-3 w-3" /> Ganti foto<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => { handlePhoto(slot, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button type="button" onClick={() => removePhoto(slot)} className="text-rose-600">Hapus foto</button></div>}
                <label className="block text-[10px] font-semibold text-slate-600">Caption (opsional)<input value={formData.photoCaptions[slot]} onChange={(event) => setFormData((current) => ({ ...current, photoCaptions: { ...current.photoCaptions, [slot]: event.target.value } }))} className={`${inputClass} mt-1`} placeholder="" /></label>
                {hasPhotoError && <p className="text-[11px] font-medium text-rose-600">{errors[photoErrorKey]}</p>}
              </div>;
            })}
          </div>
        </section>

        <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <Link href={isEditMode && editId ? `/support/troubleshoots/${encodeURIComponent(editId)}` : "/support/troubleshoots"} className="rounded-lg border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-slate-700">Batal</Link>
          {submitted ? <button type="button" onClick={() => router.push("/support/troubleshoots")} className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white">Kembali ke Troubleshoots</button> : <button type="submit" disabled={isApplyingEdit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {isEditMode ? "Simpan Perubahan" : "Submit Troubleshoot"}</button>}
        </div>
      </form>
      {createdRecordId && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="troubleshoot-create-success-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl animate-scaleIn">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
            <h2 id="troubleshoot-create-success-title" className="text-base font-bold text-slate-800">Troubleshoot Berhasil Disimpan!</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Formulir Troubleshoot <strong className="text-slate-800">{createdRecordId}</strong> untuk unit <strong className="text-slate-800">{formData.unitNo}</strong> (Device: <span className="text-slate-800">{formData.deviceId}</span>) telah berhasil dicatat.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/support/troubleshoots")}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => router.push(`/support/troubleshoots/${encodeURIComponent(createdRecordId)}`)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                View Detail
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* MODAL KONDISI B: INFORMASI TIDAK ADA PERUBAHAN */}
      {showNoChangesModal && createPortal(
        <div
          onClick={() => setShowNoChangesModal(false)}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="troubleshoot-no-changes-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100">
              <AlertCircle className="h-6 w-6" />
            </div>

            <h3 id="troubleshoot-no-changes-title" className="text-base font-bold text-slate-800">
              Tidak Ada Perubahan
            </h3>

            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Tidak ada data yang diubah. Semua nilai masih sama dengan data sebelumnya.
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => router.push("/support/troubleshoots")}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition shadow-sm"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => setShowNoChangesModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
              >
                Tetap Edit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL KONDISI A: KONFIRMASI DIFF PERUBAHAN */}
      {pendingEdit && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isApplyingEdit) {
              setPendingEdit(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-troubleshoot-diff-title"
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col animate-scaleIn"
          >
            <div className="border-b border-slate-200 p-5 bg-white">
              <h2 id="confirm-troubleshoot-diff-title" className="text-base font-bold text-slate-900">
                Konfirmasi Perubahan Troubleshoot
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Periksa nilai sebelumnya dan nilai perubahan sebelum menerapkan pembaruan formulir {pendingEdit.record.id}.
              </p>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-5 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 pb-2 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Field</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">Sebelumnya</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hidden sm:block">Perubahan</span>
              </div>
              {pendingEdit.changes.map((change, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50"
                >
                  <span className="text-xs font-semibold text-slate-700 self-center">
                    {change.field}
                  </span>
                  <div className="text-xs text-slate-500 bg-white p-2 rounded border border-slate-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5 sm:hidden">
                      Sebelumnya
                    </span>
                    {change.oldValue}
                  </div>
                  <div className="text-xs font-medium text-blue-700 bg-blue-50/50 p-2 rounded border border-blue-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-blue-500 mb-0.5 sm:hidden">
                      Perubahan
                    </span>
                    {change.newValue}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                onClick={cancelPendingEdit}
                disabled={isApplyingEdit}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmPendingEdit}
                disabled={isApplyingEdit || currentUser.role !== "superadmin"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isApplyingEdit ? "Menyimpan Perubahan..." : "Konfirmasi Perubahan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {zoomedPhoto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={zoomedPhoto.title} onClick={() => setZoomedPhoto(null)} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3"><h2 className="text-sm font-bold">{zoomedPhoto.title}</h2><button type="button" aria-label="Tutup foto" onClick={() => setZoomedPhoto(null)} className="text-slate-300 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-4"><img src={zoomedPhoto.url} alt={zoomedPhoto.title} className="max-h-[75vh] max-w-full object-contain" /></div>
            {zoomedPhoto.caption.trim() && <p className="border-t border-slate-700 px-5 py-3 text-xs text-slate-300">{zoomedPhoto.caption}</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
