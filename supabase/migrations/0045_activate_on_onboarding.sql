-- 0045_activate_on_onboarding.sql
-- ---------------------------------------------------------------------------
-- The on_auth_user_created trigger (0002) stubs every new profile with
-- is_active = false ("inactive until onboarding completes"). But nothing was
-- ever flipping it back to true:
--   * fn_complete_driver_onboarding (0037) updated licence + phone only.
--   * createStaffLogin / createDriverLogin / createDriver upserted the profile
--     without is_active.
-- RLS's app.role_is() requires is_active, so an un-activated user can sign in
-- (requireRole reads via the service client, which ignores RLS) yet sees ZERO
-- data — an empty dashboard, no vehicles, no trips.
--
-- The app-side creation paths now set is_active = true. This migration closes
-- the loop for the driver self-onboarding flow: completing onboarding activates
-- the profile, healing any driver created inactive before the code fix.
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
  SET phone     = trim(p_phone),
      is_active = true          -- activate so RLS role_is('driver') engages
  WHERE id = v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_complete_driver_onboarding(text, text, date)
  TO authenticated;

COMMIT;
