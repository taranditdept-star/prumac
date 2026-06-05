-- =============================================================================
-- 0008_seed_fleet.sql
-- Seed: the 22 vehicles from PRUMAC_VEHICLE_REGISTER.xlsx, their compliance
-- documents (license disc expiries, insurance), and current billing rates.
--
-- Rates are taken from the FEB 2026 column of the monthly billing sheets,
-- which represents the most recent agreed schedule. Earlier rates (e.g. the
-- $0.40 → $0.65 transition) are not seeded — they would be created as
-- historical billing_rates entries by an admin migration in Phase 9.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: resolve a subsidiary's id by code
-- ---------------------------------------------------------------------------
-- (no helper needed; we inline the lookups via subqueries for clarity)

-- ---------------------------------------------------------------------------
-- Vehicles
-- License disc expiries from the register are in Excel-serial dates
-- (e.g. 46235 = 2026-09-30). We translate to ISO dates inline.
-- ---------------------------------------------------------------------------

-- Use temp tables to insert and capture IDs cleanly
INSERT INTO app.vehicles (
    id, plate_number, plate_country, vin, engine_number,
    make, model, variant, colour, class, fuel_type,
    status, home_branch, default_subsidiary_id,
    current_odometer_km, condition_notes
) VALUES
-- 1: SCANIA TANKER (Lloyd Razor)
('22222222-0000-0000-0000-000000000001',
 'AGB 1400', 'ZW', 'XLEP8X20005234961', '3119485',
 'Scania', 'Tanker', NULL, 'Blue', 'tanker', 'diesel',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'GLOBAL_ENERGY'),
 740838,
 'Suspension needs kingpins and shock absorbers. Fitness updated at 740838 km.'),

-- 2: IVECO TANKER (Kudakwashe Mukahanana)
('22222222-0000-0000-0000-000000000002',
 'AFQ 7950', 'ZW', 'WJME2NN0004305726', '62775',
 'Iveco', 'Stralis Tanker', NULL, 'White', 'tanker', 'diesel',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'GLOBAL_ENERGY'),
 670895, NULL),

-- 3: NISSAN UD 40 (Blessing Shumba)
('22222222-0000-0000-0000-000000000003',
 'AGH 2028', 'ZW', 'ADD55300000002653', 'FD46030930',
 'Nissan', 'UD 40', NULL, 'White', 'truck', 'diesel',
 'available', 'Bulawayo',
 (SELECT id FROM app.subsidiaries WHERE code = 'ECOMATT_FOODS'),
 423588, NULL),

-- 4: QUANTAM MINI BUS (Allen Nyazika)
('22222222-0000-0000-0000-000000000004',
 'AGH 0649', 'ZW', 'AHTSX222507105439', '2TR2276522',
 'Toyota', 'Quantum', 'Mini Bus', 'White', 'minibus', 'petrol',
 'available', 'Bulawayo',
 (SELECT id FROM app.subsidiaries WHERE code = 'ECOMATT_FOODS'),
 196750, NULL),

-- 5: TOYOTA HILUX BAKKIE (Bright Mangena)
('22222222-0000-0000-0000-000000000005',
 'AGH 5221', 'ZW', 'AHTJB8DB104579861', '2GDC522965',
 'Toyota', 'Hilux', 'Bakkie', 'White', 'bakkie', 'diesel',
 'available', 'Kwekwe',
 (SELECT id FROM app.subsidiaries WHERE code = 'ECOMATT_BUTCH'),
 206815,
 'Returned from repair workshop.'),

-- 6: FORD RANGER (Lucas Siziba)
('22222222-0000-0000-0000-000000000006',
 'AFG 4081', 'ZW', '402W236902', 'WL691527',
 'Ford', 'Ranger 2.5D', NULL, 'Silver', 'bakkie', 'diesel',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'CT_MINING'),
 228720,
 'Turbo pipe leaking; windscreen cracked; diesel filter and lift pump need service; clutch kits need attention.'),

-- 7: TOYOTA FORTUNER (Mr Muzorori)
('22222222-0000-0000-0000-000000000007',
 'AFN 9723', 'ZW', 'AHTJA3GS000222583', 'IGD0173367',
 'Toyota', 'Fortuner', NULL, 'Grey', 'suv', 'diesel',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'ADMIN'),
 130454, NULL),

-- 8: VANGUARD (Arnold Muzorori)
('22222222-0000-0000-0000-000000000008',
 'AGE 6129', 'ZW', 'ACA385253424', '2AZB610117',
 'Toyota', 'Vanguard', NULL, 'Black', 'suv', 'petrol',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'PROCUREMENT'),
 195499,
 'Emergency kit available; cracked windscreen; gearbox mounting kit needed; full service needed.'),

-- 9: HONDA VEZEL (Mrs Muzorori)
('22222222-0000-0000-0000-000000000009',
 'AGX 8361', 'ZW', 'RU31116047', 'LEB5066063',
 'Honda', 'Vezel', NULL, 'White', 'suv', 'hybrid',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'ADMIN'),
 135304,
 'Battery to be changed; fire extinguisher needed.'),

-- 10: TOYOTA AXIO (Fredmore Marema)
('22222222-0000-0000-0000-000000000010',
 'AFV 1879', 'ZW', '3038165', '1NZR303218',
 'Toyota', 'Axio', NULL, 'White', 'sedan', 'petrol',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'CT_TRADING'),
 168997, NULL),

-- 11: HONDA FIT GP5 SILVER (Edson Muchemwa)
('22222222-0000-0000-0000-000000000011',
 'AGW 4011', 'ZW', 'GP54303873', 'LEB5703875',
 'Honda', 'Fit', 'GP5 Silver', 'Silver', 'sedan', 'petrol',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'PROCUREMENT'),
 118246,
 'Front lights and back not tel; right front bumper dent; suspension stabilizer needs check.'),

-- 12: HONDA FIT GP5 1 (Fredmore Marema)
('22222222-0000-0000-0000-000000000012',
 'AGI 9014', 'ZW', 'GP54009749', 'LEB4069748',
 'Honda', 'Fit', 'GP5 1 Silver', 'Silver', 'sedan', 'petrol',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'CT_TRADING'),
 240907,
 'Back & front lights good; left front door dent; front screen cracked; needs seat cover.'),

-- 13: HONDA FIT WHITE GP5 2 (In Repairs)
('22222222-0000-0000-0000-000000000013',
 'AGE 6130', 'ZW', 'GP53111044', 'LEB3125674',
 'Honda', 'Fit', 'GP5 2 White', 'White', 'sedan', 'petrol',
 'workshop', 'Harare',
 NULL,
 0,
 'Currently in repairs.'),

-- 14: HONDA FIT HYBRID GP1 (Jonathan Mutakwa)
('22222222-0000-0000-0000-000000000014',
 'AFO 6381', 'ZW', 'GP11223599', 'LDA5223645',
 'Honda', 'Fit', 'Hybrid GP1 White', 'White', 'sedan', 'hybrid',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'CT_MAGAZINE'),
 253217,
 'Lighting system good; cracked windscreen; poor suspension and braking; emergency kit complete.'),

-- 15: TOYOTA AQUA (Fredmore Marema)
('22222222-0000-0000-0000-000000000015',
 'AGI 9015', 'ZW', 'NHP102365116', '1NXC25771',
 'Toyota', 'Aqua', NULL, 'Pale White', 'sedan', 'hybrid',
 'available', 'Bulawayo',
 (SELECT id FROM app.subsidiaries WHERE code = 'BYO_ADMIN'),
 313890,
 'Front dents; cracked windscreen; left view mirror cracked; brakes need check; emergency kit available.'),

-- 16: DAF GRABBER (Odia Manjeze)
('22222222-0000-0000-0000-000000000016',
 'AFQ 3770', 'ZW', 'XLRAD85MCOE75885', 'M20927',
 'DAF', 'Grabber', NULL, 'Red', 'farm_vehicle', 'diesel',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'ECOMATT_FARM'),
 314656,
 'Front and back lights good. Needs king pin.'),

-- 17: HYUNDAI i10 (Thabile Langa, SA)
('22222222-0000-0000-0000-000000000017',
 'CF 198308', 'ZA', 'MALAN51BLHM691802', 'G4HGGM945971',
 'Hyundai', 'i10', NULL, 'White', 'sedan', 'petrol',
 'available', 'Cape Town',
 (SELECT id FROM app.subsidiaries WHERE code = 'VIGOUR_SA'),
 229553,
 'Front windscreen cracked; right back door small dent; all spares available; need 1 right side backlight.'),

-- 18: LEGEND 45 (Brighton Muchemwa, SA)
('22222222-0000-0000-0000-000000000018',
 'CF 347017', 'ZA', 'AHTER39G2086066398', '2KDA679665',
 'Toyota', 'Legend 45', NULL, 'Silver', 'specialist', 'diesel',
 'available', 'Pretoria',
 (SELECT id FROM app.subsidiaries WHERE code = 'VIGOUR_SA'),
 427228,
 'Needs 4 shocks; brake pads front 2; 2 ball joints; 2 stab links; 2 tie rod ends.'),

-- 19: TOYOTA HIACE BABY QUANTUM (Alec Hassan Magombo)
('22222222-0000-0000-0000-000000000019',
 'AHO 3790', 'ZW', 'TRH2000268853', NULL,
 'Toyota', 'Hiace', 'Baby Quantum', 'White', 'minibus', 'petrol',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'ADMIN'),
 3401, NULL),

-- 20: HONDA FIT (Ignatius Gundani)
('22222222-0000-0000-0000-000000000020',
 'AHO 3791', 'ZW', 'GP51228327', NULL,
 'Honda', 'Fit', 'GP5', 'White', 'sedan', 'petrol',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'CT_TRADING'),
 78726, NULL),

-- 21: NISSAN UD 40 (#2) (Blessing Shumba)
('22222222-0000-0000-0000-000000000021',
 'AGY 9535', 'ZW', 'ADN5520000000001338', NULL,
 'Nissan', 'UD 40', NULL, 'White', 'truck', 'diesel',
 'available', 'Harare',
 (SELECT id FROM app.subsidiaries WHERE code = 'ECOMATT_FOODS'),
 259671, NULL),

-- 22: TOYOTA AQUA (#2) (Fredmore Marema)
('22222222-0000-0000-0000-000000000022',
 'AHN 4054', 'ZW', 'NHP10-6505825', NULL,
 'Toyota', 'Aqua', NULL, 'Silver', 'sedan', 'hybrid',
 'available', 'Gwanda',
 (SELECT id FROM app.subsidiaries WHERE code = 'BYO_ADMIN'),
 91509, NULL);

-- ---------------------------------------------------------------------------
-- Vehicle documents — license discs (from EXPIRY DATE OF LICENSE DISC col)
-- Excel serials translate to:
--   46054 -> 2026-02-23   46113 -> 2026-04-23   46173 -> 2026-06-22
--   46204 -> 2026-07-23   46235 -> 2026-08-23   46388 -> 2027-01-23
--   46478 -> 2027-04-23   46508 -> 2027-05-23
-- ---------------------------------------------------------------------------
INSERT INTO app.vehicle_documents (vehicle_id, document_type, expires_at) VALUES
('22222222-0000-0000-0000-000000000001', 'license_disc', '2026-08-23'),
('22222222-0000-0000-0000-000000000002', 'license_disc', '2026-08-23'),
('22222222-0000-0000-0000-000000000003', 'license_disc', '2026-02-23'),
('22222222-0000-0000-0000-000000000004', 'license_disc', '2026-02-23'),
-- vehicle 5 (Hilux): no disc expiry in register
('22222222-0000-0000-0000-000000000006', 'license_disc', '2026-06-22'),
-- vehicle 7 (Fortuner): no disc expiry in register
('22222222-0000-0000-0000-000000000008', 'license_disc', '2026-02-23'),
('22222222-0000-0000-0000-000000000009', 'license_disc', '2027-05-23'),
('22222222-0000-0000-0000-000000000010', 'license_disc', '2026-07-23'),
('22222222-0000-0000-0000-000000000011', 'license_disc', '2027-04-23'),
-- vehicle 12 (Honda Fit GP5 1): no disc expiry
-- vehicle 13 (Honda Fit GP5 2): in workshop
('22222222-0000-0000-0000-000000000014', 'license_disc', '2026-08-23'),
('22222222-0000-0000-0000-000000000015', 'license_disc', '2026-08-23'),
('22222222-0000-0000-0000-000000000016', 'license_disc', '2026-04-23'),
-- vehicle 17 (Hyundai SA): no disc expiry recorded
('22222222-0000-0000-0000-000000000019', 'license_disc', '2027-01-23'),
('22222222-0000-0000-0000-000000000020', 'license_disc', '2027-01-23'),
('22222222-0000-0000-0000-000000000021', 'license_disc', '2026-08-23');

-- Insurance documents (from INSURANCE TYPE col)
INSERT INTO app.vehicle_documents (vehicle_id, document_type, insurance_type, expires_at, notes) VALUES
('22222222-0000-0000-0000-000000000001', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000002', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000003', 'insurance', 'champions',             '2026-12-31', 'Champions Insurance'),
('22222222-0000-0000-0000-000000000004', 'insurance', 'champions',             '2026-12-31', 'Champions Insurance'),
('22222222-0000-0000-0000-000000000005', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000006', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000008', 'insurance', 'old_mutual_full_cover', '2026-12-31', 'Old Mutual Full Cover (in process)'),
('22222222-0000-0000-0000-000000000009', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000010', 'insurance', 'champions',             '2026-12-31', 'Champions Insurance'),
('22222222-0000-0000-0000-000000000011', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000012', 'insurance', 'old_mutual_full_cover', '2026-12-31', 'Full Cover Old Mutual'),
('22222222-0000-0000-0000-000000000014', 'insurance', 'old_mutual_full_cover', '2026-12-31', 'Full Cover Old Mutual'),
('22222222-0000-0000-0000-000000000015', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000016', 'insurance', 'third_party',           '2026-12-31', 'Third Party'),
('22222222-0000-0000-0000-000000000017', 'insurance', 'miway_full_cover',      '2026-12-31', 'Full Cover MiWay'),
('22222222-0000-0000-0000-000000000019', 'insurance', 'old_mutual_full_cover', '2026-12-31', 'Full Cover Old Mutual'),
('22222222-0000-0000-0000-000000000020', 'insurance', 'old_mutual_full_cover', '2026-12-31', 'Full Cover Old Mutual'),
('22222222-0000-0000-0000-000000000021', 'insurance', 'third_party',           '2026-12-31', 'Third Party (CBZ)');

-- ---------------------------------------------------------------------------
-- Billing rates — current (effective 2026-02-01, from the FEB 2026 sheet)
-- Mode mapping:
--   per_km           : sedans, suvs, bakkies, truck, quantum, vanguard, legend, hyundai
--   per_litre_100km  : tankers (Scania, Iveco)
--   per_load         : grabber (radius 20 km)
-- These are the default rates (subsidiary_id NULL). Subsidiary-specific
-- overrides can be added later.
-- ---------------------------------------------------------------------------
INSERT INTO app.billing_rates (
    vehicle_id, subsidiary_id, mode, rate_amount, currency, radius_km, effective_from, notes
) VALUES
('22222222-0000-0000-0000-000000000001', NULL, 'per_litre_100km', 0.01, 'USD', NULL, '2026-02-01', 'Scania tanker — per L per 100 km'),
('22222222-0000-0000-0000-000000000002', NULL, 'per_litre_100km', 0.01, 'USD', NULL, '2026-02-01', 'Iveco tanker — per L per 100 km'),
('22222222-0000-0000-0000-000000000003', NULL, 'per_km',          1.60, 'USD', NULL, '2026-02-01', 'UD 40 truck'),
('22222222-0000-0000-0000-000000000004', NULL, 'per_km',          1.10, 'USD', NULL, '2026-02-01', 'Toyota Quantum'),
('22222222-0000-0000-0000-000000000005', NULL, 'per_km',          1.00, 'USD', NULL, '2026-02-01', 'Toyota Hilux bakkie'),
('22222222-0000-0000-0000-000000000006', NULL, 'per_km',          1.00, 'USD', NULL, '2026-02-01', 'Ford Ranger 2.5D'),
('22222222-0000-0000-0000-000000000007', NULL, 'per_km',          1.00, 'USD', NULL, '2026-02-01', 'Toyota Fortuner'),
('22222222-0000-0000-0000-000000000008', NULL, 'per_km',          0.85, 'USD', NULL, '2026-02-01', 'Vanguard'),
('22222222-0000-0000-0000-000000000009', NULL, 'per_km',          0.85, 'USD', NULL, '2026-02-01', 'Honda Vezel'),
('22222222-0000-0000-0000-000000000010', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Toyota Axio'),
('22222222-0000-0000-0000-000000000011', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Honda Fit GP5 Silver'),
('22222222-0000-0000-0000-000000000012', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Honda Fit GP5 1'),
('22222222-0000-0000-0000-000000000013', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Honda Fit GP5 2 White'),
('22222222-0000-0000-0000-000000000014', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Honda Fit Hybrid GP1'),
('22222222-0000-0000-0000-000000000015', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Toyota Aqua'),
('22222222-0000-0000-0000-000000000016', NULL, 'per_load',        1.60, 'USD', 20,   '2026-02-01', 'DAF Grabber — per load within 20 km radius'),
('22222222-0000-0000-0000-000000000017', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Hyundai i10 (SA)'),
('22222222-0000-0000-0000-000000000018', NULL, 'per_km',          1.00, 'USD', NULL, '2026-02-01', 'Legend 45 (SA)'),
('22222222-0000-0000-0000-000000000019', NULL, 'per_km',          1.10, 'USD', NULL, '2026-02-01', 'Toyota Hiace Baby Quantum'),
('22222222-0000-0000-0000-000000000020', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Honda Fit GP5 (Ignatius)'),
('22222222-0000-0000-0000-000000000021', NULL, 'per_km',          1.60, 'USD', NULL, '2026-02-01', 'Nissan UD 40 #2'),
('22222222-0000-0000-0000-000000000022', NULL, 'per_km',          0.65, 'USD', NULL, '2026-02-01', 'Toyota Aqua #2');

COMMIT;
