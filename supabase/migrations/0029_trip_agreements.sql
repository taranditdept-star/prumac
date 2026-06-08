-- 0029_trip_agreements.sql
-- ---------------------------------------------------------------------------
-- Feature 4: drivers must accept a vehicle-use agreement / privacy & terms
-- notice before starting a trip. The accepted version is recorded on the trip
-- so there is an audit trail of who agreed to what, and changing the text can
-- force re-acceptance.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS app.agreements (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           text NOT NULL,            -- 'trip_terms' | 'privacy' | 'vehicle_use'
    version        integer NOT NULL DEFAULT 1,
    title          text NOT NULL,
    body_md        text NOT NULL,
    is_active      boolean NOT NULL DEFAULT true,
    effective_from timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- At most one active agreement per kind.
CREATE UNIQUE INDEX IF NOT EXISTS agreements_active_kind
    ON app.agreements (kind) WHERE is_active;

ALTER TABLE app.agreements ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read agreements (drivers must see the text to accept).
DROP POLICY IF EXISTS agreements_read_all ON app.agreements;
CREATE POLICY agreements_read_all ON app.agreements
    FOR SELECT TO authenticated
    USING (true);

-- Only managers/admins manage the text.
DROP POLICY IF EXISTS agreements_manage ON app.agreements;
CREATE POLICY agreements_manage ON app.agreements
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

GRANT SELECT ON app.agreements TO authenticated;
GRANT ALL    ON app.agreements TO service_role;

-- Record the accepted agreement on each trip.
ALTER TABLE app.trips
    ADD COLUMN IF NOT EXISTS terms_agreement_id uuid REFERENCES app.agreements(id),
    ADD COLUMN IF NOT EXISTS terms_accepted_at  timestamptz;

-- Seed the initial vehicle-use agreement (version 1).
INSERT INTO app.agreements (kind, version, title, body_md, is_active)
SELECT 'trip_terms', 1, 'PRUMAC Vehicle-Use Agreement & Privacy Notice',
$md$By starting this trip you confirm that:

- You hold a valid driver's licence and are fit to drive.
- You have completed the vehicle checklist and the vehicle is roadworthy.
- The vehicle will be used only for the stated business purpose.
- PRUMAC may conduct random spot checks on this vehicle at any time, including
  verification of mileage logs, fuel usage, vehicle condition and driver conduct.
- Your location may be tracked via GPS for the duration of the trip for safety,
  routing and billing. This data is processed solely for fleet operations.
- Failure to cooperate with checks, or any attempt to conceal misuse, is a breach
  of contract and may result in disciplinary action, financial liability, or
  termination.

You accept these terms and conditions for this trip.$md$,
       true
WHERE NOT EXISTS (
    SELECT 1 FROM app.agreements WHERE kind = 'trip_terms' AND is_active
);

COMMIT;
