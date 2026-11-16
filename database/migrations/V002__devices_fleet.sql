/* ============================================================================
   V002__devices_fleet.sql
   MH02 Asset Report Portal - Fleet units and Master Device

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), sections 3.7-3.8.
   Tables created  : fleet_units, devices
   Depends on V001 : equipment_types, sites, device_statuses, import_batches
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows.
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if a target table already exists or a V001 table
     it depends on is missing.
   - Does NOT insert its own row into schema_migrations (the runner does).
   - Contains no GRANT/DENY.
   - No GO separators (single batch for the Node.js `mssql` driver).

   Pending business confirmations that affect this file (design section 10.1):
   - P1: unit_no is UNIQUE globally (change to UNIQUE (site_id, unit_no) if
         uniqueness turns out to be per Site).
   - P2: one device per unit is enforced by the filtered unique index
         UX_devices_current_unit_id (drop it if a unit may hold several devices).
   ============================================================================ */

/* Required session options for creating and later writing to filtered indexes. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V002: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'fleet_units', N'devices')
    )
        THROW 50002, N'V002: fleet_units or devices already exists. Nothing was changed.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'equipment_types', N'sites', N'device_statuses', N'import_batches')) <> 4
        THROW 50003, N'V002: required V001 tables are missing. Apply V001 first.', 1;

    /* ---- 3.7 fleet_units -------------------------------------------------- */
    CREATE TABLE dbo.fleet_units (
        unit_id            UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_fleet_units_unit_id DEFAULT (NEWSEQUENTIALID()),
        unit_no            NVARCHAR(30)     NOT NULL,   -- unique globally (P1 pending)
        equipment_type_id  INT              NOT NULL,
        egi                NVARCHAR(60)     NULL,       -- model code
        is_egi_confirmed   BIT              NOT NULL
            CONSTRAINT DF_fleet_units_is_egi_confirmed DEFAULT (0),
        site_id            INT              NOT NULL,
        is_active          BIT              NOT NULL
            CONSTRAINT DF_fleet_units_is_active DEFAULT (1),
        data_source        VARCHAR(20)      NOT NULL,   -- 'dev_seed' / 'import' / 'manual'
        import_batch_id    UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_fleet_units PRIMARY KEY (unit_id),
        CONSTRAINT UQ_fleet_units_unit_no UNIQUE (unit_no),
        CONSTRAINT FK_fleet_units_equipment_types
            FOREIGN KEY (equipment_type_id) REFERENCES dbo.equipment_types (equipment_type_id),
        CONSTRAINT FK_fleet_units_sites
            FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT FK_fleet_units_import_batches
            FOREIGN KEY (import_batch_id) REFERENCES dbo.import_batches (batch_id),
        CONSTRAINT CK_fleet_units_data_source
            CHECK (data_source IN ('dev_seed', 'import', 'manual'))
    );

    /* ---- 3.8 devices (Master Device) -------------------------------------- */
    CREATE TABLE dbo.devices (
        device_id                UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_devices_device_id DEFAULT (NEWSEQUENTIALID()),  -- internal key, never a business key
        device_code              NVARCHAR(40)     NOT NULL,   -- business identifier (e.g. D001)
        serial_number            NVARCHAR(80)     NOT NULL,
        status_id                INT              NOT NULL,
        site_id                  INT              NOT NULL,   -- ownership / allocation Site; the only column used for access control
        current_location_site_id INT              NULL,       -- informational physical location; never grants access
        current_unit_id          UNIQUEIDENTIFIER NULL,       -- set only while in_use
        health_check_status      VARCHAR(15)      NOT NULL
            CONSTRAINT DF_devices_health_check_status DEFAULT ('not_checked'),
        last_maintenance_date    DATE             NULL,
        notes                    NVARCHAR(500)    NULL,
        data_source              VARCHAR(20)      NOT NULL,   -- 'dev_seed' / 'import' / 'manual'
        import_batch_id          UNIQUEIDENTIFIER NULL,
        is_deleted               BIT              NOT NULL
            CONSTRAINT DF_devices_is_deleted DEFAULT (0),     -- soft delete
        deleted_at               DATETIME2(0)     NULL,
        deleted_by               UNIQUEIDENTIFIER NULL,
        row_version              ROWVERSION       NOT NULL,   -- optimistic concurrency
        created_at               DATETIME2(0)     NULL
            CONSTRAINT DF_devices_created_at DEFAULT (SYSUTCDATETIME()),
        created_by               UNIQUEIDENTIFIER NULL,
        updated_at               DATETIME2(0)     NULL,
        updated_by               UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_devices PRIMARY KEY (device_id),
        CONSTRAINT UQ_devices_device_code UNIQUE (device_code),
        CONSTRAINT FK_devices_device_statuses
            FOREIGN KEY (status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT FK_devices_sites
            FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT FK_devices_current_location_sites
            FOREIGN KEY (current_location_site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT FK_devices_fleet_units
            FOREIGN KEY (current_unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT FK_devices_import_batches
            FOREIGN KEY (import_batch_id) REFERENCES dbo.import_batches (batch_id),
        CONSTRAINT CK_devices_health_check_status
            CHECK (health_check_status IN ('complete', 'incomplete', 'not_checked')),
        CONSTRAINT CK_devices_data_source
            CHECK (data_source IN ('dev_seed', 'import', 'manual')),
        /* In Use (status_id = 1) <=> the device has a unit. */
        CONSTRAINT CK_devices_in_use_has_unit
            CHECK ((status_id = 1 AND current_unit_id IS NOT NULL)
                OR (status_id <> 1 AND current_unit_id IS NULL))
    );

    /* serial_number is unique among non-deleted devices (filtered unique index). */
    CREATE UNIQUE NONCLUSTERED INDEX UX_devices_serial_number
        ON dbo.devices (serial_number)
        WHERE is_deleted = 0;

    /* One device per unit (P2 pending): filtered unique index. */
    CREATE UNIQUE NONCLUSTERED INDEX UX_devices_current_unit_id
        ON dbo.devices (current_unit_id)
        WHERE current_unit_id IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
