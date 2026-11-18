# Backend .NET MH02

Status: migrasi belum selesai. Backend Next.js di `src/server` dan `src/app/api` tetap tersedia. Sebagian frontend menggunakan API .NET, sementara halaman lainnya masih menggunakan data mock.

Backend .NET saat ini menyediakan `/health`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/reference`, `GET /api/fleet-units`, `GET /api/devices`, `GET /api/devices/{id}`, `GET /api/dashboard/status-distribution`, `GET|POST /api/users`, dan `GET|PUT|DELETE /api/users/{id}`. Endpoint sesi membaca cookie `mh02_session` dan memeriksa sesi, status pengguna, role, dan site di PostgreSQL. Installation, replacement, dan removal tersedia sesuai kontrak di bawah; transaksi lain, perubahan master perangkat, laporan, serta bagian dashboard lainnya belum dimigrasikan.

Endpoint installation tersedia di `GET /api/installations`, `GET /api/installations/{id}`, `POST /api/installations`, `PATCH /api/installations/{id}`, dan `DELETE /api/installations/{id}`. Daftar mendukung `page`, `pageSize`, `siteId`, `dateFrom`, `dateTo`, `deviceCode`, dan `unitNo`. POST menerima JSON atau multipart: field `payload` berisi JSON, `photo:<slot>` berisi file, dan `caption:<slot>` opsional. Foto JPEG/PNG/WebP diperiksa dari byte, maksimal 10 MiB per file, pada slot `mh02_installed`, `camera_dashboard_angle`, `nodered_config`, dan `gps_antenna`. POST memerlukan header `Idempotency-Key` (16-64 huruf, angka, `_` atau `-`); responsnya berisi `activityId` dan `formNumber`. Jika hasil commit tidak diketahui, retry dengan kunci dan isi yang sama. Foto diambil melalui `GET /api/photos/{id}` setelah pemeriksaan sesi dan site.

Foto disimpan di `PHOTO_STORAGE_ROOT` atau `.storage` pada root proyek, di luar `public/`; path tersebut harus persisten dan dibackup bersama database. File ditulis sebelum commit dan dibersihkan bila kegagalan sebelum commit diketahui; hasil commit yang tidak pasti mempertahankan file. DELETE khusus Superadmin mencoba memindahkan foto ke `_quarantine` setelah commit. Rekonsiliasi file yatim, pemulihan karantina, dan pembersihan berkala belum tersedia; kegagalan pemindahan hanya dicatat pada log. PATCH khusus Superadmin hanya mendukung metadata dengan `rowVersion`; perubahan perangkat, unit, waktu, atau foto belum didukung. Formulir baru dan detail kini memakai API, sedangkan edit belum terhubung. Endpoint dan penyimpanan foto belum diuji end-to-end dan belum siap digunakan untuk data nyata.

## Removal

Daftar, detail, tambah dan edit `/operations/removal` membaca API .NET, tanpa fallback mock. Proxy Next hanya tersedia pada development.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/removals?page=1&pageSize=100&siteId=...` | Daftar sesuai scope Site; maksimal 1000 per halaman |
| GET | `/api/removals/{formNumber}` | Detail dengan unit asal, foto dan `rowVersion` |
| POST | `/api/removals` | Insert removal dan pelepasan device secara atomik |
| PATCH | `/api/removals/{formNumber}` | Update, khusus Superadmin, wajib `rowVersion` terakhir |
| DELETE | `/api/removals/{formNumber}` | Hapus dan pulihkan snapshot device, khusus Superadmin |

`formNumber` adalah nomor seperti `REM-202611-001`; nomor dibuat dari sequence database saat insert dan tetap sama saat edit. Teknisi berasal dari sesi, Site/device/unit mengikuti master atau snapshot transaksi. Site dan device tidak dapat diganti saat edit. PATCH mendukung alasan, detail alasan, shift, GL, remarks, waktu pengerjaan, kondisi akhir dan foto. Update waktu/kondisi akhir memerlukan current state yang masih cocok dengan after-snapshot dan tidak boleh mendahului aktivitas perangkat yang lebih baru menurut urutan (`started_at`, `created_at`), sesuai desain bagian 6. Waktu selesai aktivitas sebelumnya bukan penentu urutan ini. Konflik `LATER_ACTIVITY_EXISTS` menyebut nomor form penghalang dan waktu mulainya dalam zona Site. Metadata/foto tetap dapat diedit tanpa mengubah status perangkat bila waktu dan kondisi akhir tidak berubah. Versi lama ditolak dengan `STALE_VERSION`.

POST/PATCH memakai multipart: `payload` JSON, `photo:before_device` dan `photo:component_set`, serta `caption:<slot>` opsional. Foto wajib pada kedua slot, format JPEG/PNG/WebP diperiksa dari byte, maksimal 5 MiB per file dan 11 MiB per request. Payload berisi `siteId`, `deviceCode`, `startedAt`, `finishedAt` (waktu lokal Site `yyyy-MM-ddTHH:mm`), `finalCondition`, `reason`, `reasonDetail`, `shift`, `groupLeader`, dan `remarks` opsional. PATCH menambahkan `rowVersion`, `keepPhotoSlots` untuk foto yang dipertahankan, dan `photoCaptions` object untuk caption foto tersebut. File baru hanya dikirim untuk slot yang diganti. Kedua foto tetap wajib setelah edit. URL detail foto memakai proxy `/api/dotnet/photos/{photoId}`; backend langsung menyediakan `/api/photos/{photoId}`.

POST memerlukan `Idempotency-Key` 16-64 huruf/angka/underscore/hyphen. Retry dengan key dan isi yang sama bila hasil belum pasti. Device wajib In Use pada unit aktif di Site yang sama, lalu menjadi `in_stock_rfu`, `in_stock_damaged`, atau `in_stock_ho`. Unit dikosongkan; lokasi fisik tetap, termasuk saat kondisi dipilih HO. Durasi dihitung dari waktu lokal Site yang dikonversi ke UTC; waktu selesai di masa depan ditolak. INSERT/UPDATE/DELETE memakai transaksi database dengan snapshot dan audit. DELETE menolak device yang berubah/diarsipkan, memiliki aktivitas lanjutan, atau unit asal yang sudah ditempati; jika valid, status/unit/lokasi/tanggal maintenance dipulihkan dan event penghapusan disimpan. Foto yang diganti/dihapus dikarantina setelah commit, dengan keterbatasan pemulihan crash yang sama seperti installation.

### Dropdown Removal

Tinjau dan jalankan sendiri `database/postgresql/008_removal_development_seed.sql` hanya pada PostgreSQL development `db_asset_report`, setelah schema/reference awal dan akun Superadmin aktif tersedia. Script belum dijalankan oleh Copilot. Script menambahkan Site `DEV-REMOVAL`, unit `DEV-REM-DT-001`, device `DEV-REM-MH02-001` dengan initial state In Use, shift, serta GL `Development Removal GL`, termasuk audit/event registrasi. Tidak membuat laporan removal atau personel fiktif. Script aman diulang selama fixture belum berubah; jika sudah dipakai, konflik membatalkan operasi tanpa mereset state.

Uji fixture dengan sesi Superadmin. Akun User hanya melihat device/GL dari Site penugasannya; untuk akun tersebut, master harus tersedia pada Site yang benar. Tipe alat dan EGI mengikuti unit, kondisi akhir dibaca dari `device_statuses`, GL/shift dari `lookup_values`, dan teknisi otomatis dari akun login. Alasan `Kerusakan`, `Upgrade`, `Dismantle` mengikuti opsi form yang sudah ada, bukan tabel referensi baru atau aturan persetujuan tambahan.

### Verifikasi Removal

`tests/integration/removal-dotnet.mjs` memeriksa penolakan tanpa sesi secara default. Alur tulis hanya aktif dengan `REMOVAL_TEST_WRITE=development-fixture` dan sesi Superadmin pada environment `MH02_TEST_SESSION`; jangan simpan/bagikan token tersebut. `DOTNET_TEST_URL` default ke loopback port 5000. Test mencakup foto wajib, idempotensi/replay, update waktu/status/caption/file, stale version, waktu masa depan, delete dan rollback state. Audit/event append-only, sequence, idempotency key dan karantina tetap tersimpan setelah test.

Build dan skrip integrasi belum dijalankan. Uji browser dengan API tiruan memverifikasi pemuatan form, pilihan device, unit/tipe/EGI otomatis, GL dan placeholder nomor form; mock sudah dibersihkan. Request nyata tanpa cookie ke lima route removal mendapat 404 dengan `X-Request-Id` backend: proses .NET yang aktif belum memuat endpoint baru dan harus dimulai ulang. Belum ada transaksi database nyata yang dibuat/diverifikasi oleh Copilot; diagnostik editor bukan pengganti build dan test integrasi.

## Replacement

Halaman daftar, detail, tambah, dan edit replacement memakai API .NET melalui proxy development Next.js, tanpa fallback mock.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/replacements?page=1&pageSize=100&siteId=...` | Daftar sesuai scope Site; `pageSize` maksimal 1000 |
| GET | `/api/replacements/{formNumber}` | Detail, snapshot dua perangkat, foto dan `rowVersion` |
| POST | `/api/replacements` | Insert replacement beserta perubahan kedua perangkat |
| PATCH | `/api/replacements/{formNumber}` | Edit metadata, caption, atau penggantian foto, khusus Superadmin |
| DELETE | `/api/replacements/{formNumber}` | Hapus dan pulihkan snapshot kedua perangkat, khusus Superadmin |

`formNumber` adalah nomor seperti `REP-202611-001`, bukan UUID. Nomor dibuat oleh sequence database saat insert. GET foto menggunakan `/api/photos/{photoId}`; frontend memakai `/api/dotnet/photos/{photoId}` agar tidak mengarah ke endpoint SQL Server lama.

POST menggunakan `Idempotency-Key` 16-64 karakter; retry dengan key dan isi sama bila hasil belum pasti. Multipart memiliki field `payload` JSON, `photo:<slot>` file, serta `caption:<slot>` opsional. Empat slot wajib adalah `mh02_new_installed`, `mh02_old_removed`, `nodered_config`, dan `gps_antenna`. Batas file 10 MiB, total request 41 MiB, format JPEG/PNG/WebP diperiksa dari byte. Payload insert memuat `siteId`, `startedAt`, `finishedAt` (waktu lokal Site dalam format `yyyy-MM-ddTHH:mm`), `oldDeviceCode`, `newDeviceCode`, `oldFinalStatus`, `shift`, `groupLeader`, `sourcePower`, `spmVersion`, `ipAddress`, `ipCpe`, `ipVhms`, dan `remarks` opsional. Teknisi dicatat dari sesi database, bukan identitas yang dikirim client.

Perangkat lama wajib `in_use`, perangkat baru wajib `in_stock_rfu`, keduanya aktif/tidak diarsipkan dan berasal dari Site yang sama. Unit mengikuti perangkat lama dan harus aktif. Status akhir perangkat lama hanya `in_stock_rfu`, `in_stock_damaged`, atau `in_stock_ho`; lokasinya tidak diubah otomatis menjadi HO. Waktu selesai tidak boleh di masa depan. Insert sebelum riwayat perangkat yang lebih baru ditolak. Seluruh perubahan database, audit, snapshot dan idempotensi dilakukan dalam satu transaksi.

PATCH memakai `rowVersion` hasil GET terakhir dan field metadata lengkap: `shift`, `groupLeader`, `remarks`, `sourcePower`, `spmVersion`, `ipAddress`, `ipCpe`, `ipVhms`. Sertakan `keepPhotoSlots` untuk foto lama yang dipertahankan dan `photoCaptions` object untuk caption foto tersebut. Penggantian foto dikirim sebagai multipart seperti insert. Empat slot wajib harus tetap tersedia. Kamera opsional historis dipertahankan. **Edit Site, waktu, pasangan perangkat, unit, teknisi, dan kondisi akhir belum didukung**; form mengunci field tersebut dan API menolak perubahan field riwayat yang dikenalnya. Versi lama ditolak dengan `STALE_VERSION`.

DELETE menolak perangkat yang berubah/diarsipkan atau memiliki transaksi lanjutan. Status, unit, lokasi, dan tanggal maintenance dipulihkan dari snapshot; audit serta event penghapusan disimpan. Foto yang dilepas/dihapus dipindahkan ke `_quarantine` sesudah commit. Batas rekonsiliasi file dan pemulihan setelah crash sama dengan installation di atas.

### Data Dropdown Development

Query tersedia di `database/postgresql/006_replacement_development_seed.sql`. Tinjau dan jalankan sendiri hanya pada PostgreSQL development `db_asset_report`, setelah schema/reference awal dan akun Superadmin aktif tersedia. Script **belum dijalankan** oleh Copilot. Script menambahkan Site `DEV-REPLACEMENT`, unit `DEV-REP-DT-001`, perangkat lama `DEV-REP-OLD-001` (In Use), perangkat baru `DEV-REP-NEW-001` (RFU), shift/source power, serta GL dan SPM berlabel development. Tidak membuat laporan replacement, pengguna, approval, atau data personel nyata.

Script dapat diulang saat fixture belum berubah; jika perangkat sudah digunakan oleh transaksi, script membatalkan operasi tanpa meresetnya. Untuk akun User, hanya Site yang ditugaskan di database yang terlihat; fixture terisolasi dapat diuji dengan sesi Superadmin. Untuk data sebenarnya, gunakan Site/perangkat/lookups yang disetujui. Teknisi otomatis memakai akun login, sehingga tidak ada query insert teknisi fiktif.

### Verifikasi

`tests/integration/replacement-dotnet.mjs` memeriksa penolakan tanpa login secara default. Alur tulis hanya aktif dengan `REPLACEMENT_TEST_WRITE=development-fixture` dan token sesi Superadmin pada environment `MH02_TEST_SESSION`; jangan simpan token dalam file Git atau membagikannya. `DOTNET_TEST_URL` default ke loopback port 5000. Alur fixture mencakup insert, replay idempotensi, baca foto, edit metadata/caption, stale version, penolakan perubahan riwayat, delete, dan rollback kedua device. Test tetap meninggalkan audit/event append-only, idempotency key, sequence, dan file karantina sesuai rancangan.

Build dan test integrasi belum dijalankan. Percobaan browser saat implementasi mendapat connection refused pada frontend port 3000 dan backend port 5000. Pemeriksaan diagnostik editor tidak menggantikan build .NET/Next.js atau pengujian dengan database nyata. Mulai ulang backend dan frontend sebelum menguji endpoint baru; jangan gunakan untuk produksi sebelum verifikasi selesai.

Swagger UI tersedia di `http://localhost:5000/swagger` saat backend berjalan dalam environment Development. Gunakan endpoint login untuk membuat cookie sesi sebelum mencoba endpoint yang memerlukan autentikasi. Daftar query filter pada beberapa endpoint belum ditampilkan sebagai field Swagger karena masih dibaca langsung dari HTTP request.

Login TOTP menggunakan username berprefix `L` untuk NRP yang diawali `JI`, atau `p` untuk NRP lainnya. Backend menghapus prefix saat mencari NRP di PostgreSQL. Pengguna yang belum mendaftarkan Authenticator langsung menerima QR dan harus mengonfirmasi kode pertama; pengguna yang sudah terdaftar memasukkan kode 6 digit tanpa password atau kode aktivasi. Sesi penuh hanya dibuat setelah kode berhasil diverifikasi. Role dan site tetap berasal dari PostgreSQL.

Pendaftaran pertama tanpa verifikasi identitas memungkinkan siapa pun yang mengetahui NRP mengambil alih akun yang belum terdaftar. Jangan gunakan alur ini untuk deployment: proxy frontend hanya aktif pada development, tetapi endpoint backend langsung belum dibatasi berdasarkan environment. Tinjau `database/postgresql/003_auth_totp.sql` jika belum diterapkan; tabel aktivasi dari migrasi 004 yang sudah ada tidak digunakan dan tidak dihapus. Alur belum diuji dengan database dan Authenticator nyata. Secret TOTP dilindungi ASP.NET Core Data Protection: kunci harus disimpan secara persisten dan terlindungi. Mekanisme reset Authenticator belum tersedia.

Proxy Next.js `/api/dotnet/...` hanya tersedia dalam mode development untuk endpoint di atas. Alamat backend default adalah `http://localhost:5000`; `MH02_DOTNET_API_URL` dapat mengubahnya ke alamat HTTP loopback lain. Halaman login, user management, dan grafik status perangkat menggunakan proxy ini. Halaman dan komponen lainnya masih menggunakan data mock dan role demo jika tidak ada sesi. User management memerlukan sesi Superadmin; DELETE menonaktifkan akun dan mencabut sesi, bukan menghapus riwayat akun.

Konfigurasi `ConnectionStrings:PostgreSQLConnection` dapat disediakan melalui .NET user secrets, environment variable, atau `appsettings.Local.json` yang diabaikan Git. Jangan memasukkan kredensial ke `appsettings.json` atau file lain yang dilacak Git. Aturan proyek melarang integrasi database produksi.

DDL PostgreSQL tersedia di `database/postgresql/001_initial_schema.sql`, dengan data referensi terpisah di `002_reference_data.sql`. Keduanya adalah draft untuk database development kosong, belum dieksekusi atau diuji. PostgreSQL 13 atau lebih baru diperlukan untuk `gen_random_uuid()` tanpa extension tambahan. DDL tidak memigrasikan data SQL Server atau membuat akun login aplikasi.

Database development sebelumnya berhasil dibaca melalui profil editor dan skema awal sudah tersedia. Alur Authenticator belum diuji end-to-end; jangan gunakan di produksi atau menonaktifkan backend lama sampai pengujian autentikasi, transaksi, hak akses, audit, serta foto selesai.