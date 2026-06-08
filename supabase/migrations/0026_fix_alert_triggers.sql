-- 0026_fix_alert_triggers.sql
-- ---------------------------------------------------------------------------
-- BUG FIX: accident (and fault) logging fails for drivers with
--   "new row violates row-level security policy for table alerts".
--
-- Root cause: the AFTER INSERT trigger functions fn_alert_on_accident() and
-- fn_alert_on_fault() were NOT SECURITY DEFINER, so they ran with the
-- invoking driver's privileges and tried to INSERT INTO app.alerts. app.alerts
-- has RLS enabled but NO insert policy for anyone, so the insert was rejected
-- and the whole accident/fault transaction rolled back.
--
-- Fix: recreate both functions as SECURITY DEFINER with a pinned search_path.
-- CREATE OR REPLACE keeps the existing triggers pointing at them — no need to
-- recreate the triggers themselves.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_alert_on_accident()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
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

CREATE OR REPLACE FUNCTION app.fn_alert_on_fault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
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

COMMIT;
