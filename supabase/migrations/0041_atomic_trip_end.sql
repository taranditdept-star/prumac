-- 0041_atomic_trip_end.sql
-- ---------------------------------------------------------------------------
-- Fix: endTrip did the ended→completed transition + vehicle-free in TWO
-- separate client calls; a network blip between them stranded the trip in
-- 'ended', which the one-open-trip indexes count as open — freezing the driver
-- AND the vehicle until a manager intervened.
--
-- fn_end_trip does it all in ONE transaction (SECURITY DEFINER, owner-checked):
-- validate → ended → completed → free vehicle → reconcile (non-fatal). It is
-- also idempotent for recovery: if a trip is already 'ended', it just completes
-- it. Reconciliation failure never rolls back the completion.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_end_trip(
  p_trip_id       uuid,
  p_end_odometer  integer,
  p_fuel_litres   numeric DEFAULT NULL,
  p_fuel_amount   numeric DEFAULT NULL,
  p_load_count    integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_trip app.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_trip FROM app.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  -- Only the trip's own driver, or a manager/admin, may end it.
  IF NOT (
    v_trip.driver_id = app.current_driver_id()
    OR app.role_is('fleet_manager') OR app.role_is('admin')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to end this trip' USING ERRCODE = '42501';
  END IF;

  IF v_trip.status NOT IN ('in_progress', 'paused', 'ended') THEN
    RAISE EXCEPTION 'This trip cannot be ended (status: %)', v_trip.status;
  END IF;

  -- First transition (skip if already 'ended' from a prior partial failure).
  IF v_trip.status IN ('in_progress', 'paused') THEN
    IF p_end_odometer < v_trip.start_odometer_km THEN
      RAISE EXCEPTION 'End odometer (%) is below the start reading (%)', p_end_odometer, v_trip.start_odometer_km;
    END IF;
    IF p_end_odometer - v_trip.start_odometer_km > 5000 THEN
      RAISE EXCEPTION 'End odometer looks too high — please check the reading';
    END IF;
    UPDATE app.trips
    SET status = 'ended',
        ended_at = now(),
        end_odometer_km = p_end_odometer,
        fuel_litres = p_fuel_litres,
        fuel_amount = p_fuel_amount,
        load_count = p_load_count
    WHERE id = p_trip_id;
  END IF;

  -- Complete + free the vehicle.
  UPDATE app.trips SET status = 'completed', completed_at = now()
  WHERE id = p_trip_id AND status = 'ended';

  UPDATE app.vehicles SET status = 'available' WHERE id = v_trip.vehicle_id;

  -- Reconciliation is advisory — never let it roll back the completion.
  BEGIN
    PERFORM app.fn_reconcile_trip(p_trip_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_end_trip(uuid, integer, numeric, numeric, integer) TO authenticated, service_role;

COMMIT;
