-- =============================================================================
-- 0021_seed_maintenance_demo.sql
-- Demo data for the Phase 11 maintenance cluster (fuel, PM, tyres & parts).
-- Idempotent: the whole block no-ops if fuel_logs already has rows.
-- Tied to real seeded vehicles (22222222-…) and drivers.
-- =============================================================================

DO $$
DECLARE
    v_agb  uuid := '22222222-0000-0000-0000-000000000001';  -- AGB 1400 tanker  740838km
    v_afq7 uuid := '22222222-0000-0000-0000-000000000002';  -- AFQ 7950 tanker  670895km
    v_agh  uuid := '22222222-0000-0000-0000-000000000003';  -- AGH 2028 truck   423588km
    v_agi  uuid := '22222222-0000-0000-0000-000000000015';  -- AGI 9015 sedan   313890km
    d_alec uuid := '252b3a58-8524-485f-ba5a-96c50fb8ab47';
    d_bles uuid := 'c0bc4a7e-bb73-41c4-806c-6cadf3df8102';
    card1 uuid;
    p_oilf uuid; p_airf uuid; p_oil uuid; p_brake uuid;
    p_batt uuid; p_belt uuid; p_cool uuid; p_kit uuid;
    tyre uuid;
    pos text;
BEGIN
    IF (SELECT count(*) FROM app.fuel_logs) > 0 THEN
        RAISE NOTICE 'maintenance demo already seeded — skipping';
        RETURN;
    END IF;

    -- ---- Fuel cards --------------------------------------------------------
    INSERT INTO app.fuel_cards (card_number, provider, assigned_vehicle_id)
    VALUES ('PUMA-4471-0098', 'Puma Energy', v_agb) RETURNING id INTO card1;
    INSERT INTO app.fuel_cards (card_number, provider, assigned_vehicle_id)
    VALUES ('TOTAL-2210-7733', 'TotalEnergies', v_afq7);

    -- ---- Fuel logs (consecutive odometers so efficiency computes) ----------
    -- AGB 1400 tanker — last fill is an anomaly (≈73 vs ≈40 L/100km median).
    INSERT INTO app.fuel_logs (vehicle_id, driver_id, fuel_card_id, filled_at, odometer_km, litres, price_per_litre, total_cost, station, payment_method) VALUES
      (v_agb, d_alec, card1, now() - interval '60 days', 737000, 480, 0.65, 312.00, 'Puma Msasa',        'fuel_card'),
      (v_agb, d_alec, card1, now() - interval '40 days', 738250, 500, 0.66, 330.00, 'Puma Msasa',        'fuel_card'),
      (v_agb, d_alec, card1, now() - interval '20 days', 739500, 510, 0.70, 357.00, 'Puma Beitbridge',   'fuel_card'),
      (v_agb, d_alec, card1, now() - interval '5 days',  740838, 980, 0.70, 686.00, 'Independent — Gwanda', 'cash');

    -- AGH 2028 truck — normal consumption (~35 L/100km).
    INSERT INTO app.fuel_logs (vehicle_id, driver_id, filled_at, odometer_km, litres, price_per_litre, total_cost, station, payment_method) VALUES
      (v_agh, d_bles, now() - interval '45 days', 420500, 350, 0.66, 231.00, 'Total Borrowdale', 'fuel_card'),
      (v_agh, d_bles, now() - interval '25 days', 421800, 460, 0.68, 312.80, 'Total Borrowdale', 'fuel_card'),
      (v_agh, d_bles, now() - interval '6 days',  423588, 640, 0.70, 448.00, 'Zuva Chinhoyi',    'fuel_card');

    -- AGI 9015 hybrid sedan — economical (~7 L/100km).
    INSERT INTO app.fuel_logs (vehicle_id, filled_at, odometer_km, litres, price_per_litre, total_cost, station, payment_method) VALUES
      (v_agi, now() - interval '35 days', 312900, 40, 1.55, 62.00, 'Engen Avondale', 'fuel_card'),
      (v_agi, now() - interval '18 days', 313550, 44, 1.58, 69.52, 'Engen Avondale', 'fuel_card'),
      (v_agi, now() - interval '4 days',  313890, 24, 1.60, 38.40, 'Engen Avondale', 'fuel_card');

    -- ---- Preventive maintenance -------------------------------------------
    -- Base service: AGH is due soon (412 km left); AFQ7 is overdue (895 km over).
    UPDATE app.vehicles SET last_service_odometer_km = 419000, service_interval_km = 5000,
        last_service_date = current_date - 40, service_interval_days = 180 WHERE id = v_agh;
    UPDATE app.vehicles SET last_service_odometer_km = 665000, service_interval_km = 5000,
        last_service_date = current_date - 210, service_interval_days = 180 WHERE id = v_afq7;

    INSERT INTO app.pm_plans (vehicle_id, task_name, interval_km, last_done_km) VALUES
      (v_agb, 'Tyre rotation', 10000, 731000);                      -- due in ~162 km
    INSERT INTO app.pm_plans (vehicle_id, task_name, interval_days, last_done_at) VALUES
      (v_agb, 'Engine oil & filter', 180, current_date - 176),      -- due in 4 days
      (v_agh, 'Brake inspection', 90, current_date - 100);          -- overdue 10 days

    -- ---- Parts catalogue + opening stock (ledger keeps current_stock) ------
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Oil filter — Hino 300', 'HNO-OF-300', 'filter', 'each', 12.50, 5, 'Croco Motors', 'Harare main store') RETURNING id INTO p_oilf;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Air filter — Isuzu KB', 'ISZ-AF-KB', 'filter', 'each', 18.00, 4, 'Croco Motors', 'Harare main store') RETURNING id INTO p_airf;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Engine oil 15W-40', 'OIL-1540', 'oil', 'litre', 4.20, 40, 'Engen Lubricants', 'Harare main store') RETURNING id INTO p_oil;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Brake pads — front set', 'BRK-FR-SET', 'brake', 'set', 45.00, 3, 'Autoworld', 'Bulawayo store') RETURNING id INTO p_brake;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Battery 100Ah', 'BAT-100', 'battery', 'each', 95.00, 2, 'Chloride Zimbabwe', 'Harare main store') RETURNING id INTO p_batt;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Fan belt — multi-rib', 'BLT-MR', 'belt', 'each', 9.50, 6, 'Autoworld', 'Harare main store') RETURNING id INTO p_belt;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Coolant concentrate', 'CLT-CONC', 'fluid', 'litre', 6.80, 20, 'Engen Lubricants', 'Harare main store') RETURNING id INTO p_cool;
    INSERT INTO app.parts (name, sku, category, unit, unit_cost, reorder_level, supplier, location)
      VALUES ('Service kit — tanker', 'KIT-TNK', 'service_kit', 'set', 130.00, 2, 'Croco Motors', 'Harare main store') RETURNING id INTO p_kit;

    -- Opening stock (movement_type 'in'); two items deliberately land low.
    INSERT INTO app.part_movements (part_id, movement_type, quantity, unit_cost, reference) VALUES
      (p_oilf, 'in', 12, 12.50, 'Opening stock'),
      (p_airf, 'in', 3,  18.00, 'Opening stock'),     -- below reorder (4)
      (p_oil,  'in', 120, 4.20, 'Opening stock'),
      (p_brake,'in', 2,  45.00, 'Opening stock'),     -- below reorder (3)
      (p_batt, 'in', 5,  95.00, 'Opening stock'),
      (p_belt, 'in', 8,  9.50,  'Opening stock'),
      (p_cool, 'in', 60, 6.80,  'Opening stock'),
      (p_kit,  'in', 4,  130.00,'Opening stock');

    -- A few issues to a vehicle to populate the ledger.
    INSERT INTO app.part_movements (part_id, movement_type, quantity, vehicle_id, reference) VALUES
      (p_oilf, 'out', 2, v_agh, 'Job card 1042'),
      (p_oil,  'out', 8, v_agh, 'Job card 1042'),
      (p_belt, 'out', 1, v_afq7, 'Job card 1051');

    -- ---- Tyres -------------------------------------------------------------
    -- Full set fitted to AGH 2028 (truck) — RR2 is low tread.
    FOREACH pos IN ARRAY ARRAY['FL','FR','RL1','RR1','RL2','RR2'] LOOP
      INSERT INTO app.tyres (serial_number, brand, pattern, size, vehicle_id, position, status,
                             fitted_at, fitted_odometer_km, tread_depth_mm, cost)
      VALUES ('MIC-' || pos || '-2231', 'Michelin', 'X Multi Z', '11R22.5', v_agh, pos, 'in_service',
              current_date - 120, 405000,
              CASE WHEN pos = 'RR2' THEN 2.5 ELSE 9.0 + random() * 4 END, 180.00)
      RETURNING id INTO tyre;
      INSERT INTO app.tyre_events (tyre_id, vehicle_id, event_type, position, odometer_km, occurred_at)
      VALUES (tyre, v_agh, 'fitted', pos, 405000, current_date - 120);
    END LOOP;

    -- Spares in store + one scrapped.
    INSERT INTO app.tyres (serial_number, brand, size, status, tread_depth_mm, cost) VALUES
      ('BRG-ST-5510', 'Bridgestone', '11R22.5', 'in_store', 14.0, 175.00),
      ('BRG-ST-5511', 'Bridgestone', '11R22.5', 'in_store', 14.0, 175.00),
      ('GDY-SP-3380', 'Goodyear',    '11R22.5', 'spare',     8.5, 160.00),
      ('MIC-OLD-1190','Michelin',    '11R22.5', 'scrapped',  1.2, 180.00);

    RAISE NOTICE 'maintenance demo seeded';
END $$;

-- Generate the alerts these conditions imply (idempotent; safe to re-run).
SELECT app.fn_scan_service_due(2000, 30);
SELECT app.fn_scan_fuel_anomalies(90);
SELECT app.fn_scan_part_stock();
