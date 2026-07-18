-- 0046_attendance.sql
-- ---------------------------------------------------------------------------
-- Daily attendance check-in. Every internal user (driver, fleet manager,
-- admin) marks that they are on duty for the day — one tap on the home screen.
-- This gives management a live "who's in today" roster and, importantly, gives
-- drivers a daily reason to open the app.
--
-- One row per (person, day). The day is the LOCAL date in Africa/Harare, which
-- is UTC+2 with no DST and shared by both Zimbabwe and South Africa operations.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE app.attendance (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    attendance_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Harare')::date,
    marked_at       timestamptz NOT NULL DEFAULT now(),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (profile_id, attendance_date)
);

CREATE INDEX attendance_date_idx    ON app.attendance (attendance_date);
CREATE INDEX attendance_profile_idx ON app.attendance (profile_id, attendance_date DESC);

COMMENT ON TABLE app.attendance IS
    'Daily on-duty check-in, one row per person per local (Africa/Harare) day.';

ALTER TABLE app.attendance ENABLE ROW LEVEL SECURITY;

-- Everyone can see and create their OWN attendance.
CREATE POLICY attendance_read_self ON app.attendance
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

CREATE POLICY attendance_insert_self ON app.attendance
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid());

-- Managers / admins can read everyone's attendance (the roster view).
CREATE POLICY attendance_read_managers ON app.attendance
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- Mark today's attendance for the current user. Idempotent: a second tap the
-- same day returns the original mark rather than erroring or duplicating.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_mark_attendance()
RETURNS TABLE (attendance_date date, marked_at timestamptz, already_marked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_today    date := (now() AT TIME ZONE 'Africa/Harare')::date;
    v_existing timestamptz;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT a.marked_at INTO v_existing
    FROM app.attendance a
    WHERE a.profile_id = v_uid AND a.attendance_date = v_today;

    IF v_existing IS NOT NULL THEN
        RETURN QUERY SELECT v_today, v_existing, true;
        RETURN;
    END IF;

    INSERT INTO app.attendance (profile_id, attendance_date)
    VALUES (v_uid, v_today)
    ON CONFLICT (profile_id, attendance_date) DO NOTHING;

    SELECT a.marked_at INTO v_existing
    FROM app.attendance a
    WHERE a.profile_id = v_uid AND a.attendance_date = v_today;

    RETURN QUERY SELECT v_today, v_existing, false;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_mark_attendance() TO authenticated;

COMMIT;
