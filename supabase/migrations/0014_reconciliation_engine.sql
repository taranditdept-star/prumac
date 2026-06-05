-- Migration 0014: Server-side reconciliation engine.
--
-- Per the Phase 1 architecture: when a trip transitions to completed, compare
-- odometer delta to GPS-derived distance and bucket the variance:
--   ≤  5%  → accepted    ≤ 10%  → warning
--   ≤ 20%  → flagged     > 20%  → critical
--
-- Special case: gps_km < 1 AND odometer_km > 10 → flagged + reason
-- 'gps_offline_suspected' (mining areas frequently lose signal per the
-- spreadsheet evidence — Filabusi, Sherwood Farm, Collenbawn).

-- Compute the GPS-derived distance for a trip in km.
CREATE OR REPLACE FUNCTION app.fn_compute_trip_gps_km(p_trip_id uuid)
RETURNS TABLE (gps_km numeric, ping_count integer, avg_accuracy_m numeric)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_line geography;
BEGIN
  -- Build an ordered LineString of pings; ST_MakeLine over geography points.
  -- We need at least 2 points to make a line; if fewer, return 0 km.
  SELECT
    ST_MakeLine(
      ARRAY(
        SELECT loc.point::geometry
        FROM app.trip_locations loc
        WHERE loc.trip_id = p_trip_id
        ORDER BY loc.recorded_at
      )
    )::geography,
    (SELECT COUNT(*)::integer FROM app.trip_locations WHERE trip_id = p_trip_id),
    (SELECT AVG(accuracy_m) FROM app.trip_locations WHERE trip_id = p_trip_id AND accuracy_m IS NOT NULL)
  INTO v_line, ping_count, avg_accuracy_m;

  IF v_line IS NULL OR ping_count < 2 THEN
    gps_km := 0;
  ELSE
    gps_km := ROUND((ST_Length(v_line) / 1000.0)::numeric, 2);
  END IF;

  RETURN NEXT;
END;
$$;

-- Reconcile a trip: compute the new row, supersede any prior current row.
-- Idempotent: safe to call multiple times — produces a new history row each time.
CREATE OR REPLACE FUNCTION app.fn_reconcile_trip(p_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_trip            app.trips%ROWTYPE;
  v_odo_km          numeric;
  v_gps_km          numeric;
  v_ping_count      integer;
  v_avg_acc         numeric;
  v_diff            numeric;
  v_variance        numeric;
  v_status          app.reconciliation_status;
  v_reasons         text[] := '{}';
  v_new_id          uuid;
BEGIN
  SELECT * INTO v_trip FROM app.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip % not found', p_trip_id;
  END IF;
  IF v_trip.start_odometer_km IS NULL OR v_trip.end_odometer_km IS NULL THEN
    RAISE EXCEPTION 'Trip % has no complete odometer pair', p_trip_id;
  END IF;

  v_odo_km := v_trip.end_odometer_km - v_trip.start_odometer_km;

  SELECT gps_km, ping_count, avg_accuracy_m
    INTO v_gps_km, v_ping_count, v_avg_acc
  FROM app.fn_compute_trip_gps_km(p_trip_id);

  v_diff := v_odo_km - v_gps_km;
  -- Variance is absolute percentage of odometer (avoid div/0)
  IF v_odo_km <= 0 THEN
    v_variance := 0;
  ELSE
    v_variance := ROUND((ABS(v_diff) / v_odo_km)::numeric, 4);
  END IF;

  -- Bucket
  IF v_variance <= 0.05 THEN
    v_status := 'accepted';
  ELSIF v_variance <= 0.10 THEN
    v_status := 'warning';
  ELSIF v_variance <= 0.20 THEN
    v_status := 'flagged';
  ELSE
    v_status := 'critical';
  END IF;

  -- Special: GPS offline suspected — long trip but barely any pings/distance
  IF v_gps_km < 1 AND v_odo_km > 10 THEN
    v_status := 'flagged';
    v_reasons := v_reasons || ARRAY['gps_offline_suspected'];
  END IF;

  IF v_ping_count < 2 THEN
    v_reasons := v_reasons || ARRAY['no_gps_data'];
  END IF;

  -- Insert new current reconciliation (supersede trigger handles is_current swap)
  INSERT INTO app.reconciliations (
    trip_id, odometer_km, gps_km, variance_pct,
    status, reason_codes, ping_count, avg_accuracy_m, is_current
  ) VALUES (
    p_trip_id, v_odo_km, v_gps_km, v_variance,
    v_status, v_reasons, COALESCE(v_ping_count, 0), v_avg_acc, true
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_compute_trip_gps_km(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_reconcile_trip(uuid)       TO authenticated, service_role;
