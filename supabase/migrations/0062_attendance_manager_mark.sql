-- 0062_attendance_manager_mark.sql
-- ---------------------------------------------------------------------------
-- Let a fleet_manager/admin mark or clear attendance ON BEHALF of someone (e.g.
-- a driver who was on the road, or a mistaken check-in). app.attendance RLS only
-- has SELECT-self / INSERT-self / SELECT-managers — no manager INSERT, UPDATE or
-- DELETE — so this has to go through SECURITY DEFINER functions that assert the
-- role in-body. Dates are the LOCAL Africa/Harare day, matching fn_mark_attendance.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_admin_mark_attendance(
  p_profile_id uuid,
  p_date       date DEFAULT NULL,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Africa/Harare')::date);
BEGIN
  IF NOT (app.role_is('fleet_manager') OR app.role_is('admin')) THEN
    RAISE EXCEPTION 'Only a fleet manager or admin can mark attendance for someone else';
  END IF;
  IF v_date > (now() AT TIME ZONE 'Africa/Harare')::date THEN
    RAISE EXCEPTION 'Cannot mark attendance for a future date';
  END IF;

  INSERT INTO app.attendance (profile_id, attendance_date, note)
  VALUES (p_profile_id, v_date, p_note)
  ON CONFLICT (profile_id, attendance_date) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION app.fn_admin_clear_attendance(
  p_profile_id uuid,
  p_date       date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Africa/Harare')::date);
BEGIN
  IF NOT (app.role_is('fleet_manager') OR app.role_is('admin')) THEN
    RAISE EXCEPTION 'Only a fleet manager or admin can clear attendance';
  END IF;

  DELETE FROM app.attendance WHERE profile_id = p_profile_id AND attendance_date = v_date;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_admin_mark_attendance(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_admin_clear_attendance(uuid, date) TO authenticated, service_role;

COMMIT;
