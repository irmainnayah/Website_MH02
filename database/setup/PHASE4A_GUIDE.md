# Phase 4a guide: connect the Next.js app to SQL Server (`mssql`)

Source: `docs/PHASE2_DATABASE_DESIGN.md` (Revision 11), section 8. Local development
instance: SQL Server 2025 default instance `MSSQLSERVER`, database `db_asset_report`.

## Where things stand

| Item | State |
|---|---|
| `mh02_app` login (`CHECK_POLICY` on, no server roles) and database user (no roles, no permissions) | **Done** (`P4A_01`, through `Initialize-AppLogin.ps1`) |
| `.env.local` with the generated password (restricted to your Windows user), `.env.example` | **Done** |
| `mssql` package | Installed (see the report for the version) |
| TCP/IP on loopback + Mixed Mode | **Needs you**: elevated PowerShell (step 1) |
| Migrations V002-V007 and permissions (`P4A_02`) | **Not run** (needs your approval; step 3) |

## Step 1 (manual, elevated): TCP/IP and Mixed Mode

Today: `LoginMode = 1` (Windows only), TCP/IP disabled (shared memory only), nothing
listening on port 1433, no firewall rule for 1433. SQL Authentication and the Node.js
driver need both changed. This needs **Run as administrator**; the assistant's session is not elevated.

1. Close SSMS and any app connected to the server (the service restarts).
2. Open an **elevated** PowerShell in the project folder.
3. Preview (changes nothing):
   ```powershell
   powershell -ExecutionPolicy Bypass -File database\setup\Enable-SqlTcpAndMixedMode.ps1
   ```
4. Apply and restart the service:
   ```powershell
   powershell -ExecutionPolicy Bypass -File database\setup\Enable-SqlTcpAndMixedMode.ps1 -Apply -Restart
   ```
   It saves the previous values to `database\setup\sql-network-backup-<time>.json`
   (undo with `-Rollback <that file>`), enables TCP/IP **only on 127.0.0.1 and ::1**
   (`ListenOnAllIPs = 0`, every other address disabled), sets port 1433 and Mixed Mode,
   then lists what is listening. If it warns about a non-loopback address, stop and review.

Equivalent GUI route: *SQL Server Configuration Manager* → *SQL Server Network
Configuration* → *Protocols for MSSQLSERVER* → TCP/IP = Enabled; its Properties → *Listen All* = No;
*IP Addresses*: enable only the 127.0.0.1 and ::1 entries, port 1433; and SSMS → server
Properties → Security → *SQL Server and Windows Authentication mode*; restart the service.

Do **not** create an inbound Windows Firewall rule for 1433, and do not port-forward it.
Loopback traffic needs no rule, and the database must not be reachable from the network.

## Step 2 (already done): login and user

`P4A_01_create_app_login.sql` was run through `Initialize-AppLogin.ps1`. The password is
generated, passed to `sqlcmd` through an environment variable and stored only in `.env.local`.
To rotate it later: `powershell -File database\setup\Initialize-AppLogin.ps1 -Apply -RotatePassword`.

## Step 3 (needs your approval): migrations, then permissions

The migrations create the tables; permissions can only be applied once all 22 exist.
Note that `V001` is **already applied** in the database (8 tables) but is **not recorded** in
`schema_migrations` (see the report); fix that first, then:

```powershell
node database\scripts\db-migrate.mjs status                      # read-only
node database\scripts\db-migrate.mjs migrate                     # dry run
$env:MH02_ALLOW_DB_CHANGES = 'yes'
node database\scripts\db-migrate.mjs migrate --apply             # only after you approve
node database\scripts\db-migrate.mjs seed-reference --apply      # reference data
sqlcmd -S localhost -E -C -b -i database\setup\P4A_02_app_permissions.sql
```

`P4A_02` adds `mh02_app` to `db_datareader` and `db_datawriter` only, grants and denies
`SELECT`/`INSERT`/`UPDATE`/`DELETE` as in the design (append-only `audit_log` and
`device_events`, no `DELETE` on `idempotency_keys`, no `UPDATE`/`DELETE` on `schema_migrations`),
and refuses to run before the 22 tables exist.

## Step 4: verify the Node.js connection

```powershell
node database\scripts\db-check-connection.mjs
```

It is read-only. It checks: connect over TCP with encryption; logged in as `mh02_app`;
**not** sysadmin and **not** `db_owner`; database and compatibility level (>= 130);
`READ_COMMITTED_SNAPSHOT` recorded; parameterized query; `sp_getapplock` callable (inside a
rolled-back transaction); and, once the tables exist, the effective permissions
(`HAS_PERMS_BY_NAME`, no DML). Before step 3 the permission lines are `SKIP`.

## Production notes

- Use a new login and a new password on the company server; never reuse the local one.
- Set `DB_TRUST_SERVER_CERTIFICATE=false` there and install a trusted certificate.
- The application login is never `sa`, never a sysadmin; schema changes run under an
  administrative login through the migration runner.
- Keep `.env.local` out of source control and backups that leave the machine.
