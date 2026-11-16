"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wrench,
  ArrowLeft,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Truck,
  MapPin,
  Network,
  Shield,
  User,
  Camera,
  ZoomIn,
  Sparkles,
  Lock,
  Layers,
  Cpu,
  Radio,
  FileText,
  Calendar,
  Upload,
  Trash2,
  ChevronDown,
} from "lucide-react";
import {
  devices as allDevices,
  initialInstallations,
  GROUP_LEADERS,
  TECHNICIANS,
  SHIFT_OPTIONS,
  SOURCE_POWER_OPTIONS,
  SPM_VERSIONS,
  AREAS_BY_DISTRICT,
  DEMO_PHOTO_SLOTS,
  createInstallationWithDevice,
  getInstallationById,
  getNextInstallationFormNumber,
  prepareDeviceInstallationEdit,
  executeDeviceInstallationEdit,
  getEquipmentTypeByUnit,
  getEgiByUnit,
  getFleetMasterByUnit,
  matchesUnitNumberSearch,
} from "@/lib/mock-data";
import { useAuth } from "@/features/auth/AuthContext";
import {
  InstallationRecord,
  InstallationFormData,
  InstallationShift,
  SourcePowerType,
  PhotoSlotKey,
} from "@/types/installation";
import { DistrictName, EquipmentType, DeviceRecord } from "@/types/dashboard";
import { recordAuditAction } from "@/lib/mock-data/audit-logs";
import {
  calculateWorkDuration,
  normalizeToDateTimeString,
  scrollToErrorSummary,
} from "@/lib/utils";
const EQUIPMENT_TYPES: EquipmentType[] = [
  "Dump Truck",
  "Water Truck",
  "Fuel Truck",
  "Loader",
  "Others",
];

const DISTRICTS: DistrictName[] = [
  "Sangatta",
  "Bengalon",
  "Wahau",
  "Sangatta Utara",
];

// ─── Inline SearchableDropdown (same pattern as Replacement/Removal forms) ────
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
  displayValue?: string;
  allowCustomValue?: boolean;
  inputClassName?: string;
  disabled?: boolean;
}

function SearchableDropdown({
  id,
  value,
  options,
  placeholder,
  onChange,
  error = false,
  displayValue,
  allowCustomValue = false,
  inputClassName = "",
  disabled = false,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.value === value);
  const filteredOptions = options.filter((o) => {
    if (!query.trim()) return true;
    if (id.includes("unit") || id.includes("unit-no")) {
      return matchesUnitNumberSearch(o.value, query) || matchesUnitNumberSearch(o.label, query);
    }
    return `${o.label} ${o.value}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const openDropdown = (clearQuery = true) => {
    if (disabled) return;
    if (clearQuery) setQuery("");
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
        aria-activedescendant={
          isOpen && filteredOptions.length
            ? `${id}-option-${activeIndex}`
            : undefined
        }
        value={isOpen ? query : displayValue ?? selectedOption?.label ?? value}
        onClick={() => {
          if (!disabled && !isOpen) openDropdown(allowCustomValue ? false : true);
        }}
        onChange={(e) => {
          if (disabled) return;
          const nextVal = e.target.value;
          setQuery(nextVal);
          setActiveIndex(0);
          setIsOpen(true);
          if (allowCustomValue) {
            onChange(nextVal);
          }
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!isOpen) openDropdown();
            else if (filteredOptions.length)
              setActiveIndex((i) => (i + 1) % filteredOptions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!isOpen) openDropdown();
            else if (filteredOptions.length)
              setActiveIndex(
                (i) => (i - 1 + filteredOptions.length) % filteredOptions.length
              );
          } else if (e.key === "Enter" && isOpen) {
            e.preventDefault();
            const opt = filteredOptions[activeIndex];
            if (opt) selectOption(opt);
            else if (allowCustomValue && query.trim()) {
              onChange(query.trim().toUpperCase());
              setIsOpen(false);
              setQuery("");
            }
          }
        }}
        onBlur={(e) => {
          if (
            e.relatedTarget &&
            rootRef.current?.contains(e.relatedTarget as Node)
          )
            return;
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery("");
          }, 0);
        }}
        placeholder={placeholder}
        className={`w-full text-xs bg-slate-50 border rounded-lg px-3 py-2.5 pr-9 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName} ${disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed opacity-90 border-slate-200" : error ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
          }`}
      />
      {!disabled && (
        <button
          type="button"
          aria-label={`Tampilkan opsi ${placeholder}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              setQuery("");
            } else {
              openDropdown();
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
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${id}-option-${index}`}
                data-option-index={index}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                className={`block w-full px-3 py-2 text-left text-xs text-slate-700 ${index === activeIndex ? "bg-blue-50" : "hover:bg-slate-50"
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

export default function NewInstallationPage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  // Edit Mode state
  const [editingRecord, setEditingRecord] = useState<InstallationRecord | null>(null);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    record: InstallationRecord;
    changes: { label: string; oldValue: string; newValue: string }[];
  } | null>(null);
  const [showNoChangesModal, setShowNoChangesModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditConfirming, setIsEditConfirming] = useState(false);
  const [successModal, setSuccessModal] = useState<{ id: string; unitNo: string; deviceId: string } | null>(null);

  // Snapshot of available devices (In Stock RFU or currently selected in edit mode)
  const [devices] = useState<DeviceRecord[]>([...allDevices]);
  const availableDevices = useMemo(() => {
    return devices.filter(
      (d) => d.status === "in_stock_rfu" || (editingRecord && d.deviceId === editingRecord.deviceId)
    );
  }, [devices, editingRecord]);

  // Master Unit Numbers list from devices & initial installations
  const unitNumberOptions: SearchableOption[] = useMemo(() => {
    const rawUnits = new Set<string>();
    allDevices.forEach((d) => {
      if (d.unitNo) rawUnits.add(d.unitNo.trim());
    });
    initialInstallations.forEach((i) => {
      if (i.unitNo) rawUnits.add(i.unitNo.trim());
    });
    return Array.from(rawUnits)
      .sort((a, b) => a.localeCompare(b))
      .map((u) => ({ value: u, label: u }));
  }, []);

  // Form State
  const [formData, setFormData] = useState<InstallationFormData>({
    date: new Date().toISOString().split("T")[0],
    installationTime: "",
    startTime: "",
    endTime: "",
    deviceId: "",
    unitNo: "",
    equipmentType: "" as EquipmentType,
    shift: undefined,
    sourcePower: undefined,
    spmVersion: "",
    district: "" as DistrictName,
    area: "",
    locationDetail: "",
    ipAddress: "",
    ipCpe: "",
    ipVhms: "",
    technicianName: "",
    technicianNrp: "",
    groupLeaderName: "",
    remarks: "",
    notes: "",
    photos: {
      mh02_installed: "",
      nodered_config: "",
      gps_antenna: "",
      // legacy aliases
      unit_exterior: "",
      module_position: "",
      wiring_power: "",
    },
  });

  // Photo captions
  const [photoCaptions, setPhotoCaptions] = useState<Record<PhotoSlotKey, string>>({
    mh02_installed: "",
    nodered_config: "",
    gps_antenna: "",
    camera_dashboard_angle: "",
    unit_exterior: "",
    module_position: "",
    wiring_power: "",
  });

  // Validation Errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Lightbox Zoom Modal State
  const [zoomedPhoto, setZoomedPhoto] = useState<{
    url: string;
    title: string;
    caption: string;
  } | null>(null);

  // Portal SSR Hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Detect and load Edit mode from URL search param `?edit=INS-...`
  useEffect(() => {
    if (typeof window === "undefined") return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;

    if (currentUser.role !== "superadmin") {
      setEditLoadError("Hanya Superadmin yang memiliki akses untuk mengedit formulir Installation.");
      return;
    }

    const found = getInstallationById(editId);
    if (!found) {
      setEditLoadError(`Laporan Installation "${editId}" tidak ditemukan.`);
      return;
    }

    setEditingRecord(found);

    const photoFor = (key: PhotoSlotKey) => found.photos?.find((p) => p.slot === key);

    // Derive equipment type and EGI from master data if available, otherwise fallback to stored record
    const derivedEquipType = getEquipmentTypeByUnit(found.unitNo, found.equipmentType);
    const derivedEgi = found.egi || getEgiByUnit(found.unitNo);

    setFormData({
      date: found.date,
      installationTime: found.startTime || found.installationTime || "",
      startTime: normalizeToDateTimeString(found.startTime, found.date),
      endTime: normalizeToDateTimeString(found.endTime, found.date),
      deviceId: found.deviceId,
      unitNo: found.unitNo,
      equipmentType: derivedEquipType,
      egi: derivedEgi,
      shift: found.shift,
      sourcePower: found.sourcePower,
      spmVersion: found.spmVersion || "",
      district: found.district,
      area: found.area || "",
      locationDetail: found.locationDetail || "",
      ipAddress: found.ipAddress || "",
      ipCpe: found.ipCpe || "",
      ipVhms: found.ipVhms || "",
      technicianName: found.technicianName,
      technicianNrp: found.technicianNrp,
      groupLeaderName: found.groupLeaderName,
      remarks: found.remarks || found.notes || "",
      notes: found.notes || found.remarks || "",
      photos: {
        mh02_installed: photoFor("mh02_installed")?.url || photoFor("unit_exterior")?.url || "",
        nodered_config: photoFor("nodered_config")?.url || photoFor("wiring_power")?.url || "",
        gps_antenna: photoFor("gps_antenna")?.url || "",
        unit_exterior: "",
        module_position: "",
        wiring_power: "",
      },
    });

    setPhotoCaptions({
      mh02_installed: photoFor("mh02_installed")?.caption || photoFor("unit_exterior")?.caption || "",
      nodered_config: photoFor("nodered_config")?.caption || photoFor("wiring_power")?.caption || "",
      gps_antenna: photoFor("gps_antenna")?.caption || "",
      camera_dashboard_angle: photoFor("camera_dashboard_angle")?.caption || "",
      unit_exterior: "",
      module_position: "",
      wiring_power: "",
    });
  }, [currentUser.role]);

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

  // Auto-generate Document Number (INS-YYYYMM-XXX)
  const autoDocumentId = useMemo(() => {
    return getNextInstallationFormNumber(formData.date);
  }, [formData.date]);

  const displayedDocumentId = editingRecord ? editingRecord.id : autoDocumentId;

  // Auto-lookup Equipment Type from Master Data based on Unit Number
  const getEquipmentTypeForUnit = (unit: string): EquipmentType => {
    return getEquipmentTypeByUnit(unit, "Dump Truck");
  };

  const handleUnitNoChange = (rawUnit: string) => {
    const cleanUnit = rawUnit.toUpperCase();
    const master = getFleetMasterByUnit(cleanUnit);
    setFormData((prev) => ({
      ...prev,
      unitNo: cleanUnit,
      equipmentType: master ? master.equipmentType : ("" as EquipmentType),
      egi: master ? master.egi : "",
    }));
  };

  // Handle District Change & Update Area options
  const handleDistrictChange = (d: DistrictName) => {
    setFormData((prev) => ({
      ...prev,
      district: d,
      area: "",
    }));
  };

  // Handle Technician Change & Sync NRP
  const handleTechnicianChange = (techName: string) => {
    const matched = TECHNICIANS.find((t) => t.name === techName);
    setFormData((prev) => ({
      ...prev,
      technicianName: techName,
      technicianNrp: matched?.nrp || prev.technicianNrp,
    }));
  };

  // Handle Mock Image Upload / File simulation
  const handleFileUpload = (slot: PhotoSlotKey, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFormData((prev) => ({
          ...prev,
          photos: {
            ...prev.photos,
            [slot]: reader.result as string,
          },
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove/Clear Photo
  const handleRemovePhoto = (slot: PhotoSlotKey) => {
    setFormData((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [slot]: "",
      },
    }));
    setPhotoCaptions((prev) => ({
      ...prev,
      [slot]: "",
    }));
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    const errors: Record<string, string> = {};

    if (!formData.date) errors.date = "Tanggal pemasangan wajib diisi.";

    if (!formData.deviceId) {
      errors.deviceId = "Pilih perangkat SMARTD DISPLAY yang akan dipasang.";
    }

    if (!formData.unitNo.trim()) {
      errors.unitNo = "Nomor unit lambung armada wajib diisi (contoh: DT-105).";
    }

    if (!formData.equipmentType) errors.equipmentType = "Pilih tipe alat berat.";
    if (!formData.district) errors.district = "Pilih distrik operasional.";
    if (!formData.area) errors.area = "Pilih area operasional.";
    if (!formData.locationDetail.trim()) errors.locationDetail = "Lokasi detail / workshop bay wajib diisi.";

    if (!formData.ipAddress?.trim()) {
      errors.ipAddress = "IP Address SMARTD DISPLAY wajib diisi (contoh: 192.168.1.102).";
    }
    if (!formData.ipCpe?.trim()) {
      errors.ipCpe = "IP CPE wajib diisi (contoh: 192.168.1.1).";
    }
    if (!formData.ipVhms?.trim()) {
      errors.ipVhms = "IP VHMS wajib diisi (contoh: 192.168.1.50).";
    }

    if (!formData.startTime || !formData.endTime) {
      errors.time = "Start Date & Time dan Finish Date & Time wajib diisi.";
    } else if (!durationResult.isValid) {
      errors.time = durationResult.formatted;
    }

    if (!formData.shift) errors.shift = "Pilih shift kerja.";
    if (!formData.sourcePower) errors.sourcePower = "Pilih source power perangkat.";
    if (!formData.spmVersion) errors.spmVersion = "Pilih SPM Version perangkat.";

    if (!formData.technicianName.trim()) {
      errors.technicianName = "Pilih nama teknisi pelaksana.";
    }

    if (!formData.groupLeaderName.trim()) {
      errors.groupLeaderName = "Pilih Group Leader penanggung jawab lapangan.";
    }

    // Validasi foto dokumentasi wajib
    if (!formData.photos.mh02_installed) {
      errors.photo_mh02_installed = "Foto MH02 Installed wajib diunggah.";
    }
    if (!formData.photos.nodered_config) {
      errors.photo_nodered_config = "Foto Node-RED Config wajib diunggah.";
    }
    if (!formData.photos.gps_antenna) {
      errors.photo_gps_antenna = "Foto GPS Antenna wajib diunggah.";
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToErrorSummary();
      return;
    }

    const selectedDevObj = devices.find((d) => d.deviceId === formData.deviceId);
    const serialNumber = selectedDevObj?.serialNumber || (editingRecord ? editingRecord.serialNumber : `SN-${formData.deviceId}`);
    const cleanUnitNo = formData.unitNo.trim().toUpperCase();
    const fleetMaster = getFleetMasterByUnit(cleanUnitNo);
    const finalEquipmentType = fleetMaster?.equipmentType ?? formData.equipmentType ?? ("" as EquipmentType);
    const finalEgi = fleetMaster?.egi ?? "";

    // 1. Build 3 photo objects
    const photosList = [
      {
        slot: "mh02_installed" as PhotoSlotKey,
        slotLabel: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel,
        url: formData.photos.mh02_installed || "",
        caption: photoCaptions.mh02_installed?.trim() || "",
      },
      {
        slot: "nodered_config" as PhotoSlotKey,
        slotLabel: DEMO_PHOTO_SLOTS.nodered_config.slotLabel,
        url: formData.photos.nodered_config || "",
        caption: photoCaptions.nodered_config?.trim() || "",
      },
      {
        slot: "gps_antenna" as PhotoSlotKey,
        slotLabel: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel,
        url: formData.photos.gps_antenna || "",
        caption: photoCaptions.gps_antenna?.trim() || "",
      },
    ];

    // If in edit mode:
    if (editingRecord) {
      if (currentUser.role !== "superadmin") {
        setFormErrors({ authorization: "Hanya Superadmin yang dapat mengedit formulir Installation." });
        return;
      }

      // Preserve camera_dashboard_angle if present in original
      const preservedCamera = editingRecord.photos?.find((p) => p.slot === "camera_dashboard_angle");
      if (preservedCamera) {
        photosList.splice(1, 0, preservedCamera);
      }

      const proposed: InstallationRecord = {
        ...editingRecord,
        date: formData.date,
        installationTime: formData.startTime,
        startTime: formData.startTime,
        endTime: formData.endTime,
        durationFormatted: durationResult.formatted,
        durationMinutes: durationResult.minutes,
        deviceId: formData.deviceId,
        serialNumber,
        unitNo: cleanUnitNo,
        equipmentType: finalEquipmentType,
        egi: finalEgi,
        shift: formData.shift,
        sourcePower: formData.sourcePower,
        spmVersion: formData.spmVersion || undefined,
        district: formData.district,
        area: formData.area?.trim() || undefined,
        locationDetail: formData.locationDetail.trim(),
        ipAddress: formData.ipAddress?.trim() || "",
        ipCpe: formData.ipCpe?.trim() || undefined,
        ipVhms: formData.ipVhms?.trim() || undefined,
        technicianName: formData.technicianName.trim(),
        technicianNrp: formData.technicianNrp.trim(),
        groupLeaderName: formData.groupLeaderName,
        remarks: formData.remarks?.trim() || undefined,
        notes: formData.remarks?.trim() || undefined,
        photos: photosList,
      };

      const prep = prepareDeviceInstallationEdit(editingRecord.id, proposed, currentUser.role);
      if (!prep.success) {
        setFormErrors({ preparation: prep.message });
        scrollToErrorSummary();
        return;
      }

      const fields: { key: keyof InstallationRecord; label: string }[] = [
        { key: "date", label: "Tanggal Pemasangan" },
        { key: "startTime", label: "Start Date & Time" },
        { key: "endTime", label: "Finish Date & Time" },
        { key: "durationFormatted", label: "Durasi" },
        { key: "deviceId", label: "Device ID" },
        { key: "unitNo", label: "Unit Number" },
        { key: "equipmentType", label: "Tipe Alat Berat" },
        { key: "shift", label: "Shift" },
        { key: "sourcePower", label: "Source Power" },
        { key: "spmVersion", label: "SPM Version" },
        { key: "district", label: "Distrik" },
        { key: "area", label: "Area" },
        { key: "locationDetail", label: "Lokasi Detail" },
        { key: "ipAddress", label: "IP Address" },
        { key: "ipCpe", label: "IP CPE" },
        { key: "ipVhms", label: "IP VHMS" },
        { key: "technicianName", label: "Teknisi" },
        { key: "technicianNrp", label: "NRP Teknisi" },
        { key: "groupLeaderName", label: "Group Leader" },
        { key: "remarks", label: "Remarks" },
      ];

      const changes: { label: string; oldValue: string; newValue: string }[] = [];
      fields.forEach(({ key, label }) => {
        const oldVal = editingRecord[key];
        const newVal = prep.record[key];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
          changes.push({
            label,
            oldValue: oldVal == null || oldVal === "" ? "—" : String(oldVal),
            newValue: newVal == null || newVal === "" ? "—" : String(newVal),
          });
        }
      });

      const photoSlotKeys: PhotoSlotKey[] = ["mh02_installed", "nodered_config", "gps_antenna"];
      photoSlotKeys.forEach((slot) => {
        const oldPhoto = editingRecord.photos?.find(
          (p) =>
            p.slot === slot ||
            (slot === "mh02_installed" && p.slot === "unit_exterior") ||
            (slot === "nodered_config" && p.slot === "wiring_power")
        );
        const newPhoto = prep.record.photos?.find((p) => p.slot === slot);
        const title = DEMO_PHOTO_SLOTS[slot]?.slotLabel?.replace(/^\d+\.\s*/, "") || slot;
        if ((oldPhoto?.url ?? "") !== (newPhoto?.url ?? "")) {
          changes.push({
            label: `${title} (file)`,
            oldValue: oldPhoto?.url ? "Foto tersedia" : "Tidak ada",
            newValue: newPhoto?.url ? "Foto tersedia" : "Tidak ada",
          });
        }
        if ((oldPhoto?.caption ?? "") !== (newPhoto?.caption ?? "")) {
          changes.push({
            label: `${title} (caption)`,
            oldValue: oldPhoto?.caption || "—",
            newValue: newPhoto?.caption || "—",
          });
        }
      });

      if (changes.length === 0) {
        setShowNoChangesModal(true);
        return;
      }

      setPendingEdit({ record: prep.record, changes });
      return;
    }

    // 2. Construct new InstallationRecord (Create Mode)
    const newRecord: InstallationRecord = {
      id: autoDocumentId,
      date: formData.date,
      installationTime: formData.startTime,
      startTime: formData.startTime,
      endTime: formData.endTime,
      durationFormatted: durationResult.formatted,
      durationMinutes: durationResult.minutes,
      deviceId: formData.deviceId,
      serialNumber,
      unitNo: cleanUnitNo,
      equipmentType: finalEquipmentType,
      egi: finalEgi,
      shift: formData.shift,
      sourcePower: formData.sourcePower,
      spmVersion: formData.spmVersion || undefined,
      district: formData.district,
      area: formData.area?.trim() || undefined,
      locationDetail: formData.locationDetail.trim(),
      ipAddress: formData.ipAddress?.trim() || "",
      ipCpe: formData.ipCpe?.trim() || undefined,
      ipVhms: formData.ipVhms?.trim() || undefined,
      technicianName: formData.technicianName.trim(),
      technicianNrp: formData.technicianNrp.trim(),
      groupLeaderName: formData.groupLeaderName,
      status: "completed",
      remarks: formData.remarks?.trim() || undefined,
      notes: formData.remarks?.trim() || undefined,
      photos: photosList,
      createdAt: `${formData.date} ${formData.endTime}`,
    };

    // 3. Validate and create the report/device update together in the shared mock store.
    const creationResult = createInstallationWithDevice(newRecord);
    if (!creationResult.success) {
      setFormErrors({ creation: creationResult.message });
      scrollToErrorSummary();
      return;
    }
    recordAuditAction({ table: "installation", operation: "INSERT", recordId: newRecord.id });

    // 4. Show success confirmation modal
    setSuccessModal({ id: newRecord.id, unitNo: cleanUnitNo, deviceId: newRecord.deviceId });
  };

  const confirmPendingEdit = () => {
    if (!pendingEdit || isEditConfirming) return;
    setIsEditConfirming(true);

    const result = executeDeviceInstallationEdit(
      pendingEdit.record.id,
      pendingEdit.record,
      currentUser.role
    );

    if (!result.success) {
      setFormErrors({ update: result.message });
      setPendingEdit(null);
      setIsEditConfirming(false);
      return;
    }

    recordAuditAction({
      table: "installation",
      operation: "UPDATE",
      recordId: pendingEdit.record.id,
    });

    setIsEditConfirming(false);
    setPendingEdit(null);
    router.push(
      `/operations/installation/${encodeURIComponent(pendingEdit.record.id)}`
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb & Navigation Topbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            href="/operations/installation"
            className="hover:text-blue-600 transition flex items-center gap-1 font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Riwayat Pemasangan</span>
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">
            {editingRecord ? `Edit Formulir (${editingRecord.id})` : "Formulir Pemasangan Baru"}
          </span>
        </div>

        <Link
          href={editingRecord ? `/operations/installation/${encodeURIComponent(editingRecord.id)}` : "/operations/installation"}
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              {editingRecord ? "Mode Edit • MH02" : "Formulir Lapangan • MH02"}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Site: {formData.district}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-2 flex items-center gap-2.5">
            <Wrench className="h-6 w-6 text-blue-600" />
            {editingRecord ? "Edit Formulir Pemasangan Perangkat" : "Formulir Pemasangan Perangkat Baru"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {editingRecord
              ? `Perbarui data formulir pemasangan ${editingRecord.id}. Pastikan seluruh data akurat sebelum mengonfirmasi.`
              : "Pencatatan registrasi commissioning unit telematika SMARTD DISPLAY, konfigurasi jaringan, serta dokumentasi tiga sudut foto wajib."}
          </p>
        </div>

        <div className="text-right bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl shrink-0">
          <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 justify-end">
            <Lock className="h-3 w-3 text-slate-400" />
            {editingRecord ? "Nomor Formulir:" : "No. Dokumen Otomatis:"}
          </p>
          <p className="text-base font-bold tabular-nums text-blue-600 mt-0.5">
            {displayedDocumentId}
          </p>
        </div>
      </div>

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
        {/* SECTION 1: Informasi Pemasangan */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Calendar className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              1. Informasi Pemasangan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editingRecord ? "Form Number (Terkunci & Read-only)" : "Form Number (Otomatis & Read-only)"}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={displayedDocumentId}
                  disabled
                  className="w-full pl-3 pr-8 py-2 text-xs tabular-nums font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700 cursor-not-allowed"
                />
                <Lock className="h-3.5 w-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {editingRecord
                  ? "Nomor dokumen formulir pemasangan tidak dapat diubah."
                  : "Nomor form di-generate otomatis sesuai bulan dan urutan dokumen."}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Installation Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${formErrors.date ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}
              />
              {formErrors.date && <p className="text-[11px] text-rose-600 mt-1">{formErrors.date}</p>}
            </div>
          </div>
        </div>

        {/* SECTION 2: Informasi Perangkat & Konfigurasi Daya */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Cpu className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              2. Informasi Perangkat &amp; Catu Daya
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Device ID Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Device ID SMARTD DISPLAY <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-device-id"
                value={formData.deviceId}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, deviceId: val }))
                }
                options={availableDevices.map((dev) => ({
                  value: dev.deviceId,
                  label: `${dev.deviceId} (${dev.serialNumber}) — In Stock (RFU)`,
                }))}
                placeholder="-- Pilih Perangkat Siap Pasang --"
                error={!!formErrors.deviceId}
              />
              {formErrors.deviceId && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {formErrors.deviceId}
                </p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                Hanya menampilkan unit cadangan berstatus In Stock RFU.
              </p>
            </div>

            {/* Unit Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit Number (Nomor Lambung) <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-unit-no"
                value={formData.unitNo}
                onChange={handleUnitNoChange}
                options={unitNumberOptions}
                placeholder="-- Cari atau Pilih Unit Number --"
                error={!!formErrors.unitNo}
                allowCustomValue
                inputClassName="font-bold uppercase"
              />
              {formErrors.unitNo && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {formErrors.unitNo}
                </p>
              )}
            </div>

            {/* Equipment Type */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Tipe Alat Berat <span className="text-rose-500">*</span>
                </label>
                {Boolean(formData.unitNo) && (
                  <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> Otomatis Master Data
                  </span>
                )}
              </div>
              <SearchableDropdown
                id="installation-equipment-type"
                value={formData.equipmentType || ""}
                disabled={Boolean(formData.unitNo)}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    equipmentType: val as EquipmentType,
                  }))
                }
                options={EQUIPMENT_TYPES.map((type) => ({ value: type, label: type }))}
                placeholder="-- Otomatis mengikuti Unit Number --"
                error={!!formErrors.equipmentType}
              />
              {Boolean(formData.unitNo) ? (
                <p className="text-[10px] text-slate-400 mt-1">
                  Terkunci otomatis mengikuti master unit <span className="font-semibold text-slate-600">{formData.unitNo}</span>.
                </p>
              ) : formErrors.equipmentType ? (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.equipmentType}</p>
              ) : null}
            </div>

            {/* EGI (Equipment Model Code) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  EGI (Model Unit) <span className="text-rose-500">*</span>
                </label>
                {Boolean(formData.unitNo) && (
                  <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> Otomatis Master EGI
                  </span>
                )}
              </div>
              <input
                type="text"
                readOnly
                disabled
                value={getFleetMasterByUnit(formData.unitNo)?.egi ?? ""}
                placeholder="-- Otomatis mengikuti Unit Number --"
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Kode model alat berat (misal: HD785-7) otomatis mengikuti unit terpilih.
              </p>
            </div>

            {/* Shift */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift Kerja <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-shift"
                value={formData.shift || ""}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    shift: val as InstallationShift,
                  }))
                }
                options={SHIFT_OPTIONS.map((s) => ({ value: s, label: s }))}
                placeholder="-- Pilih Shift --"
                error={!!formErrors.shift}
              />
              {formErrors.shift && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.shift}</p>
              )}
            </div>

            {/* Source Power */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Source Power <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-source-power"
                value={formData.sourcePower || ""}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    sourcePower: val as SourcePowerType,
                  }))
                }
                options={SOURCE_POWER_OPTIONS.map((sp) => ({ value: sp, label: sp }))}
                placeholder="-- Pilih Source Power --"
                error={!!formErrors.sourcePower}
              />
              {formErrors.sourcePower && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.sourcePower}</p>
              )}
            </div>

            {/* SPM Version */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SPM Version <span className="text-rose-500">*</span>{" "}
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-normal">
                  Simulasi
                </span>
              </label>
              <SearchableDropdown
                id="installation-spm-version"
                value={formData.spmVersion ?? ""}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, spmVersion: val }))
                }
                options={SPM_VERSIONS.map((v) => ({ value: v, label: v }))}
                placeholder="-- Pilih SPM Version --"
                error={!!formErrors.spmVersion}
              />
              {formErrors.spmVersion && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.spmVersion}</p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: Lokasi Pemasangan */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <MapPin className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              3. Lokasi Pemasangan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Distrik */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Distrik Operasional <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-district"
                value={formData.district || ""}
                onChange={(val) => handleDistrictChange(val as DistrictName)}
                options={DISTRICTS.map((d) => ({ value: d, label: d }))}
                placeholder="-- Pilih Distrik --"
                error={!!formErrors.district}
              />
              {formErrors.district && <p className="text-[11px] text-rose-600 mt-1">{formErrors.district}</p>}
            </div>

            {/* Area */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Area Operasional <span className="text-rose-500">*</span>{" "}
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-normal">
                  Simulasi
                </span>
              </label>
              <SearchableDropdown
                id="installation-area"
                value={formData.area || ""}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, area: val }))
                }
                options={(AREAS_BY_DISTRICT[formData.district] || []).map((area) => ({ value: area, label: area }))}
                placeholder="-- Pilih Area --"
                error={!!formErrors.area}
              />
              {formErrors.area && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.area}</p>
              )}
            </div>

            {/* Lokasi Detail */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lokasi Detail / Workshop Bay <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.locationDetail}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    locationDetail: e.target.value,
                  }))
                }
                placeholder="Contoh: Bay 3 Workshop, Pit South Yard"
                className={`w-full px-3 py-2 text-xs bg-white border rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.locationDetail
                    ? "border-rose-300 bg-rose-50/50"
                    : "border-slate-200"
                  }`}
              />
              {formErrors.locationDetail && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.locationDetail}</p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Konfigurasi Jaringan */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Network className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              4. Konfigurasi Jaringan Telematika
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP Address SMARTD DISPLAY <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipAddress}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, ipAddress: e.target.value }))
                }
                placeholder="Contoh: 192.168.1.102"
                className={`w-full px-3 py-2 text-xs tabular-nums font-semibold bg-white border rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.ipAddress
                    ? "border-rose-300 bg-rose-50/50"
                    : "border-slate-200"
                  }`}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Alamat IP unit utama SMARTD DISPLAY untuk akses web server &amp; Node-RED.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP CPE (Client Premises Equipment) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipCpe}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, ipCpe: e.target.value }))
                }
                placeholder="Contoh: 192.168.1.1"
                className={`w-full px-3 py-2 text-xs tabular-nums font-semibold bg-white border rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.ipCpe
                    ? "border-rose-300 bg-rose-50/50"
                    : "border-slate-200"
                  }`}
              />
              {formErrors.ipCpe && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.ipCpe}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                Gateway router / CPE unit komunikasi armada.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                IP VHMS (Vehicle Health Monitoring) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ipVhms}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, ipVhms: e.target.value }))
                }
                placeholder="Contoh: 192.168.1.50"
                className={`w-full px-3 py-2 text-xs tabular-nums font-semibold bg-white border rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.ipVhms
                    ? "border-rose-300 bg-rose-50/50"
                    : "border-slate-200"
                  }`}
              />
              {formErrors.ipVhms && (
                <p className="text-[11px] text-rose-600 mt-1">{formErrors.ipVhms}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                Antarmuka CAN bus / VHMS monitoring mesin alat berat.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 5: Personel & Waktu Pengerjaan */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Clock className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              5. Informasi Personel &amp; Durasi Pengerjaan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* GL */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Group Leader (GL){" "}
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-normal">
                  Simulasi
                </span>
              </label>
              <SearchableDropdown
                id="installation-group-leader"
                value={formData.groupLeaderName}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, groupLeaderName: val }))
                }
                options={GROUP_LEADERS.map((gl) => ({
                  value: gl,
                  label: gl,
                }))}
                placeholder="-- Pilih Group Leader --"
                error={!!formErrors.groupLeaderName}
              />
              {formErrors.groupLeaderName && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {formErrors.groupLeaderName}
                </p>
              )}
            </div>

            {/* Teknisi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teknisi Pelaksana <span className="text-rose-500">*</span>
              </label>
              <SearchableDropdown
                id="installation-technician"
                value={formData.technicianName}
                onChange={(val) => handleTechnicianChange(val)}
                options={TECHNICIANS.map((tech) => ({
                  value: tech.name,
                  label: `${tech.name} (${tech.nrp})`,
                }))}
                placeholder="-- Pilih Teknisi --"
                error={!!formErrors.technicianName}
              />
              {formErrors.technicianName && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {formErrors.technicianName}
                </p>
              )}
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
                    ...(val && !prev.date ? { date: val.slice(0, 10) } : {}),
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

        {/* SECTION 6: Remarks / Catatan Teknis */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              6. Catatan Teknis (Remarks)
            </h2>
          </div>

          <div>
            <textarea
              rows={3}
              value={formData.remarks}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, remarks: e.target.value }))
              }
              placeholder="Tuliskan catatan teknis hasil commissioning, kondisi kabel, atau pengetesan lapangan..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium leading-relaxed"
            />
          </div>
        </div>

        {/* SECTION 7: 4 Upload Foto Dokumentasi Resmi */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                7. Dokumentasi Tiga Sudut Foto Resmi
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              3 Foto Wajib Beresolusi Tinggi
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Unggah foto dokumentasi bukti instalasi perangkat di lapangan. Klik pratinjau gambar untuk melihat dalam resolusi penuh melalui lightbox modal.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {[
              { slot: "mh02_installed" as PhotoSlotKey, label: DEMO_PHOTO_SLOTS.mh02_installed.slotLabel, slotNum: 1 },
              { slot: "nodered_config" as PhotoSlotKey, label: DEMO_PHOTO_SLOTS.nodered_config.slotLabel, slotNum: 2 },
              { slot: "gps_antenna" as PhotoSlotKey, label: DEMO_PHOTO_SLOTS.gps_antenna.slotLabel, slotNum: 3 },
            ].map(({ slot, label, slotNum }) => {
              const photoUrl = formData.photos[slot];
              const photoErrorKey = `photo_${slot}` as string;
              const hasPhotoError = Boolean(formErrors[photoErrorKey]);
              return (
                <div key={slot} className={`border rounded-xl p-4 bg-slate-50/50 space-y-3 ${hasPhotoError ? "border-rose-400 bg-rose-50/30" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 line-clamp-1">
                      {label}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                      Slot {slotNum}
                    </span>
                  </div>

                  {photoUrl ? (
                    <div
                      onClick={() =>
                        setZoomedPhoto({
                          url: photoUrl,
                          title: label,
                          caption: photoCaptions[slot] || "Foto Dokumentasi",
                        })
                      }
                      className="h-36 bg-slate-900 rounded-lg overflow-hidden cursor-pointer relative group border border-slate-300"
                    >
                      <img
                        src={photoUrl}
                        alt={label}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white gap-1 text-xs font-semibold">
                        <ZoomIn className="h-4 w-4" />
                        Perbesar Pratinjau
                      </div>
                    </div>
                  ) : (
                    <label className="h-36 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg flex flex-col items-center justify-center p-3 text-center cursor-pointer bg-white transition hover:bg-blue-50/30">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1 text-slate-400 group-hover:text-blue-500">
                        <Camera className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Pilih / Unggah Foto</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG up to 5MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFileUpload(slot, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                      Keterangan Foto:
                    </label>
                    <input
                      type="text"
                      value={photoCaptions[slot]}
                      onChange={(e) =>
                        setPhotoCaptions((prev) => ({
                          ...prev,
                          [slot]: e.target.value,
                        }))
                      }
                      placeholder="Tambahkan keterangan foto..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded text-slate-700 placeholder-slate-400"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="cursor-pointer text-blue-600 hover:text-blue-800 font-semibold text-[11px] hover:underline inline-flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {photoUrl ? "Ganti File Foto" : "Unggah File Foto"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFileUpload(slot, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(slot)}
                        className="text-rose-500 hover:text-rose-700 text-[11px] inline-flex items-center gap-1 font-medium"
                      >
                        <Trash2 className="h-3 w-3" /> Hapus Foto
                      </button>
                    )}
                  </div>
                  {hasPhotoError && (
                    <p className="text-[11px] text-rose-600 font-medium">{formErrors[photoErrorKey]}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href={editingRecord ? `/operations/installation/${encodeURIComponent(editingRecord.id)}` : "/operations/installation"}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition text-center"
          >
            Batal (Cancel)
          </Link>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{editingRecord ? "Simpan Perubahan Installation" : "Submit Installation Form"}</span>
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
            aria-labelledby="installation-success-title"
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center animate-scaleIn"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 id="installation-success-title" className="text-base font-bold text-slate-800">
              Installation Berhasil Disimpan!
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Formulir Installation{" "}
              <strong className="text-slate-800">{successModal.id}</strong>{" "}
              untuk unit{" "}
              <strong className="text-slate-800">{successModal.unitNo}</strong>{" "}
              telah berhasil dicatat.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => router.push(`/operations/installation`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => router.push(`/operations/installation/${encodeURIComponent(successModal.id)}`)}
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
                href="/operations/installation"
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

      {/* Edit Confirmation Modal (Diff comparison) */}
      {pendingEdit && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isEditConfirming) {
              setPendingEdit(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="installation-edit-confirm-title"
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col animate-scaleIn"
          >
            <div className="border-b border-slate-200 p-5 bg-white">
              <h2 id="installation-edit-confirm-title" className="text-base font-bold text-slate-900">
                Konfirmasi Perubahan Installation
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Periksa nilai sebelumnya dan nilai perubahan sebelum menerapkan pembaruan formulir {pendingEdit.record.id}.
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5 space-y-2">
              {/* Table Header */}
              <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 pb-2 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Field</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">Sebelumnya</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hidden sm:block">Perubahan</span>
              </div>
              {pendingEdit.changes.map((change, index) => (
                <div
                  key={`${change.label}-${index}`}
                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50"
                >
                  <span className="text-xs font-semibold text-slate-700 self-center">
                    {change.label}
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
                onClick={() => setPendingEdit(null)}
                disabled={isEditConfirming}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmPendingEdit}
                disabled={isEditConfirming}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isEditConfirming ? "Menyimpan Perubahan..." : "Konfirmasi Perubahan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* LIGHTBOX ZOOM MODAL (PORTAL TO DOCUMENT.BODY) */}
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
                  <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    <Camera className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-slate-100 truncate">
                      {zoomedPhoto.title}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Pratinjau Foto Resolusi Penuh • Dokumentasi Pemasangan MH02
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

              {/* Picture Area (fills remaining vertical space) */}
              <div className="flex-1 min-h-0 w-full p-4 sm:p-6 bg-slate-950 flex items-center justify-center overflow-hidden">
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
