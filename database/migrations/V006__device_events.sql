/* ============================================================================
   V006__device_events.sql
   MH02 Asset Report Portal - Append-only device lifecycle events (Timeline)

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), section 3.18,
                     section 4 and section 6 (Register Device, Delete
                     Transaction).
   Table created   : device_events
   Also creates    : triggers TR_device_events_block_update (INSTEAD OF UPDATE)
                     and TR_device_events_block_delete (INSTEAD OF DELETE)
   Depends on      : V001 (users, device_statuses), V002 (devices, fleet_units),
                     V005 (audit_log)
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows.
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if device_events already exists or devices, users
     or audit_log are missing.
   - Does NOT insert its own row into schema_migrations (the runner does).
   - No GO separators (single batch for the Node.js `mssql` driver). Because
     CREATE TRIGGER must be the first statement of a batch, the triggers are
     created through EXEC (dynamic SQL), which works inside this transaction.

   Append-only enforcement (design 3.18, same two layers as audit_log):
   - Layer 2 (this file): INSTEAD OF UPDATE and INSTEAD OF DELETE triggers that
     raise an error.
   - Layer 1 (NOT in this file): the application login mh02_app does not exist
     yet. Its permissions are applied in the separate permission-configuration
     step (Phase 4a): GRANT SELECT and INSERT on device_events, and explicit
     DENY UPDATE and DENY DELETE.
   - Note: TRUNCATE TABLE does not fire DELETE triggers; it requires ALTER on
     the table, which the application login will not have.

   Relationship notes:
   - audit_id is NOT NULL, a foreign key to audit_log and UNIQUE: exactly one
     audit entry per event, and an audit entry backs at most one event.
   - source_activity_id has deliberately NO foreign key (the activity row no
     longer exists once a transaction is deleted).
   - site_id has no foreign key: the design (3.18, section 4) defines FKs only
     for device_id, actor_user_id and audit_id.

   Usage rules that cannot be enforced by this file (service responsibility,
   design 3.18 and section 6):
   - In ONE SQL transaction the service writes the data change, then its
     audit_log row (capturing audit_id), then the device_events row that
     references that audit_id. Any failure rolls back all of it.
   - Register Device: the 'registered' event is inserted in the same
     transaction as the devices row.
   - Device override (Super Admin, mandatory reason): one 'device_override' event
     with before/after status and Unit, in the same transaction as the devices
     update and its device-level audit row (action = 'device_override').
   - Archive (soft delete): one 'soft_deleted' event, in the same transaction as
     the devices update and its audit row (action = 'device_archive').
   - Delete Transaction: one 'transaction_deleted' event per affected device, in
     the same transaction as the device-state rollback and the activity delete;
     each event references that device's own device-level audit row.
   - occurred_at is assigned by the database, never by the client.

   Column types or nullability NOT specified by the design are ASSUMPTIONS open
   to review: actor_name (and its nullability), summary nullability.
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V006: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name = N'device_events'
    )
        THROW 50002, N'V006: device_events already exists. Nothing was changed.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'devices', N'users', N'audit_log',
                       N'device_statuses', N'fleet_units')) <> 5
        THROW 50003, N'V006: required tables dbo.devices, dbo.users, dbo.audit_log, dbo.device_statuses and dbo.fleet_units are missing. Apply V001, V002 and V005 first.', 1;

    /* ---- 3.18 device_events ------------------------------------------------ */
    CREATE TABLE dbo.device_events (
        event_id                 UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_device_events_event_id DEFAULT (NEWSEQUENTIALID()),
        device_id                UNIQUEIDENTIFIER NOT NULL,       -- immutable internal device id
        event_type               VARCHAR(30)      NOT NULL,
        occurred_at              DATETIME2(3)     NOT NULL
            CONSTRAINT DF_device_events_occurred_at DEFAULT (SYSUTCDATETIME()),   -- UTC, database-assigned
        actor_user_id            UNIQUEIDENTIFIER NOT NULL,
        actor_name               NVARCHAR(120)    NULL,           -- actor name snapshot (assumed type/nullability)
        site_id                  INT              NOT NULL,       -- the device's owning Site, for access filtering; no FK per design
        audit_id                 BIGINT           NOT NULL,       -- exactly one audit entry per event
        summary                  NVARCHAR(200)    NULL,           -- nullability assumed
        reason                   NVARCHAR(500)    NULL,           -- mandatory for 'device_override'; optional for 'soft_deleted' (archive); NULL otherwise
        /* Only for event_type = 'device_override'. */
        before_status_id         INT              NULL,
        after_status_id          INT              NULL,
        before_unit_id           UNIQUEIDENTIFIER NULL,           -- NULL when the device had no Unit before
        after_unit_id            UNIQUEIDENTIFIER NULL,           -- NULL when the device has no Unit after
        /* Only for event_type = 'transaction_deleted' (all six, or none). */
        source_activity_id       UNIQUEIDENTIFIER NULL,           -- deliberately NOT a foreign key
        source_activity_type     VARCHAR(15)      NULL,
        source_form_number       NVARCHAR(30)     NULL,
        source_role              VARCHAR(10)      NULL,
        source_started_at_local  DATETIME2(0)     NULL,
        source_time_zone_id      VARCHAR(50)      NULL,
        CONSTRAINT PK_device_events PRIMARY KEY (event_id),
        CONSTRAINT FK_device_events_devices
            FOREIGN KEY (device_id) REFERENCES dbo.devices (device_id),
        CONSTRAINT FK_device_events_users
            FOREIGN KEY (actor_user_id) REFERENCES dbo.users (user_id),
        CONSTRAINT FK_device_events_audit_log
            FOREIGN KEY (audit_id) REFERENCES dbo.audit_log (audit_id),
        CONSTRAINT FK_device_events_before_status
            FOREIGN KEY (before_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT FK_device_events_after_status
            FOREIGN KEY (after_status_id) REFERENCES dbo.device_statuses (status_id),
        CONSTRAINT FK_device_events_before_unit
            FOREIGN KEY (before_unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT FK_device_events_after_unit
            FOREIGN KEY (after_unit_id) REFERENCES dbo.fleet_units (unit_id),
        CONSTRAINT UQ_device_events_audit_id UNIQUE (audit_id),
        CONSTRAINT CK_device_events_event_type
            CHECK (event_type IN ('registered', 'details_updated', 'soft_deleted',
                                  'transaction_deleted', 'device_override')),
        /* A device_override carries a non-blank reason and before/after status; the
           before/after fields are NULL for every other event type. That a Unit or
           status actually changed is a service rule (a no-op override is refused). */
        CONSTRAINT CK_device_events_override
            CHECK ((event_type = 'device_override'
                        AND reason IS NOT NULL AND LEN(LTRIM(RTRIM(reason))) > 0
                        AND before_status_id IS NOT NULL
                        AND after_status_id  IS NOT NULL)
                OR (event_type <> 'device_override'
                        AND before_status_id IS NULL
                        AND after_status_id  IS NULL
                        AND before_unit_id   IS NULL
                        AND after_unit_id    IS NULL)),
        CONSTRAINT CK_device_events_source_activity_type
            CHECK (source_activity_type IS NULL
                OR source_activity_type IN ('installation', 'replacement', 'removal', 'troubleshoot')),
        CONSTRAINT CK_device_events_source_role
            CHECK (source_role IS NULL
                OR source_role IN ('subject', 'old', 'new')),
        /* The six source_* columns are all-or-nothing, tied to the event type. */
        CONSTRAINT CK_device_events_source_all_or_nothing
            CHECK (
                (event_type = 'transaction_deleted'
                    AND source_activity_id      IS NOT NULL
                    AND source_activity_type    IS NOT NULL
                    AND source_form_number      IS NOT NULL
                    AND source_role             IS NOT NULL
                    AND source_started_at_local IS NOT NULL
                    AND source_time_zone_id     IS NOT NULL)
                OR
                (event_type <> 'transaction_deleted'
                    AND source_activity_id      IS NULL
                    AND source_activity_type    IS NULL
                    AND source_form_number      IS NULL
                    AND source_role             IS NULL
                    AND source_started_at_local IS NULL
                    AND source_time_zone_id     IS NULL)
            )
    );

    /* One registration event per device. */
    CREATE UNIQUE NONCLUSTERED INDEX UX_device_events_registered_device
        ON dbo.device_events (device_id)
        WHERE event_type = 'registered';

    /* No duplicate deletion event for the same device and deleted activity. */
    CREATE UNIQUE NONCLUSTERED INDEX UX_device_events_deleted_transaction
        ON dbo.device_events (device_id, source_activity_id)
        WHERE event_type = 'transaction_deleted';

    /* ---- Append-only: INSTEAD OF UPDATE trigger ------------------------------
       Created via EXEC because CREATE TRIGGER must be the first statement in a
       batch and this file has no GO separators.                                  */
    EXEC (N'
CREATE TRIGGER dbo.TR_device_events_block_update
ON dbo.device_events
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50030, N''device_events is append-only: UPDATE is not allowed. Add a new row instead.'', 1;
END');

    /* ---- Append-only: INSTEAD OF DELETE trigger ------------------------------ */
    EXEC (N'
CREATE TRIGGER dbo.TR_device_events_block_delete
ON dbo.device_events
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50031, N''device_events is append-only: DELETE is not allowed.'', 1;
END');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
