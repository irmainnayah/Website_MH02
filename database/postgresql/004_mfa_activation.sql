-- Draft for manual review and execution in the development database.
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected database db_asset_report';
    END IF;
END $$;

CREATE TABLE mfa_activation_codes (
    user_id uuid PRIMARY KEY REFERENCES users(user_id),
    token_hash char(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid REFERENCES users(user_id)
);

COMMIT;