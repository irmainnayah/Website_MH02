# MH02 backend (Phase 5): what exists, how to run it, what is not done

Source of truth for behavior: `docs/PHASE2_DATABASE_DESIGN.md` (Revision 11). Database setup:
`database/README.md` and `database/setup/PHASE4A_GUIDE.md`.

**Status:** implemented and tested against the live development database (unit, service-level and HTTP tests).
The Phase 5 backend is complete; what is still open is listed under "NOT implemented yet".

## Layout (`src/server`, server-side only; never import it from a client component)

| File | Purpose |
|---|---|
| `errors.ts`, `time.ts`, `scope.ts`, `transitions.ts`, `formNumber.ts`, `hash.ts` | Pure logic (no I/O). Unit-tested in `tests/unit` |
| `config.ts` | Environment parsing (`.env.local`); the DB user must never be `sa`/sysadmin |
| `db.ts` | `mssql` pool, parameterized queries, one SQL transaction per operation (`XACT_ABORT ON`), commit-ambiguity detection, SQL error mapping |
| `auth/password.ts`, `auth/session.ts` | bcrypt, server-side sessions (only the SHA-256 of the cookie token is stored), lockout |
| `http.ts` | Route wrapper: session auth, Super Admin check, Origin/CSRF check, strict JSON/query parsing, error mapping, `no-store` |
| `validators.ts` | zod schemas; body schemas are `strict` (a client-sent status, role, duration, time zone or offset is rejected) |
| `audit.ts` | `audit_log` and `device_events` writers (same SQL transaction as the change; secrets redacted) |
| `idempotency.ts` | Permanent per-user keys, applock barrier, replay, ambiguous-COMMIT resolution (design 3.19) |
| `repo.ts`, `devices.ts`, `transactions.ts`, `reference.ts` | Services (`transactions.ts` also holds edit/PATCH and delete) |
| `photos.ts`, `multipart.ts` | Photo storage (local FS adapter), staging, finalize, reconciler, integrity check, quarantine; multipart parsing |
| `users.ts`, `dashboard.ts` | User management; scoped Dashboard aggregate |
| `src/instrumentation.ts` | Starts the photo reconciler/integrity timers once per server process |
| `src/app/api/**/route.ts` | Thin Route Handlers (Node runtime, dynamic) |

## Endpoints implemented

`POST /api/auth/login` `POST /api/auth/logout` `GET /api/auth/me` `GET /api/reference` `GET /api/fleet-units`
`GET|POST /api/devices` `GET|PATCH /api/devices/{id}` `POST /api/devices/{id}/override` `POST /api/devices/{id}/archive`
`GET /api/devices/{id}/timeline` `GET /api/activity-log` `GET /api/audit-logs`
`GET|POST /api/{installations|replacements|removals|troubleshoots}` and `GET|PATCH|DELETE /api/{...}/{id}`
`GET /api/photos/{photoId}` `GET /api/dashboard/summary`
`GET|POST /api/users` `GET|PATCH /api/users/{id}` `POST /api/users/{id}/password`

Creating POSTs (`/devices` and the four transaction endpoints) **require an `Idempotency-Key` header**.

### Photos
`POST /api/{type}` accepts JSON (no photos) **or** `multipart/form-data`: field `payload` (the same JSON, same strict
schema), `photo:<slot>` files and optional `caption:<slot>`. Slots (taken from the approved UI): installation
`mh02_installed`, `camera_dashboard_angle`, `nodered_config`, `gps_antenna`; replacement `mh02_new_installed`,
`mh02_old_removed`, `nodered_config`, `gps_antenna`; removal `beforeDevice`, `componentSet`; troubleshoot `beforeRepair`,
`afterRepair`. Only JPEG/PNG/WebP (checked by magic bytes), at most `PHOTO_MAX_BYTES` (10 MB) each, 8 per transaction.
Files go `_staging/{id}.part -> .upload`; the metadata rows are inserted in the creation transaction; after COMMIT the file
is moved to `photos/{yyyy}/{mm}/{id}.{ext}` under `PHOTO_STORAGE_ROOT` (finalize, under a per-photo SQL Server applock; the
final file is never overwritten). The photo fingerprint is part of the idempotency hash. `GET /api/photos/{id}` streams the
file after the Site check (the staging file until finalized; cross-Site = 404). Deleting a transaction moves its files to
`_quarantine` after COMMIT (purged after `PHOTO_QUARANTINE_DAYS`). The reconciler (at start and on an interval) finalizes
committed-but-unmoved files and deletes orphans older than `PHOTO_STAGING_GRACE_MINUTES`; the integrity check reports
`PHOTO_LOST`, `PHOTO_CORRUPT` and `PHOTO_STORAGE_UNAVAILABLE` in the server log and never recreates or alters anything.
Deviation from the design text: the per-photo lock uses `@LockOwner = 'Transaction'` (held by a short SQL transaction)
instead of `'Session'` on a dedicated connection; it is released at COMMIT or when the connection dies, with the same effect.

### Editing a transaction (`PATCH`, Super Admin)
Body = the creation fields, all optional, plus the required `rowVersion` (returned by GET). `siteId`, status, duration,
time zone and offsets are rejected (400). A patch that changes nothing writes nothing. Metadata-only edits (shift, group
leader, remarks, network/notes/issue/action fields) touch no device and skip the revert rules. Master edits (times, device,
Unit, final condition) revert every device to its before-snapshot, re-validate as a creation would, re-apply and rewrite the
snapshots in ONE transaction. They are blocked by a later activity (409 `LATER_ACTIVITY_EXISTS`, also when the new start time
would put the activity before another one), by an archived device, or by a changed device state. Times are re-resolved in
the activity's snapshotted zone; unchanged times keep their offset. The form number is kept. Audit: `transaction_update` for
the activity and for each device whose state changed. PATCH does not change photos.

### Users (Super Admin only)
Create (role `user` needs a Site, `superadmin` may have none), update name/email/phone/role/Site/status (NRP immutable, no
password in PATCH), password reset (clears the lockout, revokes sessions). Deactivation revokes sessions; there is no delete.
Nobody changes their own role, Site or status (403); the last active Super Admin cannot be deactivated or demoted (409, a
safety net for concurrent requests). Audit table `user_management`; passwords and hashes never appear in audit rows or
responses. Minimum password length 10 (implementation default, not a business rule).

### Dashboard
`GET /api/dashboard/summary?siteId=&months=` (default 12, max 36): raw per-status KPIs; status, owner-Site, location,
equipment (In Use only) and health distributions; activity per type; a zero-filled monthly series by local month. Role user:
own Site (another Site = 403). **No total-assets formula is invented** (pending business confirmation); `notes` says so.

## Rules enforced on the server (not only in the UI)

- Role and Site are read from `users` on every request. A regular user's `siteId` is ignored (a different explicit one is
  403); a Super Admin must choose the Site for a write. Cross-Site resources return 404.
- Devices: always registered `In Stock RFU` (a status in the body is a 400); archived devices are invisible to users
  and active lists; Super Admin override needs a non-blank reason; archive refuses `In Use` devices; no hard delete,
  no restore, no Site transfer.
- Transactions: times are local strings in the Site's zone (no `Z`/offset); the offset is derived from the Site's zone and
  snapshotted; duration is computed by the server; `finishedAt` cannot be in the future; device rules from design 6;
  form numbers `INS|REP|REM|TRB-YYYYMM-NNN` from `form_sequences`; every write has audit rows in the same transaction.
- Delete (Super Admin): refused if a later activity exists, the device state changed since, or a device is archived;
  restores the complete previous state; leaves `transaction_deleted` events and audit rows.

## Implementation defaults (not business decisions; change by environment variable)

`SESSION_TTL_HOURS=8`, `LOGIN_LOCKOUT_THRESHOLD=5`, `LOGIN_LOCKOUT_MINUTES=15`, `IDEMPOTENCY_LOCK_TIMEOUT_MS=3000`,
`IDEMPOTENCY_VERIFY_TIMEOUT_MS=5000`, `CLOCK_SKEW_SECONDS=120`, `TRUST_PROXY=false`, `SESSION_COOKIE_SECURE`
(true in production). Login bookkeeping (failed counter, last login) is not business data and is not written to `audit_log`.

## NOT implemented yet (explicit list)

- **Frontend integration**: the existing pages still use mock data. Nothing in the UI was changed.
- Photos cannot be added to or replaced on an existing transaction (PATCH edits no photos).
- `db-create-admin` (first Super Admin for production): use `database/scripts/seed-test-users.mjs` for development only.
- Photo alerts go to the server log only (no notification channel is decided). A server-side CSV export is not built.
- Not exercised yet: photo concurrency across several application processes, and finalization across volumes (`EXDEV`).

## How to run once the database connection is ready

1. Enable TCP/IP + Mixed Mode (elevated PowerShell): `database/setup/PHASE4A_GUIDE.md`, step 1.
2. `node database/scripts/db-check-connection.mjs` must pass.
3. Dev test users: `$env:MH02_ENV="development"; $env:SEED_TEST_PASSWORD="<strong password>"; node database/scripts/seed-test-users.mjs --confirm-dev-seed`
4. `npm run dev`, then `node tests/integration/api-smoke.mjs` (same `SEED_TEST_PASSWORD`).
5. Unit tests (no database needed): `npm run test:unit`.
6. Service-level tests against the dev DB (no password): `npm run test:service`, `npm run test:phase5`.
7. HTTP test of the Phase 5 endpoints (app running; it creates sessions directly, no password): `npm run test:http`
   (`BASE_URL=http://localhost:3000` by default). Do not run `next build` while `next dev` is running: both write `.next`.

## Konfigurasi lokal backend .NET (wajib per komputer)

`backend-dotnet/appsettings.Local.json`, `bin/`, `obj/` dan `.storage/` **tidak ada di Git** (lihat `.gitignore`). Setiap developer:

1. Salin `backend-dotnet/appsettings.Local.example.json` menjadi `backend-dotnet/appsettings.Local.json`.
2. Isi `Username` dan `Password` akun PostgreSQL lokal miliknya sendiri (jangan akun bersama, jangan di-commit).
3. Jalankan backend dari folder `backend-dotnet` (`dotnet run`); `bin/` dan `obj/` dibuat otomatis saat build.

Jika password pernah ter-commit di riwayat Git, ganti password akun database tersebut.
