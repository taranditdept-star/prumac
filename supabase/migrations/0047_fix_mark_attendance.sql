-- 0047_fix_mark_attendance.sql
-- ---------------------------------------------------------------------------
-- Fix: in 0046 the RETURNS TABLE output columns were named attendance_date /
-- marked_at, which shadow app.attendance's own columns inside the function body
-- and raise "column reference \"attendance_date\" is ambiguous" at call time.
-- Rename the output columns (att_date / att_marked_at / att_already) so there is
-- no collision, and assign them explicitly.
-- ---------------------------------------------------------------------------
BEGIN;

-- Renaming RETURNS TABLE output columns can't be done via CREATE OR REPLACE
-- (Postgres 42P13), so drop the 0046 version first.
DROP FUNCTION IF EXISTS app.fn_mark_attendance();

CREATE OR REPLACE FUNCTION app.fn_mark_attendance()
RETURNS TABLE (att_date date, att_marked_at timestamptz, att_already boolean)
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

    IF v_existing IS NULL THEN
        INSERT INTO app.attendance (profile_id, attendance_date)
        VALUES (v_uid, v_today)
        ON CONFLICT (profile_id, attendance_date) DO NOTHING;

        SELECT a.marked_at INTO v_existing
        FROM app.attendance a
        WHERE a.profile_id = v_uid AND a.attendance_date = v_today;

        att_already := false;
    ELSE
        att_already := true;
    END IF;

    att_date := v_today;
    att_marked_at := v_existing;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_mark_attendance() TO authenticated;

COMMIT;
