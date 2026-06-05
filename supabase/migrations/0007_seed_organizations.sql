-- =============================================================================
-- 0007_seed_organizations.sql
-- Seed: subsidiaries (from the billing sheet "DEPARTMENT" column) and the
-- standard inspection templates + checklists.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Subsidiaries — every "DEPARTMENT" seen in the spreadsheets
-- ---------------------------------------------------------------------------
INSERT INTO app.subsidiaries (code, name, country) VALUES
    ('CT_MAGAZINE',   'CT Magazine',                       'ZW'),
    ('CT_MINING',     'CT Mining',                         'ZW'),
    ('CT_TRADING',    'CT Trading',                        'ZW'),
    ('BYO_ADMIN',     'Bulawayo Admin',                    'ZW'),
    ('PROCUREMENT',   'Procurement',                       'ZW'),
    ('ECOMATT_FOODS', 'Ecomatt Foods Milling Plant',       'ZW'),
    ('ECOMATT_BUTCH', 'Ecomatt Butcheries',                'ZW'),
    ('ECOMATT_FARM',  'Ecomatt Farm',                      'ZW'),
    ('GLOBAL_ENERGY', 'Global Energy',                     'ZW'),
    ('ADMIN',         'Admin',                             'ZW'),
    ('VIGOUR_SA',     'Vigour Projects SA',                'ZA')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Inspection templates
-- ---------------------------------------------------------------------------
INSERT INTO app.inspection_templates (id, name, applies_to, version)
VALUES
    ('11111111-1111-1111-1111-111111111101',
     'Light Vehicle Standard', '{}', 1),
    ('11111111-1111-1111-1111-111111111102',
     'Heavy Vehicle Standard', '{truck,tanker,minibus}', 1),
    ('11111111-1111-1111-1111-111111111103',
     'Farm Vehicle Standard', '{farm_vehicle,specialist}', 1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Light Vehicle checklist
-- ---------------------------------------------------------------------------
INSERT INTO app.inspection_checklist_items (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
    ('11111111-1111-1111-1111-111111111101',  1, 'Exterior', 'Body free of new damage',                    false, true),
    ('11111111-1111-1111-1111-111111111101',  2, 'Exterior', 'Windscreen free of cracks obscuring view',   true,  false),
    ('11111111-1111-1111-1111-111111111101',  3, 'Exterior', 'All side mirrors present and intact',        false, false),
    ('11111111-1111-1111-1111-111111111101',  4, 'Lights',   'Headlights (low + high beam) working',       true,  false),
    ('11111111-1111-1111-1111-111111111101',  5, 'Lights',   'Brake lights working',                       true,  false),
    ('11111111-1111-1111-1111-111111111101',  6, 'Lights',   'Indicators front and rear working',          true,  false),
    ('11111111-1111-1111-1111-111111111101',  7, 'Lights',   'Reverse light working',                      false, false),
    ('11111111-1111-1111-1111-111111111101',  8, 'Tyres',    'All four tyres adequate tread depth',        true,  false),
    ('11111111-1111-1111-1111-111111111101',  9, 'Tyres',    'No visible tyre damage or bulges',           true,  false),
    ('11111111-1111-1111-1111-111111111101', 10, 'Tyres',    'Spare tyre present and serviceable',         false, false),
    ('11111111-1111-1111-1111-111111111101', 11, 'Fluids',   'Coolant level adequate',                     false, false),
    ('11111111-1111-1111-1111-111111111101', 12, 'Fluids',   'Engine oil level adequate',                  false, false),
    ('11111111-1111-1111-1111-111111111101', 13, 'Fluids',   'Brake fluid level adequate',                 true,  false),
    ('11111111-1111-1111-1111-111111111101', 14, 'Brakes',   'Service brake responsive',                   true,  false),
    ('11111111-1111-1111-1111-111111111101', 15, 'Brakes',   'Handbrake holds vehicle on incline',         true,  false),
    ('11111111-1111-1111-1111-111111111101', 16, 'Safety',   'Seatbelts present and functional',           true,  false),
    ('11111111-1111-1111-1111-111111111101', 17, 'Safety',   'Fire extinguisher present and in date',      true,  false),
    ('11111111-1111-1111-1111-111111111101', 18, 'Safety',   'Warning triangles (×2) present',             true,  false),
    ('11111111-1111-1111-1111-111111111101', 19, 'Safety',   'Reflective vest present',                    false, false),
    ('11111111-1111-1111-1111-111111111101', 20, 'Safety',   'First aid kit present',                      false, false),
    ('11111111-1111-1111-1111-111111111101', 21, 'Safety',   'Wheel spanner and jack present',             false, false),
    ('11111111-1111-1111-1111-111111111101', 22, 'Documents','License disc in date and displayed',         true,  false),
    ('11111111-1111-1111-1111-111111111101', 23, 'Documents','Insurance certificate present in vehicle',   false, false),
    ('11111111-1111-1111-1111-111111111101', 24, 'Documents','Driver licence on person',                   true,  false),
    ('11111111-1111-1111-1111-111111111101', 25, 'Cabin',    'Dashboard warning lights clear',             true,  false),
    ('11111111-1111-1111-1111-111111111101', 26, 'Cabin',    'Horn working',                               false, false),
    ('11111111-1111-1111-1111-111111111101', 27, 'Cabin',    'Wipers and washer fluid functional',         false, false);

-- ---------------------------------------------------------------------------
-- Heavy Vehicle checklist (extends the light list conceptually)
-- ---------------------------------------------------------------------------
INSERT INTO app.inspection_checklist_items (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
    ('11111111-1111-1111-1111-111111111102',  1, 'Exterior',     'Cab body free of new damage',                false, true),
    ('11111111-1111-1111-1111-111111111102',  2, 'Exterior',     'Windscreen free of view-obscuring cracks',   true,  false),
    ('11111111-1111-1111-1111-111111111102',  3, 'Exterior',     'Mud flaps present and not torn',             false, false),
    ('11111111-1111-1111-1111-111111111102',  4, 'Lights',       'All marker lights and reflectors working',   true,  false),
    ('11111111-1111-1111-1111-111111111102',  5, 'Lights',       'Headlights low + high beam working',         true,  false),
    ('11111111-1111-1111-1111-111111111102',  6, 'Lights',       'Brake lights and indicators all working',    true,  false),
    ('11111111-1111-1111-1111-111111111102',  7, 'Tyres',        'All tyres (including doubles) tread OK',     true,  false),
    ('11111111-1111-1111-1111-111111111102',  8, 'Tyres',        'No cracked rims or loose wheel nuts',        true,  false),
    ('11111111-1111-1111-1111-111111111102',  9, 'Tyres',        'Spare tyre and tyre tools present',          false, false),
    ('11111111-1111-1111-1111-111111111102', 10, 'Air systems',  'Air pressure gauge in green',                true,  false),
    ('11111111-1111-1111-1111-111111111102', 11, 'Air systems',  'No audible air leaks',                       true,  false),
    ('11111111-1111-1111-1111-111111111102', 12, 'Brakes',       'Service brake responsive',                   true,  false),
    ('11111111-1111-1111-1111-111111111102', 13, 'Brakes',       'Parking brake holds load on incline',        true,  false),
    ('11111111-1111-1111-1111-111111111102', 14, 'Fluids',       'Coolant, engine oil, brake fluid OK',        true,  false),
    ('11111111-1111-1111-1111-111111111102', 15, 'Cab',          'All dashboard warning lights clear',         true,  false),
    ('11111111-1111-1111-1111-111111111102', 16, 'Cab',          'Tachograph/EDR functioning',                 false, false),
    ('11111111-1111-1111-1111-111111111102', 17, 'Safety',       'Fire extinguishers (×2) present and in date',true,  false),
    ('11111111-1111-1111-1111-111111111102', 18, 'Safety',       'Warning triangles and chocks present',       true,  false),
    ('11111111-1111-1111-1111-111111111102', 19, 'Safety',       'Reflective vest and first-aid kit present',  true,  false),
    ('11111111-1111-1111-1111-111111111102', 20, 'Documents',    'License disc in date',                       true,  false),
    ('11111111-1111-1111-1111-111111111102', 21, 'Documents',    'Certificate of Fitness in date',             true,  false),
    ('11111111-1111-1111-1111-111111111102', 22, 'Documents',    'Insurance certificate present',              false, false),
    ('11111111-1111-1111-1111-111111111102', 23, 'Documents',    'Driver licence and PrDP on person',          true,  false),
    ('11111111-1111-1111-1111-111111111102', 24, 'Tanker',       'Tank seals intact (tanker only)',            false, false),
    ('11111111-1111-1111-1111-111111111102', 25, 'Tanker',       'Hose couplings clean and undamaged',         false, false);

-- ---------------------------------------------------------------------------
-- Farm Vehicle checklist
-- ---------------------------------------------------------------------------
INSERT INTO app.inspection_checklist_items (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
    ('11111111-1111-1111-1111-111111111103',  1, 'Hydraulics', 'No hydraulic leaks',                      true,  false),
    ('11111111-1111-1111-1111-111111111103',  2, 'Hydraulics', 'PTO engages and disengages cleanly',      true,  false),
    ('11111111-1111-1111-1111-111111111103',  3, 'Fluids',     'Engine oil and coolant adequate',         true,  false),
    ('11111111-1111-1111-1111-111111111103',  4, 'Fluids',     'Hydraulic oil adequate',                  true,  false),
    ('11111111-1111-1111-1111-111111111103',  5, 'Tyres',      'Tyres adequate and undamaged',            true,  false),
    ('11111111-1111-1111-1111-111111111103',  6, 'Lights',     'Work lights functional',                  false, false),
    ('11111111-1111-1111-1111-111111111103',  7, 'Safety',     'PTO guard fitted and secure',             true,  false),
    ('11111111-1111-1111-1111-111111111103',  8, 'Safety',     'ROPS (roll-over protection) intact',      true,  false),
    ('11111111-1111-1111-1111-111111111103',  9, 'Safety',     'Fire extinguisher present',               true,  false),
    ('11111111-1111-1111-1111-111111111103', 10, 'Implements', 'Implement attached securely and pinned',  true,  true);

COMMIT;
