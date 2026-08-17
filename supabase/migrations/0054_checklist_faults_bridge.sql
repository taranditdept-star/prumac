-- 0054_checklist_faults_bridge.sql
-- ---------------------------------------------------------------------------
-- Make the daily vehicle checklist "intelligent": a reported problem becomes a
-- tracked fault on the vehicle, carried forward until it is actually fixed —
-- instead of the checklist asking the same question cold every day.
--
--   1. app.faults gains: source ('manual'|'checklist'), checklist_item_id, and
--      inspection_id (which submission first raised it).
--   2. A partial-unique index guarantees AT MOST ONE open fault per
--      (vehicle, checklist_item) — so re-confirming "still broken" tomorrow does
--      NOT pile up duplicate faults (carry-forward dedupe).
--   3. fn_submit_standalone_inspection now, per item:
--         • fail/attention  → opens a fault IF one isn't already open, and
--         • pass            → auto-resolves any open checklist fault for it
--                             ("fixed now" clears it).
--      Manual faults (checklist_item_id IS NULL) are never touched.
--   4. fn_open_vehicle_faults() — lets the driver's checklist screen (and pool
--      drivers) read the vehicle's open checklist faults to pre-flag them,
--      despite faults RLS only exposing a driver's own reports.
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. new columns ------------------------------------------------------------
ALTER TABLE app.faults
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'manual'
      CHECK (source IN ('manual', 'checklist')),
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid REFERENCES app.inspection_checklist_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspection_id     uuid REFERENCES app.inspections(id) ON DELETE SET NULL;

-- 2. at most one OPEN fault per (vehicle, checklist item) --------------------
CREATE UNIQUE INDEX IF NOT EXISTS faults_open_checklist_item_uniq
  ON app.faults (vehicle_id, checklist_item_id)
  WHERE checklist_item_id IS NOT NULL AND status NOT IN ('resolved', 'wont_fix');

-- helps the "open faults for this vehicle" lookup
CREATE INDEX IF NOT EXISTS faults_open_by_vehicle_idx
  ON app.faults (vehicle_id)
  WHERE status IN ('reported', 'acknowledged', 'in_repair');

-- 3. standalone submission RPC — now bridges into faults --------------------
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
  v_item_id       uuid;
  v_assigned      boolean;
  v_cat           text;
  v_label         text;
  v_crit          boolean;
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
    v_item_id     := (v_item->>'checklist_item_id')::uuid;
    v_item_result := (v_item->>'result')::app.inspection_result;

    INSERT INTO app.inspection_item_results (
      inspection_id, checklist_item_id, result, notes, photo_path
    ) VALUES (
      v_inspection_id,
      v_item_id,
      v_item_result,
      NULLIF(v_item->>'notes', ''),
      NULLIF(v_item->>'photo_path', '')
    );

    -- ── Fault bridge ──────────────────────────────────────────────────────
    IF v_item_result = 'pass' THEN
      -- "Fixed now" — clear any open checklist fault for this item.
      UPDATE app.faults
         SET status = 'resolved',
             resolved_at = now(),
             resolved_notes = COALESCE(resolved_notes, 'Cleared — marked OK on a later checklist')
       WHERE vehicle_id = p_vehicle_id
         AND checklist_item_id = v_item_id
         AND status NOT IN ('resolved', 'wont_fix');
    ELSE
      -- fail/attention — open a fault only if none is already open (dedupe).
      SELECT category, label, is_critical
        INTO v_cat, v_label, v_crit
        FROM app.inspection_checklist_items
       WHERE id = v_item_id;

      INSERT INTO app.faults (
        vehicle_id, trip_id, reported_by, severity, status,
        category, title, description, odometer_km,
        source, checklist_item_id, inspection_id
      )
      SELECT
        p_vehicle_id, NULL, v_driver_id,
        (CASE
           WHEN v_item_result = 'fail' AND v_crit THEN 'critical'
           WHEN v_item_result = 'fail'            THEN 'high'
           ELSE 'low'
         END)::app.fault_severity,
        'reported',
        COALESCE(NULLIF(v_cat, ''), 'other'),
        COALESCE(NULLIF(v_label, ''), 'Checklist item'),
        COALESCE(NULLIF(v_item->>'notes', ''), 'Reported on the daily vehicle checklist'),
        p_odometer_km,
        'checklist', v_item_id, v_inspection_id
      WHERE NOT EXISTS (
        SELECT 1 FROM app.faults f
        WHERE f.vehicle_id = p_vehicle_id
          AND f.checklist_item_id = v_item_id
          AND f.status NOT IN ('resolved', 'wont_fix')
      );
    END IF;
  END LOOP;

  RETURN v_inspection_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  app.fn_submit_standalone_inspection(uuid, app.inspection_type, uuid, integer, text, jsonb)
  TO authenticated, service_role;

-- 4. open checklist faults for a vehicle (for the carry-forward screen) ------
-- faults RLS only exposes a driver's OWN reports, but a pool vehicle may carry
-- a fault raised by another driver — so read it through a guarded definer fn.
CREATE OR REPLACE FUNCTION app.fn_open_vehicle_faults(p_vehicle_id uuid)
RETURNS TABLE (
  checklist_item_id uuid,
  severity          app.fault_severity,
  title             text,
  description       text,
  reported_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  SELECT f.checklist_item_id, f.severity, f.title, f.description, f.reported_at
  FROM app.faults f
  WHERE f.vehicle_id = p_vehicle_id
    AND f.checklist_item_id IS NOT NULL
    AND f.status IN ('reported', 'acknowledged', 'in_repair')
    AND (
      app.role_is('fleet_manager') OR app.role_is('admin')
      OR EXISTS (
        SELECT 1 FROM app.vehicle_assignments va
        WHERE va.vehicle_id = p_vehicle_id
          AND va.driver_id  = app.current_driver_id()
          AND va.ended_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM app.vehicles v
        WHERE v.id = p_vehicle_id AND v.is_pool = true
      )
    );
$$;

GRANT EXECUTE ON FUNCTION app.fn_open_vehicle_faults(uuid) TO authenticated, service_role;

COMMIT;
