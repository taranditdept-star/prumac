-- 0030_repair_claims.sql
-- ---------------------------------------------------------------------------
-- Feature 5: drivers / subsidiaries log minor repairs (with a receipt photo)
-- directly in the system. The Prumac accountant/admin reviews each claim and,
-- on approval, it materialises into a service_record that feeds the existing
-- invoice maintenance-credit logic (fn_generate_invoice) — replacing the old
-- "email the receipt, accountant deducts and bills the subsidiary" loop.
-- ---------------------------------------------------------------------------
BEGIN;

DO $$ BEGIN
    CREATE TYPE app.repair_claim_status AS ENUM ('submitted', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.repair_claims (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id        uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    submitted_by      uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    subsidiary_id     uuid REFERENCES app.subsidiaries(id) ON DELETE SET NULL,
    description       text NOT NULL,
    amount            numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency          text NOT NULL DEFAULT 'USD',
    odometer_km       integer CHECK (odometer_km >= 0),
    receipt_path      text,
    status            app.repair_claim_status NOT NULL DEFAULT 'submitted',
    reviewed_by       uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
    reviewed_at       timestamptz,
    review_notes      text,
    service_record_id uuid REFERENCES app.service_records(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repair_claims_status_idx ON app.repair_claims (status, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_claims_vehicle_idx ON app.repair_claims (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repair_claims_submitter_idx ON app.repair_claims (submitted_by, created_at DESC);

CREATE TRIGGER repair_claims_touch BEFORE UPDATE ON app.repair_claims
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

SELECT app.fn_attach_audit('app.repair_claims');

-- RLS ----------------------------------------------------------------------
ALTER TABLE app.repair_claims ENABLE ROW LEVEL SECURITY;

-- Submitter (driver or subsidiary user) creates and reads their own claims.
DROP POLICY IF EXISTS repair_claims_insert_own ON app.repair_claims;
CREATE POLICY repair_claims_insert_own ON app.repair_claims
    FOR INSERT TO authenticated
    WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS repair_claims_read_own ON app.repair_claims;
CREATE POLICY repair_claims_read_own ON app.repair_claims
    FOR SELECT TO authenticated
    USING (submitted_by = auth.uid());

-- Managers / admin / billing: full read + review.
DROP POLICY IF EXISTS repair_claims_manage ON app.repair_claims;
CREATE POLICY repair_claims_manage ON app.repair_claims
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin') OR app.role_is('subsidiary_billing'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin') OR app.role_is('subsidiary_billing'));

GRANT SELECT, INSERT, UPDATE ON app.repair_claims TO authenticated;
GRANT ALL ON app.repair_claims TO service_role;

-- Approval RPC -------------------------------------------------------------
-- On approval, create the reimbursable service_record and link it back so the
-- amount flows into the next invoice for the chosen subsidiary.
CREATE OR REPLACE FUNCTION app.fn_approve_repair_claim(
    p_claim_id              uuid,
    p_reimburse_subsidiary  uuid,
    p_notes                 text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_claim   app.repair_claims%ROWTYPE;
    v_sr_id   uuid;
BEGIN
    IF NOT (app.role_is('fleet_manager') OR app.role_is('admin')) THEN
        RAISE EXCEPTION 'Only a fleet manager or admin can approve repair claims'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_claim FROM app.repair_claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repair claim % not found', p_claim_id;
    END IF;
    IF v_claim.status <> 'submitted' THEN
        RAISE EXCEPTION 'Claim % is already %', p_claim_id, v_claim.status;
    END IF;

    INSERT INTO app.service_records (
        vehicle_id, performed_at, odometer_km, is_routine_service,
        total_amount, currency, reimburse_from_subsidiary_id, summary, created_by
    ) VALUES (
        v_claim.vehicle_id, now()::date, v_claim.odometer_km, false,
        v_claim.amount, v_claim.currency, p_reimburse_subsidiary,
        'Repair claim: ' || v_claim.description, auth.uid()
    )
    RETURNING id INTO v_sr_id;

    UPDATE app.repair_claims
       SET status = 'approved',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           review_notes = p_notes,
           service_record_id = v_sr_id
     WHERE id = p_claim_id;

    RETURN v_sr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_approve_repair_claim(uuid, uuid, text) TO authenticated, service_role;

COMMIT;
