-- Development-only fixture for manually testing the New Installation form.
-- Does not create a transaction. The API should create the installation itself.
-- Review all DEV_* values and run only against a disposable/development database.
BEGIN;

DO $$
DECLARE
    v_site_id integer;
    v_unit_id uuid;
    v_device_id uuid;
    v_equipment_type_id integer;
    v_actor_id uuid;
    v_actor_name varchar(120);
    v_audit_id bigint;
    v_change_group_id uuid;
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected database db_asset_report';
    END IF;

    SELECT equipment_type_id INTO v_equipment_type_id
    FROM equipment_types WHERE name = 'Dump Truck';
    IF v_equipment_type_id IS NULL THEN
        RAISE EXCEPTION 'Missing reference equipment type: Dump Truck. Apply 002_reference_data.sql first.';
    END IF;

    SELECT u.user_id, u.name INTO v_actor_id, v_actor_name
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE r.role_code = 'superadmin' AND u.status = 'active'
    ORDER BY u.created_at NULLS FIRST, u.nrp
    LIMIT 1;
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'An active Superadmin is required to seed the device audit event.';
    END IF;

    INSERT INTO sites (site_code, name, time_zone_id, is_operating_district, is_active)
    VALUES ('DEV-SANGATTA', 'Development Site (WITA)', 'Asia/Makassar', true, true)
    ON CONFLICT (site_code) DO NOTHING;

    SELECT site_id INTO v_site_id FROM sites WHERE site_code = 'DEV-SANGATTA';
    IF v_site_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM sites WHERE site_id = v_site_id AND is_active AND time_zone_id = 'Asia/Makassar'
    ) THEN
        RAISE EXCEPTION 'Development site fixture conflicts with existing data.';
    END IF;

    INSERT INTO lookup_values (category, code, label, site_id, sort_order, is_active) VALUES
        ('area', 'DEV_AREA_01', 'Development Area 01', v_site_id, 1, true),
        ('group_leader', 'DEV_GL_01', 'Development Group Leader', v_site_id, 1, true),
        ('spm_version', 'DEV_SPM_TEST', 'Development SPM Test', v_site_id, 1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO fleet_units (unit_no, equipment_type_id, egi, is_egi_confirmed, site_id, is_active, data_source)
    VALUES ('DEV-DT-001', v_equipment_type_id, 'DEV-TEST', false, v_site_id, true, 'manual')
    ON CONFLICT (unit_no) DO NOTHING;

    SELECT unit_id INTO v_unit_id FROM fleet_units WHERE unit_no = 'DEV-DT-001';
    IF v_unit_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM fleet_units
        WHERE unit_id = v_unit_id AND site_id = v_site_id AND equipment_type_id = v_equipment_type_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Development unit fixture conflicts with existing data.';
    END IF;

    INSERT INTO devices (device_code, serial_number, status_id, site_id, current_location_site_id,
        health_check_status, data_source, created_by)
    VALUES ('DEV-MH02-001', 'DEV-SN-001', 2, v_site_id, v_site_id, 'not_checked', 'manual', v_actor_id)
    ON CONFLICT DO NOTHING
    RETURNING device_id INTO v_device_id;

    IF v_device_id IS NOT NULL THEN
        v_change_group_id := gen_random_uuid();
        INSERT INTO audit_log (actor_user_id, actor_name, site_id, table_name, record_id, entity_id,
            operation, new_values, change_group_id, action)
        VALUES (v_actor_id, v_actor_name, v_site_id, 'device', 'DEV-MH02-001', v_device_id,
            'INSERT', jsonb_build_object('device_code', 'DEV-MH02-001', 'serial_number', 'DEV-SN-001',
                'status', 'in_stock_rfu', 'site_id', v_site_id), v_change_group_id, 'device_register')
        RETURNING audit_id INTO v_audit_id;

        INSERT INTO device_events (device_id, event_type, actor_user_id, actor_name, site_id, audit_id, summary)
        VALUES (v_device_id, 'registered', v_actor_id, v_actor_name, v_site_id, v_audit_id, 'Development fixture: registered as In Stock RFU');
    ELSE
        SELECT device_id INTO v_device_id FROM devices WHERE device_code = 'DEV-MH02-001';
        IF v_device_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM devices WHERE device_id = v_device_id AND site_id = v_site_id
                AND status_id = 2 AND current_unit_id IS NULL AND NOT is_deleted
        ) THEN
            RAISE EXCEPTION 'Development device fixture conflicts with existing data.';
        END IF;
    END IF;
END $$;

COMMIT;

SELECT
    s.site_code,
    s.name AS site_name,
    s.time_zone_id,
    fu.unit_no,
    et.name AS equipment_type,
    d.device_code,
    d.serial_number,
    st.code AS device_status
FROM sites s
JOIN fleet_units fu ON fu.site_id = s.site_id
JOIN equipment_types et ON et.equipment_type_id = fu.equipment_type_id
JOIN devices d ON d.site_id = s.site_id
JOIN device_statuses st ON st.status_id = d.status_id
WHERE s.site_code = 'DEV-SANGATTA'
    AND fu.unit_no = 'DEV-DT-001'
    AND d.device_code = 'DEV-MH02-001';