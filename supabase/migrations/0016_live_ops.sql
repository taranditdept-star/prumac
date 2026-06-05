-- Migration 0016: Live Ops helpers + alert generators.

-- Latest GPS position per active trip, joined with vehicle + driver names.
-- Used by /live/map to render fleet markers.
CREATE OR REPLACE FUNCTION app.fn_live_fleet_positions()
RETURNS TABLE (
  trip_id        uuid,
  vehicle_id     uuid,
  plate_number   text,
  plate_country  app.country_code,
  make           text,
  model          text,
  driver_name    text,
  trip_status    app.trip_status,
  lat            double precision,
  lng            double precision,
  speed_kph      numeric,
  heading_deg    numeric,
  recorded_at    timestamptz,
  seconds_old    integer
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  WITH active_trips AS (
    SELECT t.id, t.vehicle_id, t.driver_id, t.status
    FROM app.trips t
    WHERE t.status IN ('in_progress', 'paused')
  ),
  latest_ping AS (
    SELECT DISTINCT ON (loc.trip_id)
      loc.trip_id,
      ST_Y(loc.point::geometry) AS lat,
      ST_X(loc.point::geometry) AS lng,
      loc.speed_kph,
      loc.heading_deg,
      loc.recorded_at
    FROM app.trip_locations loc
    JOIN active_trips at ON at.id = loc.trip_id
    ORDER BY loc.trip_id, loc.recorded_at DESC
  )
  SELECT
    t.id,
    v.id,
    v.plate_number,
    v.plate_country,
    v.make,
    v.model,
    p.full_name,
    t.status,
    lp.lat,
    lp.lng,
    lp.speed_kph,
    lp.heading_deg,
    lp.recorded_at,
    EXTRACT(EPOCH FROM (now() - lp.recorded_at))::integer
  FROM active_trips t
  JOIN app.vehicles v        ON v.id = t.vehicle_id
  LEFT JOIN app.drivers d    ON d.id = t.driver_id
  LEFT JOIN app.profiles p   ON p.id = d.profile_id
  LEFT JOIN latest_ping lp   ON lp.trip_id = t.id
  WHERE lp.lat IS NOT NULL
  ORDER BY lp.recorded_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION app.fn_live_fleet_positions() TO authenticated, service_role;

-- Generate alerts for documents that are expiring or already expired.
-- Idempotent: only raises an alert if none is open for that vehicle+kind in
-- the last 7 days. Safe to call from a cron job.
CREATE OR REPLACE FUNCTION app.fn_scan_document_expiries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_count integer := 0;
  v_doc record;
BEGIN
  FOR v_doc IN
    SELECT d.vehicle_id, d.document_type, d.expires_at, v.plate_number
    FROM app.vehicle_documents d
    JOIN app.vehicles v ON v.id = d.vehicle_id
    WHERE d.is_active
      AND d.expires_at <= (now()::date + interval '30 days')
  LOOP
    -- Skip if there is already an open alert for this vehicle+kind raised in the last 7 days
    IF EXISTS (
      SELECT 1 FROM app.alerts a
      WHERE a.vehicle_id = v_doc.vehicle_id
        AND a.kind IN ('document_expiring', 'document_expired')
        AND a.resolved_at IS NULL
        AND a.raised_at > now() - interval '7 days'
        AND a.payload->>'document_type' = v_doc.document_type::text
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO app.alerts (kind, severity, vehicle_id, title, body, payload)
    VALUES (
      (CASE WHEN v_doc.expires_at < now()::date THEN 'document_expired' ELSE 'document_expiring' END)::app.alert_kind,
      (CASE WHEN v_doc.expires_at < now()::date THEN 'critical'
            WHEN v_doc.expires_at < (now()::date + interval '14 days') THEN 'warning'
            ELSE 'info' END)::app.alert_severity,
      v_doc.vehicle_id,
      v_doc.plate_number || ' — ' ||
        replace(v_doc.document_type::text, '_', ' ') || ' ' ||
        CASE WHEN v_doc.expires_at < now()::date THEN 'expired' ELSE 'expiring soon' END,
      'Expires ' || to_char(v_doc.expires_at, 'DD Mon YYYY'),
      jsonb_build_object(
        'document_type', v_doc.document_type::text,
        'expires_at', v_doc.expires_at
      )
    );
    v_count := v_count + 1;
  END LOOP;

  -- Also raise alerts when a reconciliation goes flagged/critical and no open alert exists
  INSERT INTO app.alerts (kind, severity, vehicle_id, trip_id, title, body, payload)
  SELECT
    CASE WHEN r.status = 'critical' THEN 'reconciliation_critical'::app.alert_kind
         ELSE 'reconciliation_flagged'::app.alert_kind END,
    CASE WHEN r.status = 'critical' THEN 'critical'::app.alert_severity
         ELSE 'warning'::app.alert_severity END,
    t.vehicle_id,
    r.trip_id,
    v.plate_number || ' — ' || r.status || ' reconciliation',
    ROUND(r.variance_pct * 100, 1) || '% variance · ' ||
      r.odometer_km || ' km odo vs ' || r.gps_km || ' km GPS',
    jsonb_build_object(
      'variance_pct', r.variance_pct,
      'reason_codes', r.reason_codes
    )
  FROM app.reconciliations r
  JOIN app.trips    t ON t.id = r.trip_id
  JOIN app.vehicles v ON v.id = t.vehicle_id
  WHERE r.is_current
    AND r.status IN ('flagged', 'critical')
    AND NOT EXISTS (
      SELECT 1 FROM app.alerts a
      WHERE a.trip_id = r.trip_id
        AND a.kind IN ('reconciliation_flagged', 'reconciliation_critical')
        AND a.resolved_at IS NULL
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_scan_document_expiries() TO authenticated, service_role;

-- Enable Realtime publication for live fleet updates
ALTER PUBLICATION supabase_realtime ADD TABLE app.trip_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE app.alerts;
