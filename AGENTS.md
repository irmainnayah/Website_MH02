# AGENTS.md: Rules & Operating Guidelines for MH02 Asset Report

## 1. Context & Scope
Proyek ini adalah **MH02 Asset Report Portal** (Fleet Safety & Telematics Management), berfokus pada pembangunan antarmuka pengguna (UI/UX) fidelitas tinggi menggunakan **Next.js (App Router), TypeScript, dan Tailwind CSS**.

## 2. Strict Engineering Principles & Constraints
1. **Frontend dan Backend**:
   - Frontend dapat menggunakan data mock selama integrasi belum selesai.
   - Backend .NET ditempatkan di `backend-dotnet/` dan dapat terhubung ke database development yang telah dikonfirmasi pengguna.
   - DILARANG mengintegrasikan database produksi, SSO perusahaan, atau API eksternal yang belum dikonfirmasi. Kredensial tidak boleh disimpan dalam file yang dilacak Git.
2. **Pemisahan Fakta vs Asumsi**:
   - DILARANG mengarang alur bisnis, aturan persetujuan (approval) berjenjang, atau kewenangan role tambahan yang tidak ada di dokumen acuan (`Catatan Project MH02.md` dan `ALUR WEB MH02.md`).
   - Group Leader (GL) dicatat hanya sebagai dropdown pelaksana/penanggung jawab, BUKAN sebagai entitas approval fiktif.
   - Status perangkat mengacu pada klarifikasi Pak Tama (15 Okt 2026): `In Stock` mencakup kondisi (RFU, Rusak, Butuh repair ke HO). Jangan mengunci rumus KPI total aset sebelum formula resminya dipastikan.
3. **Status Preventive Maintenance & Health Check 19/19**:
   - Jangan pernah mengarang 19 item inspeksi sebagai checklist resmi.
   - Modul PM harus selalu diberi label transparan bahwa data/layout masih berstatus mock/placeholder menunggu spesifikasi resmi.
4. **Demo Role Switcher**:
   - Fitur pergantian role di header/sidebar berstatus `[DEMO ONLY]` semata-mata untuk memudahkan evaluasi hak akses menu Superadmin vs User. Jangan diperlakukan sebagai fitur produksi.
5. **Non-Destructive Workflow**:
   - Jangan pernah menimpa, menghapus, atau memodifikasi file kebutuhan induk di folder atas (`../ALUR WEB MH02.md`, `../Catatan Project MH02.md`).
   - Jangan memodifikasi `PRODUCT.md` tanpa persetujuan eksplisit dari pengguna.

## 3. Code Standards & Architecture
- **Directory Structure**:
  - `src/app/`: Menggunakan App Router terorganisasi (`(auth)`, `(dashboard)`).
  - `src/components/ui/`: Komponen antarmuka atomik berbasis Tailwind CSS (Button, Card, Input, Modal, Table, Badge).
  - `src/components/dashboard/`: Komponen spesifik visualisasi metrik dan grafik.
  - `src/types/`: Definisi antarmuka TypeScript lengkap tanpa penggunaan `any` pada domain entitas utama.
  - `src/lib/mock-data/`: Kumpulan data tiruan terstruktur berbasis armada nyata (Dump Truck, Loader, dll.) dan multi-distrik.
- **Table Standards**:
  - Semua tabel wajib mengimplementasikan: Search, Faceted Filter per kolom, Clear Filter, Show Rows selector, Pagination, dan Export to CSV (Date Range).
- **Form Standards**:
  - Kalkulasi durasi pengerjaan harus berjalan otomatis (Waktu Mulai vs Selesai).
  - Slot upload foto multi-angle harus mendukung thumbnail preview dan zoom lightbox modal.
