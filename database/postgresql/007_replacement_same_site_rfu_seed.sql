-- DEVELOPMENT ONLY. Review and run manually in PostgreSQL db_asset_report.
-- Set v_old_device_code to the old Device ID selected on the replacement form.
-- DEV-MH02-001 is the device from the installation development fixture.
-- Creates one new RFU device at that device's Site; never resets existing devices.
BEGIN;

DO $$
DECLARE
    v_old_device_code varchar(40) := 'DEV-MH02-001';
    v_new_device_code varchar(40) := 'DEV-REP-RFU-002';
    v_serial varchar(80) := 'DEV-REP-SN-RFU-002';
    v_site integer;
    v_site_name varchar(100);
    v_rfu_status integer;
    v_device uuid;
    v_actor uuid;
    v_actor_name varchar(120);
    v_audit bigint;
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected development database db_asset_report';
    END IF;
    IF v_new_device_code NOT LIKE 'DEV-%' OR v_serial NOT LIKE 'DEV-%'
        OR v_new_device_code = v_old_device_code THEN
        RAISE EXCEPTION 'New device and serial must be distinct development fixture identifiers';
    END IF;

    SELECT d.site_id, s.name INTO v_site, v_site_name
    FROM devices d
    JOIN device_statuses st ON st.status_id = d.status_id
    JOIN sites s ON s.site_id = d.site_id
    JOIN fleet_units fu ON fu.unit_id = d.current_unit_id AND fu.site_id = d.site_id
    WHERE d.device_code = v_old_device_code AND st.code = 'in_use'
        AND NOT d.is_deleted AND s.is_active AND fu.is_active
    FOR SHARE OF d, s, fu;
    IF v_site IS NULL THEN
        RAISE EXCEPTION 'Old device % must be In Use on an active Unit/Site. Set v_old_device_code to the selected old Device ID.', v_old_device_code;
    END IF;

    SELECT status_id INTO v_rfu_status FROM device_statuses WHERE code = 'in_stock_rfu';
    IF v_rfu_status IS NULL THEN
        RAISE EXCEPTION 'Missing in_stock_rfu status reference';
    END IF;
    SELECT u.user_id, u.name INTO v_actor, v_actor_name
    FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.status = 'active' AND r.role_code = 'superadmin'
    ORDER BY u.created_at NULLS FIRST, u.nrp LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'An active Superadmin is required for device audit history';
    END IF;

    INSERT INTO devices (device_code, serial_number, status_id, site_id,
        current_location_site_id, current_unit_id, health_check_status, data_source, created_by)
    VALUES (v_new_device_code, v_serial, v_rfu_status, v_site,
        v_site, NULL, 'not_checked', 'dev_seed', v_actor)
    ON CONFLICT DO NOTHING RETURNING device_id INTO v_device;

    IF v_device IS NOT NULL THEN
        INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id,
            entity_id, operation, new_values, change_group_id, action)
        VALUES (v_actor, v_actor_name, v_site, 'device', v_new_device_code,
            v_device, 'INSERT', jsonb_build_object('device_code', v_new_device_code,
                'serial_number', v_serial, 'status', 'in_stock_rfu', 'site_id', v_site,
                'fixture', 'development_same_site_replacement'), gen_random_uuid(), 'device_register')
        RETURNING audit_id INTO v_audit;

        INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name,
            site_id, audit_id, summary)
        VALUES (v_device, 'registered', v_actor, v_actor_name,
            v_site, v_audit, 'Development RFU fixture at the replacement old device Site');
    ELSIF NOT EXISTS (
        SELECT 1 FROM devices WHERE device_code = v_new_device_code AND serial_number = v_serial
            AND site_id = v_site AND current_location_site_id = v_site
            AND status_id = v_rfu_status AND current_unit_id IS NULL
            AND NOT is_deleted AND data_source = 'dev_seed'
    ) THEN
        RAISE EXCEPTION 'Fixture % conflicts with existing data or was already used. No existing device was changed.', v_new_device_code;
    END IF;

    RAISE NOTICE 'RFU device % is available at Site % (id %), matching old device %',
        v_new_device_code, v_site_name, v_site, v_old_device_code;
END $$;

COMMIT;