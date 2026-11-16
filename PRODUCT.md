# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS. Mengikuti pola arsitektur modular dari OMP RFID Dashboard. Tahap awal difokuskan 100% pada antarmuka pengguna (UI/UX) berfidelitas tinggi dengan mock data komprehensif tanpa backend riil, database riil, autentikasi eksternal, atau integrasi SSO perusahaan sebelum arsitektur inti diverifikasi.

## Users & Roles (Sesuai Catatan Dokumen)

1. **Super Admin**: Memiliki akses ke seluruh menu dashboard operasional, log audit, serta menu khusus **Administration > User Management (RBAC)** untuk mengelola akun pengguna (NRP, Nama, Distrik, Role).
2. **User / Teknisi**: Mengisi formulir operasional di lapangan (Installation, Replacement, Removal, Troubleshoots), mengunggah bukti foto dokumentasi pengerjaan, dan melihat riwayat aktivitas perangkat.
3. **Group Leader (GL)**: Nama penanggung jawab lapangan yang dicantumkan sebagai opsi dropdown pada formulir operasional.

> [!NOTE]
> *Status Prototipe*: Disediakan kontrol internal `[DEMO ONLY: Switch Active Role]` di area navigasi untuk mempermudah evaluasi perbedaan tampilan antara Super Admin dan User biasa.
> *Catatan Hak Akses GL*: Kewenangan hak akses mandiri atau alur persetujuan/approval berjenjang untuk GL belum ada di dokumen sumber dan dicatat sebagai hal yang memerlukan konfirmasi.

## Product Purpose

Portal monitoring, administrasi siklus hidup (lifecycle), dan pelaporan teknis perangkat telematika keselamatan armada **MH02** pada alat berat tambang (Dump Truck, Water Truck, Fuel Truck, Loader, dll.) di multi-distrik. Memastikan setiap unit memiliki rekam jejak instalasi yang valid, status verifikasi kesehatan perangkat, pemeliharaan berkala, serta pelacakan historis kronologis yang transparan.

## Status Perangkat (Klarifikasi Pak Tama - 15 Okt 2026)

- **In Stock**: Kategori untuk seluruh perangkat yang belum terpasang ke unit armada, mencakup 3 kondisi fisik:
  1. *RFU (Ready for Use)*: Siap dipasang.
  2. *Rusak*: Mengalami kerusakan di site.
  3. *Butuh repair dan dikirim ke HO*: Memerlukan perbaikan ke Head Office.
- **Device in HO Repair**: Keterangan/status informasi perangkat yang sedang dalam perbaikan di Head Office.

> [!IMPORTANT]
> *Batasan Formula & Hubungan Data*:
> - Rumus matematis agregasi total aset belum ditetapkan untuk menghindari *double counting*.
> - Hubungan struktural apakah `HO Repair` berada di dalam kelompok `In Stock` atau terpisah belum dikonfirmasi.
> - Sumber pencatatan status rusak dan alur masuk/keluar `HO Repair` dicatat sebagai pertanyaan terbuka.

## Information Architecture & Navigation

- **Alur Autentikasi 2-Langkah**:
  - Langkah 1: `/login` (Form Username & Password).
  - Langkah 2: `/select-profile` (Tampilan read-only identitas: Nama, NRP, Distrik, Role dengan tombol Continue to Dashboard dan Cancel).
- **Struktur Menu Sidebar**:
  - Header: Info Login Pengguna (Nama, NRP, Distrik) + Tombol Logout.
  - **Dashboard**: Ringkasan 6 KPI, 4 Visual Charts, Monthly Activities Summary, Quick Actions, Master Device List.
  - **Administration** *(Khusus Superadmin)*: User Management (RBAC).
  - **Operation**:
    - Installation (Records, New Form, Detail View + Photo Modal Viewer).
    - Replacement (Records, New Form, Detail View + Old/New Timeline Links).
    - Removal (Records, New Form, Detail Popup Modal).
  - **Support**:
    - Troubleshoots (Records, New Form, History Breakdown per Kategori).
    - Preventive Maintenance *(Status: Mock Layout - Menunggu Konfirmasi 19 Checklist)*.
  - **Reports**:
    - Device Activity Log (View All Activities lintas site).
    - Device Timeline (Riwayat kronologis tunggal per perangkat).
    - Audit Logs (Catatan mutasi sistem dengan deep-link interaktif).

## Standar Tabel & Formulir

- **Standar Seluruh Tabel**: Search bar umum, filter independen per kolom (faceted filter), tombol *Clear Filter*, pemilih baris (*Show Rows* 10/25/50/100), pagination, dan tombol *Export to CSV* berbasis rentang tanggal (*Date Range*).
- **Standar Formulir**: Nomor form auto-generate, kalkulasi durasi pengerjaan otomatis (Waktu Mulai vs Selesai), dropdown tervalidasi, slot upload foto terstruktur dengan pratinjau thumbnail dan modal zoom gambar resolusi penuh.

## Batasan & Status Kebutuhan yang Belum Lengkap

- Data bersifat mock lokal di client-side untuk interaksi prototipe.
- Modul *Preventive Maintenance* dan checklist *Health Check 19/19* diberi label transparan bahwa spesifikasi resmi 19 item masih menunggu konfirmasi data teknis.
