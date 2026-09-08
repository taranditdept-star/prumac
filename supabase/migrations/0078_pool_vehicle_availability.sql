-- 0078_pool_vehicle_availability.sql
-- ---------------------------------------------------------------------------
-- Show a driver which pool vehicles are actually free.
--
-- A pool vehicle may be driven by anyone, but only by one person at a time —
-- app.trips already enforces that with a unique constraint, so a second driver
-- who picks a vehicle that is already out gets "This vehicle or driver already
-- has an open trip" at the moment they submit, after filling the whole form.
--
-- The picker could not warn them earlier because RLS confines a driver to their
-- OWN trips: they cannot see that a colleague has the vehicle. This function
-- answers only the narrow question the picker needs — which vehicles are out,
-- and with whom — and nothing else about those trips.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_vehicles_on_trip()
RETURNS TABLE (vehicle_id uuid, driver_name text, since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
    SELECT t.vehicle_id,
           COALESCE(p.full_name, 'another driver') AS driver_name,
           t.started_at AS since
      FROM app.trips t
      LEFT JOIN app.drivers  d ON d.id = t.driver_id
      LEFT JOIN app.profiles p ON p.id = d.profile_id
     WHERE t.status IN ('in_progress', 'paused');
$$;

REVOKE ALL ON FUNCTION app.fn_vehicles_on_trip() FROM public;
GRANT EXECUTE ON FUNCTION app.fn_vehicles_on_trip() TO authenticated;

COMMENT ON FUNCTION app.fn_vehicles_on_trip() IS
    'Vehicles currently out on a trip, for the start-trip picker. SECURITY '
    'DEFINER because a driver cannot read other drivers'' trips under RLS, and '
    'deliberately returns only vehicle, driver name and start time.';

COMMIT;
