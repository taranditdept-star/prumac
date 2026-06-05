-- =============================================================================
-- 0024_subsidiary_options.sql
-- Drivers need the subsidiary list to populate the "Bill to" dropdown when
-- starting a trip, but RLS on app.subsidiaries only exposes rows to
-- managers/admins or a user's own subsidiary (0006). Rather than open the whole
-- table (it holds billing_email / tax_number / billing_address), expose just the
-- safe picker columns through a SECURITY DEFINER function.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.fn_subsidiary_options()
RETURNS TABLE (id uuid, name text, code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    SELECT id, name, code
    FROM app.subsidiaries
    WHERE is_active
    ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION app.fn_subsidiary_options() TO anon, authenticated, service_role;
