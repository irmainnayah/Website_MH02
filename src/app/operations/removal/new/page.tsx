// src/app/operations/removal/new/page.tsx
"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  X,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Trash2,
  Lock,
  Cpu,
  Clock,
  Sparkles,
  FileText,
  Camera,
  ChevronDown,
  Info,
  Upload,
  Eye,
} from "lucide-react";
import {
  devices as allDevices,
  GROUP_LEADERS,
  TECHNICIANS,
  getEquipmentTypeByUnit,
  getEgiByUnit,
  getFleetMasterByUnit,
  matchesUnitNumberSearch,
} from "@/lib/mock-data";
import {
  getNextRemovalFormNumber,
  executeDeviceRemoval,
  executeDeviceRemovalEdit,
  getRemovalById,
  REMOVAL_DEVICE_CONDITIONS,
} from "@/lib/mock-data/removal";
import { RemovalRecord, DeviceFinalCondition } from "@/types/removal";
import { DistrictName, DeviceRecord } from "@/types/dashboard";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import { useAuth } from "@/features/auth/AuthContext";
import {
  calculateWorkDuration,
  normalizeToDateTimeString,
  scrollToErrorSummary,
} from "@/lib/utils";

const REASONS = ["Kerusakan", "Upgrade", "Dismantle"] as const;

type RemovalPhotoSlot = "beforeDevice" | "componentSet";

const REMOVAL_PHOTO_SLOTS: {
  key: RemovalPhotoSlot;
  label: string;
  captionKey: "beforeDeviceCaption" | "componentSetCaption";
  placeholderCaption: string;
}[] = [
    {
      key: "beforeDevice",
      label: "1. Foto Perangkat Sebelum Pelepasan",
      captionKey: "beforeDeviceCaption",
      placeholderCaption: "Keterangan kondisi sebelum dilepas...",
    },
    {
      key: "componentSet",
      label: "2. Foto Komponen Set yang Dicopot",
      captionKey: "componentSetCaption",
      placeholderCaption: "Keterangan kabel, bracket, atau modul pendukung...",
    },
  ];

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

function RemovalFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get("edit");
  const isEditMode = Boolean(editId);
  const { currentUser } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingRecord, setExistingRecord] = useState<RemovalRecord | null>(null);

  // Edit Modals:
  // 1) showDiffModal = jika ada perubahan
  // 2) showNoChangesModal = jika TIDAK ada perubahan
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [showNoChangesModal, setShowNoChangesModal] = useState(false);
  const [successModal, setSuccessModal] = useState<{ id: string; unitNo: string; deviceId: string } | null>(null);
  const [pendingProposedRecord, setPendingProposedRecord] = useState<RemovalRecord | null>(null);

  // Lightbox Zoom Modal State
  const [zoomedPhoto, setZoomedPhoto] = useState<{
    url: string;
    title: string;
    caption: string;
  } | null>(null);

  // File input refs konsisten dengan Replacement
  const fileInputRefs = {
    beforeDevice: useRef<HTMLInputElement>(null),
    componentSet: useRef<HTMLInputElement>(null),
  };

  const [devices] = useState<DeviceRecord[]>([...allDevices]);
  const installedDevices = useMemo(
    () => devices.filter((d) => d.status === "in_use"),
    [devices]
  );

  const [formNumber, setFormNumber] = useState<string>("");
  const [formData, setFormData] = useState({
    deviceId: "",
    unitNo: "",
    district: "" as DistrictName | "",
    activityDate: new Date().toISOString().split("T")[0],
    shift: "" as "Shift 1" | "Shift 2" | "",
    startTime: "",
    endTime: "",
    reason: "" as typeof REASONS[number] | "",
    reasonDetail: "",
    deviceFinalCondition: "" as DeviceFinalCondition | "",
    technicianName: "",
    technicianNrp: "",
    groupLeaderName: "",
    remarks: "",
    photos: {
      beforeDevice: "",
      componentSet: "",
    },
  });

  const [photoCaptions, setPhotoCaptions] = useState({
    beforeDevice: "",
    componentSet: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize Edit Mode or Create Mode
  useEffect(() => {
    if (isEditMode && editId) {
      const rec = getRemovalById(editId);
      if (rec) {
        setExistingRecord(rec);
        setFormNumber(rec.id);
        setFormData({
          deviceId: rec.deviceId,
          unitNo: rec.unitNo,
          district: (rec.district as DistrictName) || "",
          activityDate: rec.removalDate,
          shift: (rec.shift as "Shift 1" | "Shift 2") || "",
          startTime: normalizeToDateTimeString(rec.startTime, rec.removalDate),
          endTime: normalizeToDateTimeString(rec.endTime, rec.removalDate),
          reason: (rec.reason as typeof REASONS[number]) || "",
          reasonDetail: rec.reasonDetail || "",
          deviceFinalCondition: rec.deviceFinalCondition || "",
          technicianName: rec.technicianName || "",
          technicianNrp: rec.technicianNrp || "",
          groupLeaderName: rec.groupLeaderName || "",
          remarks: rec.remarks || "",
          photos: {
            beforeDevice: rec.photos?.beforeDevice || "",
            componentSet: rec.photos?.componentSet || "",
          },
        });
        setPhotoCaptions({
          beforeDevice: rec.photos?.beforeDeviceCaption || "",
          componentSet: rec.photos?.componentSetCaption || "",
        });
      } else {
        setAlertMessage({
          type: "error",
          text: `Dokumen ${editId} tidak ditemukan.`,
        });
      }
    } else {
      const today = new Date().toISOString().split("T")[0];
      setFormNumber(getNextRemovalFormNumber(today));
    }
  }, [isEditMode, editId]);

  // Keyboard shortcut: close lightbox or edit modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedPhoto) setZoomedPhoto(null);
        if (showDiffModal) setShowDiffModal(false);
        if (showNoChangesModal) setShowNoChangesModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedPhoto, showDiffModal, showNoChangesModal]);

  // When selected device changes, sync unitNo and district
  const handleDeviceChange = (devId: string) => {
    const matched = installedDevices.find((d) => d.deviceId === devId);
    setFormData((prev) => ({
      ...prev,
      deviceId: devId,
      unitNo: matched?.unitNo || "",
      district: (matched?.district as DistrictName) || "",
    }));
  };

  const handleTechnicianChange = (techName: string) => {
    const matched = TECHNICIANS.find((t) => t.name === techName);
    setFormData((prev) => ({
      ...prev,
      technicianName: techName,
      technicianNrp: matched?.nrp || "",
    }));
  };

  const durationResult = useMemo(
    () => calculateWorkDuration(formData.startTime, formData.endTime, formData.activityDate),
    [formData.startTime, formData.endTime, formData.activityDate]
  );

  // File upload handler konsisten dengan Replacement
  const handleFileChange = (
    slotKey: RemovalPhotoSlot,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setAlertMessage({ type: "error", text: "Pilih file gambar valid (PNG, JPG)." });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setAlertMessage({ type: "error", text: "Ukuran foto maksimal 5 MB." });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          photos: {
            ...prev.photos,
            [slotKey]: result,
          },
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = (slotKey: RemovalPhotoSlot) => {
    setFormData((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [slotKey]: "",
      },
    }));
    setPhotoCaptions((prev) => ({
      ...prev,
      [slotKey]: "",
    }));
    if (fileInputRefs[slotKey].current) {
      fileInputRefs[slotKey].current.value = "";
    }
  };

  // Build field comparison for edit confirmation modal
  const editFieldChanges = useMemo(() => {
    if (!isEditMode || !existingRecord || !pendingProposedRecord) return [];
    const changes: { label: string; oldVal: string; newVal: string }[] = [];

    if (existingRecord.reason !== pendingProposedRecord.reason) {
      changes.push({
        label: "Alasan Pelepasan",
        oldVal: existingRecord.reason,
        newVal: pendingProposedRecord.reason,
      });
    }
    if ((existingRecord.reasonDetail || "") !== (pendingProposedRecord.reasonDetail || "")) {
      changes.push({
        label: "Detail Alasan",
        oldVal: existingRecord.reasonDetail || "—",
        newVal: pendingProposedRecord.reasonDetail || "—",
      });
    }
    if (existingRecord.deviceFinalCondition !== pendingProposedRecord.deviceFinalCondition) {
      changes.push({
        label: "Kondisi Akhir Perangkat",
        oldVal: existingRecord.deviceFinalConditionLabel || existingRecord.deviceFinalCondition || "—",
        newVal: pendingProposedRecord.deviceFinalConditionLabel || pendingProposedRecord.deviceFinalCondition || "—",
      });
    }
    if (existingRecord.removalDate !== pendingProposedRecord.removalDate) {
      changes.push({
        label: "Tanggal Aktivitas",
        oldVal: existingRecord.removalDate,
        newVal: pendingProposedRecord.removalDate,
      });
    }
    if ((existingRecord.shift || "") !== (pendingProposedRecord.shift || "")) {
      changes.push({
        label: "Shift Kerja",
        oldVal: existingRecord.shift || "—",
        newVal: pendingProposedRecord.shift || "—",
      });
    }
    if (
      (existingRecord.startTime || "") !== (pendingProposedRecord.startTime || "") ||
      (existingRecord.endTime || "") !== (pendingProposedRecord.endTime || "")
    ) {
      changes.push({
        label: "Jam Pengerjaan",
        oldVal: `${existingRecord.startTime || "—"} s/d ${existingRecord.endTime || "—"}`,
        newVal: `${pendingProposedRecord.startTime || "—"} s/d ${pendingProposedRecord.endTime || "—"}`,
      });
    }
    if ((existingRecord.groupLeaderName || "") !== (pendingProposedRecord.groupLeaderName || "")) {
      changes.push({
        label: "Group Leader",
        oldVal: existingRecord.groupLeaderName || "—",
        newVal: pendingProposedRecord.groupLeaderName || "—",
      });
    }
    if (existingRecord.technicianName !== pendingProposedRecord.technicianName) {
      changes.push({
        label: "Teknisi",
        oldVal: existingRecord.technicianName,
        newVal: pendingProposedRecord.technicianName,
      });
    }
    if ((existingRecord.remarks || "") !== (pendingProposedRecord.remarks || "")) {
      changes.push({
        label: "Catatan (Remarks)",
        oldVal: existingRecord.remarks || "—",
        newVal: pendingProposedRecord.remarks || "—",
      });
    }

    // Perbandingan Foto 1 (Before Device)
    const oldPhoto1 = existingRecord.photos?.beforeDevice || "";
    const newPhoto1 = pendingProposedRecord.photos?.beforeDevice || "";
    if (oldPhoto1 !== newPhoto1) {
      changes.push({
        label: "Foto Sebelum Pelepasan (File)",
        oldVal: oldPhoto1 ? "Foto tersedia" : "Tidak ada",
        newVal: newPhoto1 ? "Foto tersedia" : "Tidak ada",
      });
    }
    const oldCap1 = existingRecord.photos?.beforeDeviceCaption || "";
    const newCap1 = pendingProposedRecord.photos?.beforeDeviceCaption || "";
    if (oldCap1 !== newCap1) {
      changes.push({
        label: "Foto Sebelum Pelepasan (Keterangan)",
        oldVal: oldCap1 || "—",
        newVal: newCap1 || "—",
      });
    }

    // Perbandingan Foto 2 (Component Set)
    const oldPhoto2 = existingRecord.photos?.componentSet || "";
    const newPhoto2 = pendingProposedRecord.photos?.componentSet || "";
    if (oldPhoto2 !== newPhoto2) {
      changes.push({
        label: "Foto Komponen Set (File)",
        oldVal: oldPhoto2 ? "Foto tersedia" : "Tidak ada",
        newVal: newPhoto2 ? "Foto tersedia" : "Tidak ada",
      });
    }
    const oldCap2 = existingRecord.photos?.componentSetCaption || "";
    const newCap2 = pendingProposedRecord.photos?.componentSetCaption || "";
    if (oldCap2 !== newCap2) {
      changes.push({
        label: "Foto Komponen Set (Keterangan)",
        oldVal: oldCap2 || "—",
        newVal: newCap2 || "—",
      });
    }

    return changes;
  }, [isEditMode, existingRecord, pendingProposedRecord]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const errors: Record<string, string> = {};

    if (!formData.deviceId) errors.deviceId = "Pilih perangkat yang akan dilepas.";
    if (!formData.activityDate) errors.activityDate = "Tanggal aktivitas wajib diisi.";
    if (!formData.reason) errors.reason = "Pilih alasan pelepasan.";
    if (!formData.reasonDetail.trim()) errors.reasonDetail = "Detail alasan / indikasi gejala wajib diisi.";
    if (!formData.deviceFinalCondition)
      errors.deviceFinalCondition = "Pilih kondisi akhir perangkat setelah pelepasan.";

    if (!formData.startTime || !formData.endTime) {
      errors.time = "Start Date & Time dan Finish Date & Time wajib diisi.";
    } else if (!durationResult.isValid) {
      errors.time = durationResult.formatted;
    }
    if (!formData.technicianName.trim()) {
      errors.technicianName = "Pilih nama teknisi pelaksana.";
    }
    if (!formData.groupLeaderName.trim()) {
      errors.groupLeaderName = "Pilih Group Leader penanggung jawab.";
    }

    // Validasi foto dokumentasi wajib
    if (!formData.photos.beforeDevice) {
      errors.photo_beforeDevice = "Foto Sebelum Pelepasan wajib diunggah.";
    }
    if (!formData.photos.componentSet) {
      errors.photo_componentSet = "Foto Komponen Set wajib diunggah.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      scrollToErrorSummary();
      return;
    }

    setFormErrors({});

    const conditionMeta = REMOVAL_DEVICE_CONDITIONS.find(
      (c) => c.value === formData.deviceFinalCondition
    );

    const targetUnitNo = formData.unitNo.trim().toUpperCase();
    const targetMaster = getFleetMasterByUnit(targetUnitNo);
    const targetEquipType = targetMaster?.equipmentType;
    const targetEgi = targetMaster?.egi ?? "";

    const proposedRecord: RemovalRecord = {
      id: formNumber,
      deviceId: formData.deviceId,
      unitNo: targetUnitNo,
      equipmentType: targetEquipType,
      egi: targetEgi,
      reason: formData.reason,
      reasonDetail: formData.reasonDetail.trim() || undefined,
      removalDate: formData.activityDate,
      technicianName: formData.technicianName,
      technicianNrp: formData.technicianNrp || undefined,
      district: formData.district,
      shift: formData.shift || undefined,
      startTime: formData.startTime,
      endTime: formData.endTime,
      durationMinutes: durationResult.minutes,
      deviceFinalCondition: formData.deviceFinalCondition as DeviceFinalCondition,
      deviceFinalConditionLabel: conditionMeta?.label,
      photos: {
        beforeDevice: formData.photos.beforeDevice || undefined,
        componentSet: formData.photos.componentSet || undefined,
        beforeDeviceCaption: photoCaptions.beforeDevice.trim() || undefined,
        componentSetCaption: photoCaptions.componentSet.trim() || undefined,
      },
      groupLeaderName: formData.groupLeaderName,
      remarks: formData.remarks.trim() || undefined,
      masterStateBefore: existingRecord?.masterStateBefore,
    };

    if (isEditMode) {
      setPendingProposedRecord(proposedRecord);

      // Hitung apakah ada perubahan data
      const changesCount = [
        existingRecord?.reason !== proposedRecord.reason,
        (existingRecord?.reasonDetail || "") !== (proposedRecord.reasonDetail || ""),
        existingRecord?.deviceFinalCondition !== proposedRecord.deviceFinalCondition,
        existingRecord?.removalDate !== proposedRecord.removalDate,
        (existingRecord?.shift || "") !== (proposedRecord.shift || ""),
        (existingRecord?.startTime || "") !== (proposedRecord.startTime || "") ||
        (existingRecord?.endTime || "") !== (proposedRecord.endTime || ""),
        (existingRecord?.groupLeaderName || "") !== (proposedRecord.groupLeaderName || ""),
        existingRecord?.technicianName !== proposedRecord.technicianName,
        (existingRecord?.remarks || "") !== (proposedRecord.remarks || ""),
        (existingRecord?.photos?.beforeDevice || "") !== (proposedRecord.photos?.beforeDevice || ""),
        (existingRecord?.photos?.beforeDeviceCaption || "") !== (proposedRecord.photos?.beforeDeviceCaption || ""),
        (existingRecord?.photos?.componentSet || "") !== (proposedRecord.photos?.componentSet || ""),
        (existingRecord?.photos?.componentSetCaption || "") !== (proposedRecord.photos?.componentSetCaption || ""),
      ].filter(Boolean).length;

      if (changesCount === 0) {
        // KONDISI B: TIDAK ADA PERUBAHAN
        setShowNoChangesModal(true);
      } else {
        // KONDISI A: ADA PERUBAHAN
        setShowDiffModal(true);
      }
      return;
    }

    // CREATE MODE: Execute transaction
    setIsSubmitting(true);
    const result = executeDeviceRemoval(proposedRecord);

    if (result.success) {
      recordAuditAction({
        table: "removal",
        operation: "INSERT",
        recordId: proposedRecord.id,
      });
      setIsSubmitting(false);
      setSuccessModal({
        id: proposedRecord.id,
        unitNo: proposedRecord.unitNo,
        deviceId: proposedRecord.deviceId,
      });
    } else {
      setIsSubmitting(false);
      setAlertMessage({
        type: "error",
        text: result.message,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleConfirmEdit = () => {
    if (!pendingProposedRecord || isSubmitting) return;

    if (editFieldChanges.length === 0) {
      setShowDiffModal(false);
      setShowNoChangesModal(true);
      return;
    }

    setIsSubmitting(true);
    const result = executeDeviceRemovalEdit(
      pendingProposedRecord.id,
      pendingProposedRecord,
      currentUser.role
    );

    if (result.success) {
      recordAuditAction({
        table: "removal",
        operation: "UPDATE",
        recordId: pendingProposedRecord.id,
      });
      setShowDiffModal(false);
      setAlertMessage({
        type: "success",
        text: `Perubahan laporan ${pendingProposedRecord.id} berhasil disimpan.`,
      });
      setTimeout(() => {
        router.push(`/operations/removal/${encodeURIComponent(pendingProposedRecord.id)}?updated=true`);
      }, 1000);
    } else {
      setIsSubmitting(false);
      setShowDiffModal(false);
      setAlertMessage({
        type: "error",
        text: result.message,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Options for searchable dropdowns
  const deviceOptions: SearchableOption[] = useMemo(() => {
    if (isEditMode && existingRecord) {
      return [
        {
          value: existingRecord.deviceId,
          label: `${existingRecord.deviceId} — Unit: ${existingRecord.unitNo}`,
        },
      ];
    }
    return installedDevices.map((d) => ({
      value: d.deviceId,
      label: `${d.deviceId} (${d.serialNumber}) — Unit: ${d.unitNo || "-"} [${d.district || "-"}]`,
    }));
  }, [isEditMode, existingRecord, installedDevices]);

  const technicianOptions: SearchableOption[] = useMemo(
    () =>
      TECHNICIANS.map((tech) => ({
        value: tech.name,
        label: `${tech.name} (${tech.nrp})`,
      })),
    []
  );

  const groupLeaderOptions: SearchableOption[] = useMemo(
    () =>
      GROUP_LEADERS.map((gl) => ({
        value: gl,
        label: gl,
      })),
    []
  );

  const reasonOptions: SearchableOption[] = useMemo(
    () =>
      REASONS.map((r) => ({
        value: r,
        label: r,
      })),
    []
  );

  const conditionOptions: SearchableOption[] = useMemo(
    () =>
      REMOVAL_DEVICE_CONDITIONS.map((c) => ({
        value: c.value,
        label: c.label,
      })),
    []
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb & Navigation Topbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            href="/operations/removal"
            className="hover:text-blue-600 transition flex items-center gap-1 font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Riwayat Removal</span>
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">
            {isEditMode ? `Edit Formulir (${formNumber})` : "Formulir Pelepasan Perangkat"}
          </span>
        </div>

        <Link
          href={isEditMode ? `/operations/removal/${encodeURIComponent(formNumber)}` : "/operations/removal"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          <X className="h-3.5 w-3.5" />
          <span>Batal (Cancel)</span>
        </Link>
      </div>

      {/* Page Title Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
              Formulir Lapangan • Removal
            </span>
            {isEditMode && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                Mode Edit (Superadmin)
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-500">
              Site: {formData.district || "-"}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-2 flex items-center gap-2.5">
            <Trash2 className="h-6 w-6 text-rose-600" />
            {isEditMode ? "Edit Laporan Pelepasan Perangkat (Removal)" : "Formulir Pelepasan Perangkat (Removal)"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan pelepasan unit telematika SMARTD DISPLAY dari armada operasional, alasan pencabutan, dan dokumentasi komponen.
          </p>
        </div>

        <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl shrink-0">
          <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 justify-end">
            <Lock className="h-3 w-3 text-slate-400" />
            No. Dokumen Otomatis:
          </p>
          <p className="text-base font-bold tabular-nums text-rose-600 mt-0.5">
            {formNumber || "REM-..."}
          </p>
        </div>
      </div>

      {/* Feedback Alert */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium shadow-sm animate-fadeIn ${alertMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{alertMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {Object.keys(formErrors).length > 0 && (
        <div data-error-summary="true" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Mohon lengkapi field wajib berikut:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-rose-700">
              {Object.values(formErrors).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: Informasi Dokumen & Waktu */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Calendar className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              1. Informasi Pelepasan &amp; Jadwal
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Form Number (Otomatis &amp; Read-only)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formNumber}
                  disabled
                  className="w-full pl-3 pr-8 py-2 text-xs tabular-nums font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700 cursor-not-allowed"
                />
                <Lock className="h-3.5 w-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Nomor form di-generate otomatis berurutan sesuai bulan pengerjaan.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Activity Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.activityDate}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, activityDate: e.target.value }))
                }
                aria-invalid={Boolean(formErrors.activityDate)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Informasi Perangkat & Armada */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Cpu className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              2. Perangkat yang Dilepas, Alasan &amp; Kondisi Akhir
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Device ID Selection (Searchable) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Perangkat Terinstalasi <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="removal-device-select"
                value={formData.deviceId}
                options={deviceOptions}
                placeholder="Pilih atau cari Device ID..."
                disabled={isEditMode}
                error={Boolean(formErrors.deviceId)}
                onChange={handleDeviceChange}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {isEditMode ? "Device ID dikunci pada mode edit." : "Menampilkan perangkat berstatus aktif (in_use)."}
              </p>
            </div>

            {/* Unit Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit Number (Nomor Lambung)
              </label>
              <input
                type="text"
                value={formData.unitNo}
                readOnly
                placeholder="Otomatis dari master device"
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-bold uppercase placeholder-slate-400 cursor-not-allowed"
              />
            </div>

            {/* Tipe Alat Berat */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipe Alat Berat
              </label>
              <input
                type="text"
                value={getFleetMasterByUnit(formData.unitNo)?.equipmentType ?? ""}
                readOnly
                placeholder="Otomatis mengikuti unit"
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-semibold cursor-not-allowed"
              />
            </div>

            {/* EGI (Model Unit) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                EGI (Model Unit)
              </label>
              <input
                type="text"
                value={getFleetMasterByUnit(formData.unitNo)?.egi ?? ""}
                readOnly
                placeholder="Otomatis mengikuti unit"
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-semibold cursor-not-allowed"
              />
            </div>

            {/* District */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Distrik / Site Operasional
              </label>
              <input
                type="text"
                value={formData.district || "-"}
                readOnly
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-medium cursor-not-allowed"
              />
            </div>

            {/* Shift */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift Kerja
              </label>
              <select
                value={formData.shift || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    shift: e.target.value as "Shift 1" | "Shift 2" | "",
                  }))
                }
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Pilih Shift --</option>
                <option value="Shift 1">Shift 1 (Pagi/Siang)</option>
                <option value="Shift 2">Shift 2 (Malam)</option>
              </select>
            </div>

            {/* Reason Selection (Searchable) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pelepasan <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="removal-reason-select"
                value={formData.reason}
                options={reasonOptions}
                placeholder="Pilih alasan pelepasan..."
                error={Boolean(formErrors.reason)}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    reason: val as typeof REASONS[number],
                  }))
                }
              />
            </div>

            {/* Reason Detail */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Detail Alasan / Indikasi Gejala <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.reasonDetail}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reasonDetail: e.target.value }))
                }
                placeholder="Contoh: Sensor GPS mati, upgrade modul"
                className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${
                  formErrors.reasonDetail ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
                }`}
              />
              {formErrors.reasonDetail && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.reasonDetail}</p>
              )}
            </div>

            {/* KONDISI AKHIR PERANGKAT (Searchable & Eksplisit) */}
            <div className="md:col-span-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Kondisi Akhir Perangkat (In Stock Status) <span className="text-rose-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Pilih kondisi fisik/operasional perangkat setelah dicopot. Nilai ini terpisah dari alasan pelepasan dan akan mengubah status perangkat pada Master Device.
              </p>
              <div className="max-w-md">
                <SearchableDropdown
                  id="removal-condition-select"
                  value={formData.deviceFinalCondition}
                  options={conditionOptions}
                  placeholder="-- Pilih Kondisi Akhir Perangkat --"
                  error={Boolean(formErrors.deviceFinalCondition)}
                  onChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      deviceFinalCondition: val as DeviceFinalCondition,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Personel & Durasi Pengerjaan */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Clock className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              3. Informasi Personel &amp; Durasi Pengerjaan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* GL (Searchable) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Group Leader (GL){" "}
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-normal">
                  Penanggung Jawab
                </span>
              </label>
              <SearchableDropdown
                id="removal-gl-select"
                value={formData.groupLeaderName}
                options={groupLeaderOptions}
                placeholder="Pilih Group Leader..."
                error={Boolean(formErrors.groupLeaderName)}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    groupLeaderName: val,
                  }))
                }
              />
            </div>

            {/* Teknisi (Searchable) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teknisi Pelaksana
              </label>
              <SearchableDropdown
                id="removal-tech-select"
                value={formData.technicianName}
                options={technicianOptions}
                placeholder="Pilih Teknisi..."
                error={Boolean(formErrors.technicianName)}
                onChange={handleTechnicianChange}
              />
            </div>

            {/* Start Date & Time */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    startTime: val,
                    ...(val && !prev.activityDate ? { activityDate: val.slice(0, 10) } : {}),
                  }));
                }}
                className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.time ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
              />
            </div>

            {/* Finish Date & Time */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Finish Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                }
                className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.time ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
              />
            </div>
          </div>

          {/* Automatic Duration Highlight */}
          <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-semibold text-slate-700">
                Durasi Pengerjaan Otomatis:
              </span>
            </div>
            <div>
              {durationResult.isValid ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
                  <Sparkles className="h-3 w-3" />
                  {durationResult.formatted} ({durationResult.minutes} Menit)
                </span>
              ) : (
                <span className="text-xs font-semibold text-rose-600">
                  {durationResult.formatted}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Remarks / Catatan Teknis */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              4. Catatan Teknis (Remarks)
            </h2>
          </div>

          <div>
            <textarea
              rows={3}
              value={formData.remarks}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, remarks: e.target.value }))
              }
              placeholder="Catatan kondisi fisik perangkat, kelengkapan kabel, rencana perbaikan atau tujuan transfer..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium leading-relaxed"
            />
          </div>
        </div>

        {/* SECTION 5: Foto Dokumentasi (Mengikuti Pola Replacement: Preview, Ganti Foto, Hapus, dan Lightbox Zoom) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                5. Dokumentasi Foto Pelepasan (2 Slot)
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">
              Mendukung pratinjau thumbnail &amp; zoom resolusi penuh
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REMOVAL_PHOTO_SLOTS.map((slot) => {
              const photoUrl = formData.photos[slot.key];
              const caption = photoCaptions[slot.key];
              const photoErrorKey = `photo_${slot.key}`;
              const hasPhotoError = Boolean(formErrors[photoErrorKey]);

              return (
                <div
                  key={slot.key}
                  className={`bg-slate-50 border rounded-xl p-3.5 flex flex-col justify-between space-y-3 ${
                    hasPhotoError ? "border-rose-400 bg-rose-50/30" : "border-slate-200"
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold text-slate-800 block line-clamp-1">
                      {slot.label}
                    </span>
                  </div>

                  {/* Thumbnail or Empty Placeholder */}
                  {photoUrl ? (
                    <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-900 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl}
                        alt={slot.label}
                        className="max-h-full max-w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedPhoto({
                            url: photoUrl,
                            title: slot.label,
                            caption: caption || slot.label,
                          })
                        }
                        className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5 backdrop-blur-2xs"
                      >
                        <Eye className="h-4 w-4" />
                        Perbesar
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRefs[slot.key].current?.click()}
                      className="aspect-4/3 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg flex flex-col items-center justify-center p-3 text-center cursor-pointer bg-white transition hover:bg-blue-50/30"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1 text-slate-400 group-hover:text-blue-500">
                        <Camera className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Pilih / Unggah Foto</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG up to 5MB</span>
                    </div>
                  )}

                  {/* File Upload Button & Caption Input */}
                  <div className="space-y-2 pt-1">
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRefs[slot.key]}
                      onChange={(e) => handleFileChange(slot.key, e)}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRefs[slot.key].current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors shadow-2xs"
                      >
                        <Upload className="h-3 w-3 text-slate-500" />
                        {photoUrl ? "Ganti Foto" : "Unggah Foto"}
                      </button>
                      {photoUrl && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(slot.key)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-medium transition-colors"
                          title="Hapus foto ini"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={caption}
                      onChange={(e) =>
                        setPhotoCaptions({
                          ...photoCaptions,
                          [slot.key]: e.target.value,
                        })
                      }
                      placeholder={slot.placeholderCaption}
                      className="w-full text-[11px] bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {hasPhotoError && (
                      <p className="text-[11px] text-rose-600 font-medium">{formErrors[photoErrorKey]}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href={isEditMode ? `/operations/removal/${encodeURIComponent(formNumber)}` : "/operations/removal"}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition text-center"
          >
            Batal (Cancel)
          </Link>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <span>{isEditMode ? "Review & Simpan Perubahan" : "Konfirmasi & Submit Removal"}</span>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Success Confirmation Modal */}
      {successModal && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="removal-success-title"
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 id="removal-success-title" className="text-base font-bold text-slate-800">
              Removal Berhasil Disimpan!
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Formulir Removal{" "}
              <strong className="text-slate-800">{successModal.id}</strong>{" "}
              untuk unit{" "}
              <strong className="text-slate-800">{successModal.unitNo}</strong>{" "}
              dengan perangkat{" "}
              <strong className="text-slate-800">{successModal.deviceId}</strong>{" "}
              telah berhasil dicatat.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => router.push(`/operations/removal`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => router.push(`/operations/removal/${encodeURIComponent(successModal.id)}`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
              >
                View Detail
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL KONDISI A: KONFIRMASI DIFF PERUBAHAN (3 Kolom Sesuai Installation) */}
      {mounted && showDiffModal && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) {
              setShowDiffModal(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-diff-title"
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col animate-scaleIn"
          >
            <div className="border-b border-slate-200 p-5 bg-white">
              <h2 id="confirm-diff-title" className="text-base font-bold text-slate-900">
                Konfirmasi Perubahan Removal
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Periksa nilai sebelumnya dan nilai perubahan sebelum menerapkan pembaruan formulir {formNumber}.
              </p>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-5 space-y-2">
              {/* Table Header 3-Column */}
              <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 pb-2 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Field</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">Sebelumnya</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hidden sm:block">Perubahan</span>
              </div>
              {editFieldChanges.map((change, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50"
                >
                  <span className="text-xs font-semibold text-slate-700 self-center">
                    {change.label}
                  </span>
                  <div className="text-xs text-slate-500 bg-white p-2 rounded border border-slate-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5 sm:hidden">
                      Sebelumnya
                    </span>
                    {change.oldVal}
                  </div>
                  <div className="text-xs font-medium text-blue-700 bg-blue-50/50 p-2 rounded border border-blue-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-blue-500 mb-0.5 sm:hidden">
                      Perubahan
                    </span>
                    {change.newVal}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isSubmitting ? "Menyimpan Perubahan..." : "Konfirmasi Perubahan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL KONDISI B: INFORMASI TIDAK ADA PERUBAHAN */}
      {mounted && showNoChangesModal && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowNoChangesModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="no-changes-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-blue-50 text-blue-600 border border-blue-100">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 id="no-changes-title" className="text-base font-bold text-slate-800">
              Tidak Ada Perubahan
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Tidak ada data yang diubah. Semua nilai masih sama dengan data sebelumnya.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                href="/operations/removal"
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                Back to List
              </Link>
              <button
                type="button"
                onClick={() => setShowNoChangesModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
              >
                Tetap Edit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Zoom Modal */}
      {mounted &&
        zoomedPhoto &&
        createPortal(
          <div
            onClick={() => setZoomedPhoto(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-label={zoomedPhoto.title}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-[94vw] sm:w-[90vw] max-w-7xl h-[90vh] max-h-[92vh] overflow-hidden text-white flex flex-col animate-scaleIn"
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-900/95">
                <div className="flex items-center gap-2.5 min-w-0 pr-4">
                  <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                    <Camera className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-slate-100 truncate">
                      {zoomedPhoto.title}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Pratinjau Foto Resolusi Penuh • Dokumentasi Pelepasan MH02
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setZoomedPhoto(null)}
                    aria-label="Tutup pratinjau foto"
                    className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Tutup (Esc)"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Picture Area */}
              <div className="flex-1 min-h-0 w-full p-4 sm:p-6 bg-slate-950 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomedPhoto.url}
                  alt={zoomedPhoto.title}
                  className="w-full h-full max-w-full max-h-full object-contain select-none transition-transform"
                />
              </div>

              {/* Caption Footer */}
              <div className="shrink-0 px-5 sm:px-6 py-3 sm:py-3.5 bg-slate-900/95 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  {zoomedPhoto.caption || "Tidak ada catatan foto."}
                </p>
                <span className="text-[11px] text-slate-500 shrink-0">
                  Tekan [Esc] atau klik di luar untuk menutup
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function RemovalFormPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/60 p-6 flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Memuat formulir removal...</span>
          </div>
        </div>
      }
    >
      <RemovalFormContent />
    </Suspense>
  );
}
