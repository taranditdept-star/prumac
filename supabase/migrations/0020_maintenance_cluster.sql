-- =============================================================================
-- 0020_maintenance_cluster.sql
-- Phase 11 — Maintenance cluster:
--   A. Fuel management        (fuel_cards, fuel_logs, efficiency + anomaly scan)
--   B. Preventive maintenance (vehicle interval cols, pm_plans, due/upcoming fns)
--   C. Tyre & parts inventory (parts, part_movements, tyres, tyre_events)
--
-- Conventions mirrored from earlier migrations:
--   * everything lives in the `app` schema, audited via app.fn_attach_audit
--   * RLS enabled per table with a manager/admin "manage" policy
--   * scan functions are SECURITY DEFINER + idempotent (7-day alert dedupe)
-- =============================================================================

-- New alert kinds. Added OUTSIDE the transaction (autocommit) so the labels are
-- committed before anything could reference them. They are only referenced from
-- plpgsql function bodies below, which resolve enum labels at runtime anyway.
ALTER TYPE app.alert_kind ADD VALUE IF NOT EXISTS 'fuel_anomaly';
ALTER TYPE app.alert_kind ADD VALUE IF NOT EXISTS 'part_low_stock';

BEGIN;

-- Catalogue / lifecycle enums -------------------------------------------------
CREATE TYPE app.part_category AS ENUM (
    'tyre', 'filter', 'oil', 'fluid', 'brake', 'battery', 'belt',
    'electrical', 'body', 'service_kit', 'other'
);

CREATE TYPE app.tyre_status AS ENUM ('in_service', 'spare', 'in_store', 'scrapped');

CREATE TYPE app.part_movement_type AS ENUM ('in', 'out', 'adjustment');

-- =============================================================================
-- A. FUEL MANAGEMENT
-- =============================================================================

-- Fuel cards ------------------------------------------------------------------
CREATE TABLE app.fuel_cards (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number         text NOT NULL,
    provider            text,                                  -- 'Puma','Total','Engen'
    assigned_vehicle_id uuid REFERENCES app.vehicles(id) ON DELETE SET NULL,
    is_active           boolean NOT NULL DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fuel_cards_number_unique UNIQUE (card_number)
);

CREATE TRIGGER fuel_cards_touch BEFORE UPDATE ON app.fuel_cards
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX fuel_cards_vehicle_idx ON app.fuel_cards (assigned_vehicle_id) WHERE is_active;

SELECT app.fn_attach_audit('app.fuel_cards');

-- Fuel logs -------------------------------------------------------------------
CREATE TABLE app.fuel_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    driver_id       uuid REFERENCES app.drivers(id) ON DELETE SET NULL,
    trip_id         uuid REFERENCES app.trips(id) ON DELETE SET NULL,
    fuel_card_id    uuid REFERENCES app.fuel_cards(id) ON DELETE SET NULL,
    filled_at       timestamptz NOT NULL DEFAULT now(),
    odometer_km     integer CHECK (odometer_km >= 0),
    litres          numeric(9,2) NOT NULL CHECK (litres > 0),
    price_per_litre numeric(10,4) CHECK (price_per_litre >= 0),
    total_cost      numeric(12,2) NOT NULL CHECK (total_cost >= 0),
    currency        text NOT NULL DEFAULT 'USD',
    is_full_tank    boolean NOT NULL DEFAULT true,
    station         text,
    payment_method  text,                                      -- 'fuel_card','cash','coupon','company_pump'
    receipt_path    text,                                      -- documents bucket key
    notes           text,
    created_by      uuid REFERENCES app.profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER fuel_logs_touch BEFORE UPDATE ON app.fuel_logs
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX fuel_logs_vehicle_idx ON app.fuel_logs (vehicle_id, filled_at DESC);
CREATE INDEX fuel_logs_trip_idx    ON app.fuel_logs (trip_id);
CREATE INDEX fuel_logs_period_idx  ON app.fuel_logs (filled_at DESC);

COMMENT ON TABLE app.fuel_logs IS
    'Per-fill fuel purchases. Efficiency is derived between consecutive '
    'odometer readings via app.fn_vehicle_fuel_efficiency.';

SELECT app.fn_attach_audit('app.fuel_logs');

-- Fuel efficiency: L/100km and cost/km between consecutive odometer fills.
CREATE OR REPLACE FUNCTION app.fn_vehicle_fuel_efficiency(
    p_vehicle_id   uuid,
    p_period_start date DEFAULT NULL,
    p_period_end   date DEFAULT NULL
)
RETURNS TABLE (
    total_litres     numeric,
    total_cost       numeric,
    distance_km      numeric,
    litres_per_100km numeric,
    cost_per_km      numeric,
    fill_count       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    WITH fills AS (
        SELECT
            odometer_km,
            litres,
            total_cost,
            filled_at,
            LAG(odometer_km) OVER (ORDER BY filled_at, odometer_km) AS prev_odo
        FROM app.fuel_logs
        WHERE vehicle_id = p_vehicle_id
          AND odometer_km IS NOT NULL
          AND (p_period_start IS NULL OR filled_at::date >= p_period_start)
          AND (p_period_end   IS NULL OR filled_at::date <= p_period_end)
    ),
    deltas AS (
        SELECT
            litres,
            total_cost,
            CASE WHEN prev_odo IS NOT NULL AND odometer_km > prev_odo
                 THEN odometer_km - prev_odo END AS seg_km
        FROM fills
    )
    SELECT
        COALESCE(SUM(litres), 0)::numeric                                   AS total_litres,
        COALESCE(SUM(total_cost), 0)::numeric                               AS total_cost,
        COALESCE(SUM(seg_km), 0)::numeric                                   AS distance_km,
        CASE WHEN COALESCE(SUM(seg_km), 0) > 0
             THEN ROUND(SUM(litres) FILTER (WHERE seg_km IS NOT NULL)
                        / SUM(seg_km) * 100, 2) END                         AS litres_per_100km,
        CASE WHEN COALESCE(SUM(seg_km), 0) > 0
             THEN ROUND(SUM(total_cost) FILTER (WHERE seg_km IS NOT NULL)
                        / SUM(seg_km), 4) END                               AS cost_per_km,
        COUNT(*)::integer                                                   AS fill_count
    FROM deltas;
$$;

-- Flag fills whose implied consumption is far above the vehicle's trailing
-- average (possible theft / leak / data error). Idempotent per fuel_log.
CREATE OR REPLACE FUNCTION app.fn_scan_fuel_anomalies(p_lookback_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
    v_row   record;
    v_count integer := 0;
BEGIN
    FOR v_row IN
        WITH segs AS (
            SELECT
                fl.id,
                fl.vehicle_id,
                fl.filled_at,
                fl.litres,
                fl.odometer_km,
                LAG(fl.odometer_km) OVER (PARTITION BY fl.vehicle_id ORDER BY fl.filled_at, fl.odometer_km) AS prev_odo
            FROM app.fuel_logs fl
            WHERE fl.odometer_km IS NOT NULL
              AND fl.filled_at > now() - make_interval(days => p_lookback_days)
        ),
        rated AS (
            SELECT
                id, vehicle_id, filled_at, litres,
                (odometer_km - prev_odo) AS seg_km,
                CASE WHEN prev_odo IS NOT NULL AND odometer_km > prev_odo
                     THEN litres / (odometer_km - prev_odo) * 100 END AS l_per_100
            FROM segs
            WHERE prev_odo IS NOT NULL AND odometer_km > prev_odo
        ),
        baseline AS (
            SELECT vehicle_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY l_per_100) AS median_l_per_100
            FROM rated
            GROUP BY vehicle_id
            HAVING COUNT(*) >= 3
        )
        SELECT r.id, r.vehicle_id, r.l_per_100, b.median_l_per_100, r.seg_km
        FROM rated r
        JOIN baseline b USING (vehicle_id)
        WHERE r.l_per_100 > b.median_l_per_100 * 1.6
          AND r.l_per_100 > 0
    LOOP
        IF EXISTS (
            SELECT 1 FROM app.alerts a
            WHERE a.kind = 'fuel_anomaly'
              AND a.vehicle_id = v_row.vehicle_id
              AND a.payload->>'fuel_log_id' = v_row.id::text
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO app.alerts (kind, severity, vehicle_id, title, body, payload)
        VALUES (
            'fuel_anomaly', 'warning', v_row.vehicle_id,
            'Unusual fuel consumption',
            format('A fill showed %s L/100km versus a typical %s L/100km for this vehicle.',
                   round(v_row.l_per_100::numeric, 1), round(v_row.median_l_per_100::numeric, 1)),
            jsonb_build_object(
                'fuel_log_id', v_row.id,
                'l_per_100km', round(v_row.l_per_100::numeric, 1),
                'median_l_per_100km', round(v_row.median_l_per_100::numeric, 1),
                'segment_km', v_row.seg_km
            )
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- B. PREVENTIVE MAINTENANCE SCHEDULER
-- =============================================================================

ALTER TABLE app.vehicles
    ADD COLUMN IF NOT EXISTS service_interval_days integer CHECK (service_interval_days > 0),
    ADD COLUMN IF NOT EXISTS last_service_date     date;

-- Recurring maintenance tasks per vehicle (oil service, tyre rotation, etc.)
CREATE TABLE app.pm_plans (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id    uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE CASCADE,
    task_name     text NOT NULL,
    interval_km   integer CHECK (interval_km > 0),
    interval_days integer CHECK (interval_days > 0),
    last_done_km  integer CHECK (last_done_km >= 0),
    last_done_at  date,
    is_active     boolean NOT NULL DEFAULT true,
    notes         text,
    created_by    uuid REFERENCES app.profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pm_plans_has_interval CHECK (interval_km IS NOT NULL OR interval_days IS NOT NULL)
);

CREATE TRIGGER pm_plans_touch BEFORE UPDATE ON app.pm_plans
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX pm_plans_vehicle_idx ON app.pm_plans (vehicle_id) WHERE is_active;

SELECT app.fn_attach_audit('app.pm_plans');

-- Unified upcoming / overdue maintenance feed. Combines the vehicle's base
-- service interval with any pm_plans rows. km_remaining/days_remaining are NULL
-- when that dimension is not tracked; negative means overdue.
CREATE OR REPLACE FUNCTION app.fn_upcoming_maintenance(
    p_within_km   integer DEFAULT 1000,
    p_within_days integer DEFAULT 14
)
RETURNS TABLE (
    vehicle_id     uuid,
    plate_number   text,
    plate_country  app.country_code,
    make           text,
    model          text,
    source         text,        -- 'base' | 'plan'
    plan_id        uuid,
    task_name      text,
    due_odometer_km integer,
    km_remaining   integer,
    due_date       date,
    days_remaining integer,
    is_overdue     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    WITH base AS (
        SELECT
            v.id, v.plate_number, v.plate_country, v.make, v.model,
            'base'::text AS source,
            NULL::uuid AS plan_id,
            'Routine service'::text AS task_name,
            (v.last_service_odometer_km + v.service_interval_km) AS due_odometer_km,
            (v.last_service_odometer_km + v.service_interval_km - v.current_odometer_km) AS km_remaining,
            (v.last_service_date + (v.service_interval_days || ' days')::interval)::date AS due_date,
            CASE WHEN v.last_service_date IS NOT NULL AND v.service_interval_days IS NOT NULL
                 THEN (v.last_service_date + (v.service_interval_days || ' days')::interval)::date - current_date END AS days_remaining
        FROM app.vehicles v
        WHERE v.status <> 'decommissioned'
          AND v.last_service_odometer_km IS NOT NULL
          AND v.service_interval_km IS NOT NULL
    ),
    plans AS (
        SELECT
            v.id, v.plate_number, v.plate_country, v.make, v.model,
            'plan'::text AS source,
            p.id AS plan_id,
            p.task_name,
            CASE WHEN p.interval_km IS NOT NULL
                 THEN COALESCE(p.last_done_km, v.current_odometer_km) + p.interval_km END AS due_odometer_km,
            CASE WHEN p.interval_km IS NOT NULL
                 THEN COALESCE(p.last_done_km, v.current_odometer_km) + p.interval_km - v.current_odometer_km END AS km_remaining,
            CASE WHEN p.interval_days IS NOT NULL
                 THEN (COALESCE(p.last_done_at, current_date) + (p.interval_days || ' days')::interval)::date END AS due_date,
            CASE WHEN p.interval_days IS NOT NULL
                 THEN (COALESCE(p.last_done_at, current_date) + (p.interval_days || ' days')::interval)::date - current_date END AS days_remaining
        FROM app.pm_plans p
        JOIN app.vehicles v ON v.id = p.vehicle_id
        WHERE p.is_active AND v.status <> 'decommissioned'
    ),
    unioned AS (
        SELECT * FROM base
        UNION ALL
        SELECT * FROM plans
    )
    SELECT
        id, plate_number, plate_country, make, model, source, plan_id, task_name,
        due_odometer_km, km_remaining, due_date, days_remaining,
        (COALESCE(km_remaining, 999999) < 0 OR COALESCE(days_remaining, 999999) < 0) AS is_overdue
    FROM unioned
    WHERE COALESCE(km_remaining, 999999) <= p_within_km
       OR COALESCE(days_remaining, 999999) <= p_within_days
    ORDER BY is_overdue DESC, LEAST(COALESCE(km_remaining, 999999), COALESCE(days_remaining, 999999) * 50);
$$;

-- Raise 'service_due' alerts for due/overdue items. Idempotent (7-day dedupe
-- per vehicle + task). Mirrors app.fn_scan_document_expiries.
CREATE OR REPLACE FUNCTION app.fn_scan_service_due(
    p_within_km   integer DEFAULT 500,
    p_within_days integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
    v_row   record;
    v_count integer := 0;
    v_sev   app.alert_severity;
BEGIN
    FOR v_row IN
        SELECT * FROM app.fn_upcoming_maintenance(p_within_km, p_within_days)
    LOOP
        IF EXISTS (
            SELECT 1 FROM app.alerts a
            WHERE a.kind = 'service_due'
              AND a.vehicle_id = v_row.vehicle_id
              AND a.resolved_at IS NULL
              AND a.raised_at > now() - interval '7 days'
              AND a.payload->>'task' = v_row.task_name
        ) THEN
            CONTINUE;
        END IF;

        v_sev := CASE WHEN v_row.is_overdue THEN 'critical'::app.alert_severity
                      ELSE 'warning'::app.alert_severity END;

        INSERT INTO app.alerts (kind, severity, vehicle_id, title, body, payload)
        VALUES (
            'service_due', v_sev, v_row.vehicle_id,
            CASE WHEN v_row.is_overdue THEN v_row.task_name || ' overdue'
                 ELSE v_row.task_name || ' due soon' END,
            trim(both ' ' FROM concat_ws(' · ',
                CASE WHEN v_row.km_remaining IS NOT NULL
                     THEN abs(v_row.km_remaining) || ' km ' || CASE WHEN v_row.km_remaining < 0 THEN 'over' ELSE 'remaining' END END,
                CASE WHEN v_row.days_remaining IS NOT NULL
                     THEN abs(v_row.days_remaining) || ' days ' || CASE WHEN v_row.days_remaining < 0 THEN 'over' ELSE 'remaining' END END
            )),
            jsonb_build_object(
                'task', v_row.task_name,
                'source', v_row.source,
                'plan_id', v_row.plan_id,
                'km_remaining', v_row.km_remaining,
                'days_remaining', v_row.days_remaining,
                'due_odometer_km', v_row.due_odometer_km,
                'due_date', v_row.due_date
            )
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- C. TYRE & PARTS INVENTORY
-- =============================================================================

-- Parts catalogue + running stock --------------------------------------------
CREATE TABLE app.parts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku           text,
    name          text NOT NULL,
    category      app.part_category NOT NULL DEFAULT 'other',
    unit          text NOT NULL DEFAULT 'each',                -- 'each','litre','set'
    unit_cost     numeric(12,2) CHECK (unit_cost >= 0),
    currency      text NOT NULL DEFAULT 'USD',
    current_stock numeric(12,2) NOT NULL DEFAULT 0,
    reorder_level numeric(12,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    supplier      text,
    location      text,
    is_active     boolean NOT NULL DEFAULT true,
    notes         text,
    created_by    uuid REFERENCES app.profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT parts_sku_unique UNIQUE (sku)
);

CREATE TRIGGER parts_touch BEFORE UPDATE ON app.parts
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX parts_category_idx  ON app.parts (category) WHERE is_active;
CREATE INDEX parts_low_stock_idx ON app.parts (id)
    WHERE is_active AND current_stock <= reorder_level;

SELECT app.fn_attach_audit('app.parts');

-- Stock ledger. Immutable rows; a trigger keeps parts.current_stock in sync.
CREATE TABLE app.part_movements (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id           uuid NOT NULL REFERENCES app.parts(id) ON DELETE CASCADE,
    movement_type     app.part_movement_type NOT NULL,
    quantity          numeric(12,2) NOT NULL,
    unit_cost         numeric(12,2) CHECK (unit_cost >= 0),
    vehicle_id        uuid REFERENCES app.vehicles(id) ON DELETE SET NULL,
    service_record_id uuid REFERENCES app.service_records(id) ON DELETE SET NULL,
    reference         text,
    moved_at          timestamptz NOT NULL DEFAULT now(),
    notes             text,
    created_by        uuid REFERENCES app.profiles(id),
    created_at        timestamptz NOT NULL DEFAULT now(),

    -- in/out are always positive; an adjustment is a signed correction.
    CONSTRAINT part_movements_qty_sign
        CHECK ((movement_type IN ('in', 'out') AND quantity > 0)
               OR movement_type = 'adjustment')
);

CREATE INDEX part_movements_part_idx    ON app.part_movements (part_id, moved_at DESC);
CREATE INDEX part_movements_vehicle_idx ON app.part_movements (vehicle_id);

SELECT app.fn_attach_audit('app.part_movements');

CREATE OR REPLACE FUNCTION app.fn_apply_part_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_delta numeric;
BEGIN
    v_delta := CASE NEW.movement_type
        WHEN 'in'         THEN NEW.quantity
        WHEN 'out'        THEN -NEW.quantity
        WHEN 'adjustment' THEN NEW.quantity   -- signed
    END;
    UPDATE app.parts SET current_stock = current_stock + v_delta WHERE id = NEW.part_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER part_movements_apply AFTER INSERT ON app.part_movements
    FOR EACH ROW EXECUTE FUNCTION app.fn_apply_part_movement();

-- Raise 'part_low_stock' alerts for active parts at/under reorder level.
CREATE OR REPLACE FUNCTION app.fn_scan_part_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
    v_row   record;
    v_count integer := 0;
BEGIN
    FOR v_row IN
        SELECT id, name, current_stock, reorder_level, unit
        FROM app.parts
        WHERE is_active AND current_stock <= reorder_level
    LOOP
        IF EXISTS (
            SELECT 1 FROM app.alerts a
            WHERE a.kind = 'part_low_stock'
              AND a.resolved_at IS NULL
              AND a.raised_at > now() - interval '7 days'
              AND a.payload->>'part_id' = v_row.id::text
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO app.alerts (kind, severity, title, body, payload)
        VALUES (
            'part_low_stock', 'warning',
            'Low stock: ' || v_row.name,
            format('%s %s remaining (reorder at %s).',
                   v_row.current_stock, v_row.unit, v_row.reorder_level),
            jsonb_build_object(
                'part_id', v_row.id,
                'current_stock', v_row.current_stock,
                'reorder_level', v_row.reorder_level
            )
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Tyres -----------------------------------------------------------------------
CREATE TABLE app.tyres (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number      text,
    brand              text,
    pattern            text,
    size               text,                                   -- '11R22.5'
    vehicle_id         uuid REFERENCES app.vehicles(id) ON DELETE SET NULL,
    position           text,                                   -- 'FL','FR','RL1','RR1','spare'
    status             app.tyre_status NOT NULL DEFAULT 'in_store',
    fitted_at          date,
    fitted_odometer_km integer CHECK (fitted_odometer_km >= 0),
    removed_at         date,
    tread_depth_mm     numeric(4,1) CHECK (tread_depth_mm >= 0),
    cost               numeric(12,2) CHECK (cost >= 0),
    currency           text NOT NULL DEFAULT 'USD',
    notes              text,
    created_by         uuid REFERENCES app.profiles(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tyres_fitted_needs_vehicle
        CHECK (status <> 'in_service' OR (vehicle_id IS NOT NULL AND position IS NOT NULL))
);

CREATE TRIGGER tyres_touch BEFORE UPDATE ON app.tyres
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX tyres_vehicle_idx ON app.tyres (vehicle_id) WHERE status = 'in_service';

-- Only one in-service tyre per vehicle position.
CREATE UNIQUE INDEX tyres_one_per_position ON app.tyres (vehicle_id, position)
    WHERE status = 'in_service' AND position IS NOT NULL;

SELECT app.fn_attach_audit('app.tyres');

CREATE TABLE app.tyre_events (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tyre_id        uuid NOT NULL REFERENCES app.tyres(id) ON DELETE CASCADE,
    vehicle_id     uuid REFERENCES app.vehicles(id) ON DELETE SET NULL,
    event_type     text NOT NULL CHECK (event_type IN ('fitted','removed','rotated','inspected','scrapped')),
    position       text,
    odometer_km    integer CHECK (odometer_km >= 0),
    tread_depth_mm numeric(4,1) CHECK (tread_depth_mm >= 0),
    occurred_at    date NOT NULL DEFAULT current_date,
    notes          text,
    created_by     uuid REFERENCES app.profiles(id),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tyre_events_tyre_idx ON app.tyre_events (tyre_id, occurred_at DESC);

SELECT app.fn_attach_audit('app.tyre_events');

-- =============================================================================
-- RLS — manager/admin manage everything; drivers may log their own fuel.
-- =============================================================================
ALTER TABLE app.fuel_cards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fuel_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pm_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.parts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.part_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tyres          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tyre_events    ENABLE ROW LEVEL SECURITY;

CREATE POLICY fuel_cards_manage ON app.fuel_cards
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY fuel_logs_manage ON app.fuel_logs
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- Drivers can see and add fuel logs for trips/vehicles assigned to them.
CREATE POLICY fuel_logs_driver_read ON app.fuel_logs
    FOR SELECT TO authenticated
    USING (driver_id = app.current_driver_id());

CREATE POLICY fuel_logs_driver_insert ON app.fuel_logs
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = app.current_driver_id());

CREATE POLICY pm_plans_manage ON app.pm_plans
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY parts_manage ON app.parts
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY part_movements_manage ON app.part_movements
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY tyres_manage ON app.tyres
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY tyre_events_manage ON app.tyre_events
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

GRANT EXECUTE ON FUNCTION app.fn_vehicle_fuel_efficiency(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_scan_fuel_anomalies(integer)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_upcoming_maintenance(integer, integer)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_scan_service_due(integer, integer)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_scan_part_stock()                          TO authenticated, service_role;

COMMIT;
