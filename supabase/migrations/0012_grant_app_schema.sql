-- Migration 0012: Grant schema-level access to authenticated/anon roles.
--
-- RLS still controls row visibility, but PostgREST requires USAGE on the schema
-- and table-level grants for the SQL to even reach the policy layer.

GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA audit TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app
  TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO anon;

GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA app
  TO authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app
  TO anon, authenticated, service_role;

-- Future tables created in app get these grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, USAGE ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Audit log: authenticated may SELECT (RLS restricts to admin only); writes
-- happen via SECURITY DEFINER trigger.
GRANT SELECT ON audit.log TO authenticated;
