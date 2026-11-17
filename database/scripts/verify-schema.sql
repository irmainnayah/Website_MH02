/* ============================================================================
   verify-schema.sql - MH02 database verification (Phase 4b)

   Run through the runner:  node database/scripts/db-migrate.mjs verify
   (or: sqlcmd -S localhost -E -C -b -I -i database/scripts/verify-schema.sql)

   WHAT IT DOES
   1. Structure: 22 tables, foreign keys, cascades, CHECKs, UNIQUEs, triggers and
      indexes against the numbers in the design.
   2. Seeds: reference data and the dev seed (relations between devices, audit rows
      and registered events).
   3. Behavior: executes statements that MUST fail (CHECK, UNIQUE, FK, append-only
      triggers, immutable columns) and statements that MUST succeed, all inside ONE
      transaction that is ROLLED BACK at the end, so no data persists.
   4. Permissions: runs statements as the database user mh02_app (EXECUTE AS USER)
      to prove what the application login can and cannot do.

   SAFETY
   - Everything that writes happens inside a transaction that is rolled back.
   - The only lasting side effect: failed/rolled-back INSERTs consume values of the
     audit_log identity column. At the end the identity is re-seeded to the current
     maximum so the dev database keeps contiguous audit ids.
   - Requires a sysadmin (impersonation). Run it in a development database.

   Test statements use ~ for a single quote (replaced before execution) and the
   placeholders {SITE} {SITE2} {UNIT} {ACTOR} {DEV1} {DEV2} {ACT1} {AUD1}..{AUD4}.
   Expected value: 0 = must succeed, N = must fail with exactly error N, -1 = must fail.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() <> N'db_asset_report'
BEGIN
    RAISERROR (N'verify-schema: wrong database context.', 16, 1);
    RETURN;
END;

DECLARE @r TABLE (id INT IDENTITY(1,1), status VARCHAR(4), name NVARCHAR(200), detail NVARCHAR(400));

/* ---------------------------------------------------------------------------
   1. STRUCTURE
   ------------------------------------------------------------------------- */
DECLARE @expectedTables TABLE (name SYSNAME);
INSERT @expectedTables VALUES
 (N'schema_migrations'),(N'sites'),(N'roles'),(N'users'),(N'auth_sessions'),(N'equipment_types'),
 (N'device_statuses'),(N'fleet_units'),(N'devices'),(N'activities'),(N'activity_devices'),
 (N'installation_details'),(N'replacement_details'),(N'removal_details'),(N'troubleshoot_details'),
 (N'transaction_photos'),(N'lookup_values'),(N'form_sequences'),(N'audit_log'),(N'import_batches'),
 (N'device_events'),(N'idempotency_keys');

INSERT @r (status, name, detail)
SELECT CASE WHEN COUNT(t.name) = COUNT(e.name) THEN 'PASS' ELSE 'FAIL' END,
       N'structure: all 22 design tables exist',
       N'missing: ' + ISNULL(STUFF((SELECT N',' + x.name FROM @expectedTables x
                                    WHERE NOT EXISTS (SELECT 1 FROM sys.tables s WHERE s.name = x.name COLLATE DATABASE_DEFAULT)
                                    FOR XML PATH('')), 1, 1, N''), N'none')
FROM @expectedTables e LEFT JOIN sys.tables t ON t.name = e.name COLLATE DATABASE_DEFAULT;

DECLARE @n INT;
SELECT @n = COUNT(*) FROM sys.tables;
INSERT @r VALUES (CASE WHEN @n = 22 THEN 'PASS' ELSE 'FAIL' END, N'structure: no unexpected tables', N'user tables = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.foreign_keys;
INSERT @r VALUES (CASE WHEN @n = 41 THEN 'PASS' ELSE 'FAIL' END, N'structure: foreign keys = 41', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.foreign_keys WHERE delete_referential_action_desc = 'CASCADE';
INSERT @r VALUES (CASE WHEN @n = 7 THEN 'PASS' ELSE 'FAIL' END, N'structure: cascading foreign keys = 7', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.check_constraints;
INSERT @r VALUES (CASE WHEN @n = 30 THEN 'PASS' ELSE 'FAIL' END, N'structure: CHECK constraints = 30', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.key_constraints WHERE type = 'UQ';
INSERT @r VALUES (CASE WHEN @n = 12 THEN 'PASS' ELSE 'FAIL' END, N'structure: UNIQUE constraints = 12', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.triggers WHERE parent_class = 1;
INSERT @r VALUES (CASE WHEN @n = 5 THEN 'PASS' ELSE 'FAIL' END, N'structure: triggers = 5', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.indexes i WHERE i.has_filter = 1 AND i.object_id IN (SELECT object_id FROM sys.tables);
INSERT @r VALUES (CASE WHEN @n = 4 THEN 'PASS' ELSE 'FAIL' END, N'structure: filtered unique indexes = 4', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.indexes i
 WHERE i.type = 2 AND i.is_primary_key = 0 AND i.is_unique_constraint = 0 AND i.has_filter = 0
   AND i.object_id IN (SELECT object_id FROM sys.tables);
INSERT @r VALUES (CASE WHEN @n = 5 THEN 'PASS' ELSE 'FAIL' END, N'structure: other nonclustered indexes = 5', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.columns c WHERE c.is_computed = 1 AND c.object_id = OBJECT_ID(N'dbo.activities');
INSERT @r VALUES (CASE WHEN @n = 2 THEN 'PASS' ELSE 'FAIL' END, N'structure: activities has 2 computed local-time columns', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.activities') AND name = N'status';
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: activities has NO transaction status column', N'status columns = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.transaction_photos') AND system_type_id IN (165, 173, 34); -- varbinary, binary, image
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: transaction_photos stores no binary data', N'binary columns = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID(N'dbo.idempotency_keys') AND name = N'FK_idempotency_keys_users';
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END, N'structure: idempotency_keys.user_id FK exists', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.foreign_key_columns fkc WHERE fkc.parent_object_id = OBJECT_ID(N'dbo.idempotency_keys') AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = N'activity_id';
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: idempotency_keys.activity_id has NO foreign key (by design)', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.idempotency_keys') AND name = N'expires_at';
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: idempotency_keys is permanent (no expires_at)', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.foreign_key_columns fkc WHERE fkc.parent_object_id = OBJECT_ID(N'dbo.device_events') AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) IN (N'source_activity_id', N'site_id');
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: device_events.source_activity_id and site_id have no FK (by design)', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM sys.schemas s JOIN sys.tables t ON t.schema_id = s.schema_id WHERE s.name <> N'dbo';
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'structure: every table is in schema dbo', N'tables outside dbo = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.schema_migrations;
INSERT @r VALUES (CASE WHEN @n = 7 THEN 'PASS' ELSE 'FAIL' END, N'migrations: V001-V007 recorded', N'recorded = ' + CAST(@n AS NVARCHAR(10)));

/* ---------------------------------------------------------------------------
   2. SEEDS
   ------------------------------------------------------------------------- */
SELECT @n = COUNT(*) FROM dbo.device_statuses
 WHERE (status_id = 1 AND code = 'in_use') OR (status_id = 2 AND code = 'in_stock_rfu')
    OR (status_id = 3 AND code = 'in_stock_damaged' AND label = N'In Stock (Repair)') OR (status_id = 4 AND code = 'in_stock_ho');
INSERT @r VALUES (CASE WHEN @n = 4 THEN 'PASS' ELSE 'FAIL' END, N'seed: device statuses 1-4 with codes and label In Stock (Repair)', N'matched ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.roles WHERE role_code IN (N'superadmin', N'user');
INSERT @r VALUES (CASE WHEN @n = 2 AND (SELECT COUNT(*) FROM dbo.roles) = 2 THEN 'PASS' ELSE 'FAIL' END, N'seed: roles superadmin and user only', N'roles = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.equipment_types;
INSERT @r VALUES (CASE WHEN @n = 5 THEN 'PASS' ELSE 'FAIL' END, N'seed: 5 equipment types', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.lookup_values WHERE site_id IS NULL AND category IN ('shift', 'source_power') AND is_active = 1;
INSERT @r VALUES (CASE WHEN @n = 5 THEN 'PASS' ELSE 'FAIL' END, N'seed: 5 global reference lookups (2 shift, 3 source power)', N'found ' + CAST(@n AS NVARCHAR(10)));
/* Seed checks are about the dev_seed rows only: the database may legitimately hold more data later
   (devices registered through the application, dev login accounts, transactions). */
SELECT @n = COUNT(*) FROM dbo.devices WHERE data_source = 'dev_seed';
INSERT @r VALUES (CASE WHEN @n = 16 THEN 'PASS' ELSE 'FAIL' END, N'seed: 16 dev_seed devices exist', N'found ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.devices d
 WHERE d.data_source = 'dev_seed'
   AND NOT EXISTS (SELECT 1 FROM dbo.activity_devices ad WHERE ad.device_id = d.device_id)
   AND (d.status_id <> 2 OR d.current_unit_id IS NOT NULL OR d.current_location_site_id <> d.site_id);
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'seed: untouched dev devices are In Stock RFU without a Unit, location = owning Site', N'violations = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.devices d
 WHERE d.data_source = 'dev_seed'
   AND (SELECT COUNT(*) FROM dbo.audit_log a WHERE a.entity_id = d.device_id AND a.action = 'device_register' AND a.table_name = 'device' AND a.operation = 'INSERT') = 1
   AND (SELECT COUNT(*) FROM dbo.device_events e WHERE e.device_id = d.device_id AND e.event_type = 'registered') = 1
   AND EXISTS (SELECT 1 FROM dbo.device_events e JOIN dbo.audit_log a ON a.audit_id = e.audit_id
               WHERE e.device_id = d.device_id AND e.event_type = 'registered' AND a.entity_id = d.device_id AND e.site_id = d.site_id);
INSERT @r VALUES (CASE WHEN @n = 16 THEN 'PASS' ELSE 'FAIL' END, N'seed: every dev device has exactly one audit row and one linked registered event', N'devices fully linked = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.users
 WHERE data_source NOT IN ('dev_seed', 'app')
    OR (nrp = N'DEV-SEED-ACTOR' AND (status <> 'inactive' OR password_hash <> N'!DEV_SEED_NO_LOGIN!'));
INSERT @r VALUES (CASE WHEN @n = 0 AND EXISTS (SELECT 1 FROM dbo.users WHERE nrp = N'DEV-SEED-ACTOR') THEN 'PASS' ELSE 'FAIL' END, N'seed: the dev seed actor is inactive with a placeholder hash that can never authenticate (other accounts are dev logins from seed-test-users)', N'violations = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.activities a WHERE NOT EXISTS (SELECT 1 FROM dbo.activity_devices ad WHERE ad.activity_id = a.activity_id);
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'data: every transaction has at least one device snapshot row', N'activities without a snapshot = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.activities a
 WHERE LEFT(a.form_number, 4) <> CASE a.activity_type WHEN 'installation' THEN 'INS-' WHEN 'replacement' THEN 'REP-' WHEN 'removal' THEN 'REM-' ELSE 'TRB-' END
   AND a.form_number NOT LIKE 'TST-%';
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'data: form numbers carry the prefix of their transaction type', N'mismatches = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.devices d WHERE d.status_id = 1 AND d.current_unit_id IS NULL;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END, N'data: no In Use device lacks a Unit (also enforced by CHECK)', N'violations = ' + CAST(@n AS NVARCHAR(10)));
SELECT @n = COUNT(*) FROM dbo.sites WHERE time_zone_id = 'Asia/Makassar';
INSERT @r VALUES (CASE WHEN @n = 5 THEN 'PASS' ELSE 'FAIL' END, N'seed: 5 dev Sites with the unverified placeholder time zone', N'found ' + CAST(@n AS NVARCHAR(10)));

/* ---------------------------------------------------------------------------
   3. BEHAVIOR (one transaction, rolled back) and 4. PERMISSIONS (as mh02_app)
   ------------------------------------------------------------------------- */
DECLARE @tests TABLE (id INT IDENTITY(1,1), ctx VARCHAR(6), name NVARCHAR(200), expected INT, sqltext NVARCHAR(MAX));

/* ---- devices ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'devices: In Use without a Unit is rejected (CHECK)', 547,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source) VALUES (~T-X1~, ~T-SN1~, 1, {SITE}, ~dev_seed~)'),
('admin', N'devices: a stock status with a Unit is rejected (CHECK)', 547,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, current_unit_id, data_source) VALUES (~T-X2~, ~T-SN2~, 2, {SITE}, {UNIT}, ~dev_seed~)'),
('admin', N'devices: duplicate device_code is rejected', 2627,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source) VALUES (~D001~, ~T-SN3~, 2, {SITE}, ~dev_seed~)'),
('admin', N'devices: duplicate serial among non-deleted devices is rejected (filtered unique index)', 2601,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source) VALUES (~T-X4~, ~SN001~, 2, {SITE}, ~dev_seed~)'),
('admin', N'devices: an archived device does not block reuse of its serial number', 0,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source, is_deleted) VALUES (~T-X5~, ~SN001~, 2, {SITE}, ~dev_seed~, 1)'),
('admin', N'devices: invalid health_check_status is rejected', 547,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source, health_check_status) VALUES (~T-X6~, ~T-SN6~, 2, {SITE}, ~dev_seed~, ~bogus~)'),
('admin', N'devices: invalid data_source is rejected', 547,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source) VALUES (~T-X7~, ~T-SN7~, 2, {SITE}, ~bogus~)'),
('admin', N'devices: unknown status id is rejected (FK)', 547,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, data_source) VALUES (~T-X8~, ~T-SN8~, 99, {SITE}, ~dev_seed~)'),
('admin', N'devices: In Use with a free Unit is accepted', 0,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, current_unit_id, data_source) VALUES (~T-X9~, ~T-SN9~, 1, {SITE}, {UNIT}, ~dev_seed~)'),
('admin', N'devices: a second device on the same Unit is rejected (one device per unit)', 2601,
 N'INSERT dbo.devices (device_code, serial_number, status_id, site_id, current_unit_id, data_source) VALUES (~T-X10~, ~T-SN10~, 1, {SITE}, {UNIT}, ~dev_seed~)');

/* ---- fleet units / users / sessions ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'fleet_units: duplicate unit_no is rejected (global uniqueness)', 2627,
 N'INSERT dbo.fleet_units (unit_no, equipment_type_id, site_id, data_source) VALUES (~DT-101~, 1, {SITE}, ~dev_seed~)'),
('admin', N'users: invalid status is rejected', 547,
 N'INSERT dbo.users (nrp, name, role_id, password_hash, status, data_source) VALUES (~V-1~, N~v~, (SELECT role_id FROM dbo.roles WHERE role_code = N~user~), N~x~, ~bogus~, ~dev_seed~)'),
('admin', N'users: duplicate nrp is rejected', 2627,
 N'INSERT dbo.users (nrp, name, role_id, password_hash, status, data_source) VALUES (~DEV-SEED-ACTOR~, N~v~, (SELECT role_id FROM dbo.roles WHERE role_code = N~user~), N~x~, ~active~, ~dev_seed~)'),
('admin', N'users: unknown role is rejected (FK)', 547,
 N'INSERT dbo.users (nrp, name, role_id, password_hash, status, data_source) VALUES (~V-2~, N~v~, 999, N~x~, ~active~, ~dev_seed~)'),
('admin', N'users: password_hash is required (NOT NULL)', 515,
 N'INSERT dbo.users (nrp, name, role_id, password_hash, status, data_source) VALUES (~V-3~, N~v~, (SELECT role_id FROM dbo.roles WHERE role_code = N~user~), NULL, ~active~, ~dev_seed~)'),
('admin', N'auth_sessions: a valid session is accepted', 0,
 N'INSERT dbo.auth_sessions (token_hash, user_id, expires_at) VALUES (REPLICATE(~c~, 64), {ACTOR}, ~2030-01-01~)'),
('admin', N'auth_sessions: duplicate token_hash is rejected', 2627,
 N'INSERT dbo.auth_sessions (token_hash, user_id, expires_at) VALUES (REPLICATE(~c~, 64), {ACTOR}, ~2030-01-01~)'),
('admin', N'auth_sessions: unknown user is rejected (FK)', 547,
 N'INSERT dbo.auth_sessions (token_hash, user_id, expires_at) VALUES (REPLICATE(~d~, 64), NEWID(), ~2030-01-01~)');

/* ---- activities ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'activities: a valid installation header is accepted', 0,
 N'INSERT dbo.activities (activity_type, form_number, site_id, unit_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-000001~, {SITE}, {UNIT}, ~2026-01-01T00:00:00~, ~2026-01-01T01:30:00~, ~Asia/Makassar~, 480, 480, 90)'),
('admin', N'activities: finished before started is rejected', 547,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-000002~, {SITE}, ~2026-01-01T02:00:00~, ~2026-01-01T01:00:00~, ~Asia/Makassar~, 480, 480, -60)'),
('admin', N'activities: duration that differs from DATEDIFF is rejected', 547,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-000003~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:30:00~, ~Asia/Makassar~, 480, 480, 91)'),
('admin', N'activities: UTC offset out of range is rejected', 547,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-000004~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:30:00~, ~Asia/Makassar~, 900, 480, 90)'),
('admin', N'activities: invalid activity_type is rejected', 547,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~bogus~, ~TST-000005~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:30:00~, ~Asia/Makassar~, 480, 480, 90)'),
('admin', N'activities: duplicate form_number is rejected', 2627,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~removal~, ~TST-000001~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:30:00~, ~Asia/Makassar~, 480, 480, 90)'),
('admin', N'activities: editing a non-protected column is allowed', 0,
 N'UPDATE dbo.activities SET remarks = N~ok~ WHERE form_number = ~TST-000001~');

/* ---- activity_devices and detail tables ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'activity_devices: a valid snapshot row is accepted', 0,
 N'INSERT dbo.activity_devices (activity_id, device_id, role, before_status_id, after_status_id) VALUES ({ACT1}, {DEV1}, ~subject~, 2, 1)'),
('admin', N'activity_devices: duplicate (activity, device) is rejected', 2627,
 N'INSERT dbo.activity_devices (activity_id, device_id, role, before_status_id, after_status_id) VALUES ({ACT1}, {DEV1}, ~subject~, 2, 1)'),
('admin', N'activity_devices: invalid role is rejected', 547,
 N'INSERT dbo.activity_devices (activity_id, device_id, role, before_status_id, after_status_id) VALUES ({ACT1}, {DEV2}, ~bogus~, 2, 1)'),
('admin', N'activity_devices: unknown status is rejected (FK)', 547,
 N'INSERT dbo.activity_devices (activity_id, device_id, role, before_status_id, after_status_id) VALUES ({ACT1}, {DEV2}, ~old~, 99, 1)'),
('admin', N'installation_details: accepted, and only one per activity (PK = FK)', 0,
 N'INSERT dbo.installation_details (activity_id) VALUES ({ACT1})'),
('admin', N'installation_details: second row for the same activity is rejected', 2627,
 N'INSERT dbo.installation_details (activity_id) VALUES ({ACT1})'),
('admin', N'removal_details: final status In Use (1) is rejected (must be 2/3/4)', 547,
 N'INSERT dbo.removal_details (activity_id, reason, final_status_id) VALUES ({ACT1}, N~r~, 1)'),
('admin', N'removal_details: final status 3 (In Stock (Repair)) is accepted', 0,
 N'INSERT dbo.removal_details (activity_id, reason, final_status_id) VALUES ({ACT1}, N~r~, 3)'),
('admin', N'replacement_details: old final status 1 is rejected (must be 2/3/4)', 547,
 N'INSERT dbo.replacement_details (activity_id, old_final_status_id) VALUES ({ACT1}, 1)'),
('admin', N'troubleshoot_details: unknown component type is rejected', 547,
 N'INSERT dbo.troubleshoot_details (activity_id, component_type, issue, action_taken) VALUES ({ACT1}, ~bogus~, N~i~, N~a~)'),
('admin', N'troubleshoot_details: unknown health result is rejected', 547,
 N'INSERT dbo.troubleshoot_details (activity_id, component_type, issue, action_taken, health_check_result) VALUES ({ACT1}, ~Camera~, N~i~, N~a~, ~bogus~)'),
('admin', N'troubleshoot_details: a valid row is accepted', 0,
 N'INSERT dbo.troubleshoot_details (activity_id, component_type, issue, action_taken, health_check_result) VALUES ({ACT1}, ~Camera~, N~i~, N~a~, ~Pass~)');

/* ---- transaction_photos ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'transaction_photos: a valid metadata row is accepted', 0,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_a~, N~photos/2026/01/a.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: a second photo in the same slot is rejected', 2627,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_a~, N~photos/2026/01/b.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: an absolute path (/...) is rejected', 547,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_b~, N~/etc/x.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: a drive-letter path is rejected', 547,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_c~, N~C:\x.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: a path with .. is rejected', 547,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_d~, N~photos/../x.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: a blank path is rejected', 547,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_e~, N~   ~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))'),
('admin', N'transaction_photos: sha256 is required (NOT NULL)', 515,
 N'INSERT dbo.transaction_photos (photo_id, activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES (NEWID(), {ACT1}, ~slot_f~, N~photos/2026/01/f.jpg~, ~image/jpeg~, 1000, NULL)'),
('admin', N'transaction_photos: photo_id has no default (INSERT without it fails)', 515,
 N'INSERT dbo.transaction_photos (activity_id, slot_key, storage_path, mime_type, size_bytes, sha256) VALUES ({ACT1}, ~slot_g~, N~photos/2026/01/g.jpg~, ~image/jpeg~, 1000, REPLICATE(~b~, 64))');

/* ---- audit_log ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'audit_log: a valid override audit row is accepted', 0,
 N'INSERT dbo.audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation, old_values, new_values, change_group_id, action, reason) VALUES ({ACTOR}, N~v~, {SITE}, ~device~, ~VERIFY-A1~, {DEV1}, ~UPDATE~, N~{"s":2}~, N~{"s":1}~, NEWID(), ~device_override~, N~verification~)'),
('admin', N'audit_log: three more valid rows for the device-event tests', 0,
 N'INSERT dbo.audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id, operation, old_values, new_values, change_group_id, action) SELECT {ACTOR}, N~v~, {SITE}, ~device~, v.rid, {DEV1}, ~UPDATE~, NULL, N~{"x":1}~, NEWID(), ~device_update~ FROM (VALUES (~VERIFY-A2~), (~VERIFY-A3~), (~VERIFY-A4~)) AS v (rid)'),
('admin', N'audit_log: an unknown action is rejected', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B1~, {DEV1}, ~UPDATE~, NEWID(), ~bogus~)'),
('admin', N'audit_log: an override without a reason is rejected', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B2~, {DEV1}, ~UPDATE~, NEWID(), ~device_override~)'),
('admin', N'audit_log: an override with a blank reason is rejected', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action, reason) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B3~, {DEV1}, ~UPDATE~, NEWID(), ~device_override~, N~   ~)'),
('admin', N'audit_log: invalid JSON in new_values is rejected (ISJSON)', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, new_values, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B4~, {DEV1}, ~UPDATE~, N~not json~, NEWID(), ~device_update~)'),
('admin', N'audit_log: an unknown table_name is rejected', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~bogus~, ~VERIFY-B5~, {DEV1}, ~UPDATE~, NEWID(), ~device_update~)'),
('admin', N'audit_log: an unknown operation is rejected', 547,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B6~, {DEV1}, ~MERGE~, NEWID(), ~device_update~)'),
('admin', N'audit_log: entity_id is required (NOT NULL)', 515,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-B7~, NULL, ~UPDATE~, NEWID(), ~device_update~)');

/* ---- device_events ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'device_events: a valid device_override event is accepted', 0,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary, reason, before_status_id, after_status_id, before_unit_id, after_unit_id) VALUES ({DEV1}, ~device_override~, {ACTOR}, N~v~, {SITE}, {AUD1}, N~s~, N~verification~, 2, 1, NULL, {UNIT})'),
('admin', N'device_events: one audit row cannot back two events (UNIQUE audit_id)', 2627,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id) VALUES ({DEV2}, ~details_updated~, {ACTOR}, {SITE}, {AUD1})'),
('admin', N'device_events: a second registered event for a device is rejected', 2601,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id) VALUES ({DEV1}, ~registered~, {ACTOR}, {SITE}, {AUD2})'),
('admin', N'device_events: an unknown event_type is rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id) VALUES ({DEV1}, ~bogus~, {ACTOR}, {SITE}, {AUD2})'),
('admin', N'device_events: an override without reason and statuses is rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id) VALUES ({DEV1}, ~device_override~, {ACTOR}, {SITE}, {AUD2})'),
('admin', N'device_events: override fields on a non-override event are rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id, before_status_id) VALUES ({DEV1}, ~details_updated~, {ACTOR}, {SITE}, {AUD2}, 2)'),
('admin', N'device_events: transaction_deleted without its source fields is rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id) VALUES ({DEV1}, ~transaction_deleted~, {ACTOR}, {SITE}, {AUD2})'),
('admin', N'device_events: source fields on a non-deletion event are rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id, source_form_number) VALUES ({DEV1}, ~details_updated~, {ACTOR}, {SITE}, {AUD2}, N~X~)'),
('admin', N'device_events: transaction_deleted with all six source fields is accepted', 0,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id, source_activity_id, source_activity_type, source_form_number, source_role, source_started_at_local, source_time_zone_id) VALUES ({DEV1}, ~transaction_deleted~, {ACTOR}, {SITE}, {AUD3}, ~00000000-0000-0000-0000-000000000001~, ~installation~, N~INS-X~, ~subject~, ~2026-01-01T08:00:00~, ~Asia/Makassar~)'),
('admin', N'device_events: the same deleted transaction for the same device cannot be recorded twice', 2601,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id, source_activity_id, source_activity_type, source_form_number, source_role, source_started_at_local, source_time_zone_id) VALUES ({DEV1}, ~transaction_deleted~, {ACTOR}, {SITE}, {AUD4}, ~00000000-0000-0000-0000-000000000001~, ~installation~, N~INS-X~, ~subject~, ~2026-01-01T08:00:00~, ~Asia/Makassar~)'),
('admin', N'device_events: an invalid source_role is rejected', 547,
 N'INSERT dbo.device_events (device_id, event_type, actor_user_id, site_id, audit_id, source_activity_id, source_activity_type, source_form_number, source_role, source_started_at_local, source_time_zone_id) VALUES ({DEV2}, ~transaction_deleted~, {ACTOR}, {SITE}, {AUD4}, NEWID(), ~installation~, N~INS-Y~, ~bogus~, ~2026-01-01T08:00:00~, ~Asia/Makassar~)');

/* ---- tests that DOOM their transaction (a THROW inside a trigger makes the transaction
        uncommittable), so each one runs in its OWN transaction, before the main one.
        They use committed seed rows, or build their own fixture inside that transaction. ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('own', N'activities: changing site_id is blocked by the trigger (and rolls the transaction back)', 50010,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-OWN-1~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:00:00~, ~Asia/Makassar~, 480, 480, 60); UPDATE dbo.activities SET site_id = {SITE2} WHERE form_number = ~TST-OWN-1~'),
('own', N'activities: changing time_zone_id is blocked by the trigger', 50010,
 N'INSERT dbo.activities (activity_type, form_number, site_id, started_at, finished_at, time_zone_id, start_utc_offset_minutes, finish_utc_offset_minutes, duration_minutes) VALUES (~installation~, ~TST-OWN-2~, {SITE}, ~2026-01-01T00:00:00~, ~2026-01-01T01:00:00~, ~Asia/Makassar~, 480, 480, 60); UPDATE dbo.activities SET time_zone_id = ~Asia/Jakarta~ WHERE form_number = ~TST-OWN-2~'),
('own', N'audit_log: UPDATE is blocked (append-only trigger), even for a sysadmin', 50020,
 N'UPDATE dbo.audit_log SET reason = N~x~ WHERE audit_id = (SELECT MIN(audit_id) FROM dbo.audit_log)'),
('own', N'audit_log: DELETE is blocked (append-only trigger), even for a sysadmin', 50021,
 N'DELETE FROM dbo.audit_log WHERE audit_id = (SELECT MIN(audit_id) FROM dbo.audit_log)'),
('own', N'device_events: UPDATE is blocked (append-only trigger), even for a sysadmin', 50030,
 N'UPDATE dbo.device_events SET summary = N~x~ WHERE event_id = (SELECT TOP (1) event_id FROM dbo.device_events)'),
('own', N'device_events: DELETE is blocked (append-only trigger), even for a sysadmin', 50031,
 N'DELETE FROM dbo.device_events WHERE event_id = (SELECT TOP (1) event_id FROM dbo.device_events)');

/* ---- idempotency_keys ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('admin', N'idempotency_keys: a transaction key claimed with NULL activity/form is accepted', 0,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash) VALUES ({ACTOR}, ~verify-key-0000000001~, ~installation~, REPLICATE(~a~, 64))'),
('admin', N'idempotency_keys: the same key for the same user is rejected (PK)', 2627,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash) VALUES ({ACTOR}, ~verify-key-0000000001~, ~installation~, REPLICATE(~a~, 64))'),
('admin', N'idempotency_keys: populating activity_id and form_number together is accepted', 0,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id, form_number) VALUES ({ACTOR}, ~verify-key-0000000002~, ~removal~, REPLICATE(~a~, 64), NEWID(), N~REM-1~)'),
('admin', N'idempotency_keys: activity_id without form_number is rejected (CHECK)', 547,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id) VALUES ({ACTOR}, ~verify-key-0000000003~, ~removal~, REPLICATE(~a~, 64), NEWID())'),
('admin', N'idempotency_keys: a transaction key with device_id is rejected (CHECK)', 547,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, device_id) VALUES ({ACTOR}, ~verify-key-0000000004~, ~installation~, REPLICATE(~a~, 64), {DEV1})'),
('admin', N'idempotency_keys: a device key claimed with NULL device_id is accepted', 0,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash) VALUES ({ACTOR}, ~verify-key-0000000005~, ~device~, REPLICATE(~a~, 64))'),
('admin', N'idempotency_keys: a device key populated with device_id is accepted', 0,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, device_id) VALUES ({ACTOR}, ~verify-key-0000000006~, ~device~, REPLICATE(~a~, 64), {DEV1})'),
('admin', N'idempotency_keys: a device key with activity_id is rejected (CHECK)', 547,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, activity_id, form_number) VALUES ({ACTOR}, ~verify-key-0000000007~, ~device~, REPLICATE(~a~, 64), NEWID(), N~X~)'),
('admin', N'idempotency_keys: a device key pointing to an unknown device is rejected (FK)', 547,
 N'INSERT dbo.idempotency_keys (user_id, idempotency_key, activity_type, request_hash, device_id) VALUES ({ACTOR}, ~verify-key-0000000008~, ~device~, REPLICATE(~a~, 64), NEWID())'),
('admin', N'form_sequences: (type, month) is a primary key', 0,
 N'INSERT dbo.form_sequences (activity_type, year_month, last_number) VALUES (~installation~, ~209901~, 1)'),
('admin', N'form_sequences: a duplicate (type, month) is rejected', 2627,
 N'INSERT dbo.form_sequences (activity_type, year_month, last_number) VALUES (~installation~, ~209901~, 2)');

/* ---- permissions: statements run AS the application user mh02_app ---- */
INSERT @tests (ctx, name, expected, sqltext) VALUES
('app', N'permissions: mh02_app can read business tables', 0,
 N'SELECT TOP (1) device_id FROM dbo.devices'),
('app', N'permissions: mh02_app can INSERT into audit_log', 0,
 N'INSERT dbo.audit_log (actor_user_id, site_id, table_name, record_id, entity_id, operation, change_group_id, action) VALUES ({ACTOR}, {SITE}, ~device~, ~VERIFY-P1~, {DEV1}, ~UPDATE~, NEWID(), ~device_update~)'),
('app', N'permissions: mh02_app CANNOT UPDATE audit_log', 229,
 N'UPDATE dbo.audit_log SET reason = reason WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT DELETE from audit_log', 229,
 N'DELETE FROM dbo.audit_log WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT UPDATE device_events', 229,
 N'UPDATE dbo.device_events SET summary = summary WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT DELETE from device_events', 229,
 N'DELETE FROM dbo.device_events WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT UPDATE schema_migrations', 229,
 N'UPDATE dbo.schema_migrations SET name = name WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT DELETE from schema_migrations', 229,
 N'DELETE FROM dbo.schema_migrations WHERE 1 = 0'),
('app', N'permissions: mh02_app CANNOT DELETE from idempotency_keys (keys are permanent)', 229,
 N'DELETE FROM dbo.idempotency_keys WHERE 1 = 0'),
('app', N'permissions: mh02_app can UPDATE idempotency_keys (populate before COMMIT)', 0,
 N'UPDATE dbo.idempotency_keys SET request_hash = request_hash WHERE 1 = 0'),
('app', N'permissions: mh02_app can INSERT, UPDATE and DELETE business data (db_datawriter)', 0,
 N'UPDATE dbo.devices SET notes = notes WHERE 1 = 0; DELETE FROM dbo.form_sequences WHERE 1 = 0'),
('ownapp', N'permissions: mh02_app CANNOT create tables', -1,
 N'CREATE TABLE dbo.zz_probe (a INT)'),
('ownapp', N'permissions: mh02_app CANNOT alter tables', -1,
 N'ALTER TABLE dbo.users ADD zz_probe INT'),
('ownapp', N'permissions: mh02_app CANNOT truncate audit_log', -1,
 N'TRUNCATE TABLE dbo.audit_log'),
('ownapp', N'permissions: mh02_app CANNOT disable a trigger', -1,
 N'DISABLE TRIGGER dbo.TR_audit_log_block_update ON dbo.audit_log'),
('app', N'permissions: mh02_app can call sp_getapplock inside a transaction', 0,
 N'DECLARE @rc INT; EXEC @rc = sp_getapplock @Resource = N~mh02:verify~, @LockMode = ~Exclusive~, @LockOwner = ~Transaction~, @LockTimeout = 0; IF @rc < 0 THROW 50999, N~sp_getapplock returned a negative code~, 1'),
('app', N'permissions: mh02_app is not a member of db_owner', 0,
 N'IF IS_MEMBER(N~db_owner~) <> 0 THROW 50999, N~member of db_owner~, 1'),
('app', N'permissions: mh02_app is a member of db_datareader and db_datawriter only (among fixed roles)', 0,
 N'IF IS_MEMBER(N~db_datareader~) <> 1 OR IS_MEMBER(N~db_datawriter~) <> 1 OR IS_MEMBER(N~db_ddladmin~) <> 0 OR IS_MEMBER(N~db_securityadmin~) <> 0 OR IS_MEMBER(N~db_accessadmin~) <> 0 OR IS_MEMBER(N~db_backupoperator~) <> 0 THROW 50999, N~unexpected role membership~, 1');

/* ---- run the tests inside ONE transaction that is rolled back ---- */
/* Baseline row counts BEFORE any verification write, so the rollback proof works whatever data exists. */
DECLARE @b_d INT = (SELECT COUNT(*) FROM dbo.devices), @b_a INT = (SELECT COUNT(*) FROM dbo.audit_log),
        @b_e INT = (SELECT COUNT(*) FROM dbo.device_events), @b_ac INT = (SELECT COUNT(*) FROM dbo.activities),
        @b_k INT = (SELECT COUNT(*) FROM dbo.idempotency_keys), @b_s INT = (SELECT COUNT(*) FROM dbo.auth_sessions),
        @b_fs INT = (SELECT COUNT(*) FROM dbo.form_sequences), @b_u INT = (SELECT COUNT(*) FROM dbo.users),
        @b_ph INT = (SELECT COUNT(*) FROM dbo.transaction_photos);

DECLARE @i INT = 1, @k INT = 0, @max INT, @ctx VARCHAR(6),@tname NVARCHAR(200), @expected INT, @sql NVARCHAR(MAX), @err INT, @msg NVARCHAR(200), @ok BIT;
SELECT @max = MAX(id) FROM @tests;
DECLARE @q NCHAR(1) = N'''';

/* ---- pre-pass: tests that doom their transaction, each in its own transaction ---- */
WHILE @i <= @max
BEGIN
    SELECT @ctx = ctx, @tname = name, @expected = expected, @sql = sqltext FROM @tests WHERE id = @i;
    IF @ctx IN ('own', 'ownapp')
    BEGIN
        SET @sql = REPLACE(@sql, N'~', @q);
        SET @sql = REPLACE(@sql, N'{SITE}',  N'(SELECT site_id FROM dbo.sites WHERE site_code = N''SANGATTA'')');
        SET @sql = REPLACE(@sql, N'{SITE2}', N'(SELECT site_id FROM dbo.sites WHERE site_code = N''BENGALON'')');
        SET @err = 0; SET @msg = N'';
        BEGIN TRANSACTION;
        BEGIN TRY
            IF @ctx = 'ownapp' EXECUTE AS USER = N'mh02_app';
            EXEC (@sql);
        END TRY
        BEGIN CATCH
            SET @err = ERROR_NUMBER();
            SET @msg = LEFT(ERROR_MESSAGE(), 160);
        END CATCH;
        SET @k = 0;
        WHILE USER_NAME() <> N'dbo' AND @k < 5
        BEGIN
            BEGIN TRY
                REVERT;
            END TRY
            BEGIN CATCH
            END CATCH;
            SET @k += 1;
        END;
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SET @ok = CASE WHEN @expected > 0 AND @err = @expected THEN 1
                       WHEN @expected = -1 AND @err <> 0 THEN 1
                       ELSE 0 END;
        INSERT @r (status, name, detail)
        VALUES (CASE WHEN @ok = 1 THEN 'PASS' ELSE 'FAIL' END, @tname,
                CASE WHEN @ok = 1 THEN N'rejected as expected (error ' + CAST(@err AS NVARCHAR(10)) + N'), transaction rolled back'
                     ELSE N'expected error ' + CAST(@expected AS NVARCHAR(10)) + N' but got ' + CASE WHEN @err = 0 THEN N'success' ELSE N'error ' + CAST(@err AS NVARCHAR(10)) + N': ' + @msg END END);
    END;
    SET @i += 1;
END;
SET @i = 1;

BEGIN TRANSACTION;

WHILE @i <= @max
BEGIN
    SELECT @ctx = ctx, @tname = name, @expected = expected, @sql = sqltext FROM @tests WHERE id = @i;
    IF @ctx IN ('own', 'ownapp')
    BEGIN
        SET @i += 1;
        CONTINUE;
    END;
    SET @sql = REPLACE(@sql, N'~', @q);
    SET @sql = REPLACE(@sql, N'{SITE}',  N'(SELECT site_id FROM dbo.sites WHERE site_code = N''SANGATTA'')');
    SET @sql = REPLACE(@sql, N'{SITE2}', N'(SELECT site_id FROM dbo.sites WHERE site_code = N''BENGALON'')');
    SET @sql = REPLACE(@sql, N'{UNIT}',  N'(SELECT unit_id FROM dbo.fleet_units WHERE unit_no = N''DT-101'')');
    SET @sql = REPLACE(@sql, N'{ACTOR}', N'(SELECT user_id FROM dbo.users WHERE nrp = N''DEV-SEED-ACTOR'')');
    SET @sql = REPLACE(@sql, N'{DEV1}',  N'(SELECT device_id FROM dbo.devices WHERE device_code = N''D001'')');
    SET @sql = REPLACE(@sql, N'{DEV2}',  N'(SELECT device_id FROM dbo.devices WHERE device_code = N''D002'')');
    SET @sql = REPLACE(@sql, N'{ACT1}',  N'(SELECT activity_id FROM dbo.activities WHERE form_number = N''TST-000001'')');
    SET @sql = REPLACE(@sql, N'{AUD1}',  N'(SELECT audit_id FROM dbo.audit_log WHERE record_id = N''VERIFY-A1'')');
    SET @sql = REPLACE(@sql, N'{AUD2}',  N'(SELECT audit_id FROM dbo.audit_log WHERE record_id = N''VERIFY-A2'')');
    SET @sql = REPLACE(@sql, N'{AUD3}',  N'(SELECT audit_id FROM dbo.audit_log WHERE record_id = N''VERIFY-A3'')');
    SET @sql = REPLACE(@sql, N'{AUD4}',  N'(SELECT audit_id FROM dbo.audit_log WHERE record_id = N''VERIFY-A4'')');

    SET @err = 0; SET @msg = N'';
    BEGIN TRY
        IF @ctx = 'app' EXECUTE AS USER = N'mh02_app';
        EXEC (@sql);
    END TRY
    BEGIN CATCH
        SET @err = ERROR_NUMBER();
        SET @msg = LEFT(ERROR_MESSAGE(), 160);
    END CATCH;
    IF @ctx = 'app'
    BEGIN TRY
        REVERT;
    END TRY
    BEGIN CATCH
    END CATCH;

    SET @ok = CASE WHEN @expected = 0 AND @err = 0 THEN 1
                   WHEN @expected = -1 AND @err <> 0 THEN 1
                   WHEN @expected > 0 AND @err = @expected THEN 1
                   ELSE 0 END;
    INSERT @r (status, name, detail)
    VALUES (CASE WHEN @ok = 1 THEN 'PASS' ELSE 'FAIL' END, @tname,
            CASE WHEN @ok = 1 AND @err = 0 THEN N'executed without error'
                 WHEN @ok = 1 THEN N'rejected as expected (error ' + CAST(@err AS NVARCHAR(10)) + N')'
                 ELSE N'expected ' + CASE WHEN @expected = 0 THEN N'success' WHEN @expected = -1 THEN N'an error' ELSE N'error ' + CAST(@expected AS NVARCHAR(10)) END
                      + N' but got ' + CASE WHEN @err = 0 THEN N'success' ELSE N'error ' + CAST(@err AS NVARCHAR(10)) + N': ' + @msg END END);

    IF XACT_STATE() = -1
    BEGIN
        INSERT @r VALUES ('FAIL', N'verification aborted', N'the transaction was doomed by test: ' + @tname);
        BREAK;
    END;
    SET @i += 1;
END;

/* make sure no impersonation is left active, whatever happened above */
SET @k = 0;
WHILE USER_NAME() <> N'dbo' AND @k < 5
BEGIN
    BEGIN TRY
        REVERT;
    END TRY
    BEGIN CATCH
    END CATCH;
    SET @k += 1;
END;
IF USER_NAME() <> N'dbo'
    INSERT @r VALUES ('FAIL', N'verification context', N'still impersonating ' + USER_NAME() + N' after the tests');

/* local-time computed columns and cascade deletes (still inside the transaction) */
DECLARE @loc DATETIME2(0), @fin DATETIME2(0);
SELECT @loc = started_at_local, @fin = finished_at_local FROM dbo.activities WHERE form_number = N'TST-000001';
INSERT @r VALUES (CASE WHEN @loc = '2026-01-01T08:00:00' AND @fin = '2026-01-01T09:30:00' THEN 'PASS' ELSE 'FAIL' END,
                  N'activities: persisted local times = UTC + snapshotted offset (480 min)', ISNULL(CONVERT(NVARCHAR(30), @loc, 120), N'row missing') + N' / ' + ISNULL(CONVERT(NVARCHAR(30), @fin, 120), N'row missing'));

DECLARE @before INT, @after INT;
SELECT @before = (SELECT COUNT(*) FROM dbo.activity_devices WHERE activity_id = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001'))
               + (SELECT COUNT(*) FROM dbo.installation_details WHERE activity_id = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001'))
               + (SELECT COUNT(*) FROM dbo.removal_details WHERE activity_id = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001'))
               + (SELECT COUNT(*) FROM dbo.troubleshoot_details WHERE activity_id = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001'))
               + (SELECT COUNT(*) FROM dbo.transaction_photos WHERE activity_id = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001'));
DECLARE @act UNIQUEIDENTIFIER = (SELECT activity_id FROM dbo.activities WHERE form_number = N'TST-000001');
BEGIN TRY
    DELETE FROM dbo.activities WHERE activity_id = @act;
END TRY
BEGIN CATCH
    INSERT @r VALUES ('FAIL', N'cascade: deleting an activity', ERROR_MESSAGE());
END CATCH;
SELECT @after = (SELECT COUNT(*) FROM dbo.activity_devices WHERE activity_id = @act)
              + (SELECT COUNT(*) FROM dbo.installation_details WHERE activity_id = @act)
              + (SELECT COUNT(*) FROM dbo.removal_details WHERE activity_id = @act)
              + (SELECT COUNT(*) FROM dbo.troubleshoot_details WHERE activity_id = @act)
              + (SELECT COUNT(*) FROM dbo.transaction_photos WHERE activity_id = @act);
INSERT @r VALUES (CASE WHEN @before >= 5 AND @after = 0 THEN 'PASS' ELSE 'FAIL' END,
                  N'cascade: deleting an activity removes its device snapshots, details and photo metadata (not the device events)',
                  N'child rows before = ' + CAST(@before AS NVARCHAR(10)) + N', after = ' + CAST(@after AS NVARCHAR(10)));

IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

/* ---- proof that nothing persisted, and restore the audit identity ---- */
DECLARE @d INT = (SELECT COUNT(*) FROM dbo.devices), @a INT = (SELECT COUNT(*) FROM dbo.audit_log),
        @e INT = (SELECT COUNT(*) FROM dbo.device_events), @ac INT = (SELECT COUNT(*) FROM dbo.activities),
        @keys INT = (SELECT COUNT(*) FROM dbo.idempotency_keys), @s INT = (SELECT COUNT(*) FROM dbo.auth_sessions),
        @fs INT = (SELECT COUNT(*) FROM dbo.form_sequences), @u INT = (SELECT COUNT(*) FROM dbo.users),
        @ph INT = (SELECT COUNT(*) FROM dbo.transaction_photos);
INSERT @r VALUES (CASE WHEN @d = @b_d AND @a = @b_a AND @e = @b_e AND @ac = @b_ac AND @keys = @b_k AND @s = @b_s AND @fs = @b_fs AND @u = @b_u AND @ph = @b_ph THEN 'PASS' ELSE 'FAIL' END,
                  N'rollback: all verification writes were rolled back (no test data persisted)',
                  N'devices=' + CAST(@d AS NVARCHAR(10)) + N' audit=' + CAST(@a AS NVARCHAR(10)) + N' events=' + CAST(@e AS NVARCHAR(10)) + N' activities=' + CAST(@ac AS NVARCHAR(10))
                  + N' keys=' + CAST(@keys AS NVARCHAR(10)) + N' sessions=' + CAST(@s AS NVARCHAR(10)) + N' sequences=' + CAST(@fs AS NVARCHAR(10)));

DECLARE @maxAudit BIGINT = (SELECT MAX(audit_id) FROM dbo.audit_log);
IF @maxAudit IS NOT NULL
BEGIN
    DBCC CHECKIDENT (N'dbo.audit_log', RESEED, @maxAudit) WITH NO_INFOMSGS;
    INSERT @r VALUES ('PASS', N'cleanup: audit_log identity re-seeded to the current maximum (no gaps left by verification)', N'max audit_id = ' + CAST(@maxAudit AS NVARCHAR(20)));
END;

SELECT N'RESULT', status, name, detail FROM @r ORDER BY id;
