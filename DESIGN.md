# DESIGN.md — MH02 Asset Report Portal Design System

<!-- impeccable:design-schema 1 -->

## 1. Visual Identity & Brand POV

The **MH02 Asset Report Portal** is a mission-critical fleet telematics and asset lifecycle management system designed for heavy mining equipment operations (Dump Trucks, Water Trucks, Loaders, Fuel Trucks) across multiple remote districts (Sangatta, Bengalon, Wahau, Sangatta Utara).

- **Mode:** `Operate`
- **Core Aesthetic:** Industrial-grade clarity, high-contrast scanability, utilitarian precision, zero visual fluff.
- **Tone:** Professional, reliable, structured, data-dense without clutter.
- **Design Metaphor:** Modern industrial control room dashboard; tactical slate backgrounds with clean functional accent boundaries.

---

## 2. Typography & Font Configuration

### Font Family
- **Primary Interface Font:** `'IBM Plex Sans', system-ui, -apple-system, sans-serif`
  - Loaded via `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');` in `src/app/globals.css`.
- **Monospace Font (Data & Identifiers):** Native monospace stack (`font-mono`)
  - Used for Device IDs (`D001`), Serial Numbers (`SN001`), Form Numbers (`INS-...`, `REP-...`), IP Addresses (`192.168.1.1`), and technical timestamps.

### Typographic Scale & Hierarchy
| Hierarchy Level | Tailwind Classes | Usage Context |
|---|---|---|
| **Page Title (H1)** | `text-xl font-bold text-slate-800` | Header halaman modul (`Installation`, `Replacement`, dll.) |
| **Section Header (H2)** | `text-sm font-bold uppercase tracking-wide text-slate-800` | Judul bagian form (`1. Informasi Dokumen`, `2. Informasi Perangkat`) |
| **Card Header / Widget Title** | `text-sm font-semibold text-slate-800` | Judul kartu statistik, modal title |
| **Table Column Headers (TH)** | `text-xs font-semibold tracking-wide text-slate-700` | Header tabel data |
| **Field Labels** | `text-xs font-semibold text-slate-700` | Label input form |
| **Body & Table Cells** | `text-xs text-slate-700 font-medium` | Teks isi data tabel, deskripsi paragraf |
| **Pill / Sub-badge / Metadata** | `text-[11px] font-bold uppercase tracking-wider` | Tag kategori modul (`Operation • Lifecycle`, `Site: ...`) |
| **Field Helper / Micro-copy** | `text-[10px] text-slate-400` | Keterangan petunjuk di bawah input form |
| **Metric Value (KPI Display)** | `text-2xl font-bold` / `text-3xl font-bold` | Angka metrik ringkasan kartu KPI |

---

## 3. Color Palette & Functional Design Tokens

### Core Neutral Scale (Slate Dominance)
- **App Canvas Background:** `bg-slate-50` / `bg-[#f4f6f9]` (`--background`)
- **Card / Surface Background:** `bg-white` (`--surface`)
- **Border Default:** `border-slate-200` (`#e2e8f0`)
- **Border Subtle / Dividers:** `border-slate-100` (`#f1f5f9`)
- **Text Primary (Headings, Key Data):** `text-slate-800` / `text-slate-900` (`#0f172a`)
- **Text Secondary (Subtitles, Table Labels):** `text-slate-600` / `text-slate-500` (`#64748b`)
- **Text Muted (Placeholders, Micro-copy):** `text-slate-400` (`#94a3b8`)

### Sidebar & Elevated Shell Palette
- **Sidebar Background:** `bg-slate-900` (`#0f172a`)
- **Sidebar Header/Footer Accent:** `bg-slate-950/40`
- **Sidebar Active Item:** `bg-blue-600 text-white`
- **Sidebar Hover Item:** `hover:bg-slate-800 text-slate-300`

### Semantic & Lifecycle Status Colors
| Functional Purpose | Base Background | Border | Text | Example Usage |
|---|---|---|---|---|
| **Primary / Operational Accent** | `bg-blue-50` | `border-blue-200` | `text-blue-600` / `text-blue-700` | Installation module, buttons, active highlights |
| **Success / Active (`in_use`)** | `bg-emerald-50` | `border-emerald-200` | `text-emerald-700` | Status "In Use", pesan sukses, indikator selesai |
| **Stock Ready / RFU (`in_stock_rfu`)** | `bg-violet-50` | `border-violet-200` | `text-violet-700` | Status "In Stock – RFU", modul Replacement, durasi kerja |
| **Warning / Field Repair (`in_stock_damaged`)** | `bg-amber-50` | `border-amber-200` | `text-amber-700` | Status "In Stock – Repair", indikator tertunda |
| **Destructive / Error / HO Repair (`in_stock_ho`)** | `bg-rose-50` | `border-rose-200` | `text-rose-700` | Status "HO Repair", modul Removal, validasi error, Reset Filter |
| **Support / Troubleshoot Accent** | `bg-orange-50` | `border-orange-200` | `text-orange-600` | Modul Troubleshoots, form header, tag masalah |

---

## 4. Spacing, Grid & Layout Conventions

### App Shell Architecture (`AppShell.tsx`)
```
+-------------------------------------------------------------------+
| Sidebar (w-64 expanded / w-20 collapsed, bg-slate-900)             |
|  + Topbar (h-16, bg-white, border-b border-slate-200, shadow-sm)   |
|  + Main Content Area (overflow-y-auto, p-6 lg:p-8, bg-slate-50/50)|
+-------------------------------------------------------------------+
```
- **Page Container Max-Width:**
  - Standard Table / List Views: `max-w-7xl mx-auto space-y-6 pb-12`
  - Transactional Forms: `max-w-5xl mx-auto space-y-6 pb-16`
- **Card Spacing:** `p-6` for main sections, `p-4` for metrics/summary cards.
- **Form Grid Columns:**
  - Standard 2-column: `grid grid-cols-1 md:grid-cols-2 gap-4`
  - High-density 3-column: `grid grid-cols-1 md:grid-cols-3 gap-4`
  - Personel & Waktu 4-column: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`

---

## 5. Component Patterns

### A. Page Header Card
Semua halaman utama modul menggunakan pola kartu header terpadu:
```tsx
<div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
  <div>
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
        Module Category
      </span>
      <span className="text-[11px] font-medium text-slate-500">Site: {district}</span>
    </div>
    <h1 className="text-xl font-bold text-slate-800 mt-2 flex items-center gap-2.5">
      <ModuleIcon className="h-6 w-6 text-module-accent" />
      Module Title
    </h1>
    <p className="text-xs text-slate-500 mt-1">Deskripsi tujuan operasional modul.</p>
  </div>
  <div>{/* Action Button: e.g. New Record Link */}</div>
</div>
```

### B. Summary Metric Cards
Grid metrik 4-kolom menampilkan metrik kunci modul:
```tsx
<div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
  <div>
    <p className="text-xs font-medium text-slate-500">Label Metrik</p>
    <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">{subtext}</p>
  </div>
  <div className="h-11 w-11 rounded-xl bg-accent-50 border border-accent-100 flex items-center justify-center text-accent-600">
    <Icon className="h-5 w-5" />
  </div>
</div>
```

### C. Table & Toolbar Standard (Batch 1 & Batch 4 Pattern)
Tabel terbungkus dalam `bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden`:
- **Baris 1 Toolbar:**
  - Input Pencarian (`Search` icon, clear button `X`, `max-w-md`).
  - Dropdown Faceted Filter (`Distrik`, `Tipe Alat`, `Status`, dll.).
- **Baris 2 Toolbar (Date Range & Actions):**
  - Rentang Tanggal (`Dari: [date]`, `Sampai: [date]`).
  - Tombol `Clear Tanggal` (kondisional jika tanggal terisi).
  - Tombol `Reset Filter` konsisten: `inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50` dengan icon `RotateCcw`.
  - Tombol `Ekspor CSV` di ujung kanan: `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm`.
- **Struktur Tabel:**
  - Header: `bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold tracking-wide text-xs`.
  - Rows: `hover:bg-slate-50/75 transition-colors divide-y divide-slate-200 text-xs`.
- **Pagination Footer:** Selector `Show Rows (10/25/50)`, informasi `Showing X to Y of Z records`, tombol navigasi `Prev / Next`.

### D. Form Components & Input Styles
- **Input Text / Select:** `w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`
- **Read-Only / Locked Field:** `bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed font-bold` (disertai icon `Lock`).
- **Date & Time Combined:** `type="datetime-local"` dengan class seragam.
- **Searchable Dropdown:** Input combobox kustom dengan pencarian substring instan, keyboard navigation (Arrow Up/Down/Enter), dan empty state `"Tidak ada hasil"`.
- **Validation Error Highlight:** `border-rose-300 bg-rose-50/50 text-rose-600`.
- **Error Summary Banner:** Terletak di atas form dengan atribut `data-error-summary="true"`, border `border-rose-200 bg-rose-50 text-rose-800`.
- **Automatic Duration Pill:** `bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1 rounded-lg text-xs font-bold`.
- **Multi-angle Photo Slots:** Slot kartu upload foto rasio 4:3 dengan thumbnail preview, hover overlay zoom lightbox, tombol hapus, dan input caption opsional.

---

## 6. Module Distinct Accents

| Modul | Icon Khas | Warna Aksen | Identitas Badge | File Rujukan |
|---|---|---|---|---|
| **Dashboard** | `LayoutDashboard` | Blue (`#2563eb`) | System Overview | `src/app/page.tsx` |
| **Installation** | `Wrench` | Blue (`#2563eb`) | `Operation • Lifecycle` | `src/app/operations/installation` |
| **Replacement** | `RefreshCw` | Violet (`#7c3aed`) | `Operation • Replacement` | `src/app/operations/replacement` |
| **Removal** | `Trash2` | Rose (`#e11d48`) | `Operation • Dismantle` | `src/app/operations/removal` |
| **Troubleshoots** | `AlertTriangle` / `FileText` | Orange (`#ea580c`) | `Support • Maintenance` | `src/app/support/troubleshoots` |
| **Activity Log** | `Activity` | Violet (`#7c3aed`) | `Reports • Traceability` | `src/app/reports/activity-log` |
| **Audit Logs** | `FileText` | Slate / Indigo | `Administration • Security` | `src/app/reports/audit-logs` |
| **User Management**| `Users` | Blue (`#2563eb`) | `Administration • Security` | `src/app/administration/users` |

---

## 7. Audit Inkonsistensi Desain Antarmodul

Berikut adalah temuan inkonsistensi visual/struktural yang tercatat pada codebase saat ini untuk pertimbangan perapian di tahap *Final UI Polish*:

1. **Variasi Border Radius Kartu:**
   - Mayoritas modul (Installation, Replacement, Removal, Users) menggunakan `rounded-xl` (12px).
   - Sebagian kartu di `Timeline` (`src/app/reports/timeline/page.tsx`) dan `DashboardHeader` menggunakan `rounded-2xl` (16px).
2. **Padding Halaman Form Create/Edit:**
   - Form Installation dan Removal menggunakan container `p-6` per section box.
   - Form Troubleshoots menggunakan `p-6` tetapi dengan styling grid gap yang sedikit lebih padat (`gap-4 md:grid-cols-2 lg:grid-cols-4`).
3. **Empty State Tabel Styling:**
   - Installation & Replacement menampilkan ikon modul dalam box `w-12 h-12 rounded-xl bg-slate-100` dengan tombol action sekunder `"Reset Filter"` berwarna biru (`bg-blue-600`).
   - Removal menggunakan icon `Trash2`, Troubleshoots menggunakan `AlertTriangle`.
4. **Variasi Warna Focus Ring Input:**
   - Installation menggunakan `focus:ring-blue-500`.
   - Replacement menggunakan `focus:ring-violet-500`.
   - Removal menggunakan `focus:ring-blue-500`.
   - Activity Log menggunakan `focus:ring-violet-500`.
   *Catatan:* Ini merupakan pembedaan fungsional berdasarkan tema warna modul, namun tetap perlu dipastikan kontrasnya konsisten.
5. **Format Timestamp Detail Page:**
   - Seluruh halaman detail telah diseragamkan di Batch 3 untuk menampilkan `formatDateTimeRange` dan `formatDuration`.

