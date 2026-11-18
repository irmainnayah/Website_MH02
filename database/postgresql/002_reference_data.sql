-- Draft reference data for an empty development database after 001_initial_schema.sql.
-- Does not create sites, users, devices, fleet units, or inspection checklists.
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected database db_asset_report';
    END IF;
END $$;

INSERT INTO roles (role_code, name) VALUES
    ('superadmin', 'Super Admin'),
    ('user', 'User')
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO equipment_types (name) VALUES
    ('Dump Truck'), ('Water Truck'), ('Fuel Truck'), ('Loader'), ('Others')
ON CONFLICT (name) DO NOTHING;

INSERT INTO device_statuses (status_id, code, label, is_in_stock) VALUES
    (1, 'in_use', 'In Use', false),
    (2, 'in_stock_rfu', 'In Stock RFU', true),
    (3, 'in_stock_damaged', 'In Stock (Repair)', true),
    (4, 'in_stock_ho', 'In Stock HO', true);

INSERT INTO lookup_values (category, code, label, sort_order) VALUES
    ('shift', 'SHIFT_1', 'Shift 1', 1),
    ('shift', 'SHIFT_2', 'Shift 2', 2),
    ('source_power', 'STAND_BY', 'Stand By', 1),
    ('source_power', 'ACC_ON', 'Acc On', 2),
    ('source_power', 'STANDBY_PDU', 'Standby PDU', 3)
ON CONFLICT DO NOTHING;

COMMIT;