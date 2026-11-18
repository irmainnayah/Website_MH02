-- Draft for manual review and execution in the development database.
BEGIN;

DO $$
BEGIN
    IF current_database() <> 'db_asset_report' THEN
        RAISE EXCEPTION 'Expected database db_asset_report';
    END IF;
END $$;

ALTER TABLE auth_sessions ADD COLUMN mfa_verified_at timestamptz;

CREATE TABLE user_totp (
    user_id uuid PRIMARY KEY REFERENCES users(user_id),
    protected_secret text NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accepted_step bigint NOT NULL
);

CREATE TABLE auth_mfa_challenges (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(user_id),
    expires_at timestamptz NOT NULL,
    failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    pending_secret text,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_auth_mfa_challenges_user ON auth_mfa_challenges(user_id);

COMMIT;