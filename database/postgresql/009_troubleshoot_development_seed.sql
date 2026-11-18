-- DEVELOPMENT ONLY. Review and run manually against PostgreSQL db_asset_report.
-- Requires schema/reference data and an active Superadmin; creates no troubleshoot report.
-- Component choices are the existing troubleshoot_details CHECK values, not lookup_values.
-- Technician comes from the authenticated user; no fictitious technician is inserted.
-- The RFU device is a negative test fixture, not a selectable installed Device.
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
    v_code varchar(40);
    v_serial varchar(80);
    v_status integer;
    v_status_code varchar(30);
    v_expected_unit uuid;
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected development database db_asset_report';
    END IF;
    SELECT equipment_type_id INTO v_equipment FROM equipment_types WHERE name = 'Dump Truck';
    IF v_equipment IS NULL OR NOT EXISTS (SELECT 1 FROM device_statuses WHERE status_id = 1 AND code = 'in_use')
        OR NOT EXISTS (SELECT 1 FROM device_statuses WHERE status_id = 2 AND code = 'in_stock_rfu') THEN
        RAISE EXCEPTION 'Missing or conflicting reference data. Review 002_reference_data.sql first.';
    END IF;
    SELECT u.user_id, u.name INTO v_actor, v_actor_name
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.status = 'active' AND r.role_code = 'superadmin'
    ORDER BY u.created_at NULLS FIRST, u.nrp LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'An active Superadmin is required for device audit history';
    END IF;

    INSERT INTO sites (site_code, name, time_zone_id, is_operating_district, is_active)
    VALUES ('DEV-TROUBLESHOOT', 'Development Troubleshoot (WITA)', 'Asia/Makassar', true, true)
    ON CONFLICT (site_code) DO NOTHING;
    SELECT site_id INTO v_site FROM sites WHERE site_code = 'DEV-TROUBLESHOOT';
    IF NOT EXISTS (SELECT 1 FROM sites WHERE site_id = v_site AND is_active AND time_zone_id = 'Asia/Makassar') THEN
        RAISE EXCEPTION 'Troubleshoot Site fixture conflicts with existing data';
    END IF;
    INSERT INTO fleet_units (unit_no, equipment_type_id, egi, is_egi_confirmed, site_id, is_active, data_source)
    VALUES ('DEV-TRB-DT-001', v_equipment, 'DEV-TEST', false, v_site, true, 'dev_seed')
    ON CONFLICT (unit_no) DO NOTHING;
    SELECT unit_id INTO v_unit FROM fleet_units WHERE unit_no = 'DEV-TRB-DT-001';
    IF NOT EXISTS (SELECT 1 FROM fleet_units WHERE unit_id = v_unit AND site_id = v_site
        AND equipment_type_id = v_equipment AND is_active AND data_source = 'dev_seed') THEN
        RAISE EXCEPTION 'Troubleshoot Unit fixture conflicts with existing data';
    END IF;

    FOR v_code, v_serial, v_status, v_status_code IN
        SELECT * FROM (VALUES
            ('DEV-TRB-MH02-001', 'DEV-TRB-SN-001', 1, 'in_use'),
            ('DEV-TRB-RFU-001', 'DEV-TRB-SN-RFU-001', 2, 'in_stock_rfu')
        ) AS fixtures(device_code, serial_number, status_id, status_code)
    LOOP
        v_device := NULL;
        v_expected_unit := CASE WHEN v_status = 1 THEN v_unit ELSE NULL END;
        INSERT INTO devices (device_code, serial_number, status_id, site_id, current_unit_id,
            current_location_site_id, health_check_status, data_source, created_by)
        VALUES (v_code, v_serial, v_status, v_site, v_expected_unit, v_site, 'not_checked', 'dev_seed', v_actor)
        ON CONFLICT DO NOTHING RETURNING device_id INTO v_device;
        IF v_device IS NOT NULL THEN
            INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id,
                operation, new_values, change_group_id, action)
            VALUES (v_actor, v_actor_name, v_site, 'device', v_code, v_device, 'INSERT',
                jsonb_build_object('device_code', v_code, 'serial_number', v_serial, 'status', v_status_code,
                    'unit_id', v_expected_unit, 'site_id', v_site, 'fixture', 'development_troubleshoot'),
                gen_random_uuid(), 'device_register') RETURNING audit_id INTO v_audit;
            INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary)
            VALUES (v_device, 'registered', v_actor, v_actor_name, v_site, v_audit, 'Development Troubleshoot dropdown fixture');
        ELSIF NOT EXISTS (SELECT 1 FROM devices WHERE device_code = v_code AND serial_number = v_serial
            AND status_id = v_status AND site_id = v_site AND current_unit_id IS NOT DISTINCT FROM v_expected_unit
            AND current_location_site_id = v_site AND NOT is_deleted AND data_source = 'dev_seed') THEN
            RAISE EXCEPTION 'Fixture % conflicts or was changed. No existing device state was reset.', v_code;
        END IF;
    END LOOP;
END $$;

COMMIT;

SELECT d.device_code, d.serial_number, ds.code AS status, s.site_id, s.name AS site_name,
    fu.unit_no, et.name AS fleet_equipment_type, fu.egi
FROM devices d JOIN sites s ON s.site_id = d.site_id
JOIN device_statuses ds ON ds.status_id = d.status_id
LEFT JOIN fleet_units fu ON fu.unit_id = d.current_unit_id
LEFT JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
WHERE s.site_code = 'DEV-TROUBLESHOOT' AND NOT d.is_deleted
ORDER BY d.device_code;

SELECT component_type FROM (VALUES
    ('MH02 Device'), ('GPS/Antenna'), ('Camera'), ('Wiring'), ('Speaker'), ('SPM'), ('CPE'), ('Firmware')
) AS existing_component_options(component_type);