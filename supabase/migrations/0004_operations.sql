-- =============================================================================
-- 0004_operations.sql
-- The operational core: trips, GPS pings, inspections, fault and accident
-- reports, and the alerts feed for the Live Ops Centre.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
CREATE TABLE app.trips (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    vehicle_id               uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    driver_id                uuid NOT NULL REFERENCES app.drivers(id)  ON DELETE RESTRICT,
    subsidiary_id            uuid NOT NULL REFERENCES app.subsidiaries(id) ON DELETE RESTRICT,

    purpose                  app.trip_purpose NOT NULL DEFAULT 'delivery',
    status                   app.trip_status  NOT NULL DEFAULT 'planned',

    -- Route description (free text on the original sheets; preserved here for
    -- searchability while structured origin/destination remain optional)
    route_description        text,
    origin_label             text,
    destination_label        text,
    origin_point             geography(Point, 4326),
    destination_point        geography(Point, 4326),

    -- Odometer capture
    start_odometer_km        integer CHECK (start_odometer_km >= 0
                                            AND start_odometer_km <= 9999999),
    end_odometer_km          integer CHECK (end_odometer_km   >= 0
                                            AND end_odometer_km   <= 9999999),
    start_odometer_photo_path text,                            -- supabase storage key
    end_odometer_photo_path   text,

    -- Fuel uplift recorded mid-trip (the FUEL column in the sheets)
    fuel_litres              numeric(8,2) CHECK (fuel_litres >= 0),
    fuel_amount              numeric(10,2) CHECK (fuel_amount >= 0),
    fuel_currency            text DEFAULT 'USD',

    -- Lifecycle timestamps
    planned_start_at         timestamptz,
    started_at               timestamptz,
    paused_at                timestamptz,
    ended_at                 timestamptz,
    completed_at             timestamptz,
    cancelled_at             timestamptz,
    cancellation_reason      text,

    created_by               uuid REFERENCES app.profiles(id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    -- Integrity rules
    CONSTRAINT trips_end_after_start
        CHECK (end_odometer_km IS NULL
               OR start_odometer_km IS NULL
               OR end_odometer_km >= start_odometer_km),
    CONSTRAINT trips_odometer_delta_sane
        CHECK (end_odometer_km IS NULL
               OR start_odometer_km IS NULL
               OR (end_odometer_km - start_odometer_km) <= 5000), -- one trip <= 5000 km
    CONSTRAINT trips_started_consistent
        CHECK ((status IN ('planned'))                            OR started_at  IS NOT NULL),
    CONSTRAINT trips_ended_consistent
        CHECK ((status IN ('planned','in_progress','paused','cancelled')) OR ended_at IS NOT NULL),
    CONSTRAINT trips_completed_consistent
        CHECK ((status <> 'completed') OR completed_at IS NOT NULL),
    CONSTRAINT trips_timestamps_ordered
        CHECK (started_at   IS NULL OR planned_start_at IS NULL OR started_at >= planned_start_at - interval '1 day')
);

CREATE TRIGGER trips_touch BEFORE UPDATE ON app.trips
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX trips_vehicle_idx       ON app.trips (vehicle_id, started_at DESC);
CREATE INDEX trips_driver_idx        ON app.trips (driver_id,  started_at DESC);
CREATE INDEX trips_subsidiary_idx    ON app.trips (subsidiary_id, started_at DESC);
CREATE INDEX trips_status_idx        ON app.trips (status);
CREATE INDEX trips_active_idx        ON app.trips (vehicle_id)
    WHERE status IN ('in_progress', 'paused');
CREATE INDEX trips_completion_idx    ON app.trips (completed_at DESC) WHERE status = 'completed';

-- Only one open (in_progress | paused | ended) trip per vehicle at a time
CREATE UNIQUE INDEX trips_one_open_per_vehicle
    ON app.trips (vehicle_id)
    WHERE status IN ('in_progress', 'paused', 'ended');

-- Likewise for a driver
CREATE UNIQUE INDEX trips_one_open_per_driver
    ON app.trips (driver_id)
    WHERE status IN ('in_progress', 'paused', 'ended');

-- State machine — enforced on every UPDATE
CREATE OR REPLACE FUNCTION app.fn_trips_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
        IF NOT (
               (OLD.status = 'planned'     AND NEW.status IN ('in_progress','cancelled'))
            OR (OLD.status = 'in_progress' AND NEW.status IN ('paused','ended','cancelled'))
            OR (OLD.status = 'paused'      AND NEW.status IN ('in_progress','ended','cancelled'))
            OR (OLD.status = 'ended'       AND NEW.status IN ('completed'))
        ) THEN
            RAISE EXCEPTION 'Invalid trip status transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trips_state_machine_check
    BEFORE UPDATE ON app.trips
    FOR EACH ROW EXECUTE FUNCTION app.fn_trips_state_machine();

-- When a trip transitions to completed, advance the vehicle's odometer
CREATE OR REPLACE FUNCTION app.fn_trips_advance_odometer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'completed'
       AND (OLD.status IS DISTINCT FROM 'completed')
       AND NEW.end_odometer_km IS NOT NULL THEN
        UPDATE app.vehicles
           SET current_odometer_km = GREATEST(current_odometer_km, NEW.end_odometer_km),
               status              = CASE
                                       WHEN status = 'on_trip' THEN 'available'
                                       ELSE status
                                     END
         WHERE id = NEW.vehicle_id;
    ELSIF NEW.status = 'in_progress'
       AND (OLD.status IS DISTINCT FROM 'in_progress') THEN
        UPDATE app.vehicles SET status = 'on_trip' WHERE id = NEW.vehicle_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trips_advance_odometer
    AFTER UPDATE ON app.trips
    FOR EACH ROW EXECUTE FUNCTION app.fn_trips_advance_odometer();

SELECT app.fn_attach_audit('app.trips');

-- ---------------------------------------------------------------------------
-- trip_locations — GPS pings
-- ---------------------------------------------------------------------------
CREATE TABLE app.trip_locations (
    id            bigserial PRIMARY KEY,
    trip_id       uuid NOT NULL REFERENCES app.trips(id) ON DELETE CASCADE,
    recorded_at   timestamptz NOT NULL,
    received_at   timestamptz NOT NULL DEFAULT now(),    -- when server got it
    point         geography(Point, 4326) NOT NULL,
    speed_kph     numeric(6,2) CHECK (speed_kph >= 0 AND speed_kph <= 300),
    heading_deg   numeric(5,2) CHECK (heading_deg >= 0 AND heading_deg < 360),
    accuracy_m    numeric(8,2) CHECK (accuracy_m >= 0),
    altitude_m    numeric(8,2),
    battery_pct   smallint CHECK (battery_pct BETWEEN 0 AND 100),
    is_buffered   boolean NOT NULL DEFAULT false        -- arrived from offline buffer
);

CREATE INDEX trip_locations_trip_time_idx
    ON app.trip_locations (trip_id, recorded_at);
CREATE INDEX trip_locations_recent_idx
    ON app.trip_locations (recorded_at DESC);
CREATE INDEX trip_locations_point_gix
    ON app.trip_locations USING gist (point);

COMMENT ON TABLE app.trip_locations IS
    'GPS pings streamed from the driver phone every 30-60s. Buffered offline '
    'pings arrive with is_buffered=true. Heavy table; partition by month '
    'in Phase 10 once volume justifies.';

-- audit is intentionally NOT attached: GPS pings would flood the log.
-- Mutations are app-controlled and rare; deletions go through audit
-- via a soft-delete pattern in a later phase if ever needed.

-- ---------------------------------------------------------------------------
-- inspection_template + inspection_checklist_items — the master checklist
-- ---------------------------------------------------------------------------
CREATE TABLE app.inspection_templates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    applies_to   app.vehicle_class[],            -- empty = all classes
    is_active    boolean NOT NULL DEFAULT true,
    version      integer NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.inspection_checklist_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   uuid NOT NULL REFERENCES app.inspection_templates(id) ON DELETE CASCADE,
    sort_order    integer NOT NULL,
    category      text NOT NULL,                  -- 'Lights', 'Tyres', 'Fluids', 'Safety'
    label         text NOT NULL,                  -- 'Headlights working'
    is_critical   boolean NOT NULL DEFAULT false, -- failing a critical item blocks the trip
    requires_photo boolean NOT NULL DEFAULT false,
    UNIQUE (template_id, sort_order)
);

-- ---------------------------------------------------------------------------
-- inspections — pre/post-trip
-- ---------------------------------------------------------------------------
CREATE TABLE app.inspections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             uuid NOT NULL REFERENCES app.trips(id) ON DELETE CASCADE,
    vehicle_id          uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    driver_id           uuid NOT NULL REFERENCES app.drivers(id)  ON DELETE RESTRICT,
    template_id         uuid NOT NULL REFERENCES app.inspection_templates(id),
    type                app.inspection_type NOT NULL,
    overall_result      app.inspection_result NOT NULL,
    odometer_km         integer NOT NULL CHECK (odometer_km >= 0 AND odometer_km <= 9999999),
    overall_notes       text,
    started_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz NOT NULL DEFAULT now(),
    location_point      geography(Point, 4326),
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Each trip has at most one pre and at most one post inspection
    UNIQUE (trip_id, type)
);

CREATE INDEX inspections_trip_idx     ON app.inspections (trip_id);
CREATE INDEX inspections_vehicle_idx  ON app.inspections (vehicle_id, completed_at DESC);
CREATE INDEX inspections_failed_idx   ON app.inspections (overall_result)
    WHERE overall_result IN ('fail', 'attention');

SELECT app.fn_attach_audit('app.inspections');

-- Individual item results for an inspection
CREATE TABLE app.inspection_item_results (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id   uuid NOT NULL REFERENCES app.inspections(id) ON DELETE CASCADE,
    checklist_item_id uuid NOT NULL REFERENCES app.inspection_checklist_items(id) ON DELETE RESTRICT,
    result          app.inspection_result NOT NULL,
    notes           text,
    photo_path      text,
    UNIQUE (inspection_id, checklist_item_id)
);

CREATE INDEX inspection_item_results_inspection_idx
    ON app.inspection_item_results (inspection_id);

-- ---------------------------------------------------------------------------
-- inspection_photos — odometer & general vehicle photos taken during inspection
-- (Item-level photos live on inspection_item_results.photo_path.)
-- ---------------------------------------------------------------------------
CREATE TABLE app.inspection_photos (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id uuid NOT NULL REFERENCES app.inspections(id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('odometer','front','rear','left','right','interior','damage','other')),
    file_path     text NOT NULL,
    caption       text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inspection_photos_inspection_idx ON app.inspection_photos (inspection_id);

-- ---------------------------------------------------------------------------
-- faults — driver-reported issues
-- ---------------------------------------------------------------------------
CREATE TABLE app.faults (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    trip_id         uuid REFERENCES app.trips(id) ON DELETE SET NULL,
    reported_by     uuid NOT NULL REFERENCES app.drivers(id) ON DELETE RESTRICT,
    severity        app.fault_severity NOT NULL,
    status          app.fault_status NOT NULL DEFAULT 'reported',
    category        text NOT NULL,                  -- 'engine','brakes','suspension','electrical','body','tyres','other'
    title           text NOT NULL,
    description     text NOT NULL,
    odometer_km     integer CHECK (odometer_km >= 0),
    location_point  geography(Point, 4326),
    reported_at     timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    acknowledged_by uuid REFERENCES app.profiles(id),
    resolved_at     timestamptz,
    resolved_notes  text,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER faults_touch BEFORE UPDATE ON app.faults
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX faults_vehicle_idx ON app.faults (vehicle_id, reported_at DESC);
CREATE INDEX faults_status_idx  ON app.faults (status) WHERE status IN ('reported','acknowledged','in_repair');
CREATE INDEX faults_severity_idx ON app.faults (severity) WHERE status <> 'resolved';

SELECT app.fn_attach_audit('app.faults');

-- ---------------------------------------------------------------------------
-- fault_photos
-- ---------------------------------------------------------------------------
CREATE TABLE app.fault_photos (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fault_id   uuid NOT NULL REFERENCES app.faults(id) ON DELETE CASCADE,
    file_path  text NOT NULL,
    caption    text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fault_photos_fault_idx ON app.fault_photos (fault_id);

-- ---------------------------------------------------------------------------
-- accidents
-- ---------------------------------------------------------------------------
CREATE TABLE app.accidents (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id             uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    trip_id                uuid REFERENCES app.trips(id) ON DELETE SET NULL,
    reported_by            uuid NOT NULL REFERENCES app.drivers(id) ON DELETE RESTRICT,
    severity               app.accident_severity NOT NULL,
    status                 app.accident_status NOT NULL DEFAULT 'reported',

    -- Incident details
    occurred_at            timestamptz NOT NULL,
    location_point         geography(Point, 4326),
    location_description   text NOT NULL,
    odometer_km            integer CHECK (odometer_km >= 0),
    weather               text,
    road_conditions       text,
    description            text NOT NULL,

    -- Third parties
    other_parties_involved boolean NOT NULL DEFAULT false,
    third_party_details    jsonb,                          -- [{name, phone, plate, insurer}, ...]
    injuries               boolean NOT NULL DEFAULT false,
    injuries_details       text,
    police_report_number   text,
    police_station         text,

    reported_at            timestamptz NOT NULL DEFAULT now(),
    closed_at              timestamptz,
    closed_notes           text,
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER accidents_touch BEFORE UPDATE ON app.accidents
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX accidents_vehicle_idx ON app.accidents (vehicle_id, occurred_at DESC);
CREATE INDEX accidents_open_idx    ON app.accidents (status)
    WHERE status IN ('reported','investigating');

SELECT app.fn_attach_audit('app.accidents');

-- ---------------------------------------------------------------------------
-- accident_photos
-- ---------------------------------------------------------------------------
CREATE TABLE app.accident_photos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    accident_id uuid NOT NULL REFERENCES app.accidents(id) ON DELETE CASCADE,
    file_path   text NOT NULL,
    caption     text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accident_photos_accident_idx ON app.accident_photos (accident_id);

-- ---------------------------------------------------------------------------
-- alerts — the Live Ops Centre feed
-- Generated by triggers and by the reconciliation engine. Managers acknowledge
-- and resolve alerts; the resolved ones stay in the table for analytics.
-- ---------------------------------------------------------------------------
CREATE TABLE app.alerts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            app.alert_kind NOT NULL,
    severity        app.alert_severity NOT NULL,
    vehicle_id      uuid REFERENCES app.vehicles(id) ON DELETE CASCADE,
    driver_id       uuid REFERENCES app.drivers(id)  ON DELETE SET NULL,
    trip_id         uuid REFERENCES app.trips(id)    ON DELETE CASCADE,
    fault_id        uuid REFERENCES app.faults(id)   ON DELETE CASCADE,
    accident_id     uuid REFERENCES app.accidents(id) ON DELETE CASCADE,
    title           text NOT NULL,
    body            text,
    payload         jsonb,                            -- extra context per kind
    raised_at       timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    acknowledged_by uuid REFERENCES app.profiles(id),
    resolved_at     timestamptz,
    resolved_by     uuid REFERENCES app.profiles(id),
    resolved_notes  text
);

CREATE INDEX alerts_open_idx       ON app.alerts (raised_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX alerts_vehicle_idx    ON app.alerts (vehicle_id, raised_at DESC);
CREATE INDEX alerts_severity_idx   ON app.alerts (severity, raised_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX alerts_kind_idx       ON app.alerts (kind, raised_at DESC)
    WHERE resolved_at IS NULL;

SELECT app.fn_attach_audit('app.alerts');

-- Trigger: when a fault is reported with severity >= 'high', raise an alert
CREATE OR REPLACE FUNCTION app.fn_alert_on_fault()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.severity IN ('high','critical') THEN
        INSERT INTO app.alerts (kind, severity, vehicle_id, driver_id, trip_id, fault_id,
                                title, body)
        VALUES (
            'fault_reported',
            CASE WHEN NEW.severity = 'critical' THEN 'critical'::app.alert_severity
                 ELSE 'warning'::app.alert_severity END,
            NEW.vehicle_id, NEW.reported_by, NEW.trip_id, NEW.id,
            NEW.title,
            NEW.description
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER faults_raise_alert
    AFTER INSERT ON app.faults
    FOR EACH ROW EXECUTE FUNCTION app.fn_alert_on_fault();

-- Trigger: every accident raises an alert
CREATE OR REPLACE FUNCTION app.fn_alert_on_accident()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO app.alerts (kind, severity, vehicle_id, driver_id, trip_id, accident_id,
                            title, body)
    VALUES (
        'accident_reported',
        'critical',
        NEW.vehicle_id, NEW.reported_by, NEW.trip_id, NEW.id,
        format('%s accident reported', NEW.severity),
        NEW.description
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER accidents_raise_alert
    AFTER INSERT ON app.accidents
    FOR EACH ROW EXECUTE FUNCTION app.fn_alert_on_accident();

COMMIT;
