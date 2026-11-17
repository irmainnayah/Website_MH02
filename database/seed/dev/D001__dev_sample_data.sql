/* ============================================================================
   D001__dev_sample_data.sql
   MH02 Asset Report Portal - DEVELOPMENT seed (FICTIONAL DATA ONLY)

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 11), section 8.
   Requires        : all migrations and seed/reference/R001 applied first.

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   *** DEVELOPMENT ONLY. NEVER RUN AGAINST PRODUCTION. ***
   - Every row is tagged data_source = 'dev_seed' so it can be found and retired.
   - Refuses to run if the database already holds any row that is NOT dev_seed
     (devices, fleet units or users), so it cannot be mixed into real data.
   - The runner additionally requires MH02_ENV=development and --confirm-dev-seed.
   - Idempotent: every INSERT is guarded by NOT EXISTS on a natural key.
   - Never deletes or updates existing rows.

   What it creates (all fictional or mock data taken from the project's mock files):
   - 5 Sites. Their time_zone_id is an UNVERIFIED PLACEHOLDER (Asia/Makassar for
     all); the real value per Site is a production setup decision (design P6).
   - 1 inactive, non-loginable seed actor (needed because device_events and
     audit_log reference an actor user). Its password_hash is a placeholder that
     matches no hash algorithm, so it can never authenticate.
   - Fleet units, lookup values (spm_version, area, group_leader) and 16 devices.
     Each device is registered as In Stock RFU with its audit row and its
     'registered' device event, in the same transaction, exactly as the service
     will do it.

   What it deliberately does NOT create:
   - No login accounts or passwords: test identities belong to the separate,
     reviewable authentication phase (passwords come from SEED_TEST_PASSWORD and
     are hashed by the application, never written to SQL files).
   - No installations, replacements, removals or troubleshoots, and therefore no
     In Use devices: those must be created through the backend service so that
     before/after snapshots, audit rows and events are valid. They are added
     after the backend exists.
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'D001: wrong database context. Expected db_asset_report.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'sites', N'roles', N'users', N'equipment_types', N'device_statuses',
                       N'lookup_values', N'fleet_units', N'devices', N'audit_log',
                       N'device_events')) <> 10
        THROW 50003, N'D001: required tables are missing. Apply the migrations first.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.device_statuses WHERE status_id = 2 AND code = 'in_stock_rfu')
       OR NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = N'superadmin')
       OR NOT EXISTS (SELECT 1 FROM dbo.equipment_types WHERE name = N'Dump Truck')
        THROW 50004, N'D001: reference seed (R001) has not been applied.', 1;

    IF EXISTS (SELECT 1 FROM dbo.devices WHERE data_source <> 'dev_seed')
       OR EXISTS (SELECT 1 FROM dbo.fleet_units WHERE data_source <> 'dev_seed')
       OR EXISTS (SELECT 1 FROM dbo.users WHERE data_source <> 'dev_seed')
        THROW 50005, N'D001: the database contains non-development data. Refusing to add dev seed data.', 1;

    /* ---- Sites (time zones are UNVERIFIED placeholders, design P6) ---------- */
    INSERT INTO dbo.sites (site_code, name, time_zone_id, is_operating_district)
    SELECT v.site_code, v.name, v.time_zone_id, v.is_operating_district
    FROM (VALUES
        (N'SANGATTA',       N'Sangatta',       'Asia/Makassar', CAST(1 AS BIT)),
        (N'BENGALON',       N'Bengalon',       'Asia/Makassar', CAST(1 AS BIT)),
        (N'WAHAU',          N'Wahau',          'Asia/Makassar', CAST(1 AS BIT)),
        (N'SANGATTA_UTARA', N'Sangatta Utara', 'Asia/Makassar', CAST(1 AS BIT)),
        (N'HEAD_OFFICE',    N'Head Office',    'Asia/Makassar', CAST(0 AS BIT))
    ) AS v (site_code, name, time_zone_id, is_operating_district)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.sites s WHERE s.site_code = v.site_code);

    /* ---- Seed actor: inactive, no login possible --------------------------- */
    INSERT INTO dbo.users (nrp, name, role_id, site_id, password_hash, status, data_source)
    SELECT N'DEV-SEED-ACTOR', N'Dev Seed Actor (no login)', r.role_id, NULL,
           N'!DEV_SEED_NO_LOGIN!', 'inactive', 'dev_seed'
    FROM dbo.roles r
    WHERE r.role_code = N'superadmin'
      AND NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.nrp = N'DEV-SEED-ACTOR');

    /* ---- Lookup values: spm_version (global), group_leader (global) ---------- */
    INSERT INTO dbo.lookup_values (category, code, label, site_id, sort_order, is_active)
    SELECT v.category, v.code, v.label, NULL, v.sort_order, 1
    FROM (VALUES
        ('spm_version',  N'NON_SPM', N'Non SPM',          1),
        ('spm_version',  N'V1_0_0',  N'v1.0.0',           2),
        ('spm_version',  N'V1_2_4',  N'v1.2.4 (Stable)',  3),
        ('spm_version',  N'V2_0_1',  N'v2.0.1',           4),
        ('spm_version',  N'V2_1_0',  N'v2.1.0 (Latest)',  5),
        ('group_leader', N'GL_01',   N'Agus Setiawan (GL)',    1),
        ('group_leader', N'GL_02',   N'Bambang Hermanto (GL)', 2),
        ('group_leader', N'GL_03',   N'Rudi Hartono (GL)',     3),
        ('group_leader', N'GL_04',   N'Hendra Wijaya (GL)',    4),
        ('group_leader', N'GL_05',   N'Surya Pratama (GL)',    5)
    ) AS v (category, code, label, sort_order)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.lookup_values l
                      WHERE l.category = v.category AND l.label = v.label AND l.site_id IS NULL);

    /* ---- Lookup values: area (site-scoped) ----------------------------------- */
    INSERT INTO dbo.lookup_values (category, code, label, site_id, sort_order, is_active)
    SELECT 'area', v.code, v.label, s.site_id, v.sort_order, 1
    FROM (VALUES
        (N'SANGATTA',       N'AREA_SGT_1', N'Workshop Main Pit Sangatta', 1),
        (N'SANGATTA',       N'AREA_SGT_2', N'Pit 1 North Yard',           2),
        (N'SANGATTA',       N'AREA_SGT_3', N'Pit 2 South Yard',           3),
        (N'SANGATTA',       N'AREA_SGT_4', N'Hauling Road KM 12',         4),
        (N'SANGATTA',       N'AREA_SGT_5', N'Disposal West Area',         5),
        (N'BENGALON',       N'AREA_BGL_1', N'Pit B South Workshop',       1),
        (N'BENGALON',       N'AREA_BGL_2', N'Bengalon Central Yard',      2),
        (N'BENGALON',       N'AREA_BGL_3', N'Hauling Road Bengalon KM 05', 3),
        (N'BENGALON',       N'AREA_BGL_4', N'Port Area Bengalon',         4),
        (N'WAHAU',          N'AREA_WHU_1', N'Field Bay Area Wahau',       1),
        (N'WAHAU',          N'AREA_WHU_2', N'Pit Wahau East',             2),
        (N'WAHAU',          N'AREA_WHU_3', N'Workshop Wahau KM 02',       3),
        (N'WAHAU',          N'AREA_WHU_4', N'Disposal Alpha',             4),
        (N'SANGATTA_UTARA', N'AREA_SGU_1', N'North Workshop Bay 1',       1),
        (N'SANGATTA_UTARA', N'AREA_SGU_2', N'Pit North Prima',            2),
        (N'SANGATTA_UTARA', N'AREA_SGU_3', N'Heavy Yard Sangatta Utara',  3),
        (N'SANGATTA_UTARA', N'AREA_SGU_4', N'Bay 3 Sangatta Utara',       4)
    ) AS v (site_code, code, label, sort_order)
    INNER JOIN dbo.sites s ON s.site_code = v.site_code
    WHERE NOT EXISTS (SELECT 1 FROM dbo.lookup_values l
                      WHERE l.category = 'area' AND l.label = v.label AND l.site_id = s.site_id);

    /* ---- Fleet units (fictional; EGI values are dummy placeholders) ----------- */
    INSERT INTO dbo.fleet_units (unit_no, equipment_type_id, egi, is_egi_confirmed, site_id, is_active, data_source)
    SELECT v.unit_no, et.equipment_type_id, v.egi, 0, s.site_id, 1, 'dev_seed'
    FROM (VALUES
        (N'DT-101', N'Dump Truck',  N'DUMMY-EGI-DT-101', N'SANGATTA'),
        (N'DT-102', N'Dump Truck',  N'DUMMY-EGI-DT-102', N'SANGATTA'),
        (N'WT-101', N'Water Truck', N'DUMMY-EGI-WT-101', N'SANGATTA'),
        (N'LD-101', N'Loader',      N'DUMMY-EGI-LD-101', N'SANGATTA'),
        (N'DT-201', N'Dump Truck',  N'DUMMY-EGI-DT-201', N'BENGALON'),
        (N'FT-201', N'Fuel Truck',  N'DUMMY-EGI-FT-201', N'BENGALON'),
        (N'LD-201', N'Loader',      N'DUMMY-EGI-LD-201', N'BENGALON'),
        (N'DT-301', N'Dump Truck',  N'DUMMY-EGI-DT-301', N'WAHAU'),
        (N'WT-301', N'Water Truck', N'DUMMY-EGI-WT-301', N'WAHAU'),
        (N'DT-401', N'Dump Truck',  N'DUMMY-EGI-DT-401', N'SANGATTA_UTARA'),
        (N'FT-401', N'Fuel Truck',  N'DUMMY-EGI-FT-401', N'SANGATTA_UTARA'),
        (N'OT-401', N'Others',      N'DUMMY-EGI-OT-401', N'SANGATTA_UTARA')
    ) AS v (unit_no, equipment_type, egi, site_code)
    INNER JOIN dbo.equipment_types et ON et.name = v.equipment_type
    INNER JOIN dbo.sites s ON s.site_code = v.site_code
    WHERE NOT EXISTS (SELECT 1 FROM dbo.fleet_units f WHERE f.unit_no = v.unit_no);

    /* ---- Devices: registered as In Stock RFU (status_id 2) -------------------- */
    INSERT INTO dbo.devices (device_code, serial_number, status_id, site_id, current_location_site_id,
                             health_check_status, data_source, created_by)
    SELECT v.device_code, v.serial_number, 2, s.site_id, s.site_id,
           'not_checked', 'dev_seed', a.user_id
    FROM (VALUES
        (N'D001', N'SN001', N'SANGATTA'),
        (N'D002', N'SN002', N'SANGATTA'),
        (N'D003', N'SN003', N'SANGATTA'),
        (N'D004', N'SN004', N'SANGATTA'),
        (N'D005', N'SN005', N'SANGATTA'),
        (N'D006', N'SN006', N'BENGALON'),
        (N'D007', N'SN007', N'BENGALON'),
        (N'D008', N'SN008', N'BENGALON'),
        (N'D009', N'SN009', N'BENGALON'),
        (N'D010', N'SN010', N'WAHAU'),
        (N'D011', N'SN011', N'WAHAU'),
        (N'D012', N'SN012', N'WAHAU'),
        (N'D013', N'SN013', N'WAHAU'),
        (N'D014', N'SN014', N'SANGATTA_UTARA'),
        (N'D015', N'SN015', N'SANGATTA_UTARA'),
        (N'D016', N'SN016', N'SANGATTA_UTARA')
    ) AS v (device_code, serial_number, site_code)
    INNER JOIN dbo.sites s ON s.site_code = v.site_code
    CROSS JOIN (SELECT user_id FROM dbo.users WHERE nrp = N'DEV-SEED-ACTOR') AS a
    WHERE NOT EXISTS (SELECT 1 FROM dbo.devices d WHERE d.device_code = v.device_code);

    /* ---- One audit row per dev device (action device_register) ---------------- */
    INSERT INTO dbo.audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id,
                               operation, old_values, new_values, change_group_id, action)
    SELECT a.user_id, a.name, d.site_id, 'device', d.device_code, d.device_id,
           'INSERT', NULL,
           (SELECT d.device_code AS [device_code], d.serial_number AS [serial_number],
                   N'in_stock_rfu' AS [status]
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           NEWID(), 'device_register'
    FROM dbo.devices d
    CROSS JOIN (SELECT user_id, name FROM dbo.users WHERE nrp = N'DEV-SEED-ACTOR') AS a
    WHERE d.data_source = 'dev_seed'
      AND NOT EXISTS (SELECT 1 FROM dbo.audit_log l
                      WHERE l.entity_id = d.device_id AND l.action = 'device_register');

    /* ---- One 'registered' event per dev device, linked to its audit row -------- */
    INSERT INTO dbo.device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary)
    SELECT d.device_id, 'registered', a.user_id, a.name, d.site_id, l.audit_id,
           N'Registered as In Stock RFU (dev seed)'
    FROM dbo.devices d
    INNER JOIN dbo.audit_log l ON l.entity_id = d.device_id AND l.action = 'device_register'
    CROSS JOIN (SELECT user_id, name FROM dbo.users WHERE nrp = N'DEV-SEED-ACTOR') AS a
    WHERE d.data_source = 'dev_seed'
      AND NOT EXISTS (SELECT 1 FROM dbo.device_events e
                      WHERE e.device_id = d.device_id AND e.event_type = 'registered');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
