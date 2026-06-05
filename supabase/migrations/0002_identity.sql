-- =============================================================================
-- 0002_identity.sql
-- The "who" of the system: subsidiaries (billable customers), profiles
-- (everyone who logs in), and drivers (a profile + driving credentials).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- subsidiaries — Ensign group companies that PRUMAC bills
-- ---------------------------------------------------------------------------
CREATE TABLE app.subsidiaries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE,             -- short code: 'CT_MAGAZINE'
    name            text NOT NULL UNIQUE,             -- 'CT Magazine'
    legal_name      text,                             -- full registered name
    country         app.country_code NOT NULL DEFAULT 'ZW',
    billing_email   citext,
    billing_address text,
    phone           text,
    tax_number      text,                             -- VAT/BP number
    notes           text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER subsidiaries_touch BEFORE UPDATE ON app.subsidiaries
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX subsidiaries_active_idx ON app.subsidiaries (is_active) WHERE is_active;

COMMENT ON TABLE app.subsidiaries IS
    'Ensign Holdings subsidiaries that PRUMAC provides transport services to. '
    'Discovered from the JANUARY 2026 billing sheet "DEPARTMENT" column.';

SELECT app.fn_attach_audit('app.subsidiaries');

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users with our domain attributes
-- One row per logging-in human.
-- ---------------------------------------------------------------------------
CREATE TABLE app.profiles (
    id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       text NOT NULL,
    email           citext UNIQUE,
    phone           text UNIQUE,                       -- E.164: +263..., +27...
    role            app.user_role NOT NULL,
    subsidiary_id   uuid REFERENCES app.subsidiaries(id) ON DELETE RESTRICT,
    avatar_url      text,
    is_active       boolean NOT NULL DEFAULT true,
    deactivated_at  timestamptz,
    last_seen_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- A subsidiary_billing user MUST belong to a subsidiary; nobody else may.
    CONSTRAINT subsidiary_user_has_subsidiary
        CHECK (
            (role = 'subsidiary_billing' AND subsidiary_id IS NOT NULL)
         OR (role <> 'subsidiary_billing' AND subsidiary_id IS NULL)
        )
);

CREATE TRIGGER profiles_touch BEFORE UPDATE ON app.profiles
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX profiles_role_idx        ON app.profiles (role) WHERE is_active;
CREATE INDEX profiles_subsidiary_idx  ON app.profiles (subsidiary_id);
CREATE INDEX profiles_name_trgm_idx   ON app.profiles USING gin (full_name gin_trgm_ops);

COMMENT ON TABLE app.profiles IS
    'Application-level user profile, joined 1:1 to auth.users. Role determines '
    'capabilities; subsidiary_billing users are scoped to a single subsidiary.';

SELECT app.fn_attach_audit('app.profiles');

-- Auto-create a stub profile when a user is added in auth.users.
-- The application then fills in role, full_name, etc. through onboarding.
CREATE OR REPLACE FUNCTION app.fn_bootstrap_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
BEGIN
    INSERT INTO app.profiles (id, full_name, email, phone, role, is_active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed user'),
        NEW.email,
        NEW.phone,
        'driver',          -- safe default; admin elevates as needed
        false              -- inactive until onboarding completes
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION app.fn_bootstrap_profile();

-- ---------------------------------------------------------------------------
-- drivers — driving-specific data layered on a profile
-- Not every profile is a driver, so this is a separate table rather than
-- a column on profiles. Fleet managers can also be drivers in small ops.
-- ---------------------------------------------------------------------------
CREATE TABLE app.drivers (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id                  uuid NOT NULL UNIQUE REFERENCES app.profiles(id) ON DELETE CASCADE,
    employee_number             text UNIQUE,
    licence_number              text NOT NULL,
    licence_country             app.country_code NOT NULL DEFAULT 'ZW',
    licence_classes             text[] NOT NULL DEFAULT '{}', -- 'B','C1','EC','PRDP', etc.
    licence_issued_at           date,
    licence_expires_at          date,
    defensive_driving_cert_at   date,
    medical_cert_expires_at     date,
    home_address                text,
    next_of_kin_name            text,
    next_of_kin_phone           text,
    is_active                   boolean NOT NULL DEFAULT true,
    deactivated_reason          text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER drivers_touch BEFORE UPDATE ON app.drivers
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX drivers_active_idx        ON app.drivers (is_active) WHERE is_active;
CREATE INDEX drivers_licence_expiry_idx ON app.drivers (licence_expires_at)
    WHERE licence_expires_at IS NOT NULL;

COMMENT ON TABLE app.drivers IS
    'Driving credentials and employment data for users who drive. Licence '
    'and medical expiries are tracked here for proactive alerting.';

SELECT app.fn_attach_audit('app.drivers');

COMMIT;
