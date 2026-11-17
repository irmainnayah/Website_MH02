/* ============================================================================
   R001__reference_data.sql
   MH02 Asset Report Portal - REFERENCE seed (safe for production)

   Source of truth : docs/PHASE2_DATABASE_DESIGN.md (Revision 11), sections 3.2,
                     3.5, 3.6, 3.13 and 8.
   Seeds           : roles, equipment_types, device_statuses, global lookup values
                     (shift, source_power)

   STATUS: DRAFT FOR REVIEW. This file has NOT been executed.

   - Idempotent: uses MERGE on natural keys; running it twice changes nothing.
   - Never deletes: there is no "NOT MATCHED BY SOURCE" branch.
   - Contains NO Sites, users, fleet units, devices or per-Site lookup values:
     those are company data (Sites carry a time zone that is a production setup
     decision) or fictional development data (seed/dev).
   - device_statuses ids 1-4 are FIXED by the design (the devices CHECK relies on
     id 1 = in_use). The status code in_stock_damaged is kept; its UI label is
     "In Stock (Repair)".
   - Single batch, no GO, one transaction (Node.js mssql / sqlcmd safe).
   ============================================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF DB_NAME() <> N'db_asset_report'
        THROW 50001, N'R001: wrong database context. Expected db_asset_report.', 1;

    IF (SELECT COUNT(*)
        FROM sys.tables
        WHERE schema_id = SCHEMA_ID(N'dbo')
          AND name IN (N'roles', N'equipment_types', N'device_statuses', N'lookup_values')) <> 4
        THROW 50003, N'R001: required tables are missing. Apply the migrations first.', 1;

    /* ---- roles ------------------------------------------------------------ */
    MERGE dbo.roles AS t
    USING (VALUES
        (N'superadmin', N'Super Admin'),
        (N'user',       N'User')
    ) AS s (role_code, name)
        ON t.role_code = s.role_code
    WHEN MATCHED AND t.name <> s.name THEN
        UPDATE SET t.name = s.name
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (role_code, name) VALUES (s.role_code, s.name);

    /* ---- equipment_types -------------------------------------------------- */
    MERGE dbo.equipment_types AS t
    USING (VALUES
        (N'Dump Truck'),
        (N'Water Truck'),
        (N'Fuel Truck'),
        (N'Loader'),
        (N'Others')
    ) AS s (name)
        ON t.name = s.name
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (name) VALUES (s.name);

    /* ---- device_statuses (fixed ids 1-4) ------------------------------------
       Matching on id AND code: if an id already exists with a different code the
       INSERT collides on the primary key and the whole seed fails loudly.      */
    MERGE dbo.device_statuses AS t
    USING (VALUES
        (1, 'in_use',           N'In Use',            CAST(0 AS BIT)),
        (2, 'in_stock_rfu',     N'In Stock RFU',      CAST(1 AS BIT)),
        (3, 'in_stock_damaged', N'In Stock (Repair)', CAST(1 AS BIT)),
        (4, 'in_stock_ho',      N'In Stock HO',       CAST(1 AS BIT))
    ) AS s (status_id, code, label, is_in_stock)
        ON t.status_id = s.status_id AND t.code = s.code
    WHEN MATCHED AND (t.label IS NULL OR t.label <> s.label
                   OR t.is_in_stock IS NULL OR t.is_in_stock <> s.is_in_stock) THEN
        UPDATE SET t.label = s.label, t.is_in_stock = s.is_in_stock
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (status_id, code, label, is_in_stock)
        VALUES (s.status_id, s.code, s.label, s.is_in_stock);

    /* ---- global lookup values (site_id IS NULL) ------------------------------ */
    MERGE dbo.lookup_values AS t
    USING (VALUES
        ('shift',        N'SHIFT_1',     N'Shift 1',     1),
        ('shift',        N'SHIFT_2',     N'Shift 2',     2),
        ('source_power', N'STAND_BY',    N'Stand By',    1),
        ('source_power', N'ACC_ON',      N'Acc On',      2),
        ('source_power', N'STANDBY_PDU', N'Standby PDU', 3)
    ) AS s (category, code, label, sort_order)
        ON t.category = s.category AND t.label = s.label AND t.site_id IS NULL
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (category, code, label, site_id, sort_order, is_active)
        VALUES (s.category, s.code, s.label, NULL, s.sort_order, 1);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
