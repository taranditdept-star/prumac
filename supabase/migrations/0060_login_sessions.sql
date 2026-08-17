-- 0060_login_sessions.sql
-- ---------------------------------------------------------------------------
-- Record discrete login sessions so managers can see time logged IN, time
-- logged OUT (or last active), and hours per driver. A row is opened on sign-in
-- and closed on explicit sign-out; the heartbeat keeps last_seen_at fresh so an
-- abandoned session (driver just closes the tab — the common case) still has an
-- approximate "logged out" time.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS app.login_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  login_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  logout_at     timestamptz,
  ended_reason  text
);

CREATE INDEX IF NOT EXISTS login_sessions_profile_idx ON app.login_sessions (profile_id, login_at DESC);
CREATE INDEX IF NOT EXISTS login_sessions_open_idx    ON app.login_sessions (profile_id) WHERE logout_at IS NULL;

ALTER TABLE app.login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY login_sessions_read_self ON app.login_sessions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY login_sessions_read_managers ON app.login_sessions
  FOR SELECT TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- Open a session (called right after a successful sign-in).
CREATE OR REPLACE FUNCTION app.fn_start_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO app.login_sessions (profile_id) VALUES (auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_start_session() TO authenticated, service_role;

-- Close the most-recent open session (called on explicit sign-out).
CREATE OR REPLACE FUNCTION app.fn_end_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE app.login_sessions
     SET logout_at = now(), ended_reason = 'signout', last_seen_at = now()
   WHERE id = (
     SELECT id FROM app.login_sessions
      WHERE profile_id = auth.uid() AND logout_at IS NULL
      ORDER BY login_at DESC
      LIMIT 1
   );
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_end_session() TO authenticated, service_role;

-- Heartbeat now also keeps the open session's last_seen_at fresh (approx logout).
CREATE OR REPLACE FUNCTION app.fn_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  UPDATE app.profiles SET last_seen_at = now() WHERE id = auth.uid();
  UPDATE app.login_sessions SET last_seen_at = now()
   WHERE profile_id = auth.uid() AND logout_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_heartbeat() TO authenticated, service_role;

COMMIT;
