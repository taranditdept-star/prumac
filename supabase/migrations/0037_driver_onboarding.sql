-- 0037_driver_onboarding.sql
-- ---------------------------------------------------------------------------
-- Let an import-created driver complete their own profile on first login.
-- The 12 relief drivers added from the Excel register have
-- licence_number = 'IMPORT-PENDING' and no phone. A driver can't UPDATE
-- app.drivers directly (manager-owned under RLS), so this SECURITY DEFINER RPC
-- updates the CURRENT driver's licence + phone only.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_complete_driver_onboarding(
  p_phone             text,
  p_licence_number    text,
  p_licence_expires_at date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_driver_id  uuid;
  v_profile_id uuid;
BEGIN
  v_driver_id := app.current_driver_id();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No driver record for the current user'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(p_licence_number), '') = '' THEN
    RAISE EXCEPTION 'Licence number is required';
  END IF;
  IF coalesce(trim(p_phone), '') = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  SELECT profile_id INTO v_profile_id FROM app.drivers WHERE id = v_driver_id;

  UPDATE app.drivers
  SET licence_number     = trim(p_licence_number),
      licence_expires_at = COALESCE(p_licence_expires_at, licence_expires_at),
      updated_at         = now()
  WHERE id = v_driver_id;

  UPDATE app.profiles
  SET phone = trim(p_phone)
  WHERE id = v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_complete_driver_onboarding(text, text, date)
  TO authenticated;

COMMIT;
