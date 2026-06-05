-- =============================================================================
-- 0023_lifecycle_audit.sql
-- Phase 13 — Admin / finance:
--   A. Vehicle lifecycle & depreciation (cost columns + straight-line functions)
--   B. Audit-log UI access (app-schema SECURITY DEFINER readers over audit.log,
--      since PostgREST only exposes the app schema — guarded to admins)
-- =============================================================================

BEGIN;

-- =============================================================================
-- A. VEHICLE LIFECYCLE / DEPRECIATION
-- =============================================================================
ALTER TABLE app.vehicles
    ADD COLUMN IF NOT EXISTS purchase_cost       numeric(14,2) CHECK (purchase_cost >= 0),
    ADD COLUMN IF NOT EXISTS purchase_currency   text NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS salvage_value       numeric(14,2) DEFAULT 0 CHECK (salvage_value >= 0),
    ADD COLUMN IF NOT EXISTS useful_life_years   numeric(5,2) CHECK (useful_life_years > 0),
    ADD COLUMN IF NOT EXISTS depreciation_method text NOT NULL DEFAULT 'straight_line'
        CHECK (depreciation_method IN ('straight_line', 'none')),
    ADD COLUMN IF NOT EXISTS disposal_proceeds   numeric(14,2) CHECK (disposal_proceeds >= 0);

-- Straight-line depreciation for one vehicle. age is measured from acquired_at to
-- disposal (decommissioned_at) or now. book_value never falls below salvage.
CREATE OR REPLACE FUNCTION app.fn_vehicle_depreciation(p_vehicle_id uuid)
RETURNS TABLE (
    purchase_cost            numeric,
    salvage_value            numeric,
    useful_life_years        numeric,
    method                   text,
    age_years                numeric,
    annual_depreciation      numeric,
    accumulated_depreciation numeric,
    book_value               numeric,
    depreciation_pct         numeric,
    lifetime_km              integer,
    cost_per_km              numeric,
    is_disposed              boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
    v             app.vehicles;
    v_age         numeric;
    v_depreciable numeric;
    v_annual      numeric;
    v_accum       numeric;
    v_book        numeric;
    v_pct         numeric;
    v_cpk         numeric;
BEGIN
    SELECT * INTO v FROM app.vehicles WHERE id = p_vehicle_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v.acquired_at IS NOT NULL THEN
        v_age := round(EXTRACT(epoch FROM
            (COALESCE(v.decommissioned_at::timestamptz, now()) - v.acquired_at::timestamptz))
            / (365.25 * 86400), 2);
    END IF;

    v_depreciable := v.purchase_cost - COALESCE(v.salvage_value, 0);

    IF v.purchase_cost IS NOT NULL AND v.depreciation_method = 'straight_line'
       AND v.useful_life_years IS NOT NULL AND v.useful_life_years > 0 THEN
        v_annual := round(v_depreciable / v.useful_life_years, 2);
        IF v_age IS NOT NULL THEN
            v_accum := LEAST(GREATEST(v_depreciable, 0), round(v_annual * v_age, 2));
            v_book  := round(v.purchase_cost - v_accum, 2);
            v_pct   := CASE WHEN v.purchase_cost > 0 THEN round(v_accum / v.purchase_cost * 100, 1) END;
        END IF;
    ELSIF v.purchase_cost IS NOT NULL THEN
        -- method 'none' (or no useful life): no depreciation booked
        v_annual := 0;
        v_accum  := 0;
        v_book   := v.purchase_cost;
        v_pct    := 0;
    END IF;

    IF v.purchase_cost IS NOT NULL AND v.current_odometer_km > 0 THEN
        v_cpk := round((v.purchase_cost - COALESCE(v_book, COALESCE(v.salvage_value, 0)))
                       / v.current_odometer_km, 4);
    END IF;

    RETURN QUERY SELECT
        v.purchase_cost, COALESCE(v.salvage_value, 0), v.useful_life_years,
        v.depreciation_method, v_age, v_annual, v_accum, v_book, v_pct,
        v.current_odometer_km, v_cpk, (v.decommissioned_at IS NOT NULL);
END;
$$;

-- Fleet register: every vehicle that has a purchase cost on file.
CREATE OR REPLACE FUNCTION app.fn_fleet_depreciation()
RETURNS TABLE (
    vehicle_id               uuid,
    plate_number             text,
    plate_country            app.country_code,
    make                     text,
    model                    text,
    status                   app.vehicle_status,
    purchase_cost            numeric,
    book_value               numeric,
    accumulated_depreciation numeric,
    depreciation_pct         numeric,
    age_years                numeric,
    cost_per_km              numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    SELECT
        v.id, v.plate_number, v.plate_country, v.make, v.model, v.status,
        d.purchase_cost, d.book_value, d.accumulated_depreciation,
        d.depreciation_pct, d.age_years, d.cost_per_km
    FROM app.vehicles v
    CROSS JOIN LATERAL app.fn_vehicle_depreciation(v.id) d
    WHERE v.purchase_cost IS NOT NULL
    ORDER BY d.book_value DESC NULLS LAST;
$$;

-- =============================================================================
-- B. AUDIT-LOG READERS (admin-only, expose audit.log through the app schema)
-- =============================================================================
CREATE OR REPLACE FUNCTION app.fn_audit_recent(
    p_limit     integer DEFAULT 100,
    p_table     text    DEFAULT NULL,
    p_operation text    DEFAULT NULL,
    p_actor     uuid    DEFAULT NULL
)
RETURNS TABLE (
    id              bigint,
    occurred_at     timestamptz,
    actor_id        uuid,
    actor_name      text,
    actor_role      text,
    operation       text,
    schema_name     text,
    table_name      text,
    row_pk          text,
    changed_columns text[],
    before_row      jsonb,
    after_row       jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
    IF NOT app.role_is('admin') THEN
        RAISE EXCEPTION 'Only administrators may read the audit log'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
        SELECT
            l.id, l.occurred_at, l.actor_id, p.full_name, l.actor_role,
            l.operation, l.schema_name, l.table_name, l.row_pk,
            l.changed_columns, l.before_row, l.after_row
        FROM audit.log l
        LEFT JOIN app.profiles p ON p.id = l.actor_id
        WHERE (p_table     IS NULL OR l.table_name = p_table)
          AND (p_operation IS NULL OR l.operation  = p_operation)
          AND (p_actor     IS NULL OR l.actor_id   = p_actor)
        ORDER BY l.occurred_at DESC
        LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;

-- Per-entity change history (e.g. one vehicle or driver).
CREATE OR REPLACE FUNCTION app.fn_audit_for_row(
    p_schema text,
    p_table  text,
    p_pk     text
)
RETURNS TABLE (
    id              bigint,
    occurred_at     timestamptz,
    actor_id        uuid,
    actor_name      text,
    actor_role      text,
    operation       text,
    changed_columns text[],
    before_row      jsonb,
    after_row       jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
    IF NOT app.role_is('admin') THEN
        RAISE EXCEPTION 'Only administrators may read the audit log'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
        SELECT
            l.id, l.occurred_at, l.actor_id, p.full_name, l.actor_role,
            l.operation, l.changed_columns, l.before_row, l.after_row
        FROM audit.log l
        LEFT JOIN app.profiles p ON p.id = l.actor_id
        WHERE l.schema_name = p_schema
          AND l.table_name  = p_table
          AND l.row_pk      = p_pk
        ORDER BY l.occurred_at DESC
        LIMIT 200;
END;
$$;

-- Distinct audited tables (+ change counts) for the filter dropdown.
CREATE OR REPLACE FUNCTION app.fn_audit_tables()
RETURNS TABLE (table_name text, change_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
    IF NOT app.role_is('admin') THEN
        RAISE EXCEPTION 'Only administrators may read the audit log'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
        SELECT l.table_name, count(*)
        FROM audit.log l
        GROUP BY l.table_name
        ORDER BY count(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_vehicle_depreciation(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_fleet_depreciation()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_audit_recent(integer, text, text, uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_audit_for_row(text, text, text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_audit_tables()                           TO authenticated, service_role;

COMMIT;
