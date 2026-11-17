/* ============================================================================
   V007__auth_sessions.sql
   MH02 Asset Report Portal - Server-side authentication sessions (auth phase)

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), sections 3.4,
                     4 and 8.
   Table created   : auth_sessions
   Depends on      : V001 (users)
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows.
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if auth_sessions already exists or dbo.users is
     missing.
   - Does NOT insert its own row into schema_migrations (the runner does).
   - Contains no GRANT/DENY (the application login does not exist yet).
   - No GO separators (single batch for the Node.js `mssql` driver).

   Session design notes (design 3.4):
   - token_hash holds the SHA-256 hash (64 hex characters) of the cookie token.
     The raw token is never stored.
   - Role and Site are deliberately NOT stored here. They are always read from
     the users table on every request, never from the session or the cookie.
   - Authentication is a separately reviewed phase; this table is part of it.

   Column types or nullability NOT specified by the design are ASSUMPTIONS open
   to review: session_id default, created_at, expires_at/revoked_at type,
   ip_address, user_agent.
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V007: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name = N'auth_sessions'
    )
        THROW 50002, N'V007: auth_sessions already exists. Nothing was changed.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name = N'users'
    )
        THROW 50003, N'V007: required table dbo.users is missing. Apply V001 first.', 1;

    /* ---- 3.4 auth_sessions ------------------------------------------------- */
    CREATE TABLE dbo.auth_sessions (
        session_id   UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_auth_sessions_session_id DEFAULT (NEWSEQUENTIALID()),
        token_hash   CHAR(64)         NOT NULL,           -- SHA-256 hash of the cookie token; never the token itself
        user_id      UNIQUEIDENTIFIER NOT NULL,
        created_at   DATETIME2(0)     NOT NULL            -- assumed type/nullability; UTC
            CONSTRAINT DF_auth_sessions_created_at DEFAULT (SYSUTCDATETIME()),
        expires_at   DATETIME2(0)     NOT NULL,           -- UTC
        revoked_at   DATETIME2(0)     NULL,               -- assumed type/nullability; NULL = not revoked
        ip_address   VARCHAR(45)      NULL,               -- assumed type/nullability (same as audit_log; fits IPv6)
        user_agent   NVARCHAR(500)    NULL,               -- assumed type/nullability
        CONSTRAINT PK_auth_sessions PRIMARY KEY (session_id),
        CONSTRAINT UQ_auth_sessions_token_hash UNIQUE (token_hash),
        CONSTRAINT FK_auth_sessions_users
            FOREIGN KEY (user_id) REFERENCES dbo.users (user_id) ON DELETE CASCADE
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
