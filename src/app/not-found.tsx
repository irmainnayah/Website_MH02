"use client";

import React from "react";
import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center px-6">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
        <span className="text-4xl font-bold text-slate-300">404</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Halaman Tidak Ditemukan</h2>
        <p className="text-sm text-slate-500 max-w-md">
          Halaman yang Anda cari belum tersedia atau sedang dalam pengembangan.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Home className="h-4 w-4" />
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
