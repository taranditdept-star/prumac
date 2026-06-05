-- Migration 0015: RPC for inserting a batch of GPS pings.
-- PostgREST cannot directly serialize PostGIS geography columns from JSON,
-- so we expose a SECURITY DEFINER function that accepts lat/lng arrays.

CREATE OR REPLACE FUNCTION app.fn_record_ping_batch(
  p_trip_id    uuid,
  p_pings      jsonb        -- [{recorded_at,lat,lng,speed_kph?,heading_deg?,accuracy_m?,altitude_m?,battery_pct?,is_buffered?}]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_trip_driver uuid;
  v_current_driver uuid;
  v_count integer := 0;
  v_ping jsonb;
BEGIN
  -- Authz: the caller must be the trip's driver, OR a fleet_manager/admin
  SELECT driver_id INTO v_trip_driver FROM app.trips WHERE id = p_trip_id;
  IF v_trip_driver IS NULL THEN
    RAISE EXCEPTION 'Trip not found' USING ERRCODE = 'check_violation';
  END IF;

  v_current_driver := app.current_driver_id();

  IF NOT (
    v_current_driver IS NOT NULL AND v_current_driver = v_trip_driver
    OR app.role_is('fleet_manager')
    OR app.role_is('admin')
  ) THEN
    RAISE EXCEPTION 'permission denied: not your trip' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_ping IN SELECT * FROM jsonb_array_elements(p_pings)
  LOOP
    INSERT INTO app.trip_locations (
      trip_id, recorded_at, point, speed_kph, heading_deg,
      accuracy_m, altitude_m, battery_pct, is_buffered
    ) VALUES (
      p_trip_id,
      (v_ping->>'recorded_at')::timestamptz,
      ST_SetSRID(ST_MakePoint(
        (v_ping->>'lng')::double precision,
        (v_ping->>'lat')::double precision
      ), 4326)::geography,
      NULLIF(v_ping->>'speed_kph', '')::numeric,
      NULLIF(v_ping->>'heading_deg', '')::numeric,
      NULLIF(v_ping->>'accuracy_m', '')::numeric,
      NULLIF(v_ping->>'altitude_m', '')::numeric,
      NULLIF(v_ping->>'battery_pct', '')::smallint,
      COALESCE((v_ping->>'is_buffered')::boolean, false)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_record_ping_batch(uuid, jsonb) TO authenticated, service_role;

-- Helper to fetch ping points (lat/lng) for a trip — needed for the trail UI
-- since geography can't be selected through PostgREST directly.
CREATE OR REPLACE FUNCTION app.fn_get_trip_track(p_trip_id uuid)
RETURNS TABLE (
  recorded_at timestamptz,
  lat double precision,
  lng double precision,
  speed_kph numeric,
  accuracy_m numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  SELECT recorded_at,
         ST_Y(point::geometry) AS lat,
         ST_X(point::geometry) AS lng,
         speed_kph,
         accuracy_m
    FROM app.trip_locations
   WHERE trip_id = p_trip_id
   ORDER BY recorded_at;
$$;

GRANT EXECUTE ON FUNCTION app.fn_get_trip_track(uuid) TO authenticated, service_role;
