// src/app/operations/replacement/[id]/page.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Truck,
  MapPin,
  Cpu,
  Network,
  Shield,
  User,
  Camera,
  ZoomIn,
  Eye,
  X,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  LayoutDashboard,
  FileText,
  Activity,
  Zap,
  ArrowUpRight,
  Pencil,
  Printer,
} from "lucide-react";
import { getReplacementById, getEgiByUnit } from "@/lib/mock-data";
import { ReplacementRecord } from "@/types/replacement";
import { useAuth } from "@/features/auth/AuthContext";

import { formatDateTimeRange } from "@/lib/utils";

export default function ReplacementDetailPage() {
  const { currentUser } = useAuth();
  const params = useParams();
  const rawId = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";

  // Ambil record Replacement berdasarkan ID
  const record: ReplacementRecord | null = useMemo(() => {
    if (!rawId) return null;
    return getReplacementById(rawId) || null;
  }, [rawId]);

  // Mounted state for createPortal
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lightbox Zoom Modal State
  const [zoomedPhoto, setZoomedPhoto] = useState<{
    url: string;
    title: string;
    caption: string;
  } | null>(null);

  // Close on Escape key and prevent background scroll when modal open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zoomedPhoto) {
        setZoomedPhoto(null);
      }
    };

    if (zoomedPhoto) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomedPhoto]);

  // Print helper
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  // Not Found State
  if (!record) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-12">
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Catatan Replacement Tidak Ditemukan
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Dokumen dengan nomor <strong>&quot;{rawId}&quot;</strong> tidak terdaftar dalam catatan sistem SMARTD DISPLAY.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/operations/replacement"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Daftar Replacement
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-slate-500" />
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      {/* 1. Header & Navigation Buttons Bar (2-Row Refined Layout) */}
      <div className="space-y-2.5 -mt-1">
        {/* Row 1 — Primary Navigation and Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Link
            href="/operations/replacement"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Replacement
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {currentUser.role === "superadmin" && (
              <Link
                href={`/operations/replacement/new?edit=${encodeURIComponent(record.id)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 text-violet-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Replacement
              </Link>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs"
              title="Cetak salinan dokumen formulir ini"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              Cetak / Print
            </button>
          </div>
        </div>

        {/* Row 2 — Secondary Navigation (Aligned to the Right) */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/reports/timeline/${encodeURIComponent(record.newDeviceId)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            View New Device Timeline ({record.newDeviceId})
          </Link>
          <Link
            href={`/reports/timeline/${encodeURIComponent(record.oldDeviceId)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs"
          >
            <Activity className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            View Old Device Timeline ({record.oldDeviceId})
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs"
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* 2. SATU KARTU INFORMASI UTAMA TERPADU (Single Clean Enterprise Transaction Document) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
        {/* Judul & Header Dokumen */}
        <div className="border-b border-slate-100 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
              Dokumen Penggantian Perangkat
            </span>
            <span className="text-xs font-medium text-slate-500">
              Site: Distrik {record.district}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {record.status === "completed" ? "Selesai (Completed)" : record.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold tabular-nums text-slate-900 mt-3 flex flex-wrap items-center gap-3">
            <span>{record.id}</span>
            <span className="text-slate-300 font-normal">|</span>
            <span className="flex items-center gap-2 text-slate-800 text-xl font-sans font-semibold">
              <Truck className="h-5 w-5 text-slate-600 shrink-0" />
              Unit {record.unitNo}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dicatat pada {record.createdAt} • Distrik {record.district}
          </p>
        </div>

        {/* 1. INFORMASI DASAR REPLACEMENT */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            1. INFORMASI DASAR REPLACEMENT
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Nomor Formulir</span>
              <span className="tabular-nums font-semibold text-slate-900">{record.id}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Jenis Aktivitas</span>
              <span className="font-semibold text-slate-900">{record.activityType}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Distrik</span>
              <span className="font-semibold text-slate-900">{record.district}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Status Dokumen</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {record.status === "completed" ? "Selesai (Completed)" : record.status}
              </span>
            </div>
          </div>
        </div>

        {/* 2. INFORMASI PERANGKAT LAMA & KONDISI AKHIR */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            2. INFORMASI PERANGKAT LAMA &amp; KONDISI AKHIR
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Device ID Lama (Dilepas)</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{record.oldDeviceId}</span>
                <Link
                  href={`/reports/timeline/${encodeURIComponent(record.oldDeviceId)}`}
                  className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 font-medium"
                >
                  Lihat Timeline <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Serial Number Perangkat Lama</span>
              <span className="font-semibold text-slate-900">{record.oldDeviceSerialNumber}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Unit Number Armada Asal</span>
              <span className="font-semibold text-slate-900">{record.oldUnitNo || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Tipe Armada Asal</span>
              <span className="font-semibold text-slate-900">{record.oldEquipmentType || "—"}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-xs text-slate-500 block mb-0.5">Kondisi Akhir Perangkat Lama</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{record.oldDeviceFinalConditionLabel}</span>
                <span className="text-xs text-slate-500">
                  (Status Aset: {record.oldDeviceFinalCondition})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. INFORMASI PERANGKAT BARU (PENGGANTI) */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            3. INFORMASI PERANGKAT BARU (PENGGANTI)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Device ID Baru (Terpasang)</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-700">{record.newDeviceId}</span>
                <Link
                  href={`/reports/timeline/${encodeURIComponent(record.newDeviceId)}`}
                  className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 font-medium"
                >
                  Lihat Timeline <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Serial Number Perangkat Baru</span>
              <span className="font-semibold text-slate-900">{record.newDeviceSerialNumber}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Unit Number Armada Target</span>
              <span className="font-semibold text-slate-900">{record.unitNo}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Tipe Alat Berat Target</span>
              <span className="font-semibold text-slate-900">{record.equipmentType}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">EGI (Model Unit)</span>
              <span className="font-semibold text-blue-700">{record.egi || getEgiByUnit(record.unitNo)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Source Power</span>
              <span className="font-semibold text-slate-900">{record.sourcePower}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">SPM Version</span>
              <span className="font-semibold text-slate-900">{record.spmVersion}</span>
            </div>
          </div>
        </div>

        {/* 4. WAKTU, TANGGAL, SHIFT & DURASI */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            4. WAKTU, TANGGAL, SHIFT &amp; DURASI PENGERJAAN
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Tanggal Aktivitas</span>
              <span className="font-semibold text-slate-900">{record.date}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Shift Operasional</span>
              <span className="font-semibold text-slate-900">{record.shift}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Waktu Pengerjaan</span>
              <span className="font-semibold text-slate-900">
                {formatDateTimeRange(record.startTime, record.endTime, record.date)}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Durasi Pengerjaan</span>
              <span className="font-semibold text-violet-700">{record.durationFormatted}</span>
            </div>
          </div>
        </div>

        {/* 5. KONFIGURASI JARINGAN TELEMATIKA */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            5. KONFIGURASI JARINGAN TELEMATIKA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">IP Address SMARTD DISPLAY</span>
              <span className="tabular-nums font-semibold text-slate-900">{record.ipAddress || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">IP CPE</span>
              <span className="tabular-nums font-semibold text-slate-900">{record.ipCpe || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">IP VHMS</span>
              <span className="tabular-nums font-semibold text-slate-900">{record.ipVhms || "—"}</span>
            </div>
          </div>
        </div>

        {/* 6. INFORMASI PERSONEL PELAKSANA */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            6. INFORMASI PERSONEL PELAKSANA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Group Leader (GL)</span>
              <span className="font-semibold text-slate-900">{record.groupLeaderName}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">Teknisi Pelaksana</span>
              <span className="font-semibold text-slate-900">{record.technicianName}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">NRP Teknisi</span>
              <span className="tabular-nums font-semibold text-slate-900">{record.technicianNrp || "—"}</span>
            </div>
          </div>
        </div>

        {/* 7. CATATAN / REMARKS */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            7. CATATAN / REMARKS
          </h2>
          <div className="text-sm">
            <span className="text-xs text-slate-500 block mb-1">Catatan Tambahan Pelaksanaan</span>
            <p className="text-slate-800 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-200 whitespace-pre-wrap break-words">
              {record.remarks || "Tidak ada catatan tambahan."}
            </p>
          </div>
        </div>
      </div>

      {/* 3. DOKUMENTASI FOTO (Struktur: 1. Judul di atas foto, 2. Gambar foto, 3. Deskripsi di bawah foto. Note: empty description remains empty) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Dokumentasi Foto Lapangan (5 Slot)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik gambar untuk melihat tampilan resolusi penuh (Lightbox)
            </p>
          </div>
          <span className="text-xs tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
            {record.photos.filter((photo) => Boolean(photo.url)).length} / {record.photos.length} Foto Terlampir
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {record.photos.map((photo, index) => {
            const hasPhoto = Boolean(photo.url);
            return (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group p-3.5 space-y-3"
              >
                {/* 1. Photo Title (Top of card, above image) */}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-xs text-slate-800 line-clamp-1">
                    {photo.slotLabel}
                  </h3>
                  <span className="shrink-0 bg-slate-200/80 text-slate-600 tabular-nums text-[10px] px-2 py-0.5 rounded font-bold">
                    SLOT {index + 1}
                  </span>
                </div>

                {/* 2. Photo Image (Below title) */}
                {hasPhoto ? (
                  <div
                    onClick={() =>
                      setZoomedPhoto({
                        url: photo.url,
                        title: photo.slotLabel,
                        caption: photo.caption || "",
                      })
                    }
                    className="h-44 bg-slate-900 cursor-pointer relative overflow-hidden rounded-lg flex items-center justify-center border border-slate-200"
                    title={`Klik untuk memperbesar ${photo.slotLabel}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.slotLabel}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 select-none"
                    />
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-semibold text-xs">
                      <ZoomIn className="h-4 w-4" />
                      <span>Perbesar Foto</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-44 bg-slate-100 rounded-lg border border-slate-200 flex flex-col items-center justify-center p-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center mb-1 text-slate-400">
                      <Camera className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Foto dokumentasi belum tersedia
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Belum diunggah
                    </span>
                  </div>
                )}

                {/* 3. Photo Description (Below image, keeping empty description completely empty without '-' placeholder) */}
                <div className="space-y-2 pt-1 flex-1 flex flex-col justify-between">
                  <div>
                    {photo.caption?.trim() ? (
                      <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-600">
                        {photo.caption}
                      </p>
                    ) : null}
                  </div>

                  {hasPhoto && (
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-blue-600 font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedPhoto({
                            url: photo.url,
                            title: photo.slotLabel,
                            caption: photo.caption || "",
                          })
                        }
                        className="flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <ZoomIn className="h-3 w-3" />
                        Klik untuk Zoom
                      </button>
                      <span className="text-slate-400 font-normal">HD Preview</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. BAGIAN NAVIGASI BAWAH: SESUAI DENGAN DESAIN DETAIL INSTALLATION */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">
          NAVIGASI TINDAK LANJUT &amp; PENELUSURAN (TRACEABILITY):
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Button 1: Back to List */}
          <Link
            href="/operations/replacement"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition shadow-2xs"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            <span>Back to List</span>
          </Link>

          {/* Button 2: View New Device Timeline */}
          <Link
            href={`/reports/timeline/${encodeURIComponent(record.newDeviceId)}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-2xs text-center"
            title={`Buka kronologi siklus hidup perangkat baru ${record.newDeviceId}`}
          >
            <Activity className="h-4 w-4" />
            <span className="truncate">View New Device Timeline ({record.newDeviceId})</span>
          </Link>

          {/* Button 3: View Old Device Timeline */}
          <Link
            href={`/reports/timeline/${encodeURIComponent(record.oldDeviceId)}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition shadow-2xs text-center"
            title={`Buka kronologi siklus hidup perangkat lama ${record.oldDeviceId}`}
          >
            <Activity className="h-4 w-4 text-slate-500" />
            <span className="truncate">View Old Device Timeline ({record.oldDeviceId})</span>
          </Link>

          {/* Button 4: Back to Dashboard */}
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition shadow-2xs"
          >
            <LayoutDashboard className="h-4 w-4 text-slate-500" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>

      {/* LIGHTBOX ZOOM MODAL (PORTAL TO DOCUMENT.BODY MENUTUPI SELURUH VIEWPORT TERMASUK SIDEBAR & TOPBAR) */}
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
                    <h3 className="font-semibold text-sm sm:text-base text-slate-100 truncate">
                      {zoomedPhoto.title}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Dokumentasi Formulir {record.id} • Unit Number {record.unitNo} ({record.equipmentType})
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomedPhoto.url}
                  alt={zoomedPhoto.title}
                  className="w-full h-full max-w-full max-h-full object-contain select-none transition-transform"
                />
              </div>

              {/* Caption Footer */}
              <div className="shrink-0 px-5 sm:px-6 py-3 sm:py-3.5 bg-slate-900/95 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-slate-300 leading-relaxed font-normal">
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
