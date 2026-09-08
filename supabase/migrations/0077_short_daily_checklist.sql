-- 0077_short_daily_checklist.sql
-- ---------------------------------------------------------------------------
-- Cut the vehicle check from ~30 items to 5.
--
-- A heavy vehicle asked for 30 answers before a driver could start a trip, a
-- light vehicle 32. A check that long is not done carefully — it is tapped
-- through, which is worse than a short one done honestly.
--
-- The old items are NOT deleted. inspection_item_results references them with
-- ON DELETE RESTRICT, and 3,264 answers already point at them; deleting would
-- either fail or destroy the history behind every past inspection. They are
-- switched off instead, so old inspections still render their real questions
-- and any item can be switched back on with a single UPDATE.
--
-- Documents (licence disc, CoF, insurance) are deliberately NOT in the daily
-- five. The system already watches every expiry date and raises an alert weeks
-- ahead — asking a driver to confirm the same thing every morning is duplicated
-- work that catches nothing new.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.inspection_checklist_items
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN app.inspection_checklist_items.is_active IS
    'Whether this item is asked on NEW checklists. Never delete an item that '
    'has answers against it — switch it off here so past inspections keep their '
    'questions.';

CREATE INDEX IF NOT EXISTS inspection_checklist_items_active_idx
    ON app.inspection_checklist_items (template_id, sort_order)
    WHERE is_active;

-- Retire everything that exists today.
UPDATE app.inspection_checklist_items SET is_active = false;

-- The five that replace them. New rows rather than edited ones: rewording an
-- existing item would silently change what every past answer to it meant.
-- sort_order starts at 101 because 1-44 are taken by the retired items and the
-- (template_id, sort_order) pair is unique.

-- Light vehicles ------------------------------------------------------------
INSERT INTO app.inspection_checklist_items
    (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
('11111111-1111-1111-1111-111111111101', 101, 'Tyres',    'Tyres — tread, pressure and no damage',                  true,  false),
('11111111-1111-1111-1111-111111111101', 102, 'Brakes',   'Brakes — foot brake firm, handbrake holds',              true,  false),
('11111111-1111-1111-1111-111111111101', 103, 'Lights',   'Lights — headlights, brake lights and indicators',       true,  false),
('11111111-1111-1111-1111-111111111101', 104, 'Fluids',   'Oil and water levels, and no leaks underneath',          true,  false),
('11111111-1111-1111-1111-111111111101', 105, 'Exterior', 'Body and windscreen — any new damage',                   false, true);

-- Heavy vehicles (truck, tanker, minibus) -----------------------------------
INSERT INTO app.inspection_checklist_items
    (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
('11111111-1111-1111-1111-111111111102', 101, 'Tyres',    'Tyres and wheel nuts — tread, damage, nothing loose',    true,  false),
('11111111-1111-1111-1111-111111111102', 102, 'Brakes',   'Brakes and air — pressure in the green, no leaks',       true,  false),
('11111111-1111-1111-1111-111111111102', 103, 'Lights',   'Lights — headlights, brake lights, indicators, markers', true,  false),
('11111111-1111-1111-1111-111111111102', 104, 'Fluids',   'Oil, water and coolant, and no leaks underneath',        true,  false),
('11111111-1111-1111-1111-111111111102', 105, 'Exterior', 'Cab, body and windscreen — any new damage',              false, true);

-- Farm and specialist vehicles ----------------------------------------------
INSERT INTO app.inspection_checklist_items
    (template_id, sort_order, category, label, is_critical, requires_photo) VALUES
('11111111-1111-1111-1111-111111111103', 101, 'Tyres',      'Tyres and wheels — adequate and undamaged',            true,  false),
('11111111-1111-1111-1111-111111111103', 102, 'Brakes',     'Brakes and steering respond properly',                 true,  false),
('11111111-1111-1111-1111-111111111103', 103, 'Hydraulics', 'Hydraulics and PTO — no leaks, engages cleanly',       true,  false),
('11111111-1111-1111-1111-111111111103', 104, 'Fluids',     'Engine oil, coolant and hydraulic oil',                true,  false),
('11111111-1111-1111-1111-111111111103', 105, 'Safety',     'PTO guard, ROPS and implement secure',                 true,  true);

COMMIT;
