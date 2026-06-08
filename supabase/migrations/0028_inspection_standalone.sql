-- 0028_inspection_standalone.sql
-- ---------------------------------------------------------------------------
-- Feature 2: digital vehicle checklist in the driver interface.
--
-- The existing inspection engine (templates, checklist items, item results) is
-- reused as-is — we only lift the hard dependency on a trip so a driver can
-- complete the standard checklist for an assigned vehicle at any time.
--   1. inspections.trip_id becomes NULLABLE
--   2. the UNIQUE(trip_id, type) constraint becomes a PARTIAL unique index
--      (still one pre/post per trip, but standalone checklists are unconstrained)
--   3. new RPC fn_submit_standalone_inspection() — derives the driver from the
--      caller, takes the vehicle directly, no trip.
--   4. the existing per-class templates gain the paper form's "Operational test"
--      items so the digital checklist faithfully reflects the manual one.
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. trip_id nullable -------------------------------------------------------
ALTER TABLE app.inspections ALTER COLUMN trip_id DROP NOT NULL;

-- 2. swap the unique constraint for a partial unique index ------------------
ALTER TABLE app.inspections DROP CONSTRAINT IF EXISTS inspections_trip_id_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS inspections_trip_type_uniq
    ON app.inspections (trip_id, type)
    WHERE trip_id IS NOT NULL;

-- 3. standalone submission RPC ---------------------------------------------
-- Mirrors fn_submit_inspection but: caller IS the driver (no trip to derive
-- identity from), vehicle is passed directly, trip_id is NULL, no upsert.
CREATE OR REPLACE FUNCTION app.fn_submit_standalone_inspection(
  p_vehicle_id  uuid,
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
  v_driver_id     uuid;
  v_overall       app.inspection_result := 'pass';
  v_inspection_id uuid;
  v_item          jsonb;
  v_item_result   app.inspection_result;
  v_assigned      boolean;
BEGIN
  v_driver_id := app.current_driver_id();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Only an active driver can submit a vehicle checklist';
  END IF;

  -- The driver must currently hold this vehicle
  SELECT EXISTS (
    SELECT 1 FROM app.vehicle_assignments
    WHERE vehicle_id = p_vehicle_id
      AND driver_id  = v_driver_id
      AND ended_at IS NULL
  ) INTO v_assigned;
  IF NOT v_assigned THEN
    RAISE EXCEPTION 'Vehicle % is not assigned to you', p_vehicle_id;
  END IF;

  -- Worst-result rollup
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
    NULL, p_vehicle_id, v_driver_id, p_template_id,
    p_type, v_overall, p_odometer_km, p_notes
  )
  RETURNING id INTO v_inspection_id;

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

GRANT EXECUTE ON FUNCTION
  app.fn_submit_standalone_inspection(uuid, app.inspection_type, uuid, integer, text, jsonb)
  TO authenticated, service_role;

-- 4. Augment existing templates with the paper form's "Operational test"
--    section (was missing from the digital templates). Idempotent.
INSERT INTO app.inspection_checklist_items (template_id, sort_order, category, label, is_critical, requires_photo)
SELECT t.template_id::uuid, t.sort_order, 'Operational test', t.label, t.is_critical, false
FROM (VALUES
    -- Light Vehicle Standard
    ('11111111-1111-1111-1111-111111111101', 40, 'Engine starts smoothly',      false),
    ('11111111-1111-1111-1111-111111111101', 41, 'Brakes responsive on road',   true),
    ('11111111-1111-1111-1111-111111111101', 42, 'Steering tracks straight',     true),
    ('11111111-1111-1111-1111-111111111101', 43, 'Transmission shifts properly', false),
    ('11111111-1111-1111-1111-111111111101', 44, 'Suspension stable, no knocks', false),
    -- Heavy Vehicle Standard
    ('11111111-1111-1111-1111-111111111102', 40, 'Engine starts smoothly',      false),
    ('11111111-1111-1111-1111-111111111102', 41, 'Brakes responsive on road',   true),
    ('11111111-1111-1111-1111-111111111102', 42, 'Steering tracks straight',     true),
    ('11111111-1111-1111-1111-111111111102', 43, 'Transmission shifts properly', false),
    ('11111111-1111-1111-1111-111111111102', 44, 'Suspension stable, no knocks', false),
    -- Farm Vehicle Standard
    ('11111111-1111-1111-1111-111111111103', 40, 'Engine starts smoothly',      false),
    ('11111111-1111-1111-1111-111111111103', 41, 'Brakes responsive',           true),
    ('11111111-1111-1111-1111-111111111103', 42, 'Steering/controls respond',    true),
    ('11111111-1111-1111-1111-111111111103', 43, 'Hydraulics function',          false),
    ('11111111-1111-1111-1111-111111111103', 44, 'Suspension/chassis stable',    false)
) AS t(template_id, sort_order, label, is_critical)
WHERE NOT EXISTS (
  SELECT 1 FROM app.inspection_checklist_items i
  WHERE i.template_id = t.template_id::uuid
    AND i.category = 'Operational test'
    AND i.label = t.label
);

COMMIT;
