# Struktur Folder dan File Proyek MH02 Asset Report

Dokumen ini mendokumentasikan struktur berkas nyata pada repositori **MH02 Asset Report Portal** (Fleet Safety & Telematics Management) per **16 Oktober 2026**. Dokumen ini dibuat agar pengembang dapat memahami, merawat, dan mengembangkan aplikasi secara mandiri tanpa bergantung pada AI.

---

## 1. Pemisahan Berkas: Buatan Pengembang vs Berkas Generated

Untuk memudahkan navigasi dan pengelolaan version control (Git), berkas dalam workspace diklasifikasikan menjadi dua kelompok:

### A. Berkas & Direktori Hasil Otomatis (*Generated / Build Artifacts*)
DILARANG mengedit berkas-berkas ini secara manual karena selalu ditimpa oleh sistem/bundler:
- `.next/`: Direktori output kompilasi lokal Next.js (berisi bundle chunk, cache SSR/SSG).
- `node_modules/`: Direktori pustaka dependensi pihak ketiga yang diinstal oleh `npm`.
- `tsconfig.tsbuildinfo`: Cache build inkremental TypeScript.
- `package-lock.json`: Snapshot kunci hierarki dependensi npm (dikelola otomatis oleh `npm install`).
- `.impeccable/`: Direktori konfigurasi internal skill perancangan UI Impeccable.

### B. Berkas Konfigurasi & Sumber Buatan Pengembang (*Handcrafted / Source Files*)
Berkas-berkas yang dikelola dan diedit langsung oleh pengembang:
- Konfigurasi Root: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next.config.ts`.
- Dokumen Spesifikasi: `AGENTS.md`, `PRODUCT.md`, `DESIGN_BRIEF.md`, `DEVELOPMENT_LOG.md`, `README.md`.
- Seluruh kode sumber aplikasi di bawah direktori `src/`.

---

## 2. Peta Direktori Aktual Proyek

Berikut adalah representasi pohon berkas aktual di dalam workspace:

```text
Website MH02/
├── .agent/
│   └── skills/impeccable/           # Skill & pedoman asistensi desain frontend
├── .impeccable/
│   └── config.json                  # Konfigurasi workspace Impeccable
├── .next/                           # [GENERATED] Bundle & cache Next.js
├── node_modules/                    # [GENERATED] Modul pustaka dependensi npm
├── src/
│   ├── app/                         # Next.js App Router (Routing, Layout, Halaman)
│   │   ├── administration/
│   │   │   └── users/
│   │   │       └── page.tsx         # Halaman User Management (RBAC Superadmin)
│   │   ├── operations/
│   │   │   ├── installation/
│   │   │   │   └── page.tsx         # Halaman Operasional Instalasi Unit
│   │   │   ├── removal/
│   │   │   │   └── page.tsx         # Halaman Operasional Pencopotan Perangkat
│   │   │   └── replacement/
│   │   │       └── page.tsx         # Halaman Operasional Penggantian Perangkat
│   │   ├── reports/
│   │   │   ├── activity-log/
│   │   │   │   └── page.tsx         # Halaman Log Aktivitas Perangkat
│   │   │   ├── audit-logs/
│   │   │   │   └── page.tsx         # Halaman Riwayat Audit Sistem
│   │   │   └── timeline/
│   │   │       └── page.tsx         # Halaman Timeline Riwayat Siklus Perangkat
│   │   ├── support/
│   │   │   ├── preventive-maintenance/
│   │   │   │   └── page.tsx         # Halaman Preventive Maintenance (Status Mock)
│   │   │   └── troubleshoots/
│   │   │       └── page.tsx         # Halaman Operasional Penanganan Gangguan
│   │   ├── globals.css              # Variabel CSS tema, reset dasar & utilitas Tailwind
│   │   ├── layout.tsx               # Root Layout HTML (Pembungkus AppShell)
│   │   ├── not-found.tsx            # Penanganan rute 404 aplikasi
│   │   └── page.tsx                 # Dashboard utama aplikasi (rute "/")
│   ├── components/                  # Komponen antarmuka pengguna (UI)
│   │   └── layout/
│   │       ├── AppShell.tsx         # Kerangka layout utama pembungkus Auth, Sidebar & Topbar
│   │       ├── Sidebar.tsx          # Komponen navigasi samping (collapsible & role-aware)
│   │       └── Topbar.tsx           # Komponen bilah atas (breadcrumbs, site info, jam)
│   ├── data/
│   │   └── navigation.ts            # Definisi struktur daftar menu & hak akses navigasi
│   ├── features/
│   │   └── auth/
│   │       └── AuthContext.tsx      # Simulasi state autentikasi pengguna & role switcher
│   ├── lib/
│   │   └── utils.ts                 # Utilitas helper class merging Tailwind (cn function)
│   └── types/
│       └── navigation.ts            # Tipe TypeScript untuk profil pengguna & skema navigasi
├── AGENTS.md                        # Aturan operasional & batasan teknis AI/Engineer
├── CHANGELOG.md                     # Catatan riwayat versi & perubahan sistem
├── DESIGN_BRIEF.md                  # Panduan desain UI, warna, dan standar form/tabel
├── DEVELOPMENT_LOG.md               # Kronologi keputusan dan perkembangan proyek
├── MANUAL_DEVELOPMENT_GUIDE.md      # Panduan teknis pengembangan mandiri untuk developer
├── next.config.ts                   # Konfigurasi runtime Next.js
├── next-env.d.ts                    # Deklarasi tipe lingkungan Next.js
├── package.json                     # Konfigurasi dependensi dan skrip proyek
├── package-lock.json                # Kunci versi dependensi
├── postcss.config.mjs               # Konfigurasi plugin PostCSS
├── PRODUCT.md                       # Dokumen spesifikasi fungsional produk MH02
├── PROJECT_ARCHITECTURE.md          # Penjelasan arsitektur perangkat lunak dan aliran data
├── PROJECT_STRUCTURE.md             # Dokumen ini (struktur direktori & panduan lokasi file)
├── README.md                        # Ringkasan umum proyek
├── tailwind.config.ts               # Konfigurasi desain token Tailwind CSS
├── tsconfig.json                    # Konfigurasi compiler TypeScript
└── tsconfig.tsbuildinfo             # [GENERATED] Cache build TypeScript
```

---

## 3. Matriks Lokasi Berkas Berdasarkan Kebutuhan Modifikasi

Gunakan panduan tabel berikut saat ingin mengubah tampilan atau fungsionalitas tertentu:

| Kebutuhan Modifikasi | Berkas yang Wajib Diedit | Lokasi Terkait Tambahan |
| :--- | :--- | :--- |
| **Mengubah Sidebar** (tampilan/animasi/toggle) | `src/components/layout/Sidebar.tsx` | `src/features/auth/AuthContext.tsx` (state collapse) |
| **Menambah/Mengubah Menu Navigasi** | `src/data/navigation.ts` | `src/types/navigation.ts` (jika menambah field skema) |
| **Mengubah Topbar** (header, site, tanggal) | `src/components/layout/Topbar.tsx` | `src/features/auth/AuthContext.tsx` (data site/user) |
| **Mengubah Dashboard Utama** | `src/app/page.tsx` | Nanti: `src/components/dashboard/` (widget/grafik) |
| **Mengubah Modul Installation** | `src/app/operations/installation/page.tsx` | Nanti: `src/features/installation/` atau form komponen |
| **Mengubah Modul Replacement** | `src/app/operations/replacement/page.tsx` | Nanti: komponen form pertukaran serial number |
| **Mengubah Modul Removal** | `src/app/operations/removal/page.tsx` | Nanti: form pelepasan perangkat & status aset |
| **Mengubah Modul Troubleshoots** | `src/app/support/troubleshoots/page.tsx` | Nanti: form klasifikasi kendala & durasi kerja |
| **Mengubah Modul Preventive Maintenance** | `src/app/support/preventive-maintenance/page.tsx` | Tetap beri label transparan "Pending/Mock 19/19" |
| **Mengubah User Management (RBAC)** | `src/app/administration/users/page.tsx` | `src/features/auth/AuthContext.tsx` |
| **Mengubah Halaman Laporan** | `src/app/reports/activity-log/page.tsx`<br>`src/app/reports/timeline/page.tsx`<br>`src/app/reports/audit-logs/page.tsx` | Nanti: `src/components/ui/Table.tsx` |
| **Mengubah Profil User Simulasi / Switcher** | `src/features/auth/AuthContext.tsx` | `src/components/layout/Sidebar.tsx` (UI toggle switcher) |
| **Mengubah Tema Warna / Gaya Global** | `src/app/globals.css` | `tailwind.config.ts` |

---

## 4. Konvensi dan Aturan Penempatan Berkas

Saat melanjutkan pembuatan fitur secara manual, patuhi aturan struktur folder berikut:

1. **Komponen Antarmuka Umum (`src/components/ui/`)**:
   - Letakkan elemen UI reusable di sini (contoh: `Button.tsx`, `Modal.tsx`, `Table.tsx`, `Badge.tsx`, `Input.tsx`, `Select.tsx`).
   - Komponen UI harus *dumb/stateless* sejauh mungkin, hanya menerima `props`.

2. **Komponen Spesifik Fitur (`src/components/dashboard/` atau `src/features/<feature-name>/`)**:
   - Komponen visualisasi metrik atau form spesifik alur operasional (misal form instalasi multi-step) diletakkan di dalam folder fiturnya masing-masing agar rapi dan tidak mengotori komponen generik.

3. **Definisi Tipe Data (`src/types/`)**:
   - Buat file `.ts` sesuai domain (misal: `device.ts`, `installation.ts`, `user.ts`, `report.ts`).
   - **Aturan Ketat**: Dilarang menggunakan tipe `any` pada domain entitas utama. Definisikan `interface` atau `type union` yang eksplisit.

4. **Data Simulasi Lokal / Mock Data (`src/data/` atau `src/lib/mock-data/`)**:
   - Simpan data tiruan lokal (seperti daftar armada Dump Truck, daftar teknisi, riwayat tiket kendala) di direktori ini.
   - Karena aplikasi berstatus *Frontend-Only Prototype*, seluruh mutasi data dilakukan pada state lokal (React Context / in-memory state).
