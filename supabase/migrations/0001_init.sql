-- =============================================================================
-- 0001_init.sql
-- Extensions, enums, common helper functions, and audit infrastructure.
-- This is the foundation. Every subsequent migration depends on it.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";          -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";            -- case-insensitive emails
CREATE EXTENSION IF NOT EXISTS "postgis";           -- GPS geometry
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- fuzzy search on driver names
CREATE EXTENSION IF NOT EXISTS "btree_gist";        -- exclusion constraints on tstzrange
CREATE EXTENSION IF NOT EXISTS "pg_cron" SCHEMA extensions;  -- scheduled jobs

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;       -- our domain
CREATE SCHEMA IF NOT EXISTS audit;     -- audit log lives here, isolated

COMMENT ON SCHEMA app   IS 'PRUMAC fleet platform domain tables';
COMMENT ON SCHEMA audit IS 'Append-only audit log for all operational tables';

-- ---------------------------------------------------------------------------
-- Enums — defined once, referenced everywhere
-- ---------------------------------------------------------------------------

CREATE TYPE app.user_role AS ENUM (
    'driver',
    'fleet_manager',
    'admin',
    'subsidiary_billing'
);

CREATE TYPE app.country_code AS ENUM ('ZW', 'ZA');

CREATE TYPE app.vehicle_class AS ENUM (
    'tanker',              -- Scania, Iveco — fuel-based billing
    'truck',               -- Nissan UD 40 — per-km heavy
    'minibus',             -- Toyota Quantum / Hiace
    'bakkie',              -- Toyota Hilux, Ford Ranger — per-km medium
    'suv',                 -- Toyota Fortuner, Honda Vezel
    'sedan',               -- Toyota Axio, Honda Fit, Toyota Aqua, Hyundai i10
    'farm_vehicle',        -- Grabber — per-load billing
    'specialist'           -- Vanguard, Legend 45
);

CREATE TYPE app.vehicle_status AS ENUM (
    'available',
    'on_trip',
    'maintenance',
    'workshop',           -- being repaired
    'decommissioned'
);

CREATE TYPE app.fuel_type AS ENUM ('diesel', 'petrol', 'hybrid', 'electric');

CREATE TYPE app.document_type AS ENUM (
    'license_disc',       -- ZW vehicle licence / ZA licence disc
    'insurance',
    'fitness',            -- Certificate of Fitness (commercial vehicles)
    'registration',       -- registration book / NaTIS papers
    'cross_border'        -- for vehicles that cross ZW-ZA border
);

CREATE TYPE app.insurance_type AS ENUM (
    'third_party',
    'full_cover',
    'champions',
    'old_mutual_full_cover',
    'miway_full_cover',
    'other'
);

CREATE TYPE app.trip_status AS ENUM (
    'planned',
    'in_progress',
    'paused',
    'ended',              -- odometer captured, post-trip inspection pending
    'completed',          -- everything done, reconciliation has run
    'cancelled'
);

CREATE TYPE app.trip_purpose AS ENUM (
    'delivery',
    'sales',
    'collection',
    'maintenance_run',
    'admin',
    'personal',           -- approved personal use
    'other'
);

CREATE TYPE app.inspection_type   AS ENUM ('pre_trip', 'post_trip');
CREATE TYPE app.inspection_result AS ENUM ('pass', 'attention', 'fail');

CREATE TYPE app.fault_severity    AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE app.fault_status      AS ENUM ('reported', 'acknowledged', 'in_repair', 'resolved', 'wont_fix');

CREATE TYPE app.accident_severity AS ENUM ('minor', 'moderate', 'severe', 'fatal');
CREATE TYPE app.accident_status   AS ENUM ('reported', 'investigating', 'closed');

CREATE TYPE app.reconciliation_status AS ENUM (
    'pending',            -- gps stream may still be arriving
    'accepted',           -- <= 5% variance
    'warning',            -- 5–10%
    'flagged',            -- 10–20%, or gps_offline_suspected
    'critical'            -- > 20% — excluded from automatic billing
);

CREATE TYPE app.billing_mode AS ENUM (
    'per_km',
    'per_litre_100km',    -- tankers
    'per_load',           -- grabber
    'fixed_monthly'
);

CREATE TYPE app.invoice_status AS ENUM (
    'draft',
    'issued',
    'paid',
    'partially_paid',
    'overdue',
    'void'
);

CREATE TYPE app.alert_kind AS ENUM (
    'gps_offline',
    'route_deviation',
    'speeding',
    'fault_reported',
    'accident_reported',
    'service_due',
    'document_expiring',
    'document_expired',
    'reconciliation_flagged',
    'reconciliation_critical'
);

CREATE TYPE app.alert_severity AS ENUM ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- Common helper functions
-- ---------------------------------------------------------------------------

-- Returns true iff the current JWT carries the given role (or 'admin' which
-- supersedes all roles).
-- NOTE: these functions reference app.profiles which is created in 0002.
-- Using plpgsql so the body is validated at call time, not creation time.
CREATE OR REPLACE FUNCTION app.role_is(target_role app.user_role)
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.profiles p
        WHERE p.id = auth.uid()
          AND (p.role = target_role OR p.role = 'admin')
          AND p.is_active
    );
END;
$$;

-- Returns the subsidiary_id of the current user, if they have one.
CREATE OR REPLACE FUNCTION app.current_subsidiary_id()
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_sub uuid;
BEGIN
    SELECT subsidiary_id INTO v_sub
    FROM app.profiles
    WHERE id = auth.uid() AND is_active;
    RETURN v_sub;
END;
$$;

-- updated_at maintenance — attached to every table with an updated_at column
CREATE OR REPLACE FUNCTION app.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- A single table receiving JSONB snapshots of every change to the operational
-- tables. The audit log is append-only — RLS in 0006 will forbid UPDATE
-- and DELETE on it for everyone.
-- ---------------------------------------------------------------------------

CREATE TABLE audit.log (
    id              bigserial PRIMARY KEY,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    actor_id        uuid,                             -- auth.uid(), nullable for system actions
    actor_role      text,                             -- captured at the moment of action
    operation       text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    schema_name     text NOT NULL,
    table_name      text NOT NULL,
    row_pk          text NOT NULL,                    -- stringified primary key (uuid::text)
    before_row      jsonb,                            -- NULL for INSERT
    after_row       jsonb,                            -- NULL for DELETE
    changed_columns text[],                           -- diff convenience for UPDATE
    request_id      text                              -- correlation id from app, optional
);

CREATE INDEX audit_log_table_pk_idx
    ON audit.log (schema_name, table_name, row_pk);
CREATE INDEX audit_log_actor_idx
    ON audit.log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_occurred_idx
    ON audit.log (occurred_at DESC);

-- Generic audit trigger. Tables opt in by attaching it.
CREATE OR REPLACE FUNCTION audit.fn_capture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public, pg_temp
AS $$
DECLARE
    v_pk text;
    v_actor uuid := auth.uid();
    v_role text;
    v_changed text[];
    v_before jsonb;
    v_after  jsonb;
BEGIN
    -- Resolve the PK; expect a column named "id" on every audited table.
    IF TG_OP = 'DELETE' THEN
        v_pk := OLD.id::text;
        v_before := to_jsonb(OLD);
        v_after  := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_pk := NEW.id::text;
        v_before := NULL;
        v_after  := to_jsonb(NEW);
    ELSE
        v_pk := NEW.id::text;
        v_before := to_jsonb(OLD);
        v_after  := to_jsonb(NEW);
        -- compute changed column names
        SELECT array_agg(key)
          INTO v_changed
          FROM jsonb_each(v_before) b
          JOIN jsonb_each(v_after)  a USING (key)
         WHERE b.value IS DISTINCT FROM a.value;
    END IF;

    -- best-effort role capture; ignore if profile not yet visible
    BEGIN
        SELECT p.role::text INTO v_role
        FROM app.profiles p
        WHERE p.id = v_actor;
    EXCEPTION WHEN OTHERS THEN
        v_role := NULL;
    END;

    INSERT INTO audit.log (
        actor_id, actor_role, operation,
        schema_name, table_name, row_pk,
        before_row, after_row, changed_columns
    ) VALUES (
        v_actor, v_role, TG_OP,
        TG_TABLE_SCHEMA, TG_TABLE_NAME, v_pk,
        v_before, v_after, v_changed
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Helper to attach the audit trigger to a table in one line.
CREATE OR REPLACE FUNCTION app.fn_attach_audit(target_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    trigger_name text := 'aud_' || replace(target_table::text, '.', '_');
BEGIN
    EXECUTE format(
        'CREATE TRIGGER %I
            AFTER INSERT OR UPDATE OR DELETE ON %s
            FOR EACH ROW EXECUTE FUNCTION audit.fn_capture_change()',
        trigger_name, target_table
    );
END;
$$;

COMMIT;
