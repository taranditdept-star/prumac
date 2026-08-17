-- 0059_location_status.sql
-- ---------------------------------------------------------------------------
-- Record each driver's geolocation-permission state so managers can SEE who is
-- refusing to share location (the operator chose "allow but flag", not a hard
-- lockout). The driver app reports its permission state; managers get a red
-- flag. A PWA can't force the OS permission — this makes refusal visible.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS location_status text NOT NULL DEFAULT 'unknown'
    CHECK (location_status IN ('unknown', 'granted', 'denied', 'prompt', 'unsupported', 'insecure', 'error')),
  ADD COLUMN IF NOT EXISTS location_status_at timestamptz;

-- The driver app calls this whenever its permission state changes.
CREATE OR REPLACE FUNCTION app.fn_report_location_status(p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF p_status NOT IN ('granted', 'denied', 'prompt', 'unsupported', 'insecure', 'error') THEN
    RETURN;
  END IF;
  UPDATE app.profiles
     SET location_status = p_status,
         location_status_at = now()
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_report_location_status(text) TO authenticated, service_role;

COMMIT;
