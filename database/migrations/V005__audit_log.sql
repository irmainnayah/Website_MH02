/* ============================================================================
   V005__audit_log.sql
   MH02 Asset Report Portal - Append-only audit log

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), sections 3.15
                     and 4.
   Table created   : audit_log
   Also creates    : triggers TR_audit_log_block_update (INSTEAD OF UPDATE)
                     and TR_audit_log_block_delete (INSTEAD OF DELETE)
   Depends on      : V001 (users, sites)
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows.
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if audit_log already exists or users/sites are
     missing.
   - Does NOT insert its own row into schema_migrations (the runner does).
   - No GO separators (single batch for the Node.js `mssql` driver). Because
     CREATE TRIGGER must be the first statement of a batch, the triggers are
     created through EXEC (dynamic SQL), which works inside this transaction.

   Append-only enforcement (design 3.15, two layers):
   - Layer 2 (this file): INSTEAD OF UPDATE and INSTEAD OF DELETE triggers that
     raise an error, so no row can be changed or removed by an UPDATE or DELETE
     statement, even from a more privileged login. Corrections are made by
     adding a new row.
   - Layer 1 (NOT in this file): the application login mh02_app does not exist
     yet. Its permissions are applied in the separate permission-configuration
     step (Phase 4a): GRANT SELECT and INSERT on audit_log, and explicit
     DENY UPDATE and DENY DELETE (a DENY overrides db_datawriter membership).
   - Note: TRUNCATE TABLE does not fire DELETE triggers; it is blocked by
     permissions (it requires ALTER on the table), which the app login will not
     have, and by the foreign key that device_events.audit_id will place on
     this table.

   Usage rules that cannot be enforced by this file (service responsibility):
   - Audit rows are written INSIDE the same SQL transaction as the change they
     describe (both commit or neither does); the audit row is inserted first so
     its audit_id can be referenced by device_events.audit_id.
   - Passwords and password hashes must never be written to old_values or
     new_values.
   - entity_id is the immutable internal id of the affected row (device_id,
     activity_id or user_id); record_id is a human-readable label only and is
     never a join key.
   - occurred_at is assigned by the database, never by the client.
   - Every application write is audited; every Super Admin write is audited
     without exception, however small (design 3.15 coverage rule). A request that
     changes nothing writes no audit row.

   Column types or nullability NOT specified by the design are ASSUMPTIONS open
   to review: actor_name, ip_address, request_id (see the review report).
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V005: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name = N'audit_log'
    )
        THROW 50002, N'V005: audit_log already exists. Nothing was changed.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'users', N'sites')) <> 2
        THROW 50003, N'V005: required tables dbo.users and dbo.sites are missing. Apply V001 first.', 1;

    /* ---- 3.15 audit_log --------------------------------------------------- */
    CREATE TABLE dbo.audit_log (
        audit_id         BIGINT           IDENTITY(1,1) NOT NULL,
        occurred_at      DATETIME2(3)     NOT NULL
            CONSTRAINT DF_audit_log_occurred_at DEFAULT (SYSUTCDATETIME()),   -- UTC, database-assigned
        actor_user_id    UNIQUEIDENTIFIER NULL,
        actor_name       NVARCHAR(120)    NULL,           -- snapshot of the actor's name (assumed type/nullability)
        site_id          INT              NULL,           -- the audited record's Site, used for access filtering
        table_name       VARCHAR(30)      NOT NULL,
        record_id        NVARCHAR(60)     NOT NULL,       -- human-readable label (form number, device code, user NRP); NOT a join key
        entity_id        UNIQUEIDENTIFIER NOT NULL,       -- immutable internal id; required for every allowed table_name
        operation        VARCHAR(6)       NOT NULL,
        old_values       NVARCHAR(MAX)    NULL,           -- JSON; never contains passwords or hashes
        new_values       NVARCHAR(MAX)    NULL,           -- JSON; never contains passwords or hashes
        change_group_id  UNIQUEIDENTIFIER NOT NULL,       -- ties a transaction edit/delete to the device changes it caused
        ip_address       VARCHAR(45)      NULL,           -- assumed type/nullability (45 fits IPv6)
        request_id       VARCHAR(64)      NULL,           -- assumed type/nullability
        action           VARCHAR(30)      NOT NULL,       -- what kind of change the row records (controlled vocabulary)
        reason           NVARCHAR(500)    NULL,           -- actor's stated reason; mandatory for action = 'device_override'
        CONSTRAINT PK_audit_log PRIMARY KEY (audit_id),
        CONSTRAINT FK_audit_log_users
            FOREIGN KEY (actor_user_id) REFERENCES dbo.users (user_id),
        CONSTRAINT FK_audit_log_sites
            FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT CK_audit_log_table_name
            CHECK (table_name IN ('installation', 'replacement', 'removal',
                                  'troubleshoot', 'device', 'user_management')),
        CONSTRAINT CK_audit_log_operation
            CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        CONSTRAINT CK_audit_log_old_values_json
            CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
        CONSTRAINT CK_audit_log_new_values_json
            CHECK (new_values IS NULL OR ISJSON(new_values) = 1),
        CONSTRAINT CK_audit_log_action
            CHECK (action IN ('device_register', 'device_update', 'device_override', 'device_archive',
                              'transaction_create', 'transaction_update', 'transaction_delete',
                              'user_create', 'user_update', 'user_deactivate', 'user_password_reset')),
        /* A Super Admin override must carry a non-blank reason. */
        CONSTRAINT CK_audit_log_override_reason
            CHECK (action <> 'device_override'
                OR (reason IS NOT NULL AND LEN(LTRIM(RTRIM(reason))) > 0))
    );

    /* ---- Append-only: INSTEAD OF UPDATE trigger ------------------------------
       Created via EXEC because CREATE TRIGGER must be the first statement in a
       batch and this file has no GO separators.                                  */
    EXEC (N'
CREATE TRIGGER dbo.TR_audit_log_block_update
ON dbo.audit_log
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50020, N''audit_log is append-only: UPDATE is not allowed. Add a new row instead.'', 1;
END');

    /* ---- Append-only: INSTEAD OF DELETE trigger ------------------------------ */
    EXEC (N'
CREATE TRIGGER dbo.TR_audit_log_block_delete
ON dbo.audit_log
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50021, N''audit_log is append-only: DELETE is not allowed.'', 1;
END');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
