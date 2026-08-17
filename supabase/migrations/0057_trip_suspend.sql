-- 0057_trip_suspend.sql
-- ---------------------------------------------------------------------------
-- Wire up the 'suspended' trip status (added in 0056):
--   • state machine gains suspend / unsuspend transitions
--   • a suspended trip still counts as "open" (the vehicle + driver stay tied
--     up), so it belongs in the one-open-trip-per-vehicle/driver indexes.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_trips_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
        IF NOT (
               (OLD.status = 'planned'     AND NEW.status IN ('in_progress','cancelled'))
            OR (OLD.status = 'in_progress' AND NEW.status IN ('paused','ended','cancelled','suspended'))
            OR (OLD.status = 'paused'      AND NEW.status IN ('in_progress','ended','cancelled','suspended'))
            OR (OLD.status = 'suspended'   AND NEW.status IN ('in_progress','cancelled'))
            OR (OLD.status = 'ended'       AND NEW.status IN ('completed'))
        ) THEN
            RAISE EXCEPTION 'Invalid trip status transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- A suspended trip keeps the vehicle + driver occupied.
DROP INDEX IF EXISTS app.trips_one_open_per_vehicle;
CREATE UNIQUE INDEX trips_one_open_per_vehicle
    ON app.trips (vehicle_id)
    WHERE status IN ('in_progress', 'paused', 'ended', 'suspended');

DROP INDEX IF EXISTS app.trips_one_open_per_driver;
CREATE UNIQUE INDEX trips_one_open_per_driver
    ON app.trips (driver_id)
    WHERE status IN ('in_progress', 'paused', 'ended', 'suspended');

COMMIT;
