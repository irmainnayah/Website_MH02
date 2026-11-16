/* ============================================================================
   V001__core_reference.sql
   MH02 Asset Report Portal - Core and reference tables

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 9), sections 3.1-3.3,
                     3.5-3.6, 3.13, 3.16, 3.17.
   Tables created  : schema_migrations, sites, roles, users, equipment_types,
                     device_statuses, lookup_values, import_batches
   Target database : db_asset_report (SQL Server)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   Rules followed (design section 8):
   - Forward-only. Creates objects only: no DROP, no ALTER of existing objects,
     no data changes, no seed rows (reference/dev seeds are separate work).
   - Runs as one SQL transaction (all or nothing).
   - Fails (and rolls back) if any target table already exists, so it can never
     overwrite or recreate existing tables.
   - Does NOT insert its own row into schema_migrations; the migration runner
     records the version and checksum after a successful run.
   - Contains no GRANT/DENY and no login/user creation: the application login
     (mh02_app) does not exist yet and is created in the separate, approved
     Phase 4a step (design section 8).
   - No GO separators, so the file can be sent as a single batch by the
     Node.js `mssql` driver.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ---- Safety guards ---------------------------------------------------- */
    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'V001: wrong database context. Expected db_asset_report.', 1;

    IF EXISTS (
        SELECT 1
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'schema_migrations', N'sites', N'roles', N'users',
                       N'equipment_types', N'device_statuses',
                       N'lookup_values', N'import_batches')
    )
        THROW 50002, N'V001: one or more target tables already exist. Nothing was changed.', 1;

    /* ---- 3.17 schema_migrations ------------------------------------------ */
    CREATE TABLE dbo.schema_migrations (
        version     VARCHAR(20)   NOT NULL,
        name        NVARCHAR(200) NOT NULL,
        checksum    CHAR(64)      NOT NULL,
        applied_at  DATETIME2(0)  NULL
            CONSTRAINT DF_schema_migrations_applied_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_schema_migrations PRIMARY KEY (version)
    );

    /* ---- 3.1 sites -------------------------------------------------------- */
    CREATE TABLE dbo.sites (
        site_id               INT           IDENTITY(1,1) NOT NULL,
        site_code             NVARCHAR(30)  NOT NULL,
        name                  NVARCHAR(100) NOT NULL,
        time_zone_id          VARCHAR(50)   NOT NULL,  -- IANA id; allowed values are an application-level configurable list; no default
        is_operating_district BIT           NOT NULL
            CONSTRAINT DF_sites_is_operating_district DEFAULT (1),
        is_active             BIT           NOT NULL
            CONSTRAINT DF_sites_is_active DEFAULT (1),
        CONSTRAINT PK_sites PRIMARY KEY (site_id),
        CONSTRAINT UQ_sites_site_code UNIQUE (site_code)
    );

    /* ---- 3.2 roles -------------------------------------------------------- */
    CREATE TABLE dbo.roles (
        role_id    INT           IDENTITY(1,1) NOT NULL,
        role_code  NVARCHAR(30)  NOT NULL,             -- 'superadmin', 'user'
        name       NVARCHAR(60)  NOT NULL,
        CONSTRAINT PK_roles PRIMARY KEY (role_id),
        CONSTRAINT UQ_roles_role_code UNIQUE (role_code)
    );

    /* ---- 3.5 equipment_types --------------------------------------------- */
    CREATE TABLE dbo.equipment_types (
        equipment_type_id INT          IDENTITY(1,1) NOT NULL,
        name              NVARCHAR(40) NOT NULL,
        CONSTRAINT PK_equipment_types PRIMARY KEY (equipment_type_id),
        CONSTRAINT UQ_equipment_types_name UNIQUE (name)
    );

    /* ---- 3.6 device_statuses ---------------------------------------------
       status_id is NOT an identity: the design fixes the ids (1 in_use,
       2 in_stock_rfu, 3 in_stock_damaged, 4 in_stock_ho) and later tables
       (e.g. the devices CHECK on status_id = 1) depend on them. The ids are
       supplied by the reference seed, which is not part of this file.        */
    CREATE TABLE dbo.device_statuses (
        status_id    INT          NOT NULL,
        code         VARCHAR(30)  NOT NULL,
        label        NVARCHAR(50) NULL,                -- UI label
        is_in_stock  BIT          NULL,
        CONSTRAINT PK_device_statuses PRIMARY KEY (status_id),
        CONSTRAINT UQ_device_statuses_code UNIQUE (code)
    );

    /* ---- 3.16 import_batches --------------------------------------------- */
    CREATE TABLE dbo.import_batches (
        batch_id     UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_import_batches_batch_id DEFAULT (NEWSEQUENTIALID()),
        source_name  NVARCHAR(200)    NOT NULL,
        data_source  VARCHAR(20)      NOT NULL,
        imported_by  UNIQUEIDENTIFIER NULL,
        imported_at  DATETIME2(0)     NULL
            CONSTRAINT DF_import_batches_imported_at DEFAULT (SYSUTCDATETIME()),
        row_count    INT              NULL,
        status       VARCHAR(20)      NULL,
        notes        NVARCHAR(1000)   NULL,
        CONSTRAINT PK_import_batches PRIMARY KEY (batch_id)
    );

    /* ---- 3.3 users -------------------------------------------------------- */
    CREATE TABLE dbo.users (
        user_id            UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_users_user_id DEFAULT (NEWSEQUENTIALID()),
        nrp                NVARCHAR(30)     NOT NULL,   -- login identifier
        name               NVARCHAR(120)    NOT NULL,
        email              NVARCHAR(150)    NULL,
        phone              NVARCHAR(30)     NULL,
        role_id            INT              NOT NULL,
        site_id            INT              NULL,       -- required for role 'user' (service rule); optional for 'superadmin'
        password_hash      NVARCHAR(255)    NOT NULL,   -- argon2id or bcrypt; never plaintext
        status             VARCHAR(10)      NOT NULL,
        failed_login_count INT              NULL,
        locked_until       DATETIME2(0)     NULL,
        last_login_at      DATETIME2(0)     NULL,
        data_source        VARCHAR(20)      NOT NULL,   -- 'app' or 'dev_seed'
        created_at         DATETIME2(0)     NULL
            CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME()),
        created_by         UNIQUEIDENTIFIER NULL,
        updated_at         DATETIME2(0)     NULL,
        updated_by         UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_users PRIMARY KEY (user_id),
        CONSTRAINT UQ_users_nrp UNIQUE (nrp),
        CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES dbo.roles (role_id),
        CONSTRAINT FK_users_sites FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT CK_users_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT CK_users_data_source CHECK (data_source IN ('app', 'dev_seed'))
    );

    /* ---- 3.13 lookup_values ---------------------------------------------- */
    CREATE TABLE dbo.lookup_values (
        lookup_id   INT           IDENTITY(1,1) NOT NULL,
        category    VARCHAR(30)   NOT NULL,
        code        NVARCHAR(60)  NOT NULL,
        label       NVARCHAR(120) NOT NULL,
        site_id     INT           NULL,                 -- NULL = global; set for site-scoped areas and group leaders
        sort_order  INT           NULL,
        is_active   BIT           NOT NULL
            CONSTRAINT DF_lookup_values_is_active DEFAULT (1),
        CONSTRAINT PK_lookup_values PRIMARY KEY (lookup_id),
        CONSTRAINT FK_lookup_values_sites FOREIGN KEY (site_id) REFERENCES dbo.sites (site_id),
        CONSTRAINT CK_lookup_values_category
            CHECK (category IN ('shift', 'source_power', 'spm_version', 'area', 'group_leader')),
        CONSTRAINT UQ_lookup_values_category_label_site UNIQUE (category, label, site_id)
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
