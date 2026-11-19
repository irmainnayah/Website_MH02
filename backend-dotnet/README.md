# Backend .NET MH02

Status: migrasi belum selesai. Backend Next.js di `src/server` dan `src/app/api` tetap tersedia. Sebagian frontend menggunakan API .NET, sementara halaman lainnya masih menggunakan data mock.

Backend .NET saat ini menyediakan `/health`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/reference`, `GET /api/fleet-units`, `GET /api/devices`, `GET /api/devices/{id}`, `GET /api/dashboard/status-distribution`, `GET|POST /api/users`, dan `GET|PUT|DELETE /api/users/{id}`. Endpoint sesi membaca cookie `mh02_session` dan memeriksa sesi, status pengguna, role, dan site di PostgreSQL. Installation, replacement, removal, dan troubleshoot tersedia sesuai kontrak di bawah; perubahan master perangkat, laporan lain, serta bagian dashboard lainnya belum dimigrasikan.

Endpoint installation tersedia di `GET /api/installations`, `GET /api/installations/{id}`, `POST /api/installations`, `PATCH /api/installations/{id}`, dan `DELETE /api/installations/{id}`. Daftar mendukung `page`, `pageSize`, `siteId`, `dateFrom`, `dateTo`, `deviceCode`, dan `unitNo`. POST menerima JSON atau multipart: field `payload` berisi JSON, `photo:<slot>` berisi file, dan `caption:<slot>` opsional. Foto JPEG/PNG/WebP diperiksa dari byte, maksimal 10 MiB per file, pada slot `mh02_installed`, `camera_dashboard_angle`, `nodered_config`, dan `gps_antenna`. POST memerlukan header `Idempotency-Key` (16-64 huruf, angka, `_` atau `-`); responsnya berisi `activityId` dan `formNumber`. Jika hasil commit tidak diketahui, retry dengan kunci dan isi yang sama. Foto diambil melalui `GET /api/photos/{id}` setelah pemeriksaan sesi dan site.

Foto disimpan di `PHOTO_STORAGE_ROOT` atau `.storage` pada root proyek, di luar `public/`; path tersebut harus persisten dan dibackup bersama database. File ditulis sebelum commit dan dibersihkan bila kegagalan sebelum commit diketahui; hasil commit yang tidak pasti mempertahankan file. DELETE khusus Superadmin mencoba memindahkan foto ke `_quarantine` setelah commit. Rekonsiliasi file yatim, pemulihan karantina, dan pembersihan berkala belum tersedia; kegagalan pemindahan hanya dicatat pada log. PATCH khusus Superadmin hanya mendukung metadata dengan `rowVersion`; perubahan perangkat, unit, waktu, atau foto belum didukung. Formulir baru dan detail kini memakai API, sedangkan edit belum terhubung. Endpoint dan penyimpanan foto belum diuji end-to-end dan belum siap digunakan untuk data nyata.

## Dashboard

Halaman utama `/` memakai provider data bersama untuk angka inventaris, grafik status/lokasi/tipe alat, tren enam bulan, ringkasan bulan berjalan, tabel inventaris dan modal perangkat. Komponen dashboard yang aktif tidak lagi memakai mock. Dua komponen prototipe yang tidak dipasang pada halaman utama (`HealthDistributionChart` dan `StockDistributionChart`) tetap di luar integrasi ini; tidak ada checklist PM/health check 19 item baru.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/dashboard?siteId=...` | Angka inventaris dan distribusi serta aktivitas bulanan |
| GET | `/api/dashboard/devices?page=1&pageSize=100&siteId=...` | Inventaris nonarsip dengan tanggal aktivitas terakhir |
| GET | `/api/dashboard/status-distribution?siteId=...` | Endpoint status lama, tetap tersedia untuk kompatibilitas |

Ketiganya memeriksa cookie sesi dan Site database. Superadmin dapat memilih semua Site atau satu Site; User otomatis dibatasi Site penugasannya. Site yang tidak ada ditolak oleh API baru, bukan dianggap ringkasan nol. Pagination inventaris menerima ukuran 1-1000; frontend membaca seluruh halaman untuk filter dan CSV. Respons tidak di-cache dan query dalam satu respons baru memakai transaksi repeatable-read agar agregat konsisten satu sama lain. Ringkasan dan inventaris adalah request terpisah, bukan satu snapshot lintas request saat ada perubahan bersamaan. Data dimuat saat halaman/filter Site berubah atau tombol muat ulang ditekan; tidak ada klaim sinkronisasi push realtime.

`kpis.registeredDevices` adalah jumlah record perangkat nonarsip dalam scope dan dilabeli Perangkat Tercatat, bukan formula total aset resmi. `totalInstalled` menghitung In Use; `hoRepair` menghitung kondisi In Stock HO; `inStock` mencakup RFU + rusak + butuh repair ke HO. `officialAssetTotal` sengaja null karena formula total aset resmi belum dikonfirmasi. Tidak ada rumus tambahan yang menggabungkan angka-angka saling beririsan sebagai total aset.

Distribusi lokasi memakai `devices.current_location_site_id`, bukan Site kepemilikan sebagai proksi. Lokasi null menjadi Belum tercatat dan tidak dipindahkan otomatis ke HO karena kondisi repair. Scope tetap berdasarkan Site pemilik perangkat. Distribusi tipe alat menghitung perangkat In Use menurut unit yang sedang terhubung, bukan semua fleet unit atau perangkat stok tanpa unit. Perangkat arsip dikecualikan dari jumlah/status/lokasi/alat dan inventaris.

Tren/ringkasan dihitung dari header `activities` yang masih ada, satu transaksi satu hitungan; replacement tidak dihitung dua kali berdasarkan jumlah device. Audit dan lifecycle event bukan sumber hitungan operasional. Transaksi yang dihapus tidak lagi dihitung, sementara jejak penghapusannya tetap di timeline. Bulan aktivitas dihitung memakai `started_at` ditambah snapshot `start_utc_offset_minutes`, bukan UTC mentah atau jam browser. Enam bulan selalu dikembalikan, termasuk bulan tanpa aktivitas dengan nilai nol. Acuan bulan berjalan adalah zona Site untuk scope tunggal dan UTC untuk semua Site, dinyatakan melalui `periodTimeZone`; pengelompokan transaksi tetap menurut bulan lokal tersimpan (`activityGrouping=stored_start_local_month`). Zona Site yang diubah tidak menggeser bulan historis transaksi.

Inventaris menyediakan identitas sebenarnya, status, unit, tipe alat, EGI, Site pemilik, lokasi fisik (nullable), health-check master yang tercatat, dan `lastActivityDate`. Tanggal terakhir adalah tanggal lokal waktu mulai aktivitas terbaru menurut (`started_at`, `created_at`, UUID), bukan tanggal registrasi, event audit, atau fallback mock; bila belum ada transaksi nilainya null. Tabel mempertahankan search, faceted filter kolom, clear, show rows, pagination dan CSV rentang tanggal aktivitas terakhir, dengan escaping CSV. Modal menampilkan identitas/EGI/lokasi serta sepuluh entri timeline terbaru dan tautan ke timeline penuh; tidak mengarang status completed atau hasil inspeksi. Nilai kosong dan kegagalan API berbeda: kegagalan menampilkan error/retry dan menyembunyikan angka lama, sedangkan database kosong menampilkan nol serta state kosong yang sesuai.

### Verifikasi Dashboard

`tests/integration/dashboard-dotnet.mjs` memeriksa autentikasi secara default. Pemeriksaan dengan sesi hanya aktif dengan `DASHBOARD_TEST_READ=development` dan `MH02_TEST_SESSION`; jangan simpan/bagikan token. `DOTNET_TEST_URL` default ke loopback port 5000. Test read-only membandingkan agregat dengan inventaris, total per status/lokasi/alat, kategori lokasi tidak tercatat, scope Site, enam bulan/current month, jumlah transaksi pada Activity Log dan endpoint status lama. Jalankan pada development yang tenang karena data dapat berubah antar request. Contract test memeriksa scope, nonarsip, snapshot lokal bulan, tidak ada mutasi dan tidak ada mock pada widget aktif.

Build serta test unit/integrasi belum dijalankan. Percobaan tanpa cookie menunjukkan API ringkasan/inventaris baru masih 404 dengan `X-Request-Id` backend, sementara endpoint status lama 401: proses .NET aktif perlu dimulai ulang untuk memuat route baru. Uji browser memakai API tiruan memverifikasi render grafik/inventaris, angka record 3/installed 1/HO 1/stock 2, kategori lokasi kosong, riwayat/EGI modal, perubahan Site ke scope record 1/stock 1, empty state alat/aktivitas, serta error API tanpa angka/inventaris lama. Mock browser sudah dibersihkan. Tidak ada data PostgreSQL nyata yang ditulis atau diverifikasi dan tidak ada perintah terminal yang dijalankan oleh Copilot. Diagnostik editor bukan pengganti build/test integrasi.

## Audit Logs

`/reports/audit-logs` membaca `audit_log` PostgreSQL melalui API .NET, bukan mock sesi. **Audit adalah append-only sesuai desain bagian 3.15 dan trigger database.** INSERT audit tetap dilakukan otomatis dalam transaksi database yang sama dengan perubahan data asal. Tidak ada endpoint untuk membuat bukti audit manual, mengeditnya, menghapusnya, atau menghapus seluruh riwayat; pembatasan ini berlaku juga bagi Superadmin.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/audit-logs` | Daftar metadata audit sesuai Site scope |
| GET | `/api/audit-logs/{auditId}` | Detail metadata serta nilai sebelum/sesudah yang disaring |
| POST/PUT/PATCH/DELETE | `/api/audit-logs` atau `/api/audit-logs/{auditId}` | Ditolak 405 `AUDIT_APPEND_ONLY` untuk sesi yang sah dan entri yang terlihat |

Penolakan write tetap memeriksa sesi, origin dan scope. Tanpa sesi mendapat 401; entri detail yang tidak ada atau di luar Site mendapat 404; tidak ada body request yang ditulis ke database. Header `Allow: GET` menjelaskan metode yang tersedia. Koreksi data dilakukan melalui modul asal dan menghasilkan audit baru, bukan mengubah audit lama. Proteksi database dan pencatatan audit pada transaksi asal tidak diubah.

GET list mendukung `page`, `pageSize` (1-1000), `siteId`, `table` (`installation`, `replacement`, `removal`, `troubleshoot`, `device`, `user_management`), `operation` (`INSERT`, `UPDATE`, `DELETE`), `action`, `changeGroupId`, `dateFrom`, `dateTo` (`yyyy-MM-dd` dalam UTC), serta `q` (maksimal 120 karakter). Pencarian backend mencakup record, pelaksana, action, request ID, reason dan IP. User hanya melihat `audit_log.site_id` milik Site-nya; Superadmin dapat melihat semua atau meminta Site tertentu. Audit global dengan Site null tidak terlihat pada User biasa. Urutan stabil memakai `occurred_at DESC, audit_id DESC`.

Audit ID BIGINT dikirim sebagai string agar tidak kehilangan presisi JavaScript. Respons memuat timestamp UTC, record/entity, pelaksana yang tercatat, Site, operation/action, IP, request ID dan change group. Nilai null ditampilkan sebagai tidak tersedia/global yang tidak tercatat; nama pelaksana dan IP tidak dikarang. List tidak memuat payload before/after; keduanya hanya diambil oleh GET detail. Field dengan nama yang mengandung password/pass/hash/secret/token/credential/connectionstring/activationcode/totp/apikey dihapus secara rekursif dari object dan array sebelum dikirim. Ini pertahanan pada pembacaan, bukan pengganti larangan menyimpan rahasia saat penulisan audit.

Tautan data asal dicari dengan immutable `entity_id`, bukan `record_id` yang dapat berubah. Transaksi yang masih ada menuju detail Activity Log; device yang masih terlihat menuju timeline kode perangkat saat ini. Tidak ada tautan ke transaksi yang sudah dihapus atau arsip device yang tidak terlihat oleh User. Halaman menyediakan search, filter per kolom, clear filter, show rows, pagination, refresh, dan CSV rentang tanggal UTC. Semua halaman metadata dibaca agar ekspor tidak terpotong pada 1000 baris. Detail readonly menampilkan before/after, reason, request ID dan change group. Tidak diperlukan seed audit palsu; jalankan perubahan data yang sah pada modul asal untuk menghasilkan audit.

### Verifikasi Audit Logs

`tests/integration/audit-logs-dotnet.mjs` memeriksa autentikasi GET dan metode write yang ditolak secara default. Pemeriksaan dengan sesi hanya aktif dengan `AUDIT_LOG_TEST_READ=development` dan `MH02_TEST_SESSION`; jangan simpan/bagikan token. `DOTNET_TEST_URL` default ke loopback port 5000. Test menggunakan audit yang sudah ada, tanpa membuat fixture audit: list/detail, Site scope, UTC/filter tanggal, change group, redaction rekursif, 405 pada penulisan manual dan baris audit tidak berubah. Detail test dilewati bila belum ada entri yang terlihat. Contract test memeriksa larangan SQL mutasi audit, perlindungan trigger, scope, redaction, ID string dan join entity.

Build dan test unit/integrasi belum dijalankan. Percobaan HTTP tanpa cookie lewat proxy mendapat 404 dengan `X-Request-Id` backend untuk kelima route/metode yang diperiksa: proses .NET aktif belum memuat endpoint baru dan perlu dimulai ulang. Uji browser dengan API tiruan memverifikasi render tabel, tautan device, detail readonly, before/after, request ID, UTC, dan Audit ID `9007199254740993` tanpa kehilangan presisi; tidak ada tombol mutasi audit. Mock browser sudah dibersihkan. Tidak ada query insert atau perintah terminal yang dijalankan oleh Copilot. Diagnostik editor bukan pengganti build/test integrasi.

## Device Timeline

Directory `/reports/timeline` dan detail `/reports/timeline/{deviceCode}` (contoh `/reports/timeline/D001`) membaca PostgreSQL melalui API .NET, tanpa fallback mock. `deviceCode` adalah kode nyata `devices.device_code`, bukan UUID dan bukan ID dummy; kode yang tidak ada/tidak terlihat menghasilkan 404. Header menampilkan master saat ini, sedangkan setiap transaksi memakai unit/status historis dari snapshot. Unit historis tidak dipakai sebagai fallback unit aktif di header.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/timeline` | Directory perangkat aktif dalam scope Site pengguna |
| GET | `/api/timeline/{deviceCode}` | Master perangkat dan gabungan kronologi aktivitas/event |
| POST | `/api/timeline/{deviceCode}?activityType=...` | Tambah transaksi yang melibatkan device tersebut |
| POST | `/api/timeline?deviceCode=D001&activityType=...` | Varian insert dari directory |
| PATCH | `/api/timeline/{deviceCode}/activities/{activityId}` | Update transaksi asal; khusus Superadmin |
| DELETE | `/api/timeline/{deviceCode}/activities/{activityId}` | Delete transaksi asal dengan guard/rollback; khusus Superadmin |
| PATCH/DELETE | `/api/timeline/{deviceCode}/events/{eventId}` | Ditolak 405 `HISTORY_IMMUTABLE` setelah pemeriksaan sesi dan visibilitas device |

Directory mendukung `page`, `pageSize` (1-1000), `siteId`, `q` (kode, serial, unit), `status`, dan `archived=true` khusus Superadmin. Secara default perangkat arsip tidak tampil. Detail memakai kode case-sensitive sesuai master, mendukung `page`, `pageSize`, `q` (nomor form/ringkasan/keterangan), `dateFrom`, `dateTo` (`yyyy-MM-dd`). User hanya dapat melihat device pada Site sendiri yang tidak diarsipkan; Superadmin dapat membuka timeline perangkat arsip. `siteId` yang diminta tetap diperiksa terhadap scope sesi.

Kronologi dibentuk oleh tepat dua sumber: `activity_devices` join `activities` dengan key `A:{activity_id}:{device_id}`, dan `device_events` dengan key `E:{event_id}`. `audit_log` bukan sumber timeline, sehingga audit dan aktivitas tidak diduplikasi. Replacement tampil sekali pada masing-masing device yang terlibat, dengan role lama/baru. Penghapusan transaksi menghilangkan entri `A:` dan menyimpan satu event `transaction_deleted` per device; event menyimpan nomor form, jenis, role, waktu lokal asal dan zona asal walaupun aktivitas sudah tidak ada. Event diurutkan pada waktu penghapusan, bukan waktu aktivitas asal. Urutan gabungan adalah UTC `started_at`/`occurred_at`, lalu `created_at`, lalu key secara menurun. Timestamp aktivitas memakai offset/zona yang disimpan; timestamp lifecycle event memakai zona Site perangkat.

POST/PATCH meneruskan body dan header ke handler transaksi asal melalui Activity Log; kontrak JSON/multipart, foto, `Idempotency-Key` saat POST, `rowVersion` saat PATCH, validasi status/unit, audit dan hasil commit mengikuti modul asal. POST harus memiliki `deviceCode` payload yang sama dengan timeline; untuk replacement, device harus muncul sebagai `oldDeviceCode` atau `newDeviceCode`. Ketidakcocokan ditolak dengan `DEVICE_MISMATCH`. PATCH/DELETE memeriksa `activity_devices` agar transaksi UUID benar-benar berada di timeline device tersebut; transaksi milik device lain menghasilkan 404. Body JSON dibuffer dan multipart dibaca dari form cache agar pemeriksaan device tidak menghabiskan body sebelum handler asal. Batas ukuran mengikuti jenis transaksi. Device arsip menolak perubahan. Tidak ada SQL mutasi master, activities atau lifecycle event yang ditulis terpisah pada handler timeline.

Event registrasi, perubahan detail perangkat, archive, override, dan transaksi dihapus tetap append-only. API timeline tidak menghapus device, menghapus audit, membuat event manual, atau menyediakan bulk delete riwayat. Pembatasan edit modul asal tetap berlaku, termasuk installation yang hanya mendukung metadata. CRUD di timeline berarti mengelola transaksi yang membentuk riwayat; ketika transaksi dihapus, jejak event penghapusan tetap ada.

Frontend directory mendukung search, filter Site/status/arsip, clear filter, pilihan jumlah perangkat dan pagination. Detail memiliki search, filter jenis, rentang tanggal, pagination dan CSV sesuai filter. Statistik aktivitas tidak mencampur event lifecycle. Detail transaksi mengarah ke Activity Log berdasarkan UUID yang benar. Superadmin mendapat tautan edit dan konfirmasi hapus 5 detik pada entri aktivitas, bukan event; hasil delete memuat ulang master dan kronologi. Tambah Aktivitas membuka form transaksi lengkap, bukan membuat baris event kosong. Tidak ada seed timeline khusus: riwayat berasal dari transaksi dan registrasi perangkat yang sudah tersimpan.

### Verifikasi Timeline

`tests/integration/timeline-dotnet.mjs` memeriksa autentikasi route secara default. Alur tulis hanya aktif dengan `TIMELINE_TEST_WRITE=development-fixture` dan sesi Superadmin pada environment `MH02_TEST_SESSION`; jangan simpan/bagikan token. `DOTNET_TEST_URL` default ke loopback port 5000. Fixture memakai perangkat dari `009_troubleshoot_development_seed.sql`. Test mencakup device mismatch, create/replay, satu key `A:`, penolakan edit/delete event, penolakan transaksi milik device lain, update ke handler asal, stale version, dan perubahan satu aktivitas menjadi tepat satu event penghapusan tanpa perubahan master. Audit/event append-only, sequence, idempotency key dan karantina tetap tersimpan. Contract test memeriksa dua sumber, key/order, scope, delegasi dan larangan SQL mutasi event.

Build dan test unit/integrasi belum dijalankan. Percobaan HTTP tanpa cookie lewat proxy mendapat 404 dengan `X-Request-Id` backend untuk seluruh route yang diperiksa: proses .NET aktif belum memuat endpoint baru dan perlu dimulai ulang. Uji browser memakai API tiruan memverifikasi directory ke `/reports/timeline/D001`, header tanpa unit aktif, unit historis, WITA, event penghapusan yang tidak memiliki tombol hapus, serta tidak adanya edit/delete bagi User biasa. Mock browser sudah dibersihkan. Tidak ada transaksi database nyata atau perintah terminal yang dijalankan oleh Copilot; diagnostik editor bukan pengganti build/test integrasi.

## Activity Log

`/reports/activity-log` membaca PostgreSQL melalui API .NET, bukan gabungan mock di browser. Detail tersedia di `/reports/activity-log/{activityId}`. Satu baris mewakili satu transaksi, termasuk replacement dengan dua device; unit berasal dari transaksi, bukan assignment master device saat ini. Tanggal dan waktu memakai offset/zona Site yang disimpan, bukan WIB tetap. Tidak ada tabel log duplikat dan tidak ada seed Activity Log tersendiri.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/activity-log` | Semua jenis transaksi dalam scope Site pengguna |
| GET | `/api/activity-log/{activityId}` | Header, detail transaksi, snapshot semua device dan foto |
| POST | `/api/activity-log?activityType=installation` | Insert melalui handler jenis transaksi yang dipilih |
| PATCH | `/api/activity-log/{activityId}` | Update transaksi asal; khusus Superadmin |
| DELETE | `/api/activity-log/{activityId}` | Delete transaksi asal; khusus Superadmin |

`activityId` adalah UUID `activities.activity_id`, bukan nomor form. GET list mendukung `page`, `pageSize` (1-1000), `siteId`, `activityType` (`installation`, `replacement`, `removal`, `troubleshoot`), `dateFrom`, `dateTo` (`yyyy-MM-dd`), dan `q` (maksimal 120 karakter). Tanpa filter jenis, keempat jenis tampil. Pencarian backend mencakup nomor form, kode device, unit, teknisi dan remarks. Aktivitas historis tetap terlihat sesuai Site walaupun device sudah diarsipkan. Respons mencakup `transactionPath` serta `editPath` bila form edit asal tersedia. Tabel frontend mendukung search, filter kolom, clear, show rows, pagination, dan CSV rentang tanggal; seluruh halaman API dibaca agar ekspor tidak terpotong pada 1000 baris.

POST mewajibkan query `activityType` dan meneruskan body/header yang sama ke handler transaksi asal; bukan menambahkan baris kosong ke Activity Log. `Idempotency-Key`, jenis content type, foto wajib, validasi status/unit, zona waktu, nomor form, audit dan hasil commit mengikuti kontrak modul asal di bawah. Installation mendukung JSON atau multipart; jenis lainnya multipart. Header `Location` dan `formNumber` pada respons menunjuk transaksi asal. Di UI, menu Tambah Aktivitas membuka form asal agar semua field transaksi tetap lengkap.

PATCH/DELETE menentukan jenis transaksi dari UUID yang dicari di database, bukan dari tipe yang dikirim client. Handler asli dipakai bersama, tanpa internal HTTP request, sehingga Site scope, role, rowVersion, pemeriksaan riwayat, audit, idempotensi dan rollback tidak disalin atau dilewati. PATCH installation tetap metadata JSON dengan `rowVersion`; replacement tetap metadata/foto; removal dan troubleshoot mengikuti batas edit masing-masing. Kapabilitas edit tidak diperluas hanya karena diakses lewat laporan. DELETE menghapus transaksi asal dan memulihkan state perangkat bila handler asal mensyaratkannya; dapat ditolak jika device berubah/diarsipkan atau ada transaksi lanjutan. Audit/event penghapusan tetap disimpan. Ini bukan API untuk mengubah atau menghapus `audit_log`.

Detail UI menyediakan header, unit/EGI, waktu/durasi, personel, detail per jenis, snapshot sebelum/sesudah dan foto dengan lightbox. Superadmin mendapat Edit Metadata dan Hapus; form metadata memakai opsi shift/GL dari reference Site. Tombol Edit Transaksi membuka form asal bila didukung. Penyimpanan metadata menggunakan PATCH terpadu dengan `rowVersion` terakhir dan mempertahankan foto lama. Untuk edit penuh/foto, gunakan form asal. User biasa tidak mendapat kontrol tulis tersebut.

### Verifikasi Activity Log

`tests/integration/activity-log-dotnet.mjs` memeriksa autentikasi kelima route secara default. Alur tulis hanya aktif dengan `ACTIVITY_LOG_TEST_WRITE=development-fixture` dan sesi Superadmin pada environment `MH02_TEST_SESSION`; jangan simpan/bagikan token. `DOTNET_TEST_URL` default ke loopback port 5000. Fixture memakai Site/device dari `009_troubleshoot_development_seed.sql`. Test mencakup create/replay lewat facade, tidak ada duplikasi Activity Log, detail/foto/snapshot dan WITA, PATCH yang terlihat pada endpoint asal, stale version, DELETE pada kedua tampilan, serta master device tetap sama. Audit/event append-only, sequence, idempotency key dan karantina tetap tersimpan. Contract test memastikan facade mendelegasikan ke seluruh handler asal tanpa SQL mutasi sendiri.

Build serta test unit/integrasi belum dijalankan. Percobaan HTTP tanpa cookie melalui proxy mendapat 404 dengan `X-Request-Id` backend untuk kelima route: proses .NET aktif belum memuat endpoint baru dan perlu dimulai ulang. Uji browser dengan API tiruan memverifikasi render tabel/detail, waktu WITA, snapshot unit, foto termuat dan pembukaan editor metadata; simulasi pengisian/simpan belum berhasil diverifikasi karena otomasi interaksi tab tidak konsisten. Semua mock browser sudah dibersihkan. Tidak ada transaksi database nyata atau perintah terminal yang dijalankan oleh Copilot. Diagnostik editor bukan pengganti build/test integrasi.

## Troubleshoot

Daftar, detail, tambah dan edit `/support/troubleshoots` memakai API .NET tanpa fallback mock. Proxy Next hanya tersedia pada development.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/troubleshoots?page=1&pageSize=100&siteId=...` | Daftar sesuai scope Site; maksimal 1000 per halaman |
| GET | `/api/troubleshoots/{formNumber}` | Detail, snapshot unit, foto dan `rowVersion` |
| POST | `/api/troubleshoots` | Insert laporan beserta snapshot dan audit |
| PATCH | `/api/troubleshoots/{formNumber}` | Update, khusus Superadmin, wajib `rowVersion` terakhir |
| DELETE | `/api/troubleshoots/{formNumber}` | Delete dengan pemeriksaan riwayat, khusus Superadmin |

`formNumber` seperti `TRB-202611-001` dibuat sequence database saat insert dan tidak berubah saat edit. Sesuai klarifikasi alur pengguna, laporan baru memilih perangkat yang sedang terpasang (`in_use` dengan unit aktif terhubung), bukan stok RFU tanpa unit. Unit Number, tipe alat dan EGI mengikuti assignment pemasangan terkini pada master; tidak diambil dari sembarang installation lama. API menolak device yang belum terpasang dengan `DEVICE_NOT_INSTALLED`, termasuk saat mengganti device pada mode edit. Mode edit dengan device asli mempertahankan snapshot unit/tipe/EGI laporan, sekalipun master perangkat kemudian berubah. EGI kosong ditampilkan sebagai belum diisi di master unit, bukan diisi dengan nilai tiruan. **Create/update/delete troubleshoot tidak menjalankan perubahan master device**, termasuk status, unit, lokasi, tanggal maintenance, health check, maupun row version device. Snapshot `activity_devices` selalu memiliki before = after. `healthCheckStatus`, bila dikirim, hanya menjadi hasil pada laporan, bukan checklist PM/health check 19 item atau perubahan health check master.

POST/PATCH memakai multipart: field `payload` JSON, `photo:before_repair` dan `photo:after_repair`, serta `caption:<slot>` opsional. Kedua foto wajib tersedia sesudah operasi. Format JPEG/PNG/WebP diperiksa dari byte, batas 5 MiB/file dan 11 MiB/request. Payload berisi `siteId`, `deviceCode`, `startedAt`, `finishedAt` (waktu lokal Site `yyyy-MM-ddTHH:mm`), `componentType`, `issue`, `actionTaken`, `remarks` opsional, serta `healthCheckStatus` opsional (`Pass`, `Fail`, `Verified`, `Pending`). Issue/action wajib dan masing-masing maksimal 1000 karakter; remarks maksimal 1000 dan caption maksimal 200. Teknisi dicatat dari sesi. Foto detail menggunakan `/api/dotnet/photos/{photoId}` di frontend dan `/api/photos/{photoId}` pada backend langsung.

POST memerlukan `Idempotency-Key` 16-64 huruf/angka/underscore/hyphen; retry dengan key dan isi sama bila hasil belum pasti. PATCH menambahkan `rowVersion`, `keepPhotoSlots` untuk foto yang dipertahankan, dan `photoCaptions` object untuk caption foto lama. Mendukung perubahan metadata, komponen, waktu, foto serta device dalam Site yang sama; Site/teknisi transaksi tetap. Metadata/foto tanpa perubahan device/waktu mempertahankan snapshot historis. Perubahan device/waktu memeriksa current state terhadap snapshot device lama dan urutan riwayat (`started_at`, `created_at`); urutan tidak ditentukan dari `finished_at`. Konflik menyebut nomor form penghalang dan waktu lokalnya. Waktu selesai di masa depan ditolak, durasi dihitung backend menurut zona Site. Versi lama ditolak dengan `STALE_VERSION`.

DELETE menolak device yang diarsipkan, state yang tidak lagi cocok dengan snapshot, atau aktivitas yang lebih baru. Karena before = after, tidak ada status/assignment device yang perlu dimutasi. Audit dan event `transaction_deleted` tetap disimpan sesuai desain. Metadata database, snapshot, idempotensi dan audit dilakukan dalam satu transaksi. File foto diganti/dihapus dipindahkan ke karantina setelah commit; keterbatasan rekonsiliasi dan pemulihan setelah crash sama dengan installation.

### Dropdown Troubleshoot

Tinjau dan jalankan sendiri `database/postgresql/009_troubleshoot_development_seed.sql` hanya di PostgreSQL development `db_asset_report`, setelah schema/reference awal dan akun Superadmin aktif tersedia. Script belum dijalankan oleh Copilot. Script menambahkan Site `DEV-TROUBLESHOOT`, unit `DEV-TRB-DT-001`, device `DEV-TRB-MH02-001` (In Use), device `DEV-TRB-RFU-001` (RFU tanpa unit untuk uji penolakan, tidak ditawarkan sebagai pilihan baru), serta audit/event registrasi. Tidak membuat laporan troubleshoot atau personel fiktif dan tidak mereset state yang sudah berubah. Uji fixture menggunakan sesi Superadmin; akun User hanya melihat Site penugasannya.

Dropdown device/Site/unit memakai master PostgreSQL; tipe armada dan EGI mengikuti unit. Teknisi memakai akun login, sehingga tidak ada insert nama teknisi dummy. Delapan opsi komponen (`MH02 Device`, `GPS/Antenna`, `Camera`, `Wiring`, `Speaker`, `SPM`, `CPE`, `Firmware`) mengikuti CHECK `troubleshoot_details.component_type` yang sudah ada, bukan kategori `lookup_values` baru; query seed menampilkannya melalui SELECT tanpa membuat tabel baru. Tidak ada GL atau shift baru yang ditambahkan pada form troubleshoot.

### Verifikasi Troubleshoot

`tests/integration/troubleshoot-dotnet.mjs` memeriksa penolakan tanpa sesi secara default. Alur tulis hanya aktif dengan `TROUBLESHOOT_TEST_WRITE=development-fixture` dan sesi Superadmin dalam environment `MH02_TEST_SESSION`; jangan simpan/bagikan token tersebut. `DOTNET_TEST_URL` default ke loopback port 5000. Test mencakup foto wajib, idempotensi/replay, penolakan device RFU saat create/edit, unit/tipe/EGI dari device terpasang, waktu, caption, file, stale version, waktu masa depan, delete, serta pembandingan seluruh respons master device termasuk rowVersion/health check sebelum dan sesudah CRUD. Audit/event append-only, sequence, idempotency key dan karantina tetap tersimpan setelah test. Contract test yang tidak membutuhkan database ditambahkan pada `tests/unit/schema-contract.test.ts` untuk pilihan komponen, filter device terpasang, urutan riwayat dan larangan mutasi master device.

Build serta kedua jenis test belum dijalankan. Percobaan HTTP tanpa cookie lewat browser terhalang `ERR_CONNECTION_REFUSED` pada frontend port 3000, sehingga route/UI maupun CRUD PostgreSQL nyata belum terverifikasi. Tidak ada query insert atau perintah terminal yang dijalankan oleh Copilot. Mulai ulang backend dan frontend untuk memuat endpoint baru sebelum pengujian. Diagnostik editor bukan pengganti build/test integrasi.

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