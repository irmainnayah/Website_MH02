/* ============================================================================
   P4A_02_app_permissions.sql
   MH02 Phase 4a - application permissions for mh02_app (run AFTER all migrations)

   Source of truth: docs/PHASE2_DATABASE_DESIGN.md (Revision 11), sections 3.15,
   3.18, 3.19 and 8 (Phase 4a step 3).

   Run with sqlcmd as a sysadmin (uses GO and :on error). Idempotent: running it
   again changes nothing. It refuses to run unless the database user exists and
   all 22 tables exist, so it cannot be applied half-way.

   Result:
   - mh02_app becomes a member of db_datareader and db_datawriter ONLY (no
     db_owner, no db_ddladmin, no schema changes, no TRUNCATE).
   - audit_log, device_events: SELECT and INSERT only; UPDATE and DELETE denied
     (a DENY overrides db_datawriter). Together with the INSTEAD OF triggers
     from the migrations this is the two-layer append-only protection.
   - schema_migrations: UPDATE and DELETE denied (the application never records
     migrations; the runner uses a separate administrative login).
   - idempotency_keys: SELECT, INSERT, UPDATE granted explicitly; DELETE denied
     (keys are permanent).

   Not covered here: sp_getapplock needs no explicit grant in the documented
   design; the connection check (database/scripts/db-check-connection.mjs)
   verifies that the call works for mh02_app instead of assuming it.

   STATUS: DRAFT. Not executed. Do not run before the migrations are applied.
   ============================================================================ */

:on error exit

USE [db_asset_report];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mh02_app')
    THROW 50110, N'P4A_02: database user mh02_app does not exist. Run P4A_01 first.', 1;

IF (SELECT COUNT(*)
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo')
      AND name IN (N'schema_migrations', N'sites', N'roles', N'users', N'auth_sessions',
                   N'equipment_types', N'device_statuses', N'fleet_units', N'devices',
                   N'activities', N'activity_devices', N'installation_details',
                   N'replacement_details', N'removal_details', N'troubleshoot_details',
                   N'transaction_photos', N'lookup_values', N'form_sequences',
                   N'audit_log', N'import_batches', N'device_events', N'idempotency_keys')) <> 22
    THROW 50111, N'P4A_02: not all 22 tables exist. Apply every migration first.', 1;
GO

ALTER ROLE db_datareader ADD MEMBER [mh02_app];
ALTER ROLE db_datawriter ADD MEMBER [mh02_app];
GO

/* Append-only records */
GRANT SELECT, INSERT ON dbo.audit_log     TO [mh02_app];
GRANT SELECT, INSERT ON dbo.device_events TO [mh02_app];
DENY  UPDATE, DELETE ON dbo.audit_log     TO [mh02_app];
DENY  UPDATE, DELETE ON dbo.device_events TO [mh02_app];

/* Migration bookkeeping is not an application concern */
DENY  UPDATE, DELETE ON dbo.schema_migrations TO [mh02_app];

/* Permanent idempotency keys */
GRANT SELECT, INSERT, UPDATE ON dbo.idempotency_keys TO [mh02_app];
DENY  DELETE                 ON dbo.idempotency_keys TO [mh02_app];
GO

PRINT N'Permissions applied for mh02_app.';
GO
