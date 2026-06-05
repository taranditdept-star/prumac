-- =============================================================================
-- 0009_seed_drivers.sql
-- Seed: drivers extracted from the PRUMAC register and 12 months of trip data.
--
-- The original data has name variants ("BLESSING SHUMBA" vs "B LESSING SHUMBA"
-- vs "BLESSING MUZORORI" — note Shumba and Muzorori are TWO DIFFERENT people
-- both with first name Blessing; the data has been disambiguated by tracking
-- which plate they drive consistently).
--
-- Driver profiles below cannot be linked to auth.users yet — that happens in
-- Phase 2 onboarding when each driver claims their account by phone OTP.
-- For now we store the driver record with profile_id pointing at a stub
-- profile created without an auth.users row (using a sentinel approach is
-- not appropriate; instead we leave drivers seeded WITHOUT profiles and
-- onboarding will create both rows atomically).
--
-- Implementation: we create stub auth.users + profiles via the helper, then
-- create drivers. In a real Supabase deploy, Phase 2 onboarding replaces the
-- stub records with real ones via auth.admin.createUser().
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper to create a "placeholder" profile+driver pair. Returns the driver id.
-- Used only for seeding; production onboarding goes through Supabase Auth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.fn_seed_driver(
    p_profile_id   uuid,
    p_full_name    text,
    p_phone        text,
    p_licence_no   text,
    p_licence_country app.country_code DEFAULT 'ZW'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_driver_id uuid;
BEGIN
    -- Insert a stub auth.users row (Supabase will treat this as a phone-OTP
    -- user pending claim). In a real deploy you'd skip this and just create
    -- the profile via the dashboard's auth API.
    INSERT INTO auth.users (
        id, email, phone, instance_id, aud, role, raw_app_meta_data,
        raw_user_meta_data, created_at, updated_at, confirmation_token,
        email_change_token_new, email_change, recovery_token, is_super_admin
    )
    VALUES (
        p_profile_id, NULL, p_phone, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '{"provider":"phone","providers":["phone"]}'::jsonb,
        jsonb_build_object('full_name', p_full_name),
        now(), now(), '', '', '', '', false
    )
    ON CONFLICT (id) DO NOTHING;

    -- The auth trigger creates the profile; we then enrich it
    UPDATE app.profiles
       SET full_name = p_full_name,
           phone     = p_phone,
           role      = 'driver',
           is_active = true
     WHERE id = p_profile_id;

    -- If for any reason the trigger didn't fire (e.g. running this in a
    -- detached test), ensure a profile exists:
    INSERT INTO app.profiles (id, full_name, phone, role, is_active)
    VALUES (p_profile_id, p_full_name, p_phone, 'driver', true)
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone     = EXCLUDED.phone,
        role      = EXCLUDED.role,
        is_active = true;

    INSERT INTO app.drivers (profile_id, licence_number, licence_country, is_active)
    VALUES (p_profile_id, p_licence_no, p_licence_country, true)
    ON CONFLICT (profile_id) DO UPDATE SET
        licence_number  = EXCLUDED.licence_number,
        licence_country = EXCLUDED.licence_country,
        is_active       = true
    RETURNING id INTO v_driver_id;

    RETURN v_driver_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed drivers
-- Licence numbers are placeholders (LIC-####) — replaced during Phase 2 onboarding.
-- ---------------------------------------------------------------------------
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000001'::uuid,
    'Lloyd Razor',           '+263774834618', 'LIC-0001', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000002'::uuid,
    'Kudakwashe Mukahanana', '+263779954046', 'LIC-0002', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000003'::uuid,
    'Blessing Shumba',       '+263774088129', 'LIC-0003', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000004'::uuid,
    'Allen Nyazika',         '+263784178763', 'LIC-0004', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000005'::uuid,
    'Bright Mangena',        '+263771919287', 'LIC-0005', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000006'::uuid,
    'Lucas Siziba',          '+263788418458', 'LIC-0006', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000007'::uuid,
    'Arnold Muzorori',       '+263786835993', 'LIC-0007', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000008'::uuid,
    'Fredmore Marema',       '+263718638047', 'LIC-0008', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000009'::uuid,
    'Edson Muchemwa',        '+263771919287', 'LIC-0009', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000010'::uuid,
    'Jonathan Mutakwa',      '+263777784209', 'LIC-0010', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000011'::uuid,
    'Odia Manjeze',          '+263715720832', 'LIC-0011', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000012'::uuid,
    'Thabile Langa',         '+27738612612',  'LIC-0012', 'ZA');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000013'::uuid,
    'Brighton Muchemwa',     '+27844824027',  'LIC-0013', 'ZA');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000014'::uuid,
    'Alec Hassan Magombo',   '+263785243317', 'LIC-0014', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000015'::uuid,
    'Ignatius Gundani',      '+263781527516', 'LIC-0015', 'ZW');

-- Additional drivers seen in the trip data (didn't appear in the master register
-- but actively drove vehicles — they need accounts day one)
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000016'::uuid,
    'Trevor Mpesi',          '+263770000016', 'LIC-0016', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000017'::uuid,
    'David Gondwe',          '+263770000017', 'LIC-0017', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000018'::uuid,
    'Emmanuel Mudzuri',      '+263770000018', 'LIC-0018', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000019'::uuid,
    'Blessing Muzorori',     '+263770000019', 'LIC-0019', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000020'::uuid,
    'Shyleen Mazengera',     '+263770000020', 'LIC-0020', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000021'::uuid,
    'Melusi Ncube',          '+263770000021', 'LIC-0021', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000022'::uuid,
    'Eliah Vuranda',         '+263770000022', 'LIC-0022', 'ZW');
SELECT app.fn_seed_driver(
    '33333333-0000-0000-0000-000000000023'::uuid,
    'Thando Mokoena',        '+27840000023',  'LIC-0023', 'ZA');

-- ---------------------------------------------------------------------------
-- Current vehicle assignments — who has which vehicle right now
-- ---------------------------------------------------------------------------
INSERT INTO app.vehicle_assignments (vehicle_id, driver_id, started_at, notes)
SELECT v.id, d.id, '2026-02-01 06:00:00+02'::timestamptz, 'Initial seed from PRUMAC register'
FROM (VALUES
    ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001'),  -- Scania → Lloyd Razor
    ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002'),  -- Iveco → Kudakwashe
    ('22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003'),  -- UD 40 → Blessing Shumba
    ('22222222-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000004'),  -- Quantum → Allen Nyazika
    ('22222222-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000005'),  -- Hilux → Bright Mangena
    ('22222222-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000006'),  -- Ford Ranger → Lucas Siziba
    -- Fortuner (007) → reserved for Mr Muzorori; left unassigned in seed
    ('22222222-0000-0000-0000-000000000008', '33333333-0000-0000-0000-000000000007'),  -- Vanguard → Arnold Muzorori
    -- Vezel (009) → Mrs Muzorori; left unassigned in seed
    ('22222222-0000-0000-0000-000000000010', '33333333-0000-0000-0000-000000000008'),  -- Axio → Fredmore Marema
    ('22222222-0000-0000-0000-000000000011', '33333333-0000-0000-0000-000000000009'),  -- GP5 Silver → Edson Muchemwa
    ('22222222-0000-0000-0000-000000000012', '33333333-0000-0000-0000-000000000018'),  -- GP5 1 → Emmanuel Mudzuri
    -- 13 in workshop; no assignment
    ('22222222-0000-0000-0000-000000000014', '33333333-0000-0000-0000-000000000010'),  -- Hybrid GP1 → Jonathan
    ('22222222-0000-0000-0000-000000000015', '33333333-0000-0000-0000-000000000008'),  -- Aqua → Fredmore Marema (multi-vehicle)
    ('22222222-0000-0000-0000-000000000016', '33333333-0000-0000-0000-000000000011'),  -- Grabber → Odia Manjeze
    ('22222222-0000-0000-0000-000000000017', '33333333-0000-0000-0000-000000000023'),  -- Hyundai i10 → Thando
    ('22222222-0000-0000-0000-000000000018', '33333333-0000-0000-0000-000000000013'),  -- Legend 45 → Brighton
    ('22222222-0000-0000-0000-000000000019', '33333333-0000-0000-0000-000000000014'),  -- Baby Quantum → Alec
    ('22222222-0000-0000-0000-000000000020', '33333333-0000-0000-0000-000000000015'),  -- GP5 (Ignatius) → Ignatius
    ('22222222-0000-0000-0000-000000000021', '33333333-0000-0000-0000-000000000003'),  -- UD 40 #2 → Blessing Shumba (shares with #1)
    ('22222222-0000-0000-0000-000000000022', '33333333-0000-0000-0000-000000000008')   -- Aqua #2 → Fredmore Marema
) AS pair(vehicle_id, driver_id)
JOIN app.vehicles v ON v.id = pair.vehicle_id::uuid
JOIN app.drivers  d ON d.id = pair.driver_id::uuid;

-- Note: Fredmore Marema appears assigned to three vehicles (Axio, Aqua, Aqua#2)
-- in the source data. The exclusion constraint on assignments prevents one
-- vehicle from being double-assigned, but a driver CAN hold multiple vehicles
-- (e.g. swing driver). The trip-level constraint (one open trip per driver)
-- ensures they only drive one at a time.

-- Drop the seeding helper to keep the public schema clean
DROP FUNCTION app.fn_seed_driver(uuid, text, text, text, app.country_code);

COMMIT;
