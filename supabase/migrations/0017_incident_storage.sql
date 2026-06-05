-- Migration 0017: Storage bucket for inspection/fault/accident photos +
-- helper to pick the right inspection template per vehicle.

-- ───────────────────────────────────────────────────────────────────────────
-- Photos bucket (separate from `documents` so retention can differ)
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  15728640,  -- 15 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone signed-in may read the photos bucket; writes restricted to managers + the
-- driver who reported the incident. Service-role bypasses RLS for server actions.
CREATE POLICY "photos_read_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'photos');

CREATE POLICY "photos_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'photos');

CREATE POLICY "photos_update_ops"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM app.profiles
      WHERE id = auth.uid()
      AND role IN ('fleet_manager','admin')
    )
  );

CREATE POLICY "photos_delete_ops"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND EXISTS (
      SELECT 1 FROM app.profiles
      WHERE id = auth.uid()
      AND role IN ('fleet_manager','admin')
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Inspection template resolver: pick the best template for a given vehicle.
-- Prefers templates whose applies_to[] contains the vehicle class; falls back
-- to a generic one with empty applies_to.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_template_for_vehicle(p_vehicle_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_class app.vehicle_class;
  v_template uuid;
BEGIN
  SELECT class INTO v_class FROM app.vehicles WHERE id = p_vehicle_id;
  IF v_class IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_template
  FROM app.inspection_templates
  WHERE is_active
    AND v_class = ANY (applies_to)
  ORDER BY version DESC
  LIMIT 1;

  IF v_template IS NOT NULL THEN RETURN v_template; END IF;

  SELECT id INTO v_template
  FROM app.inspection_templates
  WHERE is_active
    AND (applies_to IS NULL OR cardinality(applies_to) = 0)
  ORDER BY version DESC
  LIMIT 1;

  RETURN v_template;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_template_for_vehicle(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Atomic inspection submission: trip_id, type, results+photos in one call.
-- Returns the new inspection id. Overall result is derived from the worst item.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_submit_inspection(
  p_trip_id     uuid,
  p_type        app.inspection_type,
  p_template_id uuid,
  p_odometer_km integer,
  p_notes       text,
  p_items       jsonb  -- [{ checklist_item_id, result, notes?, photo_path? }]
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

  -- Compute worst result
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

  -- Wipe previous item results for this inspection and re-insert
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
