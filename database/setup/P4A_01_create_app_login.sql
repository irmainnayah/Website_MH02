/* ============================================================================
   P4A_01_create_app_login.sql
   MH02 Phase 4a - create the application login and database user (least privilege)

   Run with sqlcmd (it uses sqlcmd scripting: GO, :on error, $(variables)), as a
   sysadmin, normally through Initialize-AppLogin.ps1, which generates the
   password, keeps it out of the console and the command line, and writes it to
   .env.local.

   Required environment variables (read by sqlcmd as scripting variables):
     MH02_APP_PASSWORD   the password (24+ characters; no single quote)
     MH02_ROTATE         "1" to change the password of an existing login, else "0"

   What it does:
   - Creates SQL login mh02_app (CHECK_POLICY ON, CHECK_EXPIRATION OFF, default
     database db_asset_report) if it does not exist.
   - Creates database user mh02_app in db_asset_report (default schema dbo).
   What it does NOT do (least privilege):
   - NO server role membership (never sysadmin, never dbcreator, ...).
   - NO database role membership and NO table permissions yet. Those are applied
     by P4A_02_app_permissions.sql AFTER all migrations exist, so the login has
     no access at all in the meantime.
   - Does not touch tables, rows or any other login.

   The login cannot connect yet anyway: SQL Authentication needs Mixed Mode and
   TCP/IP (see PHASE4A_GUIDE.md).

   STATUS: nothing in database/setup is executed automatically.
   ============================================================================ */

:on error exit

USE [master];
GO

DECLARE @pw     NVARCHAR(128) = N'$(MH02_APP_PASSWORD)';
DECLARE @rotate BIT           = CASE WHEN N'$(MH02_ROTATE)' = N'1' THEN 1 ELSE 0 END;

IF DB_ID(N'db_asset_report') IS NULL
    THROW 50100, N'P4A_01: database db_asset_report does not exist.', 1;

IF IS_SRVROLEMEMBER(N'sysadmin') <> 1
    THROW 50101, N'P4A_01: run this as a sysadmin.', 1;

IF @pw IS NULL OR LEN(@pw) < 24 OR @pw LIKE N'%''%'
    THROW 50102, N'P4A_01: MH02_APP_PASSWORD must be at least 24 characters and contain no single quote.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'mh02_app')
BEGIN
    EXEC (N'CREATE LOGIN [mh02_app] WITH PASSWORD = N''' + @pw + N''', DEFAULT_DATABASE = [db_asset_report], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF');
    PRINT N'Login mh02_app created.';
END
ELSE IF @rotate = 1
BEGIN
    EXEC (N'ALTER LOGIN [mh02_app] WITH PASSWORD = N''' + @pw + N'''');
    PRINT N'Password of login mh02_app rotated.';
END
ELSE
    PRINT N'Login mh02_app already exists; password unchanged.';
GO

USE [db_asset_report];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'mh02_app')
BEGIN
    CREATE USER [mh02_app] FOR LOGIN [mh02_app] WITH DEFAULT_SCHEMA = [dbo];
    PRINT N'Database user mh02_app created in db_asset_report (no roles, no permissions yet).';
END
ELSE
    PRINT N'Database user mh02_app already exists.';
GO
