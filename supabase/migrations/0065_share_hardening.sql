-- 0065_share_hardening.sql
-- ---------------------------------------------------------------------------
-- Three fixes to the accident share link, all found by an adversarial review:
--
-- 1. password_version — the viewing-session cookie is signed over the share id
--    only, so "New password" did NOT log out someone already inside. The version
--    is bumped on every password reset and mixed into the cookie signature, so
--    resetting the password immediately invalidates live sessions.
--
-- 2. fn_share_register_failure() — the failed-attempt throttle was a read-then-
--    write in JS: N concurrent unlock attempts all read the same counter and all
--    wrote value+1, so "8 attempts then lock" was trivially bypassed by firing
--    requests in parallel. This does the increment and the lock decision in ONE
--    atomic statement, and no longer resets the counter to 0 when it locks (so
--    attempts stay cumulative instead of restarting after every lockout).
--
-- 3. fn_share_register_view() — view_count was also read-then-write, so
--    concurrent views under-counted.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.accident_shares
  ADD COLUMN IF NOT EXISTS password_version integer NOT NULL DEFAULT 1;

-- 1 atomic failed-attempt registration -------------------------------------
CREATE OR REPLACE FUNCTION app.fn_share_register_failure(
  p_share_id     uuid,
  p_max_attempts integer,
  p_lock_minutes integer
)
RETURNS TABLE (locked boolean, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE app.accident_shares s
     SET failed_attempts = s.failed_attempts + 1,
         locked_until = CASE
           WHEN (s.failed_attempts + 1) % GREATEST(p_max_attempts, 1) = 0
             THEN now() + make_interval(mins => GREATEST(p_lock_minutes, 1))
           ELSE s.locked_until
         END
   WHERE s.id = p_share_id
  RETURNING (s.locked_until IS NOT NULL AND s.locked_until > now()), s.failed_attempts;
END;
$$;
GRANT EXECUTE ON FUNCTION app.fn_share_register_failure(uuid, integer, integer) TO authenticated, service_role;

-- 2 atomic view registration ----------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_share_register_view(p_share_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  UPDATE app.accident_shares
     SET view_count = view_count + 1,
         last_viewed_at = now(),
         failed_attempts = 0,
         locked_until = NULL
   WHERE id = p_share_id;
$$;
GRANT EXECUTE ON FUNCTION app.fn_share_register_view(uuid) TO authenticated, service_role;

COMMIT;
