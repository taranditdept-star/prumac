-- 0061_session_single_open.sql
-- ---------------------------------------------------------------------------
-- Keep at most ONE open login_sessions row per user. Previously a driver who
-- closed the tab without signing out left a dangling open row; the next login
-- opened a second, and fn_heartbeat (which bumps last_seen_at on ALL open rows)
-- then kept un-freezing the abandoned row — corrupting the /attendance session
-- report and misattributing time on multi-device use. fn_start_session now
-- closes any prior open session (stamping the abandoned one's logout at its own
-- last activity) before opening a new one.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_start_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  -- Close any dangling open session at its last known activity, so a fresh
  -- login can't reopen/advance it.
  UPDATE app.login_sessions
     SET logout_at = last_seen_at, ended_reason = 'superseded'
   WHERE profile_id = auth.uid() AND logout_at IS NULL;
  INSERT INTO app.login_sessions (profile_id) VALUES (auth.uid());
END;
$$;

COMMIT;
