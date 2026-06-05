-- =============================================================================
-- 0003_fleet.sql
-- Vehicles, their compliance documents, and current driver assignments.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- vehicles — the register
-- ---------------------------------------------------------------------------
CREATE TABLE app.vehicles (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    plate_number             text NOT NULL,
    plate_country            app.country_code NOT NULL DEFAULT 'ZW',
    vin                      text,                          -- chassis number
    engine_number            text,
    make                     text NOT NULL,
    model                    text NOT NULL,
    variant                  text,                          -- 'GP5 1', 'Hybrid GP1'
    year_of_manufacture      smallint CHECK (year_of_manufacture BETWEEN 1980 AND 2100),
    colour                   text,

    -- Classification
    class                    app.vehicle_class NOT NULL,
    fuel_type                app.fuel_type NOT NULL DEFAULT 'diesel',
    fuel_tank_litres         numeric(8,2) CHECK (fuel_tank_litres > 0),
    status                   app.vehicle_status NOT NULL DEFAULT 'available',
    home_branch              text,                          -- 'Harare', 'Bulawayo', 'Gwanda'
    default_subsidiary_id    uuid REFERENCES app.subsidiaries(id) ON DELETE RESTRICT,

    -- Odometer state — updated by trip-completion trigger
    current_odometer_km      integer NOT NULL DEFAULT 0
                                CHECK (current_odometer_km >= 0
                                       AND current_odometer_km <= 9999999),
    last_service_odometer_km integer CHECK (last_service_odometer_km >= 0),
    service_interval_km      integer DEFAULT 5000 CHECK (service_interval_km > 0),

    condition_notes          text,
    acquired_at              date,
    decommissioned_at        date,
    decommission_reason      text,

    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT vehicles_plate_country_unique UNIQUE (plate_country, plate_number),
    CONSTRAINT vehicles_decommissioned_status
        CHECK ((status = 'decommissioned') = (decommissioned_at IS NOT NULL))
);

CREATE TRIGGER vehicles_touch BEFORE UPDATE ON app.vehicles
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX vehicles_status_idx      ON app.vehicles (status);
CREATE INDEX vehicles_class_idx       ON app.vehicles (class);
CREATE INDEX vehicles_subsidiary_idx  ON app.vehicles (default_subsidiary_id);
CREATE INDEX vehicles_plate_trgm_idx  ON app.vehicles USING gin (plate_number gin_trgm_ops);
CREATE INDEX vehicles_service_due_idx ON app.vehicles
    ((current_odometer_km - last_service_odometer_km))
    WHERE last_service_odometer_km IS NOT NULL;

COMMENT ON TABLE app.vehicles IS
    'The PRUMAC fleet register. Plate numbers are unique per issuing country.';

SELECT app.fn_attach_audit('app.vehicles');

-- ---------------------------------------------------------------------------
-- vehicle_documents — license discs, insurance, fitness, registration
-- ---------------------------------------------------------------------------
CREATE TABLE app.vehicle_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE CASCADE,
    document_type   app.document_type NOT NULL,
    insurance_type  app.insurance_type,                    -- only when type='insurance'
    document_number text,
    issuer          text,
    issued_at       date,
    expires_at      date NOT NULL,
    policy_amount   numeric(12,2),
    file_path       text,                                  -- supabase storage key
    notes           text,
    is_active       boolean NOT NULL DEFAULT true,
    created_by      uuid REFERENCES app.profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT documents_insurance_type_only_for_insurance
        CHECK ((document_type = 'insurance') OR (insurance_type IS NULL)),

    CONSTRAINT documents_issued_before_expiry
        CHECK (issued_at IS NULL OR issued_at <= expires_at)
);

CREATE TRIGGER vehicle_documents_touch BEFORE UPDATE ON app.vehicle_documents
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX vehicle_documents_vehicle_idx ON app.vehicle_documents (vehicle_id);
CREATE INDEX vehicle_documents_expiry_idx  ON app.vehicle_documents (expires_at)
    WHERE is_active;
CREATE INDEX vehicle_documents_type_idx    ON app.vehicle_documents (vehicle_id, document_type)
    WHERE is_active;

-- Exactly one active document of each type per vehicle
CREATE UNIQUE INDEX vehicle_documents_one_active_per_type
    ON app.vehicle_documents (vehicle_id, document_type)
    WHERE is_active;

SELECT app.fn_attach_audit('app.vehicle_documents');

-- ---------------------------------------------------------------------------
-- vehicle_assignments — which driver has which vehicle, when
-- Historical record; the "current" assignment is the row where ended_at is NULL.
-- An exclusion constraint guarantees a vehicle cannot have two overlapping
-- assignments.
-- ---------------------------------------------------------------------------
CREATE TABLE app.vehicle_assignments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id   uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    driver_id    uuid NOT NULL REFERENCES app.drivers(id)  ON DELETE RESTRICT,
    started_at   timestamptz NOT NULL DEFAULT now(),
    ended_at     timestamptz,
    assigned_by  uuid REFERENCES app.profiles(id),
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT assignments_period_valid
        CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- One vehicle can only be assigned to one driver at a time.
ALTER TABLE app.vehicle_assignments
    ADD CONSTRAINT assignments_no_vehicle_overlap
    EXCLUDE USING gist (
        vehicle_id WITH =,
        tstzrange(started_at, COALESCE(ended_at, 'infinity'::timestamptz), '[)') WITH &&
    );

CREATE INDEX assignments_vehicle_idx ON app.vehicle_assignments (vehicle_id, started_at DESC);
CREATE INDEX assignments_driver_idx  ON app.vehicle_assignments (driver_id, started_at DESC);
CREATE INDEX assignments_current_idx ON app.vehicle_assignments (vehicle_id)
    WHERE ended_at IS NULL;

COMMENT ON TABLE app.vehicle_assignments IS
    'History of driver-vehicle assignments. The current assignment for a '
    'vehicle is the row with ended_at IS NULL. Exclusion constraint ensures '
    'a vehicle is never double-assigned.';

SELECT app.fn_attach_audit('app.vehicle_assignments');

COMMIT;
