-- 0039_trip_load_count.sql
-- ---------------------------------------------------------------------------
-- Billing fix for per_load vehicles (e.g. the grabber): capture how many loads
-- a trip carried instead of assuming exactly one. fn_trip_charge now bills
-- COALESCE(load_count, 1) loads. (per_litre_100km already reads trips.fuel_litres
-- which the End-trip form captures — no DB change needed there.)
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.trips
  ADD COLUMN IF NOT EXISTS load_count integer CHECK (load_count >= 0 AND load_count <= 1000);

COMMENT ON COLUMN app.trips.load_count IS
  'Number of loads carried on this trip — drives per_load billing. NULL = 1.';

CREATE OR REPLACE FUNCTION app.fn_trip_charge(p_trip_id uuid)
RETURNS TABLE (
  description text,
  quantity numeric,
  unit_amount numeric,
  rate_mode app.billing_mode
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_trip      app.trips%ROWTYPE;
  v_rate      app.billing_rates%ROWTYPE;
  v_distance  numeric;
  v_loads     numeric;
  v_vehicle_plate text;
BEGIN
  SELECT * INTO v_trip FROM app.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT plate_number INTO v_vehicle_plate FROM app.vehicles WHERE id = v_trip.vehicle_id;

  v_rate := app.fn_effective_rate(v_trip.vehicle_id, v_trip.subsidiary_id, v_trip.started_at::date);
  IF v_rate.id IS NULL THEN RETURN; END IF;

  v_distance := COALESCE(v_trip.end_odometer_km - v_trip.start_odometer_km, 0);

  rate_mode := v_rate.mode;

  IF v_rate.mode = 'per_km' THEN
    description := format('%s · %s', v_vehicle_plate, COALESCE(v_trip.route_description, 'Trip'));
    quantity := v_distance;
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'per_litre_100km' THEN
    -- fuel_litres × (distance / 100) × rate
    description := format('%s · %s (fuel-based)', v_vehicle_plate, COALESCE(v_trip.route_description, 'Trip'));
    quantity := COALESCE(v_trip.fuel_litres, 0) * (v_distance / 100.0);
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'per_load' THEN
    -- Bill the number of loads carried (defaults to 1 if not recorded).
    v_loads := COALESCE(v_trip.load_count, 1);
    description := format('%s · %s load(s) · %s', v_vehicle_plate, v_loads, COALESCE(v_trip.route_description, 'Trip'));
    quantity := v_loads;
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'fixed_monthly' THEN
    -- Handled by a separate pass per subsidiary so we don't repeat per trip
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_trip_charge(uuid) TO authenticated, service_role;

COMMIT;
