# MH02 Fleet Safety & Telematics Asset Report Portal

Portal manajemen siklus hidup, monitoring aset, dan pelaporan teknis perangkat telematika keselamatan armada **MH02** di unit-unit tambang operasional multi-distrik.

---

## 1. Ikhtisar Proyek

Aplikasi ini dikembangkan untuk mendigitalisasi pelaporan lapangan, riwayat pemeliharaan, serta monitoring kondisi perangkat MH02 pada alat berat tambang (Dump Truck, Water Truck, Fuel Truck, Loader, dll.).

### Pengguna Sistem:
- **Super Admin**: Memonitor seluruh status perangkat secara agregat lintas distrik, mengelola data pengguna (User Management / RBAC), serta meninjau log audit.
- **User / Teknisi Lapangan**: Mengisi formulir operasional di lapangan (Installation, Replacement, Removal, Troubleshoots), mengunggah foto dokumentasi pekerjaan, dan melihat riwayat timeline perangkat.
- **Group Leader (GL)**: Nama penanggung jawab lapangan yang dicantumkan dalam formulir operasional.

---

## 2. Fitur & Modul Utama

1. **Alur Autentikasi 2-Langkah**:
   - `/login`: Form kredensial pengguna.
   - `/select-profile`: Tampilan konfirmasi profil pengguna (Nama, NRP, Distrik, Role) sebelum memasuki dashboard.
2. **Dashboard Operasional**:
   - 6 Kartu KPI: Total Device Terpasang (Agregat), Unit Terpasang per Site, Device in HO Repair, Maintained Bulan Ini, Not Maintained Bulan Ini, Device In-Stock.
   - 4 Grafik Visual: Donut Chart Status Instalasi, Distribusi Kesehatan Perangkat (19/19), Bar Chart Aktivitas Bulanan, dan Bar Chart Tipe Armada.
   - Quick Action & Ringkasan Aktivitas Bulanan.
   - Tabel Master Device List dengan pencarian dan filter mendalam per kolom.
3. **Administration (Khusus Superadmin)**:
   - User Management (RBAC) untuk mengelola data user, distrik, dan role.
4. **Modul Operasional (Operation)**:
   - **Installation**: Pencatatan pemasangan baru, kalkulasi durasi pengerjaan otomatis, dan 4 slot foto dokumentasi.
   - **Replacement**: Pencatatan penggantian unit lama ke unit baru dengan perbandingan riwayat perangkat.
   - **Removal**: Pencatatan pelepasan unit dengan alasan terstruktur dan dokumentasi fisik.
5. **Modul Dukungan (Support)**:
   - **Troubleshoots**: Pencatatan perbaikan komponen (8 tipe equipment) beserta foto sebelum & sesudah pengerjaan.
   - **Preventive Maintenance**: Layout berstatus placeholder (menunggu konfirmasi rincian 19 item Health Check resmi).
6. **Modul Laporan & Riwayat (Reports)**:
   - **Device Timeline**: Kronologi siklus hidup tunggal per perangkat (statistik aktivitas & visual event history).
   - **Device Activity Log**: Rekap seluruh aktivitas lintas distrik dengan filter komprehensif.
   - **Audit Logs**: Rekaman mutasi data sistem dengan deep-link interaktif ke halaman terkait.

---

## 3. Standar Antarmuka

- **Universal Table Features**: Setiap tabel dilengkapi Search Bar, Faceted Filter per kolom, Clear Filter, pemilih baris (Show Rows 10/25/50/100), Pagination, dan Export to CSV berbasis Date Range.
- **Form Pengerjaan**: Perhitungan durasi otomatis (Waktu Mulai vs Selesai) dan slot upload foto terstruktur dengan pratinjau thumbnail serta modal zoom foto.

---

## 4. Status Implementasi & Catatan Prototipe

- **Stack**: Next.js (App Router), TypeScript, Tailwind CSS.
- **Lingkungan**: Prototipe frontend murni menggunakan mock data lokal interaktif (tanpa integrasi database/backend riil sebelum arsitektur inti diverifikasi).
- **Demo Tool**: Terdapat switch role `[DEMO ONLY]` pada sidebar untuk menguji perbedaan tampilan antara Super Admin dan User biasa.

