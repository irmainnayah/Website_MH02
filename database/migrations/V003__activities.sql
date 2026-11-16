/* ============================================================================
   V003__activities.sql
   MH02 Asset Report Portal - Activities (transaction headers), device links,
   per-type detail tables, form-number sequences and idempotency keys

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), sections 3.9,
                     3.10, 3.11, 3.14, 3.19 and 4.
   Tables created  : activities, activity_devices, installation_details,
                     replacement_details, removal_details, troubleshoot_details,
                     form_sequences, idempotency_keys
   Also creates    : trigger TR_activities_site_zone_immutable
   Depends on      : V001 (sites, users, device_statuses)
                     V002 (fleet_units, devices)
   Not in V003     : transaction_photos, audit_log, device_events (later files)
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows.
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if a target table already exists or a required
     table from V001/V002 is missing.
   - Does NOT insert its own row into schema_migrations (the runner does).
   - Contains no GRANT/DENY (the application login does not exist yet).
   - No GO separators (single batch for the Node.js `mssql` driver). Because
     CREATE TRIGGER must be the first statement of a batch, the trigger is
     created through EXEC (dynamic SQL), which works inside this transaction.

   Notes:
   - activities has NO transaction status column.
   - idempotency_keys is permanent: no expiry column, no purge.
   - idempotency_keys.activity_id has deliberately NO foreign key.
   - The SET options below are required to create the index on the persisted
     computed column and, later, for any session that writes to activities.
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V003: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'activities', N'activity_devices', N'installation_details',
                       N'replacement_details', N'removal_details',
                       N'troubleshoot_details', N'form_sequences',
                       N'idempotency_keys')
    )
        THROW 50002, N'V003: one or more target tables already exist. Nothing was changed.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'sites', N'users', N'device_statuses',
                       N'fleet_units', N'devices')) <> 5
        THROW 50003, N'V003: required V001/V002 tables are missing. Apply V001 and V002 first.', 1;

    /* ---- 3.9 activities (header; Activity Log source) ---------------------- */
    CREATE TABLE dbo.activities (
        activity_id               UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_activities_activity_id DEFAULT (NEWSEQUENTIALID()),
        activity_type             VARCHAR(15)      NOT NULL,
        form_number               NVARCHAR(30)     NOT NULL,   -- e.g. INS-202610-001
        site_id                   INT              NOT NULL,   -- from the actor's Site (user) or the validated Super Admin selection
        unit_id                   UNIQUEIDENTIFIER NULL,
        started_at                DATETIME2(0)     NOT NULL,   -- UTC instant
        finished_at               DATETIME2(0)     NOT NULL,   -- UTC instant
        time_zone_id              VARCHAR(50)      NOT NULL,   -- snapshot of sites.time_zone_id at creation
        start_utc_offset_minutes  SMALLINT         NOT NULL,   -- snapshot at started_at, derived by the backend
        finish_utc_offset_minutes SMALLINT         NOT NULL,   -- snapshot at finished_at, derived by the backend
        started_at_local  AS DATEADD(MINUTE, start_utc_offset_minutes,  started_at)  PERSISTED NOT NULL,
        finished_at_local AS DATEADD(MINUTE, finish_utc_offset_minutes, finished_at) PERSISTED NOT NULL,
        duration_minutes          INT              NOT NULL,   -- computed server-side
        shift                     VARCHAR(10)      NULL,       -- 'Shift 1' / 'Shift 2'; not a transaction status
        technician_user_id        UNIQUEIDENTIFIER NULL,       -- creator (P3 pending)
        technician_name           NVARCHAR(120)    NULL,       -- snapshot at creation
        technician_nrp            NVARCHAR(30)     NULL,       -- snapshot at creation
        group_leader              NVARCHAR(120)    NULL,       -- dropdown label only; not an approval entity
        remarks                   NVARCHAR(1000)   NULL,
        created_at                DATETIME2(0)     NOT NULL
            CONSTRAINT DF_activities_created_at DEFAULT (SYSUTCDATETIME()),
        created_by                UNIQUEIDENTIFIER NULL,
        updated_at                DATETIME2(0)     NULL,
        updated_by                UNIQUEIDENTIFIER NULL,
        row_version               ROWVERSION       NOT NULL,
        CONSTRAINT PK_activities PRIMARY KEY (activity_id),
        CONSTRAINT UQ_activities_form_number UNIQUE (form_number),
        CONSTRAINT FK_activities_sites
            FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT FK_activities_fleet_units
            FOREIGN KEY (unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT FK_activities_users_technician
            FOREIGN KEY (technician_user_id) REFERENCES dbo.users (user_id),
        CONSTRAINT CK_activities_activity_type
            CHECK (activity_type IN ('installation', 'replacement', 'removal', 'troubleshoot')),
        CONSTRAINT CK_activities_finished_after_started
            CHECK (finished_at >= started_at),
        CONSTRAINT CK_activities_start_utc_offset
            CHECK (start_utc_offset_minutes BETWEEN -720 AND 840),
        CONSTRAINT CK_activities_finish_utc_offset
            CHECK (finish_utc_offset_minutes BETWEEN -720 AND 840),
        CONSTRAINT CK_activities_duration
            CHECK (duration_minutes = DATEDIFF(MINUTE, started_at, finished_at))
    );

    CREATE NONCLUSTERED INDEX IX_activities_site_started
        ON dbo.activities (site_id, started_at DESC);

    CREATE NONCLUSTERED INDEX IX_activities_type_started
        ON dbo.activities (activity_type, started_at);

    CREATE NONCLUSTERED INDEX IX_activities_started_at_local
        ON dbo.activities (started_at_local);

    /* ---- 3.9 trigger: site_id and time_zone_id are immutable ------------------
       Created via EXEC because CREATE TRIGGER must be the first statement in a
       batch and this file has no GO separators.                                  */
    EXEC (N'
CREATE TRIGGER dbo.TR_activities_site_zone_immutable
ON dbo.activities
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(site_id) OR UPDATE(time_zone_id))
       AND EXISTS (
            SELECT 1
            FROM inserted AS i
            INNER JOIN deleted AS d ON d.activity_id = i.activity_id
            WHERE i.site_id <> d.site_id
               OR i.time_zone_id <> d.time_zone_id
       )
        THROW 50010, N''activities.site_id and activities.time_zone_id cannot be changed after creation.'', 1;
END');

    /* ---- 3.10 activity_devices (complete before/after snapshots) ------------- */
    CREATE TABLE dbo.activity_devices (
        activity_id                   UNIQUEIDENTIFIER NOT NULL,
        device_id                     UNIQUEIDENTIFIER NOT NULL,
        role                          VARCHAR(10)      NOT NULL,   -- 'subject' / 'old' / 'new'
        before_status_id              INT              NOT NULL,
        after_status_id               INT              NOT NULL,
        before_unit_id                UNIQUEIDENTIFIER NULL,       -- null when not installed
        after_unit_id                 UNIQUEIDENTIFIER NULL,
        before_location_site_id       INT              NULL,
        after_location_site_id        INT              NULL,
        before_last_maintenance_date  DATE             NULL,
        after_last_maintenance_date   DATE             NULL,
        CONSTRAINT PK_activity_devices PRIMARY KEY (activity_id, device_id),
        CONSTRAINT FK_activity_devices_activities
            FOREIGN KEY (activity_id) REFERENCES dbo.activities (activity_id) ON DELETE CASCADE,
        CONSTRAINT FK_activity_devices_devices
            FOREIGN KEY (device_id) REFERENCES dbo.devices (device_id),
        CONSTRAINT FK_activity_devices_before_status
            FOREIGN KEY (before_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT FK_activity_devices_after_status
            FOREIGN KEY (after_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT FK_activity_devices_before_unit
            FOREIGN KEY (before_unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT FK_activity_devices_after_unit
            FOREIGN KEY (after_unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT FK_activity_devices_before_location
            FOREIGN KEY (before_location_site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT FK_activity_devices_after_location
            FOREIGN KEY (after_location_site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT CK_activity_devices_role
            CHECK (role IN ('subject', 'old', 'new'))
    );

    /* Drives the Device Timeline. */
    CREATE NONCLUSTERED INDEX IX_activity_devices_device_activity
        ON dbo.activity_devices (device_id, activity_id);

    /* ---- 3.11 detail tables (PK = FK = activity_id, ON DELETE CASCADE) ------ */
    CREATE TABLE dbo.installation_details (
        activity_id        UNIQUEIDENTIFIER NOT NULL,
        equipment_type_id  INT              NULL,        -- snapshot
        egi                NVARCHAR(60)     NULL,        -- snapshot
        source_power       NVARCHAR(60)     NULL,
        spm_version        NVARCHAR(60)     NULL,
        area               NVARCHAR(60)     NULL,
        location_detail    NVARCHAR(200)    NULL,
        ip_address         VARCHAR(45)      NULL,
        ip_cpe             VARCHAR(45)      NULL,
        ip_vhms            VARCHAR(45)      NULL,
        notes              NVARCHAR(1000)   NULL,
        CONSTRAINT PK_installation_details PRIMARY KEY (activity_id),
        CONSTRAINT FK_installation_details_activities
            FOREIGN KEY (activity_id) REFERENCES dbo.activities (activity_id) ON DELETE CASCADE
    );

    CREATE TABLE dbo.replacement_details (
        activity_id          UNIQUEIDENTIFIER NOT NULL,
        old_final_status_id  INT              NOT NULL,   -- must be 2 / 3 / 4
        source_power         NVARCHAR(60)     NULL,
        spm_version          NVARCHAR(60)     NULL,
        area                 NVARCHAR(60)     NULL,
        location_detail      NVARCHAR(200)    NULL,
        ip_address           VARCHAR(45)      NULL,
        ip_cpe               VARCHAR(45)      NULL,
        ip_vhms              VARCHAR(45)      NULL,
        CONSTRAINT PK_replacement_details PRIMARY KEY (activity_id),
        CONSTRAINT FK_replacement_details_activities
            FOREIGN KEY (activity_id) REFERENCES dbo.activities (activity_id) ON DELETE CASCADE,
        CONSTRAINT FK_replacement_details_old_final_status
            FOREIGN KEY (old_final_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT CK_replacement_details_old_final_status
            CHECK (old_final_status_id IN (2, 3, 4))
    );

    CREATE TABLE dbo.removal_details (
        activity_id      UNIQUEIDENTIFIER NOT NULL,
        reason           NVARCHAR(200)    NOT NULL,
        reason_detail    NVARCHAR(1000)   NULL,
        final_status_id  INT              NOT NULL,       -- must be 2 / 3 / 4
        CONSTRAINT PK_removal_details PRIMARY KEY (activity_id),
        CONSTRAINT FK_removal_details_activities
            FOREIGN KEY (activity_id) REFERENCES dbo.activities (activity_id) ON DELETE CASCADE,
        CONSTRAINT FK_removal_details_final_status
            FOREIGN KEY (final_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT CK_removal_details_final_status
            CHECK (final_status_id IN (2, 3, 4))
    );

    CREATE TABLE dbo.troubleshoot_details (
        activity_id         UNIQUEIDENTIFIER NOT NULL,
        component_type      VARCHAR(20)      NULL,
        issue               NVARCHAR(1000)   NOT NULL,
        action_taken        NVARCHAR(1000)   NOT NULL,
        health_check_result VARCHAR(10)      NULL,        -- a health result, not a transaction status
        CONSTRAINT PK_troubleshoot_details PRIMARY KEY (activity_id),
        CONSTRAINT FK_troubleshoot_details_activities
            FOREIGN KEY (activity_id) REFERENCES dbo.activities (activity_id) ON DELETE CASCADE,
        CONSTRAINT CK_troubleshoot_details_component_type
            CHECK (component_type IN ('MH02 Device', 'GPS/Antenna', 'Camera', 'Wiring',
                                      'Speaker', 'SPM', 'CPE', 'Firmware')),
        CONSTRAINT CK_troubleshoot_details_health_check_result
            CHECK (health_check_result IN ('Pass', 'Fail', 'Verified', 'Pending'))
    );

    /* ---- 3.14 form_sequences ------------------------------------------------
       Incremented inside the creating transaction with UPDLOCK, HOLDLOCK by the
       service; the table itself only provides the (type, month) key.          */
    CREATE TABLE dbo.form_sequences (
        activity_type  VARCHAR(15) NOT NULL,
        year_month     CHAR(6)     NOT NULL,              -- 'YYYYMM'
        last_number    INT         NOT NULL,
        CONSTRAINT PK_form_sequences PRIMARY KEY (activity_type, year_month)
    );

    /* ---- 3.19 idempotency_keys (permanent; no expiry, no purge) -------------- */
    CREATE TABLE dbo.idempotency_keys (
        user_id          UNIQUEIDENTIFIER NOT NULL,
        idempotency_key  VARCHAR(64)      NOT NULL,
        activity_type    VARCHAR(15)      NOT NULL,       -- endpoint the key was first used on
        request_hash     CHAR(64)         NOT NULL,       -- SHA-256 of the canonical validated request
        activity_id      UNIQUEIDENTIFIER NULL,           -- NULL only while the creating transaction is uncommitted; NOT a foreign key
        form_number      NVARCHAR(30)     NULL,           -- NULL only while uncommitted
        created_at       DATETIME2(0)     NOT NULL
            CONSTRAINT DF_idempotency_keys_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_idempotency_keys PRIMARY KEY (user_id, idempotency_key),
        CONSTRAINT FK_idempotency_keys_users
            FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
        /* The two columns are populated together or not at all. The service must
           populate both before COMMIT (design 3.19 invariant). */
        CONSTRAINT CK_idempotency_keys_activity_form_together
            CHECK ((activity_id IS NULL AND form_number IS NULL)
                OR (activity_id IS NOT NULL AND form_number IS NOT NULL))
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
