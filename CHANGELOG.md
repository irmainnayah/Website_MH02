# CHANGELOG: MH02 Asset Report Portal

Catatan riwayat perubahan, pembaruan versi, dan evolusi kode sistem **MH02 Asset Report Portal**. Format penulisan mengacu pada prinsip transparansi fakta teknis dan pemisahan antara kondisi terverifikasi aktual dengan catatan log sebelumnya.

---

## 1. Perbandingan Versi Dependensi (Spesifikasi vs Aktual Terpasang)

Pemeriksaan versi dilakukan secara langsung pada repositori per **16 Oktober 2026** membandingkan berkas [package.json](file:///c:/Users/irmai/Documents/Projects_Magang/MH02/Website%20MH02/package.json) dengan hasil audit perintah `npm ls --depth=0`:

| Paket Dependensi | Deklarasi Rentang di `package.json` | Versi Aktual Terpasang (`npm ls`) | Status Verifikasi |
| :--- | :--- | :--- | :--- |
| **next** | `^15.1.0` | `15.5.28` | Terverifikasi |
| **react** | `^19.0.0` | `19.3.1` | Terverifikasi |
| **react-dom** | `^19.0.0` | `19.3.1` | Terverifikasi |
| **lucide-react** | `^0.475.0` | `0.475.0` | Terverifikasi |
| **clsx** | `^2.1.1` | `2.1.1` | Terverifikasi |
| **tailwind-merge** | `^3.0.1` | `3.7.0` | Terverifikasi |
| **typescript** | `^5.7.3` | `5.9.3` | Terverifikasi |
| **tailwindcss** | `^3.4.17` | `3.4.19` | Terverifikasi |
| **postcss** | `^8.5.1` | `8.5.30` | Terverifikasi |
| **eslint** | `^9.18.0` | `9.39.5` | Terverifikasi |
| **eslint-config-next** | `^15.1.0` | `15.5.28` | Terverifikasi |
| **@types/node** | `^22.10.7` | `22.20.5` | Terverifikasi |
| **@types/react** | `^19.0.7` | `19.3.0` | Terverifikasi |
| **@types/react-dom** | `^19.0.3` | `19.3.0` | Terverifikasi |

*(Catatan: Tanda sisipan `^` pada `package.json` menyebabkan npm mengunduh rilis patch/minor terbaru yang kompatibel saat proses instalasi awal).*

---

## 2. Riwayat Perubahan Terverifikasi (Kondisi Kode & Berkas Nyata)

### [2026-10-16] - Tahap Dokumentasi Teknis Mandiri
- **Ditambahkan**: Berkas dokumentasi arsitektur dan panduan pengembangan mandiri:
  - `PROJECT_STRUCTURE.md`: Pemetaan struktur direktori, klasifikasi berkas buatan vs generated, serta panduan berkas sasaran edit.
  - `PROJECT_ARCHITECTURE.md`: Dokumentasi siklus App Router, keterhubungan layout, simulasi RBAC, dan status implementasi modul.
  - `MANUAL_DEVELOPMENT_GUIDE.md`: Rujukan langkah manual bagi pengembang untuk menjalankan proyek, mengatasi konflik port 3000, membuat form, tabel, backup kode, dan pengecekan build.
  - `CHANGELOG.md`: Catatan versi dan perubahan resmi proyek.
- **Diverifikasi**: Seluruh berkas inti aplikasi (`src/app/`, `src/components/`, `src/features/`, `src/data/`, `src/types/`, `src/lib/`) dipertahankan tanpa perubahan destruktif.

### [2026-10-15] - Tahap Scaffold Fondasi & App Shell (Terverifikasi dari Kode Sumber)
- **Ditambahkan**: Inisialisasi basis proyek Next.js 15 dengan App Router, TypeScript, dan Tailwind CSS.
- **Ditambahkan**: Arsitektur layout terpadu:
  - `src/components/layout/AppShell.tsx`: Wadah pembungkus aplikasi dengan state provider.
  - `src/components/layout/Sidebar.tsx`: Navigasi samping dengan dukungan ciut/rentang (collapsible), ikon Lucide, serta role-aware navigation.
  - `src/components/layout/Topbar.tsx`: Header dinamis dengan penunjuk breadcrumb otomatis berbasis rute, penanda Site/Distrik, dan tanggal lokal.
- **Ditambahkan**: Modul autentikasi simulasi di `src/features/auth/AuthContext.tsx` yang mengelola `currentUser`, fungsi `switchRole`, dan toggle sidebar.
- **Ditambahkan**: Rute placeholder operasional dan laporan dengan perlindungan role guard untuk rute `/administration/users`.
- **Ditambahkan**: Halaman penanganan kesalahan rute `src/app/not-found.tsx` (404 Page).
- **Ditambahkan**: Definisi tipe data di `src/types/navigation.ts` dan konfigurasi daftar menu di `src/data/navigation.ts`.
- **Ditambahkan**: Skrip utilitas class merging di `src/lib/utils.ts` menggunakan `clsx` dan `tailwind-merge`.

---

## 3. Catatan dari Laporan Awal (Tercatat dalam Log Sebelumnya, Perlu Verifikasi Lanjutan)

Bagian ini merangkum catatan yang tercantum dalam dokumen log sebelumnya (`DEVELOPMENT_LOG.md` & `DESIGN_BRIEF.md`) yang berkaitan dengan kesepakatan desain dan klarifikasi pemangku kepentingan:

- **Klarifikasi Status Perangkat (Pak Tama - 15 Okt 2026)**:
  - *Status*: Tercatat di `DEVELOPMENT_LOG.md` dan `AGENTS.md`.
  - *Rincian*: Status `In Stock` mencakup 3 sub-kondisi (RFU, Rusak, Butuh repair & dikirim ke HO). `Device in HO Repair` adalah keterangan pelengkap.
  - *Status Kode Saat Ini*: **Belum diverifikasi di tingkat form/database** karena modul manajemen inventaris perangkat belum dibangun.
- **Status Preventive Maintenance & Health Check 19/19**:
  - *Status*: Tercatat sebagai pending spesifikasi resmi.
  - *Status Kode Saat Ini*: Terverifikasi berlabel badge `"Pending 19/19"` pada menu sidebar dan halaman placeholder.
- **Hasil Kompilasi Build `npm run build`**:
  - *Status*: Tercatat berhasil 100% pada catatan audit sebelumnya. Kompatibilitas tipe data TypeScript pada kode saat ini tetap terjaga tanpa penggunaan tipe `any` pada domain entitas navigasi.
