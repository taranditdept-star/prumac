-- Migration 0010: Enforce that users cannot change their own role or subsidiary_id.
--
-- The Phase 1 RLS policy used a subquery that evaluated post-update values,
-- which meant the constraint could be bypassed. This BEFORE UPDATE trigger
-- is the authoritative guard and fires regardless of the calling application.

CREATE OR REPLACE FUNCTION app.enforce_profile_immutable_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
BEGIN
  -- Allow service-role API calls and direct postgres superuser connections to change anything.
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;

  -- A user may only update their own profile row.
  IF auth.uid() != OLD.id THEN
    RAISE EXCEPTION 'permission denied: cannot update another user''s profile';
  END IF;

  -- Role and subsidiary are immutable by the user themselves.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'permission denied: users cannot change their own role';
  END IF;

  IF NEW.subsidiary_id IS DISTINCT FROM OLD.subsidiary_id THEN
    RAISE EXCEPTION 'permission denied: users cannot change their own subsidiary';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if re-running (idempotent migration)
DROP TRIGGER IF EXISTS trg_profiles_immutable_role ON app.profiles;

CREATE TRIGGER trg_profiles_immutable_role
  BEFORE UPDATE ON app.profiles
  FOR EACH ROW
  EXECUTE FUNCTION app.enforce_profile_immutable_role();

COMMENT ON FUNCTION app.enforce_profile_immutable_role() IS
  'Prevents users from elevating their own role or switching subsidiary. '
  'Admins acting via the service-role key are exempt.';
