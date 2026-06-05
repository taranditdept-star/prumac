-- Migration 0013: Fix infinite recursion in RLS helper functions.
--
-- app.role_is() and app.current_subsidiary_id() both query app.profiles. The
-- policies on app.profiles use these helpers, so each SELECT recurses
-- until "stack depth limit exceeded". Marking them SECURITY DEFINER makes
-- them run with the owner's privileges, bypassing RLS on the inner query.
-- The functions still only return information about the *current* user (via
-- auth.uid()), so this is safe.

CREATE OR REPLACE FUNCTION app.role_is(target_role app.user_role)
RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.profiles p
        WHERE p.id = auth.uid()
          AND (p.role = target_role OR p.role = 'admin')
          AND p.is_active
    );
END;
$$;

CREATE OR REPLACE FUNCTION app.current_subsidiary_id()
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_sub uuid;
BEGIN
    SELECT subsidiary_id INTO v_sub
    FROM app.profiles
    WHERE id = auth.uid() AND is_active;
    RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_driver_id()
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT d.id INTO v_id
    FROM app.drivers d
    WHERE d.profile_id = auth.uid() AND d.is_active;
    RETURN v_id;
END;
$$;
