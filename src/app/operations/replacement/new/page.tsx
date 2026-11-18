// src/app/operations/replacement/new/page.tsx
"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  Calendar,
  Clock,
  MapPin,
  Truck,
  Cpu,
  Zap,
  Network,
  Camera,
  User,
  Shield,
  FileText,
  AlertCircle,
  CheckCircle2,
  Upload,
  Eye,
  X,
  HardDrive,
  Info,
  Trash2,
} from "lucide-react";
import {
  createReplacement,
  getReplacement,
  getReplacementFormOptions,
  ReplacementDevice,
  ReplacementLookup,
  ReplacementPayload,
  ReplacementSite,
  ReplacementPhotoInput,
  updateReplacement,
} from "@/lib/replacement-api";
import {
  ReplacementFormData,
  ReplacementRecord,
  ReplacementPhotoSlotKey,
  OldDeviceFinalCondition,
} from "@/types/replacement";
import { EquipmentType, DistrictName } from "@/types/dashboard";
import { InstallationShift, SourcePowerType } from "@/types/installation";
import { useAuth } from "@/features/auth/AuthContext";
import {
  calculateWorkDuration,
  normalizeToDateTimeString,
  scrollToErrorSummary,
} from "@/lib/utils";

type ReplacementFormPhotoSlotKey = Exclude<ReplacementPhotoSlotKey, "camera_dashboard_angle">;

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
  allowCustomValue?: boolean;
  inputClassName?: string;
  displayValue?: string;
  disabled?: boolean;
}

function SearchableDropdown({
  id,
  value,
  options,
  placeholder,
  onChange,
  error = false,
  allowCustomValue = false,
  inputClassName = "",
  displayValue,
  disabled = false,
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
      const normalized = query.trim().toLowerCase();
      return option.value.toLowerCase().includes(normalized) || option.label.toLowerCase().includes(normalized);
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

  const openDropdown = (resetQuery: boolean) => {
    if (disabled) return;
    setQuery(resetQuery ? "" : value);
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
        aria-activedescendant={isOpen && filteredOptions.length ? `${id}-option-${activeIndex}` : undefined}
        value={isOpen ? query : displayValue ?? selectedOption?.label ?? value}
        onClick={() => {
          if (!disabled && !isOpen) openDropdown(allowCustomValue ? false : true);
        }}
        onChange={(event) => {
          if (disabled) return;
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setActiveIndex(0);
          setIsOpen(true);
          if (allowCustomValue) onChange(nextQuery);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) openDropdown(true);
            else if (filteredOptions.length) setActiveIndex((index) => (index + 1) % filteredOptions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) openDropdown(true);
            else if (filteredOptions.length) setActiveIndex((index) => (index - 1 + filteredOptions.length) % filteredOptions.length);
          } else if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            const option = filteredOptions[activeIndex];
            if (option) selectOption(option);
            else if (allowCustomValue) {
              onChange(query);
              setIsOpen(false);
              setQuery("");
            }
          }
        }}
        onBlur={(event) => {
          if (event.relatedTarget && rootRef.current?.contains(event.relatedTarget as Node)) return;
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery("");
          }, 0);
        }}
        placeholder={placeholder}
        className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 pr-9 text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
          disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed opacity-90 border-slate-200" : error ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
        } ${inputClassName}`}
      />
      {!disabled && (
        <button
          type="button"
          aria-label={`Tampilkan opsi ${placeholder}`}
          aria-expanded={isOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              setQuery("");
            } else {
              openDropdown(true);
            }
          }}
          className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-slate-500 hover:text-slate-700"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
      {isOpen && (
        <div
          id={`${id}-options`}
          role="listbox"
          ref={listRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-[220px] w-full overflow-y-auto overscroll-y-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.value}
              id={`${id}-option-${index}`}
              data-option-index={index}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={`block w-full px-3 py-2 text-left text-xs text-slate-700 ${
                index === activeIndex ? "bg-violet-50" : "hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-slate-500">Tidak ada hasil</p>
          )}
        </div>
      )}
    </div>
  );
}

const REPLACEMENT_FORM_PHOTO_SLOTS: ReplacementFormPhotoSlotKey[] = [
  "mh02_new_installed",
  "mh02_old_removed",
  "nodered_config",
  "gps_antenna",
];

const getReplacementFormPhotoLabel = (slotKey: ReplacementFormPhotoSlotKey) => {
  const order = REPLACEMENT_FORM_PHOTO_SLOTS.indexOf(slotKey) + 1;
  const label = {
    mh02_new_installed: "Foto SMARTD DISPLAY Baru Setelah Terpasang",
    mh02_old_removed: "Foto SMARTD DISPLAY Lama yang Dilepas/Diganti",
    nodered_config: "Foto Konfigurasi Node-RED",
    gps_antenna: "Foto Antena GPS",
  }[slotKey];
  return `${order}. ${label}`;
};

// Helper: Real-time duration calculation removed in favor of calculateWorkDuration from @/lib/utils

export default function NewReplacementPage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  // Snapshot list of devices
  const [deviceList, setDeviceList] = useState<ReplacementDevice[]>([]);
  const [sites, setSites] = useState<ReplacementSite[]>([]);
  const [lookups, setLookups] = useState<ReplacementLookup[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [deviceStatuses, setDeviceStatuses] = useState<{ code: string; label: string | null }[]>([]);
  const [formOptionsReady, setFormOptionsReady] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const editLoadStarted = useRef(false);
  const [editingRecord, setEditingRecord] = useState<ReplacementRecord | null>(null);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [formNotice] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ id: string; unitNo: string; newDeviceId: string } | null>(null);
  const [showNoChangesModal, setShowNoChangesModal] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    record: ReplacementRecord;
    changes: { label: string; oldValue: string; newValue: string }[];
  } | null>(null);
  const [isEditConfirming, setIsEditConfirming] = useState(false);
  const editConfirmGuard = useRef(false);

  // Perangkat lama: hanya perangkat yang saat ini aktif terpasang (status === 'in_use')
  // (atau perangkat lama yang terikat pada record yang sedang diedit)
  const inUseDevices = useMemo(() => {
    return deviceList.filter(
      (d) => d.status === "in_use" || (editingRecord && d.deviceId === editingRecord.oldDeviceId)
    );
  }, [deviceList, editingRecord]);

  // Perangkat baru: HANYA perangkat cadangan dengan status persis 'in_stock_rfu'
  // (atau perangkat baru yang saat ini terikat pada record yang sedang diedit)
  const availableNewDevices = useMemo(() => {
    return deviceList.filter(
      (d) => d.status === "in_stock_rfu" || (editingRecord && d.deviceId === editingRecord.newDeviceId)
    );
  }, [deviceList, editingRecord]);

  // Form State
  const [formData, setFormData] = useState<ReplacementFormData>({
    date: new Date().toISOString().split("T")[0],
    activityType: "Replacement",
    district: "",
    shift: "" as InstallationShift,
    startTime: "",
    endTime: "",
    oldDeviceId: "",
    oldDeviceFinalCondition: "" as OldDeviceFinalCondition,
    newDeviceId: "",
    unitNo: "",
    equipmentType: "" as EquipmentType,
    sourcePower: "" as SourcePowerType,
    spmVersion: "",
    ipAddress: "",
    ipCpe: "",
    ipVhms: "",
    groupLeaderName: "",
    technicianName: currentUser.name,
    technicianNrp: currentUser.nrp,
    remarks: "",
    photos: {
      mh02_new_installed: "",
      mh02_old_removed: "",
      nodered_config: "",
      gps_antenna: "",
    },
    photoCaptions: {
      mh02_new_installed: "",
      mh02_old_removed: "",
      nodered_config: "",
      gps_antenna: "",
    },
  });

  // Selected Old Device Details
  const selectedOldDeviceObj = useMemo(() => {
    return deviceList.find((d) => d.deviceId === formData.oldDeviceId) || null;
  }, [deviceList, formData.oldDeviceId]);

  // Selected New Device Details
  const selectedNewDeviceObj = useMemo(() => {
    return deviceList.find((d) => d.deviceId === formData.newDeviceId) || null;
  }, [deviceList, formData.newDeviceId]);

  const districtOptions: SearchableOption[] = sites.map((site) => ({ value: site.name, label: site.name }));
  const oldDeviceOptions: SearchableOption[] = inUseDevices.map((device) => ({
    value: device.deviceId,
    label: `${device.deviceId} - ${device.unitNo || "Tanpa Unit"} (${device.equipmentType || "Alat"}) [${device.district}]`,
  }));
  const newDeviceOptions: SearchableOption[] = availableNewDevices.filter((device) => Boolean(editingRecord) || !selectedOldDeviceObj || device.siteId === selectedOldDeviceObj.siteId).map((device) => ({
    value: device.deviceId,
    label: `${device.deviceId} (${device.serialNumber}) [${device.status}]`,
  }));
  const equipmentTypeOptions: SearchableOption[] = equipmentTypes.map((type) => ({ value: type, label: type }));
  const activityTypeOptions: SearchableOption[] = [{ value: "Replacement", label: "Replacement (Penggantian)" }];
  const conditionOptions: SearchableOption[] = deviceStatuses
    .filter(({ code }) => ["in_stock_damaged", "in_stock_ho", "in_stock_rfu"].includes(code))
    .map(({ code, label }) => ({ value: code, label: label ?? code }));
  const selectedSiteId = editingRecord?.siteId ?? sites.find((site) => site.name === formData.district)?.siteId;
  const optionsFor = (category: string) => Array.from(new Set(lookups.filter((item) => item.category === category && (item.siteId === null || item.siteId === selectedSiteId)).map((item) => item.label)))
    .map((label) => ({ value: label, label }));
  const shiftOptions = optionsFor("shift");
  const sourcePowerOptions = optionsFor("source_power");
  const spmVersionOptions = optionsFor("spm_version");
  const groupLeaderOptions = optionsFor("group_leader");
  const technicianOptions: SearchableOption[] = [{ value: currentUser.nrp, label: `${currentUser.name} - ${currentUser.nrp}` }];

  const unitNumberOptions = Array.from(new Set(
    deviceList.map((device) => device.unitNo)
      .filter((unitNo): unitNo is string => Boolean(unitNo && unitNo.trim()))
      .map((unitNo) => unitNo.trim())
  )).sort((a, b) => a.localeCompare(b));
  const unitNumberSearchOptions = unitNumberOptions.map((unitNo) => ({ value: unitNo, label: unitNo }));

  useEffect(() => {
    let active = true;
    getReplacementFormOptions()
      .then((result) => {
        if (!active) return;
        setSites(result.sites);
        setLookups(result.lookups);
        setEquipmentTypes(result.equipmentTypes.map((item) => item.name));
        setDeviceStatuses(result.deviceStatuses);
        setDeviceList(result.devices);
        setFormOptionsReady(true);
      })
      .catch((error: unknown) => {
        if (active) setOptionsError(error instanceof Error ? error.message : "Gagal memuat data dropdown.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      technicianName: currentUser.name,
      technicianNrp: currentUser.nrp,
    }));
  }, [currentUser.name, currentUser.nrp]);

  useEffect(() => {
    if (!formOptionsReady || editLoadStarted.current) return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) { editLoadStarted.current = true; return; }
    if (currentUser.role !== "superadmin") {
      setEditLoadError("Hanya Superadmin yang dapat mengedit laporan Replacement.");
      editLoadStarted.current = true;
      return;
    }
    editLoadStarted.current = true;
    getReplacement(editId).then((record) => {
      setEditingRecord(record);
      const photoFor = (slot: ReplacementFormPhotoSlotKey) => record.photos.find((photo) => photo.slot === slot);
      setFormData({
        date: record.date,
        activityType: record.activityType,
        district: record.district,
        shift: record.shift,
        startTime: normalizeToDateTimeString(record.startTime, record.date),
        endTime: normalizeToDateTimeString(record.endTime, record.date),
        oldDeviceId: record.oldDeviceId,
        oldDeviceFinalCondition: record.oldDeviceFinalCondition,
        newDeviceId: record.newDeviceId,
        unitNo: record.oldUnitNo || record.unitNo,
        equipmentType: record.oldEquipmentType ?? record.equipmentType,
        egi: record.oldEgi ?? record.egi ?? "",
        sourcePower: record.sourcePower,
        spmVersion: record.spmVersion,
        ipAddress: record.ipAddress ?? "",
        ipCpe: record.ipCpe ?? "",
        ipVhms: record.ipVhms ?? "",
        groupLeaderName: record.groupLeaderName,
        technicianName: record.technicianName,
        technicianNrp: record.technicianNrp,
        remarks: record.remarks,
        photos: {
          mh02_new_installed: photoFor("mh02_new_installed")?.url ?? "",
          mh02_old_removed: photoFor("mh02_old_removed")?.url ?? "",
          nodered_config: photoFor("nodered_config")?.url ?? "",
          gps_antenna: photoFor("gps_antenna")?.url ?? "",
        },
        photoCaptions: {
          mh02_new_installed: photoFor("mh02_new_installed")?.caption ?? "",
          mh02_old_removed: photoFor("mh02_old_removed")?.caption ?? "",
          nodered_config: photoFor("nodered_config")?.caption ?? "",
          gps_antenna: photoFor("gps_antenna")?.caption ?? "",
        },
      });
    }).catch((error: unknown) => {
      setEditLoadError(error instanceof Error ? error.message : "Replacement tidak ditemukan.");
    });
  }, [currentUser.role, deviceList, formOptionsReady]);

  // Handle Old Device change -> Auto update Unit No & Equipment Type & EGI & District if available
  const handleOldDeviceChange = (newOldId: string) => {
    const dev = deviceList.find((d) => d.deviceId === newOldId);
    const unit = dev?.unitNo || "";
    const equipType = dev?.equipmentType ?? ("" as EquipmentType);
    const egi = dev?.egi ?? "";
    setFormData((prev) => ({
      ...prev,
      oldDeviceId: newOldId,
      newDeviceId: deviceList.some((device) => device.deviceId === prev.newDeviceId && device.siteId === dev?.siteId && device.status === "in_stock_rfu") ? prev.newDeviceId : "",
      unitNo: unit,
      equipmentType: equipType,
      egi: egi,
      district: (dev?.district as DistrictName) || prev.district,
    }));
  };

  // Validation Errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lightbox Zoom Modal State
  const [zoomedPhoto, setZoomedPhoto] = useState<{
    url: string;
    title: string;
    caption: string;
  } | null>(null);

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zoomedPhoto) {
        setZoomedPhoto(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomedPhoto]);

  // Duration calculation
  const durationResult = useMemo(() => {
    return calculateWorkDuration(formData.startTime, formData.endTime, formData.date);
  }, [formData.startTime, formData.endTime, formData.date]);

  const displayedDocumentId = editingRecord?.id ?? "Dibuat saat disimpan";

  // Handle Photo File Upload
  const fileInputRefs = {
    mh02_new_installed: useRef<HTMLInputElement>(null),
    mh02_old_removed: useRef<HTMLInputElement>(null),
    nodered_config: useRef<HTMLInputElement>(null),
    gps_antenna: useRef<HTMLInputElement>(null),
  };

  const handleFileChange = (
    slotKey: ReplacementFormPhotoSlotKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0) {
        setFormErrors({ [`photo_${slotKey}`]: "Foto harus JPEG, PNG, atau WebP, maksimal 10 MiB." });
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

  const handleRemovePhoto = (slotKey: ReplacementFormPhotoSlotKey) => {
    setFormData((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [slotKey]: "",
      },
      photoCaptions: {
        ...prev.photoCaptions,
        [slotKey]: "",
      },
    }));
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formOptionsReady || optionsError) errors.creation = optionsError ?? "Data dropdown masih dimuat.";
    if (!editingRecord && selectedOldDeviceObj?.siteId !== selectedNewDeviceObj?.siteId) {
      errors.newDeviceId = "Perangkat lama dan baru harus berasal dari Site yang sama.";
    }

    if (!formData.oldDeviceId) {
      errors.oldDeviceId = "Pilih perangkat lama yang akan diganti.";
    }
    if (!formData.newDeviceId) {
      errors.newDeviceId = newDeviceOptions.length === 0
        ? `Tidak ada perangkat In Stock RFU${selectedOldDeviceObj?.district ? ` di Site ${selectedOldDeviceObj.district}` : " yang dapat diakses"}.`
        : "Pilih perangkat baru pengganti.";
    } else {
      const targetNewDev = deviceList.find((d) => d.deviceId === formData.newDeviceId);
      const isCurrentEditingNewDev = editingRecord && editingRecord.newDeviceId === formData.newDeviceId;
      if (!isCurrentEditingNewDev && (!targetNewDev || targetNewDev.status !== "in_stock_rfu")) {
        errors.newDeviceId = `Perangkat ${formData.newDeviceId} tidak memenuhi syarat: hanya perangkat berstatus In Stock RFU yang dapat dipilih.`;
      }
    }
    if (formData.oldDeviceId && formData.newDeviceId && formData.oldDeviceId === formData.newDeviceId) {
      errors.newDeviceId = "Perangkat baru tidak boleh sama dengan perangkat lama.";
    }
    if (!editingRecord && selectedOldDeviceObj && selectedOldDeviceObj.unitNo && formData.unitNo && selectedOldDeviceObj.unitNo.trim().toUpperCase() !== formData.unitNo.trim().toUpperCase()) {
      errors.unitNo = `Unit Number target (${formData.unitNo}) harus sama dengan Unit Number perangkat lama (${selectedOldDeviceObj.unitNo}).`;
    }
    if (!editingRecord && selectedOldDeviceObj && selectedOldDeviceObj.equipmentType && formData.equipmentType && selectedOldDeviceObj.equipmentType !== formData.equipmentType) {
      errors.equipmentType = `Tipe Alat Berat target (${formData.equipmentType}) harus sama dengan Tipe Alat Berat perangkat lama (${selectedOldDeviceObj.equipmentType}).`;
    }
    if (!formData.oldDeviceFinalCondition) {
      errors.oldDeviceFinalCondition = "Pilih kondisi akhir perangkat lama.";
    }
    if (!formData.unitNo.trim()) {
      errors.unitNo = "Nomor unit armada wajib diisi.";
    }
    if (!formData.district.trim()) {
      errors.district = "Distrik wajib diisi.";
    }
    if (!formData.equipmentType) errors.equipmentType = "Pilih tipe alat berat.";
    if (!formData.shift) errors.shift = "Pilih shift operasional.";
    if (!formData.sourcePower) errors.sourcePower = "Pilih source power.";
    if (!formData.spmVersion) errors.spmVersion = "Pilih SPM version.";
    if (!formData.date) {
      errors.date = "Tanggal pengerjaan wajib diisi.";
    }
    if (!formData.startTime) {
      errors.startTime = "Start Date & Time wajib diisi.";
    }
    if (!formData.endTime) {
      errors.endTime = "Finish Date & Time wajib diisi.";
    }
    if (formData.startTime && formData.endTime && !durationResult.isValid) {
      errors.endTime = durationResult.formatted;
    }
    if (!formData.technicianName.trim()) {
      errors.technicianName = "Nama teknisi pelaksana wajib diisi.";
    }
    if (!formData.groupLeaderName.trim()) {
      errors.groupLeaderName = "Group Leader penanggung jawab wajib dipilih.";
    }

    if (!formData.ipAddress.trim()) {
      errors.ipAddress = "IP Address SMARTD DISPLAY wajib diisi.";
    }
    if (!formData.ipCpe.trim()) {
      errors.ipCpe = "IP CPE wajib diisi.";
    }
    if (!formData.ipVhms.trim()) {
      errors.ipVhms = "IP VHMS wajib diisi.";
    }

    // Validasi foto dokumentasi wajib
    if (!formData.photos.mh02_new_installed) {
      errors.photo_mh02_new_installed = "Foto MH02 Baru Terpasang wajib diunggah.";
    }
    if (!formData.photos.mh02_old_removed) {
      errors.photo_mh02_old_removed = "Foto MH02 Lama Dilepas wajib diunggah.";
    }
    if (!formData.photos.nodered_config) {
      errors.photo_nodered_config = "Foto Konfigurasi Node-RED wajib diunggah.";
    }
    if (!formData.photos.gps_antenna) {
      errors.photo_gps_antenna = "Foto Antena GPS wajib diunggah.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form Submit Handler
  const buildPayload = (record: ReplacementRecord): ReplacementPayload => {
    const siteId = record.siteId ?? sites.find((site) => site.name === record.district)?.siteId;
    if (!siteId) throw new Error("Pilih Site yang valid.");
    return {
      siteId,
      startedAt: record.startTime,
      finishedAt: record.endTime,
      oldDeviceCode: record.oldDeviceId,
      newDeviceCode: record.newDeviceId,
      oldFinalStatus: record.oldDeviceFinalCondition,
      shift: record.shift,
      groupLeader: record.groupLeaderName,
      remarks: record.remarks,
      sourcePower: record.sourcePower,
      spmVersion: record.spmVersion,
      ipAddress: record.ipAddress ?? "",
      ipCpe: record.ipCpe ?? "",
      ipVhms: record.ipVhms ?? "",
      rowVersion: record.rowVersion,
    };
  };

  const buildPhotos = (record: ReplacementRecord): ReplacementPhotoInput[] => REPLACEMENT_FORM_PHOTO_SLOTS.map((slot) => {
    const photo = record.photos.find((item) => item.slot === slot);
    return { slot, url: photo?.url ?? "", caption: photo?.caption ?? "" };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) {
      // Scroll to top error
      scrollToErrorSummary();
      return;
    }

    setIsSubmitting(true);

    if (editingRecord) {
      if (currentUser.role !== "superadmin") {
        setFormErrors({ authorization: "Hanya Superadmin yang dapat mengedit laporan Replacement." });
        setIsSubmitting(false);
        return;
      }

      const photosFormatted: ReplacementRecord["photos"] = REPLACEMENT_FORM_PHOTO_SLOTS.map((slot) => {
        const existingPhoto = editingRecord.photos.find((photo) => photo.slot === slot);
        return {
          slot,
          // Historical labels remain part of the stored documentation unless the slot is new.
          slotLabel: existingPhoto?.slotLabel ?? getReplacementFormPhotoLabel(slot),
          url: formData.photos[slot] || "",
          caption: formData.photoCaptions[slot],
        };
      });
      const preservedCameraPhoto = editingRecord.photos.find((photo) => photo.slot === "camera_dashboard_angle");
      if (preservedCameraPhoto) photosFormatted.splice(2, 0, preservedCameraPhoto);
      const conditionLabel = conditionOptions.find((condition) => condition.value === formData.oldDeviceFinalCondition)?.label ?? formData.oldDeviceFinalCondition;
      const canonicalUnitNo = (editingRecord.oldUnitNo || formData.unitNo).trim();
      const canonicalEquipType = editingRecord.oldEquipmentType || formData.equipmentType;
      const canonicalEgi = formData.egi ?? editingRecord.egi ?? "";

      const proposed: ReplacementRecord = {
        ...editingRecord,
        date: formData.date,
        activityType: formData.activityType,
        district: formData.district.trim(),
        shift: formData.shift,
        startTime: formData.startTime,
        endTime: formData.endTime,
        durationFormatted: durationResult.formatted,
        durationMinutes: durationResult.minutes,
        oldDeviceId: formData.oldDeviceId,
        oldDeviceSerialNumber: formData.oldDeviceId === editingRecord.oldDeviceId
          ? editingRecord.oldDeviceSerialNumber
          : selectedOldDeviceObj?.serialNumber ?? editingRecord.oldDeviceSerialNumber,
        oldUnitNo: canonicalUnitNo,
        oldEquipmentType: canonicalEquipType,
        oldEgi: canonicalEgi,
        oldDeviceFinalCondition: formData.oldDeviceFinalCondition,
        oldDeviceFinalConditionLabel: conditionLabel,
        newDeviceId: formData.newDeviceId,
        newDeviceSerialNumber: formData.newDeviceId === editingRecord.newDeviceId
          ? editingRecord.newDeviceSerialNumber
          : selectedNewDeviceObj?.serialNumber ?? editingRecord.newDeviceSerialNumber,
        unitNo: canonicalUnitNo,
        equipmentType: canonicalEquipType,
        egi: canonicalEgi,
        sourcePower: formData.sourcePower,
        spmVersion: formData.spmVersion,
        ipAddress: formData.ipAddress.trim() || undefined,
        ipCpe: formData.ipCpe.trim() || undefined,
        ipVhms: formData.ipVhms.trim() || undefined,
        technicianName: formData.technicianName.trim(),
        technicianNrp: formData.technicianNrp.trim(),
        groupLeaderName: formData.groupLeaderName,
        remarks: formData.remarks.trim(),
        photos: photosFormatted,
      };

      const fields: { key: keyof ReplacementRecord; label: string }[] = [
        { key: "date", label: "Tanggal Aktivitas" },
        { key: "activityType", label: "Jenis Aktivitas" },
        { key: "district", label: "Distrik" },
        { key: "shift", label: "Shift" },
        { key: "startTime", label: "Waktu Mulai" },
        { key: "endTime", label: "Waktu Selesai" },
        { key: "durationFormatted", label: "Durasi" },
        { key: "oldDeviceId", label: "Device ID Lama" },
        { key: "oldDeviceSerialNumber", label: "Serial Number Lama" },
        { key: "oldUnitNo", label: "Unit Number Asal" },
        { key: "oldEquipmentType", label: "Tipe Armada Asal" },
        { key: "oldDeviceFinalCondition", label: "Kondisi Akhir Perangkat Lama" },
        { key: "oldDeviceFinalConditionLabel", label: "Label Kondisi Perangkat Lama" },
        { key: "newDeviceId", label: "Device ID Baru" },
        { key: "newDeviceSerialNumber", label: "Serial Number Baru" },
        { key: "unitNo", label: "Unit Number Target" },
        { key: "equipmentType", label: "Tipe Alat Berat" },
        { key: "sourcePower", label: "Source Power" },
        { key: "spmVersion", label: "SPM Version" },
        { key: "ipAddress", label: "IP Address SMARTD DISPLAY" },
        { key: "ipCpe", label: "IP CPE" },
        { key: "ipVhms", label: "IP VHMS" },
        { key: "technicianName", label: "Teknisi" },
        { key: "technicianNrp", label: "NRP Teknisi" },
        { key: "groupLeaderName", label: "Group Leader" },
        { key: "remarks", label: "Remarks" },
      ];
      const changes = fields.flatMap(({ key, label }) => {
        const oldValue = editingRecord[key];
        const newValue = proposed[key];
        if (oldValue === newValue) return [];
        return [{ label, oldValue: oldValue == null || oldValue === "" ? "—" : String(oldValue), newValue: newValue == null || newValue === "" ? "—" : String(newValue) }];
      });
      const photoSlots: ReplacementPhotoSlotKey[] = ["mh02_new_installed", "mh02_old_removed", "camera_dashboard_angle", "nodered_config", "gps_antenna"];
      photoSlots.forEach((slot) => {
        const oldPhoto = editingRecord.photos.find((photo) => photo.slot === slot);
        const newPhoto = proposed.photos.find((photo) => photo.slot === slot);
        const title = oldPhoto?.slotLabel ?? slot;
        if ((oldPhoto?.url ?? "") !== (newPhoto?.url ?? "")) {
          changes.push({ label: `${title} (file)`, oldValue: oldPhoto?.url ? "Foto tersedia" : "Tidak ada", newValue: newPhoto?.url ? "Foto tersedia" : "Tidak ada" });
        }
        if ((oldPhoto?.caption ?? "") !== (newPhoto?.caption ?? "")) {
          changes.push({ label: `${title} (caption)`, oldValue: oldPhoto?.caption || "—", newValue: newPhoto?.caption || "—" });
        }
      });
      setIsSubmitting(false);
      if (!changes.length) {
        setShowNoChangesModal(true);
        return;
      }
      setPendingEdit({ record: proposed, changes });
      return;
    }

    const requestedEditId = new URLSearchParams(window.location.search).get("edit");
    if (requestedEditId && !editingRecord) {
      setFormErrors({ authorization: editLoadError ?? "Laporan edit belum berhasil dimuat. Tidak ada perubahan yang disimpan." });
      setIsSubmitting(false);
      return;
    }

    // Siapkan data foto lengkap
    const photosFormatted = REPLACEMENT_FORM_PHOTO_SLOTS.map((slot) => ({
      slot,
      slotLabel: getReplacementFormPhotoLabel(slot),
      url: formData.photos[slot] || "",
      caption: formData.photoCaptions[slot],
    }));

    // Label kondisi akhir perangkat lama
    const conditionObj = conditionOptions.find((condition) => condition.value === formData.oldDeviceFinalCondition);
    const oldConditionLabel = conditionObj?.label || formData.oldDeviceFinalCondition;

    // Siapkan Replacement record. Unit lama dan target tetap disimpan
    // sebagai snapshot sesuai data yang tersedia saat submit.
    const canonicalUnitNo = (selectedOldDeviceObj?.unitNo || formData.unitNo).trim();
    const canonicalEquipType = selectedOldDeviceObj?.equipmentType ?? formData.equipmentType;
    const canonicalEgi = selectedOldDeviceObj?.egi ?? "";

    const newRecord: ReplacementRecord = {
      id: "",
      activityType: "Replacement",
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      durationFormatted: durationResult.formatted,
      durationMinutes: durationResult.minutes,
      shift: formData.shift,
      district: formData.district.trim(),

      oldDeviceId: formData.oldDeviceId,
      oldDeviceSerialNumber: selectedOldDeviceObj?.serialNumber || "SN-OLD",
      oldUnitNo: canonicalUnitNo,
      oldEquipmentType: canonicalEquipType,
      oldEgi: canonicalEgi,
      oldDeviceFinalCondition: formData.oldDeviceFinalCondition,
      oldDeviceFinalConditionLabel: oldConditionLabel,

      newDeviceId: formData.newDeviceId,
      newDeviceSerialNumber: selectedNewDeviceObj?.serialNumber || "SN-NEW",
      unitNo: canonicalUnitNo,
      equipmentType: canonicalEquipType,
      egi: canonicalEgi,
      sourcePower: formData.sourcePower,
      spmVersion: formData.spmVersion,

      ipAddress: formData.ipAddress.trim() || undefined,
      ipCpe: formData.ipCpe.trim() || undefined,
      ipVhms: formData.ipVhms.trim() || undefined,

      technicianName: formData.technicianName.trim(),
      technicianNrp: formData.technicianNrp.trim(),
      groupLeaderName: formData.groupLeaderName,

      status: "completed",
      remarks: formData.remarks.trim(),
      photos: photosFormatted,
      createdAt: `${formData.date} ${formData.endTime}`,
    };

    // Validasi dan simpan record serta mutasi kedua perangkat dalam satu operasi.
    try {
      const payload = buildPayload(newRecord);
      const photos = buildPhotos(newRecord);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = sessionStorage.getItem("mh02-replacement-key") ?? crypto.randomUUID();
        sessionStorage.setItem("mh02-replacement-key", idempotencyKeyRef.current);
      }
      const result = await createReplacement(payload, photos, idempotencyKeyRef.current);
      sessionStorage.removeItem("mh02-replacement-key");
      idempotencyKeyRef.current = null;
      setSuccessModal({ id: result.formNumber, unitNo: newRecord.unitNo, newDeviceId: newRecord.newDeviceId });
    } catch (error) {
      setFormErrors({ creation: error instanceof Error ? error.message : "Gagal menyimpan Replacement." });
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelPendingEdit = useCallback(() => {
    if (!pendingEdit || editConfirmGuard.current) return;
    setPendingEdit(null);
  }, [pendingEdit]);

  const confirmPendingEdit = async () => {
    if (!pendingEdit || editConfirmGuard.current || currentUser.role !== "superadmin") return;
    editConfirmGuard.current = true;
    setIsEditConfirming(true);
    try {
      await updateReplacement(pendingEdit.record.id, buildPayload(pendingEdit.record), buildPhotos(pendingEdit.record));
      setPendingEdit(null);
      router.push(`/operations/replacement/${encodeURIComponent(pendingEdit.record.id)}`);
    } catch (error) {
      editConfirmGuard.current = false;
      setIsEditConfirming(false);
      setPendingEdit(null);
      setFormErrors({ creation: error instanceof Error ? error.message : "Gagal mengedit Replacement." });
    }
  };

  useEffect(() => {
    if (!pendingEdit) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPendingEdit();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [pendingEdit, cancelPendingEdit]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* 1. Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/operations/replacement"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar Replacement
        </Link>
        <span className="text-xs tabular-nums bg-violet-50 text-violet-700 px-3 py-1 rounded-full border border-violet-200">
          {editingRecord ? `Form Number: ${displayedDocumentId}` : `Auto Form No: ${displayedDocumentId}`}
        </span>
      </div>

      {/* 2. Title Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-50 text-violet-600 border border-violet-100">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editingRecord ? "Edit Replacement" : "Form Replacement"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Catat pergantian unit telematika SMARTD DISPLAY lama dengan perangkat baru pada armada operasional.
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-800">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Ketentuan Mutasi:</span> Saat formulir disubmit, perangkat lama akan otomatis dilepas dari unit armada dan statusnya dialihkan ke kondisi akhir yang Anda tentukan. Perangkat baru akan beralih menjadi <strong>In Use</strong> dan dikaitkan ke unit armada.
          </div>
        </div>

        {/* Global Errors Alert */}
        {Object.keys(formErrors).length > 0 && (
          <div data-error-summary="true" className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {formErrors.creation ? "Gagal menyimpan Replacement:" : "Mohon periksa kolom yang belum valid:"}
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {Object.values(formErrors).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {formNotice && (
          <div className="mt-4 p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-800">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p>{formNotice}</p>
          </div>
        )}
      </div>

      {editLoadError || optionsError ? (
        <div role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800">{editLoadError ?? optionsError}</div>
      ) : !formOptionsReady ? (
        <div role="status" className="p-4 text-sm text-slate-500">Memuat data dropdown...</div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* A. Bagian Perangkat Lama yang Diganti */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <HardDrive className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              A. Perangkat Lama yang Akan Diganti
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dropdown Perangkat Lama (In Use Only) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pilih Device ID Lama <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-old-device"
                disabled={Boolean(editingRecord)}
                value={formData.oldDeviceId}
                options={oldDeviceOptions}
                placeholder="Cari atau pilih perangkat aktif"
                onChange={handleOldDeviceChange}
                error={Boolean(formErrors.oldDeviceId)}
              />
              {formErrors.oldDeviceId && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.oldDeviceId}</p>
              )}
            </div>

            {/* Pilihan Kondisi Akhir Perangkat Lama */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kondisi Akhir Perangkat Lama <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-old-device-condition"
                disabled={Boolean(editingRecord)}
                value={formData.oldDeviceFinalCondition || ""}
                options={conditionOptions}
                placeholder="Cari atau pilih kondisi akhir"
                onChange={(value) => setFormData((prev) => ({ ...prev, oldDeviceFinalCondition: value as OldDeviceFinalCondition }))}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {
                  conditionOptions.find((condition) => condition.value === formData.oldDeviceFinalCondition)?.label
                }
              </p>
            </div>
          </div>

          {/* Rincian Info Perangkat Lama (Read-only Badge Card) */}
          {selectedOldDeviceObj && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Serial Number</span>
                <span className="font-semibold text-slate-700">
                  {selectedOldDeviceObj.serialNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Unit Number Terpasang</span>
                <span className="font-semibold text-slate-700">
                  {selectedOldDeviceObj.unitNo || "Belum Terpasang"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Tipe Armada</span>
                <span className="font-semibold text-slate-700">
                  {selectedOldDeviceObj.equipmentType || "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Distrik Asal</span>
                <span className="font-semibold text-slate-700">
                  {selectedOldDeviceObj.district || "-"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* B. Informasi Dasar Aktivitas */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Clock className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              B. Informasi Dasar Pelaksanaan
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Form Number (Read-only) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Form Number (Auto)
              </label>
              <input
                type="text"
                value={displayedDocumentId}
                readOnly
                className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 tabular-nums text-slate-600 cursor-not-allowed font-semibold"
              />
            </div>

            {/* Jenis Aktivitas (Dropdown) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jenis Aktivitas
              </label>
              <SearchableDropdown
                id="replacement-activity-type"
                value={formData.activityType}
                options={activityTypeOptions}
                placeholder="Cari jenis aktivitas"
                onChange={(value) => setFormData((prev) => ({ ...prev, activityType: value as "Replacement" }))}
              />
            </div>

            {/* Distrik */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Distrik <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-district"
                disabled
                value={formData.district}
                options={districtOptions}
                placeholder="Cari atau pilih distrik"
                onChange={(value) => setFormData((prev) => ({ ...prev, district: value }))}
                error={Boolean(formErrors.district)}
              />
              {formErrors.district && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.district}</p>
              )}
            </div>

            {/* Tanggal Aktivitas (Date Picker) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Aktivitas <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                disabled={Boolean(editingRecord)}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Shift */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift Operasional <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-shift"
                value={formData.shift || ""}
                options={shiftOptions}
                placeholder="Cari atau pilih shift"
                onChange={(value) => setFormData((prev) => ({ ...prev, shift: value as InstallationShift }))}
              />
            </div>

            {/* Start Date & Time & Finish Date & Time (Durasi Otomatis) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={Boolean(editingRecord)}
                  value={formData.startTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      startTime: val,
                      ...(val && !prev.date ? { date: val.slice(0, 10) } : {}),
                    }));
                  }}
                  className={`w-full text-xs bg-slate-50 border rounded-lg px-2.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 ${formErrors.startTime ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finish Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={Boolean(editingRecord)}
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className={`w-full text-xs bg-slate-50 border rounded-lg px-2.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 ${formErrors.endTime ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
                />
              </div>
            </div>
          </div>

          {/* Durasi Pengerjaan Otomatis */}
          <div className="p-3 bg-violet-50 border border-violet-100 rounded-lg flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-800">
              Durasi Pengerjaan (Kalkulasi Otomatis):
            </span>
            <span
              className={`text-xs font-bold ${
                durationResult.isValid ? "text-violet-700" : "text-rose-600"
              }`}
            >
              {durationResult.formatted}
            </span>
          </div>
          {formErrors.endTime && (
            <p className="text-[11px] text-rose-600">{formErrors.endTime}</p>
          )}
        </div>

        {/* C. Informasi Device Baru (Pengganti) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Zap className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              C. Informasi Device Baru &amp; Unit Target
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Dropdown Device ID Baru */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Device ID Baru (Stok RFU) <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-new-device"
                disabled={Boolean(editingRecord)}
                value={formData.newDeviceId}
                options={newDeviceOptions}
                placeholder="Cari atau pilih unit pengganti"
                onChange={(value) => setFormData((prev) => ({ ...prev, newDeviceId: value }))}
                error={Boolean(formErrors.newDeviceId)}
              />
              {!editingRecord && newDeviceOptions.length === 0 && !formErrors.newDeviceId && (
                <p role="status" className="text-[11px] text-amber-700 mt-1">
                  Tidak ada perangkat In Stock RFU{selectedOldDeviceObj?.district ? ` di Site ${selectedOldDeviceObj.district}` : " yang dapat diakses"}.
                </p>
              )}
              {formErrors.newDeviceId && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.newDeviceId}</p>
              )}
            </div>

            {/* Unit Number - strictly inherited from old device / vehicle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Unit Number <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 flex items-center gap-1">
                  Otomatis Unit Lama
                </span>
              </div>
              <SearchableDropdown
                id="replacement-unit-number"
                value={formData.unitNo}
                options={unitNumberSearchOptions}
                placeholder="Otomatis mengikuti perangkat lama"
                onChange={() => {}}
                disabled
                error={Boolean(formErrors.unitNo)}
                inputClassName="font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Identitas lambung kendaraan tidak berubah saat penggantian perangkat.
              </p>
              {formErrors.unitNo && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.unitNo}</p>
              )}
            </div>

            {/* Tipe Alat Berat - strictly inherited from old device / vehicle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Tipe Alat Berat <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 flex items-center gap-1">
                  Otomatis Unit Lama
                </span>
              </div>
              <SearchableDropdown
                id="replacement-equipment-type"
                value={formData.equipmentType || ""}
                options={equipmentTypeOptions}
                placeholder="Otomatis mengikuti perangkat lama"
                onChange={() => {}}
                disabled
                error={Boolean(formErrors.equipmentType)}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Tipe alat berat terkunci sesuai armada asal.
              </p>
              {formErrors.equipmentType && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.equipmentType}</p>
              )}
            </div>

            {/* EGI (Model Unit) - strictly inherited from old device / vehicle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  EGI (Model Unit) <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 flex items-center gap-1">
                  Otomatis Unit Lama
                </span>
              </div>
              <input
                type="text"
                readOnly
                disabled
                value={formData.egi ?? ""}
                placeholder="Otomatis mengikuti perangkat lama"
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Kode model unit (misal: HD785-7) terkunci otomatis sesuai armada asal.
              </p>
            </div>

            {/* Source Power */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Source Power <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-source-power"
                value={formData.sourcePower || ""}
                options={sourcePowerOptions}
                placeholder="Cari atau pilih source power"
                onChange={(value) => setFormData((prev) => ({ ...prev, sourcePower: value as SourcePowerType }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SPM Version */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SPM Version <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-spm-version"
                value={formData.spmVersion}
                options={spmVersionOptions}
                placeholder="Cari atau pilih SPM version"
                onChange={(value) => setFormData((prev) => ({ ...prev, spmVersion: value }))}
              />
            </div>
          </div>
        </div>

        {/* E. Konfigurasi Jaringan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Network className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              E. Konfigurasi Jaringan Telematika
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP Address SMARTD DISPLAY <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipAddress}
                onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                placeholder="192.168.1.100"
                className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formErrors.ipAddress ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
                }`}
              />
              {formErrors.ipAddress && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.ipAddress}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP CPE <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipCpe}
                onChange={(e) => setFormData({ ...formData, ipCpe: e.target.value })}
                placeholder="192.168.1.1"
                className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formErrors.ipCpe ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
                }`}
              />
              {formErrors.ipCpe && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.ipCpe}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP VHMS <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipVhms}
                onChange={(e) => setFormData({ ...formData, ipVhms: e.target.value })}
                placeholder="192.168.1.50"
                className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formErrors.ipVhms ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
                }`}
              />
              {formErrors.ipVhms && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.ipVhms}</p>
              )}
            </div>
          </div>
        </div>

        {/* F. Foto Dokumentasi: Empat Slot Foto Terpisah */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                F. Foto Dokumentasi Pengerjaan (4 Slot)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Mendukung pratinjau thumbnail &amp; zoom resolusi penuh
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REPLACEMENT_FORM_PHOTO_SLOTS.map((slotKey) => {
              const slotLabel = getReplacementFormPhotoLabel(slotKey);
              const photoUrl = formData.photos[slotKey];
              const caption = formData.photoCaptions[slotKey];
              const photoErrorKey = `photo_${slotKey}`;
              const hasPhotoError = Boolean(formErrors[photoErrorKey]);

              return (
                <div
                  key={slotKey}
                  className={`rounded-xl border overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group p-3.5 space-y-3 ${
                    hasPhotoError
                      ? "border-rose-400 bg-rose-50/30"
                      : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  {/* 1. Photo Title (Top of card, above image) */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 block line-clamp-1">
                      {slotLabel}
                    </span>
                  </div>

                  {/* 2. Photo Image or Placeholder (Below title) */}
                  {photoUrl ? (
                    <div className="relative flex h-[180px] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-900 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl}
                        alt={slotLabel}
                        className="max-h-full max-w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedPhoto({
                            url: photoUrl,
                            title: slotLabel,
                            caption,
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
                      onClick={() => fileInputRefs[slotKey].current?.click()}
                      className="h-[180px] w-full border-2 border-dashed border-slate-300 hover:border-violet-400 rounded-lg flex flex-col items-center justify-center p-3 text-center cursor-pointer bg-white transition hover:bg-violet-50/30"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1 text-slate-400 group-hover:text-violet-500">
                        <Camera className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Pilih / Unggah Foto</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG up to 5MB</span>
                    </div>
                  )}

                  {/* 3. Photo Description & Actions (Below image) */}
                  <div className="space-y-2 pt-1 flex-1 flex flex-col justify-between">
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRefs[slotKey]}
                      onChange={(e) => handleFileChange(slotKey, e)}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRefs[slotKey].current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors shadow-2xs"
                      >
                        <Upload className="h-3 w-3 text-slate-500" />
                        {photoUrl ? "Ganti Foto" : "Unggah Foto"}
                      </button>
                      {photoUrl && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(slotKey)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-medium transition-colors"
                          title="Hapus foto ini"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={caption}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          photoCaptions: {
                            ...formData.photoCaptions,
                            [slotKey]: e.target.value,
                          },
                        })
                      }
                      placeholder="Keterangan foto (opsional)..."
                      className="w-full text-[11px] bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
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

        {/* G. Informasi Personel */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <User className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              G. Informasi Personel Pelaksana
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Group Leader */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Group Leader (GL) <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-group-leader"
                value={formData.groupLeaderName}
                options={groupLeaderOptions}
                placeholder="Cari atau pilih Group Leader"
                onChange={(value) => setFormData((prev) => ({ ...prev, groupLeaderName: value }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teknisi Pelaksana <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="replacement-technician"
                disabled
                value={formData.technicianNrp}
                options={technicianOptions}
                placeholder="Cari atau pilih teknisi"
                displayValue={formData.technicianName}
                onChange={(nrp) => {
                  if (nrp !== currentUser.nrp) return;
                  setFormData((prev) => ({
                    ...prev,
                    technicianName: currentUser.name,
                    technicianNrp: currentUser.nrp,
                  }));
                }}
                error={Boolean(formErrors.technicianName)}
              />
              {formErrors.technicianName && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.technicianName}</p>
              )}
            </div>

            {/* NRP */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NRP Teknisi
              </label>
              <input
                type="text"
                value={formData.technicianNrp}
                readOnly
                className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 tabular-nums text-slate-700 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* H. Remarks / Catatan Tambahan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              H. Remarks &amp; Catatan Khusus
            </h3>
          </div>

          <div>
            <textarea
              rows={3}
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="Tuliskan kendala teknis atau catatan tambahan terkait proses penggantian unit..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* I. Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <Link
            href="/operations/replacement"
            className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors shadow-2xs"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors shadow-sm disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isSubmitting ? "Menyimpan Catatan..." : editingRecord ? "Simpan Perubahan Replacement" : "Submit Replacement Form"}
          </button>
        </div>
      </form>
      )}

      {/* Lightbox Zoom Modal */}
      {zoomedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">{zoomedPhoto.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{zoomedPhoto.caption}</p>
              </div>
              <button
                type="button"
                onClick={() => setZoomedPhoto(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 flex items-center justify-center bg-slate-950 max-h-[75vh] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoomedPhoto.url}
                alt={zoomedPhoto.title}
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Confirmation Modal */}
      {successModal && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replacement-success-title"
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 id="replacement-success-title" className="text-base font-bold text-slate-800">
              Replacement Berhasil Disimpan!
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Formulir Replacement{" "}
              <strong className="text-slate-800">{successModal.id}</strong>{" "}
              untuk unit{" "}
              <strong className="text-slate-800">{successModal.unitNo}</strong>{" "}
              dengan perangkat baru{" "}
              <strong className="text-slate-800">{successModal.newDeviceId}</strong>{" "}
              telah berhasil dicatat.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => router.push(`/operations/replacement`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => router.push(`/operations/replacement/${encodeURIComponent(successModal.id)}`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
              >
                View Detail
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* No Changes Modal */}
      {showNoChangesModal && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowNoChangesModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-blue-50 text-blue-600 border border-blue-100">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Tidak Ada Perubahan
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Tidak ada data yang diubah. Semua nilai masih sama dengan data sebelumnya.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                href="/operations/replacement"
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

      {pendingEdit && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !isEditConfirming) cancelPendingEdit(); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="replacement-edit-confirm-title" className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col animate-scaleIn">
            <div className="border-b border-slate-200 p-5 bg-white">
              <h2 id="replacement-edit-confirm-title" className="text-base font-bold text-slate-900">Konfirmasi Perubahan Replacement</h2>
              <p className="mt-1 text-xs text-slate-500">Periksa nilai sebelumnya dan nilai perubahan sebelum menerapkan pembaruan formulir {pendingEdit.record.id}.</p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 pb-2 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Field</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">Sebelumnya</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hidden sm:block">Perubahan</span>
              </div>
              {pendingEdit.changes.map((change, index) => (
                <div key={`${change.label}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                  <span className="text-xs font-semibold text-slate-700 self-center">{change.label}</span>
                  <div className="text-xs text-slate-500 bg-white p-2 rounded border border-slate-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5 sm:hidden">Sebelumnya</span>
                    {change.oldValue}
                  </div>
                  <div className="text-xs font-medium text-blue-700 bg-blue-50/50 p-2 rounded border border-blue-200 break-words">
                    <span className="block text-[10px] font-bold uppercase text-blue-500 mb-0.5 sm:hidden">Perubahan</span>
                    {change.newValue}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={cancelPendingEdit} disabled={isEditConfirming} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition">Batal</button>
              <button type="button" onClick={confirmPendingEdit} disabled={isEditConfirming} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5">{isEditConfirming ? "Menyimpan Perubahan..." : "Konfirmasi Perubahan"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
