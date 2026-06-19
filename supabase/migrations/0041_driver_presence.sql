-- 0041_driver_presence.sql
-- ---------------------------------------------------------------------------
-- Always-on driver live location ("presence").
--
-- Today a driver only appears on the head-office live map while they sit on the
-- "Manage trip" screen with a trip in progress (GpsTracker writes trip_locations
-- keyed by trip_id). This adds a trip-independent presence layer so that the
-- moment a driver logs in and allows location, the admin sees them on the map —
-- no "Start trip", no "Manage trip", no "Sync now".
--
-- One row per driver (upserted = latest position only; the table never grows
-- with history — the trip GPS trail in trip_locations remains the audit record).
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS app.driver_presence (
  driver_id   uuid PRIMARY KEY REFERENCES app.drivers(id) ON DELETE CASCADE,
  point       geography(Point, 4326) NOT NULL,
  speed_kph   numeric,
  heading_deg numeric,
  accuracy_m  numeric,
  battery_pct smallint,
  -- Resolved server-side for live-map context (active trip / current vehicle).
  vehicle_id  uuid REFERENCES app.vehicles(id) ON DELETE SET NULL,
  trip_id     uuid REFERENCES app.trips(id)    ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_presence_updated
  ON app.driver_presence (updated_at DESC);

-- Presence rows are UPSERTed, so the live map relies on Realtime UPDATE events.
-- FULL replica identity guarantees those events carry the row reliably.
ALTER TABLE app.driver_presence REPLICA IDENTITY FULL;

ALTER TABLE app.driver_presence ENABLE ROW LEVEL SECURITY;

-- A driver can read / write only their own presence row. (Writes actually go
-- through the SECURITY DEFINER RPC below, but this keeps the table safe for any
-- direct access.)
DROP POLICY IF EXISTS driver_presence_owner ON app.driver_presence;
CREATE POLICY driver_presence_owner ON app.driver_presence
  FOR ALL TO authenticated
  USING (driver_id = app.current_driver_id())
  WITH CHECK (driver_id = app.current_driver_id());

-- Managers / admins can read every driver's live position (and need SELECT here
-- for the Realtime subscription on the live map to deliver change events).
DROP POLICY IF EXISTS driver_presence_managers_read ON app.driver_presence;
CREATE POLICY driver_presence_managers_read ON app.driver_presence
  FOR SELECT TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.driver_presence TO authenticated;

-- ---------------------------------------------------------------------------
-- Upsert the calling driver's latest position. Derives the driver from the JWT
-- (current_driver_id) so a driver can only ever write their own row, and
-- resolves their active trip + current vehicle for live-map context.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_record_driver_location(
  p_lat         double precision,
  p_lng         double precision,
  p_speed_kph   numeric DEFAULT NULL,
  p_heading_deg numeric DEFAULT NULL,
  p_accuracy_m  numeric DEFAULT NULL,
  p_battery_pct integer DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_driver     uuid;
  v_trip_id    uuid;
  v_vehicle_id uuid;
  v_now        timestamptz := now();
BEGIN
  v_driver := app.current_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Only drivers can report live location'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Active trip (if any) — so the marker can show trip status / link.
  SELECT t.id, t.vehicle_id
    INTO v_trip_id, v_vehicle_id
  FROM app.trips t
  WHERE t.driver_id = v_driver
    AND t.status IN ('in_progress', 'paused')
  ORDER BY t.started_at DESC NULLS LAST
  LIMIT 1;

  -- Not on a trip? Fall back to the driver's current vehicle assignment.
  IF v_vehicle_id IS NULL THEN
    SELECT a.vehicle_id
      INTO v_vehicle_id
    FROM app.vehicle_assignments a
    WHERE a.driver_id = v_driver
      AND a.ended_at IS NULL
    ORDER BY a.started_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO app.driver_presence AS dp (
    driver_id, point, speed_kph, heading_deg, accuracy_m, battery_pct,
    vehicle_id, trip_id, updated_at
  )
  VALUES (
    v_driver,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_speed_kph, p_heading_deg, p_accuracy_m, p_battery_pct::smallint,
    v_vehicle_id, v_trip_id, v_now
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    point       = EXCLUDED.point,
    speed_kph   = EXCLUDED.speed_kph,
    heading_deg = EXCLUDED.heading_deg,
    accuracy_m  = EXCLUDED.accuracy_m,
    battery_pct = EXCLUDED.battery_pct,
    vehicle_id  = EXCLUDED.vehicle_id,
    trip_id     = EXCLUDED.trip_id,
    updated_at  = EXCLUDED.updated_at;

  RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION
  app.fn_record_driver_location(double precision, double precision, numeric, numeric, numeric, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live positions of every driver who has reported within the staleness window.
-- Manager/admin only. Superset of fn_live_fleet_positions: includes drivers who
-- are simply logged in (no active trip) as well as those on a trip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_live_driver_positions(p_stale_seconds integer DEFAULT 900)
RETURNS TABLE (
  driver_id     uuid,
  driver_name   text,
  vehicle_id    uuid,
  plate_number  text,
  plate_country app.country_code,
  make          text,
  model         text,
  trip_id       uuid,
  trip_status   app.trip_status,
  lat           double precision,
  lng           double precision,
  speed_kph     numeric,
  heading_deg   numeric,
  recorded_at   timestamptz,
  seconds_old   integer
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF NOT (app.role_is('fleet_manager') OR app.role_is('admin')) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    dp.driver_id,
    p.full_name,
    dp.vehicle_id,
    v.plate_number,
    v.plate_country,
    v.make,
    v.model,
    dp.trip_id,
    t.status,
    ST_Y(dp.point::geometry),
    ST_X(dp.point::geometry),
    dp.speed_kph,
    dp.heading_deg,
    dp.updated_at,
    EXTRACT(EPOCH FROM (now() - dp.updated_at))::integer
  FROM app.driver_presence dp
  LEFT JOIN app.drivers  d ON d.id = dp.driver_id
  LEFT JOIN app.profiles p ON p.id = d.profile_id
  LEFT JOIN app.vehicles v ON v.id = dp.vehicle_id
  LEFT JOIN app.trips    t ON t.id = dp.trip_id
  WHERE dp.updated_at > now() - make_interval(secs => p_stale_seconds)
  ORDER BY dp.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_live_driver_positions(integer) TO authenticated, service_role;

-- Realtime: stream presence changes to the live map. Guarded so re-running the
-- migration doesn't error on "already a member of publication".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'app'
      AND tablename = 'driver_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.driver_presence;
  END IF;
END$$;

COMMIT;
