-- 0032_vehicle_handovers.sql
-- ---------------------------------------------------------------------------
-- Feature 3: formal vehicle handover / takeover between drivers.
--
-- The outgoing driver initiates a handover (completing a 'handover' checklist);
-- the receiving driver confirms the takeover (completing a 'takeover' checklist).
-- On confirmation the vehicle is atomically reassigned. Both checklists are the
-- record that the two drivers agreed on the vehicle's condition.
--
-- Inspections + reassignment for the RECEIVING driver run through SECURITY
-- DEFINER RPCs because the receiver does not hold the vehicle yet, so they
-- cannot use the assignment-guarded standalone inspection path.
-- ---------------------------------------------------------------------------
BEGIN;

DO $$ BEGIN
    CREATE TYPE app.handover_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.vehicle_handovers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id         uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    from_driver_id     uuid NOT NULL REFERENCES app.drivers(id) ON DELETE RESTRICT,
    to_driver_id       uuid NOT NULL REFERENCES app.drivers(id) ON DELETE RESTRICT,
    status             app.handover_status NOT NULL DEFAULT 'pending',
    from_inspection_id uuid REFERENCES app.inspections(id) ON DELETE SET NULL,
    to_inspection_id   uuid REFERENCES app.inspections(id) ON DELETE SET NULL,
    odometer_km        integer CHECK (odometer_km >= 0),
    notes              text,
    reject_reason      text,
    from_signed_at     timestamptz,
    to_signed_at       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT handover_distinct_drivers CHECK (from_driver_id <> to_driver_id)
);

-- At most one open handover per vehicle.
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_handovers_one_open
    ON app.vehicle_handovers (vehicle_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS vehicle_handovers_to_idx
    ON app.vehicle_handovers (to_driver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_handovers_from_idx
    ON app.vehicle_handovers (from_driver_id, status, created_at DESC);

CREATE TRIGGER vehicle_handovers_touch BEFORE UPDATE ON app.vehicle_handovers
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

SELECT app.fn_attach_audit('app.vehicle_handovers');

-- RLS ----------------------------------------------------------------------
ALTER TABLE app.vehicle_handovers ENABLE ROW LEVEL SECURITY;

-- Both participating drivers can see their handovers. Writes go through the
-- SECURITY DEFINER RPCs below, so no driver insert/update policy is needed.
DROP POLICY IF EXISTS vehicle_handovers_read_participant ON app.vehicle_handovers;
CREATE POLICY vehicle_handovers_read_participant ON app.vehicle_handovers
    FOR SELECT TO authenticated
    USING (from_driver_id = app.current_driver_id()
        OR to_driver_id = app.current_driver_id());

DROP POLICY IF EXISTS vehicle_handovers_manage ON app.vehicle_handovers;
CREATE POLICY vehicle_handovers_manage ON app.vehicle_handovers
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

GRANT SELECT ON app.vehicle_handovers TO authenticated;
GRANT ALL ON app.vehicle_handovers TO service_role;

-- Driver picker options (active drivers other than the caller) -------------
CREATE OR REPLACE FUNCTION app.fn_driver_options()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    SELECT d.id, p.full_name
    FROM app.drivers d
    JOIN app.profiles p ON p.id = d.profile_id
    WHERE d.is_active
      AND d.id <> COALESCE(app.current_driver_id(), '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY p.full_name;
$$;
GRANT EXECUTE ON FUNCTION app.fn_driver_options() TO authenticated, service_role;

-- Shared helper: insert an inspection (no trip) for a given driver/vehicle ---
CREATE OR REPLACE FUNCTION app.fn__insert_inspection(
    p_vehicle_id uuid, p_driver_id uuid, p_template_id uuid,
    p_type app.inspection_type, p_odometer_km integer, p_notes text, p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_overall app.inspection_result := 'pass';
    v_id uuid;
    v_item jsonb;
    v_res app.inspection_result;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_res := (v_item->>'result')::app.inspection_result;
        IF v_res = 'fail' THEN v_overall := 'fail';
        ELSIF v_res = 'attention' AND v_overall <> 'fail' THEN v_overall := 'attention';
        END IF;
    END LOOP;

    INSERT INTO app.inspections (trip_id, vehicle_id, driver_id, template_id, type,
                                 overall_result, odometer_km, overall_notes)
    VALUES (NULL, p_vehicle_id, p_driver_id, p_template_id, p_type,
            v_overall, p_odometer_km, p_notes)
    RETURNING id INTO v_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO app.inspection_item_results (inspection_id, checklist_item_id, result, notes)
        VALUES (v_id, (v_item->>'checklist_item_id')::uuid,
                (v_item->>'result')::app.inspection_result, NULLIF(v_item->>'notes',''));
    END LOOP;

    RETURN v_id;
END;
$$;

-- Initiate: outgoing driver completes the handover checklist + opens the row --
CREATE OR REPLACE FUNCTION app.fn_initiate_handover(
    p_vehicle_id uuid, p_to_driver_id uuid, p_template_id uuid,
    p_odometer_km integer, p_inspection_notes text, p_items jsonb, p_handover_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_from uuid;
    v_insp uuid;
    v_handover uuid;
BEGIN
    v_from := app.current_driver_id();
    IF v_from IS NULL THEN
        RAISE EXCEPTION 'Only an active driver can initiate a handover';
    END IF;
    IF v_from = p_to_driver_id THEN
        RAISE EXCEPTION 'You cannot hand a vehicle over to yourself';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.vehicle_assignments
                   WHERE vehicle_id = p_vehicle_id AND driver_id = v_from AND ended_at IS NULL) THEN
        RAISE EXCEPTION 'Vehicle is not assigned to you';
    END IF;
    IF EXISTS (SELECT 1 FROM app.vehicle_handovers
               WHERE vehicle_id = p_vehicle_id AND status = 'pending') THEN
        RAISE EXCEPTION 'This vehicle already has a pending handover';
    END IF;

    v_insp := app.fn__insert_inspection(p_vehicle_id, v_from, p_template_id,
                                        'handover', p_odometer_km, p_inspection_notes, p_items);

    INSERT INTO app.vehicle_handovers (vehicle_id, from_driver_id, to_driver_id, status,
                                       from_inspection_id, odometer_km, notes, from_signed_at)
    VALUES (p_vehicle_id, v_from, p_to_driver_id, 'pending',
            v_insp, p_odometer_km, p_handover_notes, now())
    RETURNING id INTO v_handover;

    RETURN v_handover;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_initiate_handover(uuid, uuid, uuid, integer, text, jsonb, text)
    TO authenticated, service_role;

-- Confirm: receiving driver completes takeover checklist + vehicle reassigned -
CREATE OR REPLACE FUNCTION app.fn_confirm_takeover(
    p_handover_id uuid, p_template_id uuid, p_odometer_km integer, p_notes text, p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_to uuid;
    v_h  app.vehicle_handovers%ROWTYPE;
    v_insp uuid;
BEGIN
    v_to := app.current_driver_id();
    IF v_to IS NULL THEN
        RAISE EXCEPTION 'Only an active driver can confirm a takeover';
    END IF;

    SELECT * INTO v_h FROM app.vehicle_handovers WHERE id = p_handover_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Handover not found'; END IF;
    IF v_h.to_driver_id <> v_to THEN
        RAISE EXCEPTION 'This handover is not addressed to you';
    END IF;
    IF v_h.status <> 'pending' THEN
        RAISE EXCEPTION 'Handover is already %', v_h.status;
    END IF;

    v_insp := app.fn__insert_inspection(v_h.vehicle_id, v_to, p_template_id,
                                        'takeover', p_odometer_km, p_notes, p_items);

    UPDATE app.vehicle_handovers
       SET status = 'accepted', to_inspection_id = v_insp, to_signed_at = now()
     WHERE id = p_handover_id;

    -- Atomically reassign the vehicle: close the outgoing assignment, open the new.
    UPDATE app.vehicle_assignments
       SET ended_at = now()
     WHERE vehicle_id = v_h.vehicle_id AND driver_id = v_h.from_driver_id AND ended_at IS NULL;

    INSERT INTO app.vehicle_assignments (vehicle_id, driver_id, started_at, notes)
    VALUES (v_h.vehicle_id, v_to, now(), 'Via handover ' || p_handover_id);

    RETURN v_insp;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_confirm_takeover(uuid, uuid, integer, text, jsonb)
    TO authenticated, service_role;

-- Reject (by receiver) and cancel (by initiator) ---------------------------
CREATE OR REPLACE FUNCTION app.fn_reject_takeover(p_handover_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog
AS $$
DECLARE v_to uuid; v_h app.vehicle_handovers%ROWTYPE;
BEGIN
    v_to := app.current_driver_id();
    SELECT * INTO v_h FROM app.vehicle_handovers WHERE id = p_handover_id FOR UPDATE;
    IF NOT FOUND OR v_h.to_driver_id <> v_to THEN
        RAISE EXCEPTION 'This handover is not addressed to you';
    END IF;
    IF v_h.status <> 'pending' THEN RAISE EXCEPTION 'Handover is already %', v_h.status; END IF;
    UPDATE app.vehicle_handovers SET status='rejected', reject_reason=p_reason WHERE id=p_handover_id;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_reject_takeover(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.fn_cancel_handover(p_handover_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog
AS $$
DECLARE v_from uuid; v_h app.vehicle_handovers%ROWTYPE;
BEGIN
    v_from := app.current_driver_id();
    SELECT * INTO v_h FROM app.vehicle_handovers WHERE id = p_handover_id FOR UPDATE;
    IF NOT FOUND OR v_h.from_driver_id <> v_from THEN
        RAISE EXCEPTION 'You did not initiate this handover';
    END IF;
    IF v_h.status <> 'pending' THEN RAISE EXCEPTION 'Handover is already %', v_h.status; END IF;
    UPDATE app.vehicle_handovers SET status='cancelled' WHERE id=p_handover_id;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_cancel_handover(uuid) TO authenticated, service_role;

COMMIT;
