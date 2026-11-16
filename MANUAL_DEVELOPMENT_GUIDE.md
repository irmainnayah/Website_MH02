# Panduan Pengembangan Mandiri (Manual Development Guide)

Panduan ini disusun sebagai rujukan teknis langkah-demi-langkah bagi pengembang perangkat lunak untuk melanjutkan, memodifikasi, dan merawat proyek **MH02 Asset Report Portal** secara manual tanpa ketergantungan pada asisten kecerdasan buatan (AI).

---

## 1. Menjalankan Proyek Secara Lokal

### Prasyarat Lingkungan:
- **Node.js**: Versi LTS yang disarankan (v18.x, v20.x, atau v22.x).
- **Package Manager**: `npm` (bawaan Node.js).

### Langkah Menjalankan Server Pengembangan:
Buka terminal (PowerShell / Command Prompt / Bash) pada direktori `Website MH02`, lalu jalankan:

```powershell
npm run dev
```

Buka peramban (browser) di alamat: [http://localhost:3000](http://localhost:3000).

---

## 2. Mengatasi Konflik Port 3000

Jika muncul pesan kesalahan bahwa port 3000 sedang digunakan oleh proses lain (`Port 3000 is in use, trying another one...`), Anda dapat memilih salah satu solusi berikut:

### Opsi A: Menjalankan di Port Lain Secara Otomatis atau Eksplisit
Next.js secara otomatis akan menawarkan port alternatif (seperti port 3001). Atau Anda dapat menentukannya secara langsung via perintah:
```powershell
npx next dev -p 3001
```

### Opsi B: Memeriksa dan Mematikan Proses yang Menyandera Port 3000 (Windows PowerShell)
Untuk menghentikan proses lama yang masih berjalan di latar belakang:
```powershell
# 1. Cari Process ID (PID) yang mendengarkan di port 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess

# 2. Hentikan proses tersebut berdasarkan PID yang ditemukan (misal PID 1234)
Stop-Process -Id <PID_ANGKA> -Force
```

---

## 3. Prosedur Backup & Keamanan Kode Sebelum Modifikasi

Sebelum melakukan perubahan besar atau eksperimen kode, lakukan langkah pencegahan kerusakan:

### A. Jika Menggunakan Git (Sangat Disarankan)
```powershell
# Periksa status perubahan
git status

# Simpan checkpoint pada branch baru atau commit cadangan
git checkout -b feature/nama-fitur-baru
# ATAU jika masih di branch yang sama:
git commit -am "WIP: checkpoint sebelum refactor"
```

### B. Jika Menggunakan Salinan Manual (Folder Backup)
Salin folder `src/` ke folder cadangan sementara:
```powershell
Copy-Item -Path "src" -Destination "src_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')" -Recurse
```
*(Catatan: Jangan menyalin folder `.next/` atau `node_modules/` karena ukurannya besar dan tidak diperlukan).*

---

## 4. Panduan Menambah & Memodifikasi Halaman Baru

Next.js menggunakan sistem **App Router** berbasis direktori di dalam `src/app/`.

### Langkah Menambah Halaman Baru:
1. Buat direktori baru di dalam `src/app/` sesuai hierarki rute yang diinginkan. Contoh rute `/operations/audit-schedule`:
   - Lokasi: `src/app/operations/audit-schedule/page.tsx`
2. Tulis komponen React halaman dengan deklarasi `"use client"` jika memerlukan interaktivitas:
   ```tsx
   "use client";

   import React from "react";

   export default function AuditSchedulePage() {
     return (
       <div className="space-y-6 max-w-7xl mx-auto">
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <h2 className="text-xl font-bold text-slate-800">Jadwal Audit Lapangan</h2>
           <p className="text-xs text-slate-500 mt-1">Daftar inspeksi berkala perangkat armada.</p>
         </div>
       </div>
     );
   }
   ```
3. Daftarkan menu baru tersebut ke sidebar pada berkas `src/data/navigation.ts`:
   ```typescript
   {
     name: "Jadwal Audit",
     href: "/operations/audit-schedule",
     iconName: "Calendar", // Pastikan ikon terdaftar di Sidebar.tsx iconMap
   }
   ```

---

## 5. Panduan Pembuatan Komponen Form dan Perhitungan Otomatis

Sesuai aturan `AGENTS.md` dan `DESIGN_BRIEF.md`, formulir operasional memiliki standar tertentu:

### Pola Kalkulasi Otomatis Durasi Pengerjaan:
Hitung durasi pengerjaan secara otomatis saat pengguna mengisi Waktu Mulai dan Waktu Selesai:
```tsx
import React, { useState } from "react";

export function TimeDurationCalculator() {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const calculateDuration = () => {
    if (!startTime || !endTime) return "-";
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    let diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return "Waktu selesai lebih awal dari mulai";
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours} Jam ${minutes} Menit`;
  };

  return (
    <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
      <div>
        <label className="text-xs font-semibold text-slate-700">Waktu Mulai</label>
        <input 
          type="time" 
          value={startTime} 
          onChange={(e) => setStartTime(e.target.value)} 
          className="mt-1 w-full text-xs p-2 rounded border border-slate-300"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-700">Waktu Selesai</label>
        <input 
          type="time" 
          value={endTime} 
          onChange={(e) => setEndTime(e.target.value)} 
          className="mt-1 w-full text-xs p-2 rounded border border-slate-300"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-700">Durasi Pengerjaan</label>
        <div className="mt-1 text-xs font-bold text-blue-600 bg-white p-2 rounded border border-slate-200">
          {calculateDuration()}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Panduan Pembuatan Tabel: Search, Filter, Pagination & Export CSV

Seluruh tabel operasional dan laporan diwajibkan memiliki 6 fitur standar:

1. **Penyimpanan State Filter**:
   ```tsx
   const [searchQuery, setSearchQuery] = useState("");
   const [statusFilter, setStatusFilter] = useState("ALL");
   const [currentPage, setCurrentPage] = useState(1);
   const [pageSize, setPageSize] = useState(10);
   ```
2. **Penyaringan Data (Faceted Filter)**:
   ```tsx
   const filteredData = rawData.filter((item) => {
     const matchQuery = item.unitCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase());
     const matchStatus = statusFilter === "ALL" || item.status === statusFilter;
     return matchQuery && matchStatus;
   });
   ```
3. **Pemisahan Halaman (Pagination)**:
   ```tsx
   const totalPages = Math.ceil(filteredData.length / pageSize);
   const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
   ```
4. **Fungsi Export CSV Tanpa Dependensi Tambahan**:
   ```tsx
   const exportToCSV = (data: any[], filename = "export-data.csv") => {
     if (data.length === 0) return;
     const headers = Object.keys(data[0]).join(",");
     const rows = data.map((row) => Object.values(row).map((val) => `"${val}"`).join(","));
     const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
     const encodedUri = encodeURI(csvContent);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", filename);
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
   };
   ```

---

## 7. Pengelolaan Data Tiruan (Mock Data)

Karena proyek ini adalah *Frontend-Only Prototype*:
1. Simpan kumpulan data master awal di `src/lib/mock-data/` atau `src/data/`.
2. Gunakan React State atau Context API untuk mengelola operasi tambah/ubah data (*in-memory*):
   ```tsx
   const [installations, setInstallations] = useState<InstallationRecord[]>(initialMockInstallations);
   
   const handleCreate = (newRecord: InstallationRecord) => {
     setInstallations((prev) => [newRecord, ...prev]);
   };
   ```
3. **Peringatan Penting**: Jangan mengintegrasikan panggilan API eksternal atau konfigurasi database sampai disetujui secara resmi.

---

## 8. Verifikasi Kualitas Kode & Production Build

Selalu uji kepatuhan tipe TypeScript dan proses bundling sebelum menyerahkan hasil kerja:

### A. Uji Type Checking TypeScript:
```powershell
npx tsc --noEmit
```
*Jika tidak ada pesan galat yang muncul, berarti seluruh definisi tipe valid.*

### B. Uji Kompilasi Production Build:
```powershell
npm run build
```
*Perintah ini memvalidasi linting ESLint, tree-shaking Next.js, dan membuktikan bahwa kode siap di-deploy.*

---

## 9. Prosedur Pemulihan Saat Terjadi Galat (*Troubleshooting & Recovery*)

Jika aplikasi mengalami error layar merah atau gagal kompilasi:

1. **Periksa Terminal**: Baca nama berkas dan nomor baris yang dilaporkan oleh Next.js/TypeScript.
2. **Bersihkan Cache Kompilasi**: Jika terdapat error cache bundler yang korup, hapus folder `.next`:
   ```powershell
   Remove-Item -Recurse -Force .next
   npm run dev
   ```
3. **Kembalikan Berkas dari Backup**:
   - Jika menggunakan Git:
     ```powershell
     git restore <nama_berkas_yang_error>
     ```
   - Jika menggunakan salinan manual, ganti berkas yang bermasalah dengan berkas dari folder backup yang dibuat pada Bagian 3.
