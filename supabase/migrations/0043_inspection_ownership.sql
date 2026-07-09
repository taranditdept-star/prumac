-- 0043_inspection_ownership.sql
-- ---------------------------------------------------------------------------
-- SECURITY (audit rank 7): fn_submit_inspection is SECURITY DEFINER and looked
-- up the trip solely by the client-supplied p_trip_id with NO caller check, so
-- any authenticated driver holding another driver's trip UUID (exposed in
-- /trips/[id] URLs) could overwrite that trip's pre/post inspection and flip a
-- genuine 'fail' to 'pass' attributed to the other driver. Add an ownership
-- guard mirroring fn_end_trip / fn_record_ping_batch.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_submit_inspection(
  p_trip_id     uuid,
  p_type        app.inspection_type,
  p_template_id uuid,
  p_odometer_km integer,
  p_notes       text,
  p_items       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_trip          app.trips%ROWTYPE;
  v_overall       app.inspection_result := 'pass';
  v_inspection_id uuid;
  v_item          jsonb;
  v_item_result   app.inspection_result;
BEGIN
  SELECT * INTO v_trip FROM app.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip % not found', p_trip_id;
  END IF;

  -- Only the trip's own driver, or a manager/admin, may submit its inspection.
  IF NOT (
    v_trip.driver_id = app.current_driver_id()
    OR app.role_is('fleet_manager') OR app.role_is('admin')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to submit an inspection for this trip'
      USING ERRCODE = '42501';
  END IF;

  -- Compute worst result.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_result := (v_item->>'result')::app.inspection_result;
    IF v_item_result = 'fail' THEN
      v_overall := 'fail';
    ELSIF v_item_result = 'attention' AND v_overall <> 'fail' THEN
      v_overall := 'attention';
    END IF;
  END LOOP;

  INSERT INTO app.inspections (
    trip_id, vehicle_id, driver_id, template_id,
    type, overall_result, odometer_km, overall_notes
  ) VALUES (
    p_trip_id, v_trip.vehicle_id, v_trip.driver_id, p_template_id,
    p_type, v_overall, p_odometer_km, p_notes
  )
  ON CONFLICT (trip_id, type) DO UPDATE
    SET overall_result = EXCLUDED.overall_result,
        odometer_km    = EXCLUDED.odometer_km,
        overall_notes  = EXCLUDED.overall_notes,
        completed_at   = now()
  RETURNING id INTO v_inspection_id;

  DELETE FROM app.inspection_item_results WHERE inspection_id = v_inspection_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO app.inspection_item_results (
      inspection_id, checklist_item_id, result, notes, photo_path
    ) VALUES (
      v_inspection_id,
      (v_item->>'checklist_item_id')::uuid,
      (v_item->>'result')::app.inspection_result,
      NULLIF(v_item->>'notes', ''),
      NULLIF(v_item->>'photo_path', '')
    );
  END LOOP;

  RETURN v_inspection_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_submit_inspection(uuid, app.inspection_type, uuid, integer, text, jsonb) TO authenticated, service_role;

COMMIT;
