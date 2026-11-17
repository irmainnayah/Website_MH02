# MH02 database (SQL Server)

Source of truth: `docs/PHASE2_DATABASE_DESIGN.md` (Revision 11).
**Status: drafts. Nothing in this folder has been executed against any database.**

```
database/
  migrations/      V001..V007  forward-only DDL, one SQL transaction each, no GO
  seed/reference/  R001        production-safe reference data (idempotent MERGE)
  seed/dev/        D001        FICTIONAL development data only
  scripts/         db-migrate.mjs   runner (no npm dependencies, uses sqlcmd)
```

## Runner

```
node database/scripts/db-migrate.mjs list                 # offline: files + checksums, no connection
node database/scripts/db-migrate.mjs status               # read-only: applied vs pending
node database/scripts/db-migrate.mjs migrate              # DRY RUN (plan only)
node database/scripts/db-migrate.mjs migrate --apply      # needs MH02_ALLOW_DB_CHANGES=yes
node database/scripts/db-migrate.mjs seed-reference       # DRY RUN
node database/scripts/db-migrate.mjs seed-reference --apply
node database/scripts/db-migrate.mjs seed-dev --apply --confirm-dev-seed   # also needs MH02_ENV=development
```

Safe by default: every command except `list` connects to the database, and every
command that would change it is a dry run unless `--apply` **and**
`MH02_ALLOW_DB_CHANGES=yes` are both given. Seeds refuse to run while migrations
are pending. `seed-dev` additionally refuses unless `MH02_ENV=development`.

Environment: `DB_SERVER` (default `localhost`), `DB_NAME` (must be
`db_asset_report`), optional `DB_USER` / `DB_PASSWORD` (otherwise Windows
Authentication is used; the password goes to `sqlcmd` through `SQLCMDPASSWORD`,
never the command line), `DB_TRUST_CERT` (default `true` for a local
self-signed certificate; use `false` on a server with a trusted certificate),
`SQLCMD_PATH`. Never commit credentials.

## Other scripts

```
node database/scripts/db-migrate.mjs verify --apply         # 131 structure/seed/constraint/trigger/permission checks,
                                                            # all writes rolled back (needs MH02_ALLOW_DB_CHANGES=yes)
node database/scripts/db-check-connection.mjs               # Node `mssql` -> SQL Server as mh02_app (needs TCP/IP + Mixed Mode)
node database/scripts/seed-test-users.mjs --confirm-dev-seed  # dev login accounts (SEED_TEST_PASSWORD, MH02_ENV=development)
database/setup/                                             # Phase 4a: login, permissions, TCP/IP + Mixed Mode (see PHASE4A_GUIDE.md)
```

## Rules

- Applied migrations are never edited. The runner compares SHA-256 checksums
  (line endings normalized) and stops on any difference. Changes go into a new
  forward-only migration.
- V001-V007 have never been executed, so Revision 10/11 changes were made in
  place. From the first execution on, that is no longer allowed.
- No `GRANT`/`DENY` and no login creation here: the application login
  `mh02_app` and its permissions are the separate Phase 4a step (design 8).
- The dev seed contains no login accounts and no transactions (those need the
  backend service so that snapshots, audit rows and events are valid).
- Time zones of the dev Sites are unverified placeholders; production Sites are
  created at setup with an explicit `time_zone_id`.
- `db-create-admin` (first Super Admin) belongs to the authentication phase and
  is not part of this folder yet.
