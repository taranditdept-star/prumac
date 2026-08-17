-- 0070_driver_self_profile.sql
-- ---------------------------------------------------------------------------
-- Let a driver maintain their OWN details from the app.
--
-- Drivers cannot UPDATE app.drivers or app.profiles directly (RLS gives write
-- access to managers/admins only), so this mirrors fn_complete_driver_onboarding:
-- a SECURITY DEFINER function that derives the driver from auth.uid() and can
-- therefore only ever touch that driver's own rows.
--
-- Deliberately NOT editable by the driver: employee_number (their PMD id is
-- issued by the office), role, is_active/access_status, and anything about
-- vehicles or assignments. Changing those is a management decision.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_update_my_driver_profile(
  p_full_name           text,
  p_phone               text,
  p_licence_number      text,
  p_licence_country     text DEFAULT NULL,
  p_licence_classes     text[] DEFAULT NULL,
  p_licence_issued_at   date DEFAULT NULL,
  p_licence_expires_at  date DEFAULT NULL,
  p_defensive_cert_at   date DEFAULT NULL,
  p_medical_expires_at  date DEFAULT NULL,
  p_home_address        text DEFAULT NULL,
  p_next_of_kin_name    text DEFAULT NULL,
  p_next_of_kin_phone   text DEFAULT NULL
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
    RAISE EXCEPTION 'No driver record for the current user' USING ERRCODE = '42501';
  END IF;

  IF coalesce(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Your name is required';
  END IF;
  IF coalesce(trim(p_licence_number), '') = '' THEN
    RAISE EXCEPTION 'Licence number is required';
  END IF;
  IF p_licence_country IS NOT NULL AND p_licence_country NOT IN ('ZW', 'ZA') THEN
    RAISE EXCEPTION 'Licence country must be ZW or ZA';
  END IF;
  IF p_licence_expires_at IS NOT NULL AND p_licence_issued_at IS NOT NULL
     AND p_licence_expires_at < p_licence_issued_at THEN
    RAISE EXCEPTION 'Licence expiry cannot be before the issue date';
  END IF;

  SELECT profile_id INTO v_profile_id FROM app.drivers WHERE id = v_driver_id;

  UPDATE app.drivers
     SET licence_number            = trim(p_licence_number),
         licence_country           = COALESCE(p_licence_country::app.country_code, licence_country),
         licence_classes           = COALESCE(p_licence_classes, licence_classes),
         licence_issued_at         = COALESCE(p_licence_issued_at, licence_issued_at),
         licence_expires_at        = COALESCE(p_licence_expires_at, licence_expires_at),
         defensive_driving_cert_at = COALESCE(p_defensive_cert_at, defensive_driving_cert_at),
         medical_cert_expires_at   = COALESCE(p_medical_expires_at, medical_cert_expires_at),
         home_address              = COALESCE(NULLIF(trim(p_home_address), ''), home_address),
         next_of_kin_name          = COALESCE(NULLIF(trim(p_next_of_kin_name), ''), next_of_kin_name),
         next_of_kin_phone         = COALESCE(NULLIF(trim(p_next_of_kin_phone), ''), next_of_kin_phone),
         updated_at                = now()
   WHERE id = v_driver_id;

  UPDATE app.profiles
     SET full_name = trim(p_full_name),
         phone     = COALESCE(NULLIF(trim(p_phone), ''), phone)
   WHERE id = v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_update_my_driver_profile(
  text, text, text, text, text[], date, date, date, date, text, text, text
) TO authenticated;

-- A driver may READ their own driver row (they could not before, which is why
-- the profile screen had nothing to show).
DROP POLICY IF EXISTS drivers_read_self ON app.drivers;
CREATE POLICY drivers_read_self ON app.drivers
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

COMMIT;
