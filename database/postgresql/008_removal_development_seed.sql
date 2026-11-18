-- DEVELOPMENT ONLY. Review and run manually against PostgreSQL db_asset_report.
-- Requires 001_initial_schema.sql, 002_reference_data.sql and an active Superadmin.
-- Creates dropdown fixtures, not a removal transaction or fictitious user accounts.
-- Existing device state is never reset. Conflicts abort the entire script.
BEGIN;

DO $$
DECLARE
    v_site integer;
    v_equipment integer;
    v_unit uuid;
    v_device uuid;
    v_actor uuid;
    v_actor_name varchar(120);
    v_audit bigint;
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected development database db_asset_report';
    END IF;
    SELECT equipment_type_id INTO v_equipment FROM equipment_types WHERE name = 'Dump Truck';
    IF v_equipment IS NULL OR (SELECT count(*) FROM device_statuses WHERE
        (status_id = 1 AND code = 'in_use') OR (status_id = 2 AND code = 'in_stock_rfu')
        OR (status_id = 3 AND code = 'in_stock_damaged') OR (status_id = 4 AND code = 'in_stock_ho')) <> 4 THEN
        RAISE EXCEPTION 'Missing or conflicting equipment/status references. Review 002_reference_data.sql.';
    END IF;
    SELECT u.user_id, u.name INTO v_actor, v_actor_name
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.status = 'active' AND r.role_code = 'superadmin'
    ORDER BY u.created_at NULLS FIRST, u.nrp LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'An active Superadmin is required for device audit history';
    END IF;

    INSERT INTO sites (site_code, name, time_zone_id, is_operating_district, is_active)
    VALUES ('DEV-REMOVAL', 'Development Removal (WITA)', 'Asia/Makassar', true, true)
    ON CONFLICT (site_code) DO NOTHING;
    SELECT site_id INTO v_site FROM sites WHERE site_code = 'DEV-REMOVAL';
    IF NOT EXISTS (SELECT 1 FROM sites WHERE site_id = v_site AND is_active AND time_zone_id = 'Asia/Makassar') THEN
        RAISE EXCEPTION 'Removal Site fixture conflicts with existing data';
    END IF;

    INSERT INTO lookup_values (category, code, label, site_id, sort_order, is_active) VALUES
        ('shift', 'SHIFT_1', 'Shift 1', NULL, 1, true),
        ('shift', 'SHIFT_2', 'Shift 2', NULL, 2, true),
        ('group_leader', 'DEV_REM_GL', 'Development Removal GL', v_site, 1, true)
    ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM lookup_values WHERE category = 'group_leader'
        AND label = 'Development Removal GL' AND site_id = v_site AND is_active)
        OR (SELECT count(*) FROM lookup_values WHERE category = 'shift' AND site_id IS NULL
            AND label IN ('Shift 1', 'Shift 2') AND is_active) <> 2 THEN
        RAISE EXCEPTION 'Removal dropdown fixture conflicts with inactive existing reference values';
    END IF;

    INSERT INTO fleet_units (unit_no, equipment_type_id, egi, is_egi_confirmed, site_id, is_active, data_source)
    VALUES ('DEV-REM-DT-001', v_equipment, 'DEV-TEST', false, v_site, true, 'dev_seed')
    ON CONFLICT (unit_no) DO NOTHING;
    SELECT unit_id INTO v_unit FROM fleet_units WHERE unit_no = 'DEV-REM-DT-001';
    IF NOT EXISTS (SELECT 1 FROM fleet_units WHERE unit_id = v_unit AND site_id = v_site
        AND equipment_type_id = v_equipment AND is_active AND data_source = 'dev_seed') THEN
        RAISE EXCEPTION 'Removal Unit fixture conflicts with existing data';
    END IF;

    INSERT INTO devices (device_code, serial_number, status_id, site_id, current_unit_id,
        current_location_site_id, health_check_status, data_source, created_by)
    VALUES ('DEV-REM-MH02-001', 'DEV-REM-SN-001', 1, v_site, v_unit,
        v_site, 'not_checked', 'dev_seed', v_actor)
    ON CONFLICT DO NOTHING RETURNING device_id INTO v_device;
    IF v_device IS NOT NULL THEN
        INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id,
            operation, new_values, change_group_id, action)
        VALUES (v_actor, v_actor_name, v_site, 'device', 'DEV-REM-MH02-001', v_device, 'INSERT',
            jsonb_build_object('device_code', 'DEV-REM-MH02-001', 'serial_number', 'DEV-REM-SN-001',
                'status', 'in_use', 'unit_id', v_unit, 'site_id', v_site, 'fixture', 'development_removal'),
            gen_random_uuid(), 'device_register') RETURNING audit_id INTO v_audit;
        INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary)
        VALUES (v_device, 'registered', v_actor, v_actor_name, v_site, v_audit, 'Development Removal dropdown fixture: initial In Use state');
    ELSIF NOT EXISTS (SELECT 1 FROM devices WHERE device_code = 'DEV-REM-MH02-001'
        AND serial_number = 'DEV-REM-SN-001' AND status_id = 1 AND site_id = v_site
        AND current_unit_id = v_unit AND current_location_site_id = v_site
        AND NOT is_deleted AND data_source = 'dev_seed') THEN
        RAISE EXCEPTION 'Removal device fixture conflicts or was already used. No existing state was reset.';
    END IF;
END $$;

COMMIT;

SELECT d.device_code, d.serial_number, ds.code AS status, s.site_id, s.name AS site_name,
    fu.unit_no, et.name AS equipment_type, fu.egi
FROM devices d JOIN sites s ON s.site_id = d.site_id
JOIN device_statuses ds ON ds.status_id = d.status_id
JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
WHERE d.device_code = 'DEV-REM-MH02-001';

SELECT category, label, site_id FROM lookup_values
WHERE is_active AND (site_id IS NULL OR site_id = (SELECT site_id FROM sites WHERE site_code = 'DEV-REMOVAL'))
    AND category IN ('shift', 'group_leader')
ORDER BY category, sort_order, label;

SELECT code, label FROM device_statuses WHERE code IN ('in_stock_rfu', 'in_stock_damaged', 'in_stock_ho');