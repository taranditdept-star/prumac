-- Migration 0018: Billing engine.
-- Generates a draft invoice per (subsidiary, period) by walking completed
-- trips and adding mode-aware charges, then crediting reimbursable maintenance.

-- ───────────────────────────────────────────────────────────────────────────
-- Invoice number generator: PRUMAC-YYYY-MM-<SUBCODE>-NNN
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_next_invoice_number(
  p_subsidiary_id uuid,
  p_period_start  date
)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_code text;
  v_n integer;
BEGIN
  SELECT code INTO v_code FROM app.subsidiaries WHERE id = p_subsidiary_id;
  IF v_code IS NULL THEN
    v_code := 'UNKNOWN';
  END IF;

  -- Count existing invoices for this subsidiary in this period (incl. void) to derive seq
  SELECT COUNT(*) + 1 INTO v_n
  FROM app.invoices
  WHERE subsidiary_id = p_subsidiary_id
    AND date_trunc('month', period_start) = date_trunc('month', p_period_start);

  RETURN format('PRUMAC-%s-%s-%s', to_char(p_period_start, 'YYYY-MM'), v_code, lpad(v_n::text, 3, '0'));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Compute charge for a trip per its effective rate. Returns line description
-- and amount. Critical trips are excluded by the caller.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_trip_charge(p_trip_id uuid)
RETURNS TABLE (
  description text,
  quantity numeric,
  unit_amount numeric,
  rate_mode app.billing_mode
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_trip      app.trips%ROWTYPE;
  v_rate      app.billing_rates%ROWTYPE;
  v_distance  numeric;
  v_vehicle_plate text;
BEGIN
  SELECT * INTO v_trip FROM app.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT plate_number INTO v_vehicle_plate FROM app.vehicles WHERE id = v_trip.vehicle_id;

  v_rate := app.fn_effective_rate(v_trip.vehicle_id, v_trip.subsidiary_id, v_trip.started_at::date);
  IF v_rate.id IS NULL THEN RETURN; END IF;

  v_distance := COALESCE(v_trip.end_odometer_km - v_trip.start_odometer_km, 0);

  rate_mode := v_rate.mode;

  IF v_rate.mode = 'per_km' THEN
    description := format('%s · %s', v_vehicle_plate, COALESCE(v_trip.route_description, 'Trip'));
    quantity := v_distance;
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'per_litre_100km' THEN
    -- fuel_litres × (distance / 100) × rate
    description := format('%s · %s (fuel-based)', v_vehicle_plate, COALESCE(v_trip.route_description, 'Trip'));
    quantity := COALESCE(v_trip.fuel_litres, 0) * (v_distance / 100.0);
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'per_load' THEN
    -- One load per trip — phase 9 simplification; multi-load trips arrive in phase 10
    description := format('%s · Load · %s', v_vehicle_plate, COALESCE(v_trip.route_description, 'Trip'));
    quantity := 1;
    unit_amount := v_rate.rate_amount;
    RETURN NEXT;

  ELSIF v_rate.mode = 'fixed_monthly' THEN
    -- Handled by a separate pass per subsidiary so we don't repeat per trip
    RETURN;
  END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Generate (or regenerate) a draft invoice for a subsidiary in a period.
-- Pre-existing draft for the same (subsidiary, period) is wiped first.
-- Returns the new invoice id.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_generate_invoice(
  p_subsidiary_id uuid,
  p_period_start  date,
  p_period_end    date,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_existing_id uuid;
  v_invoice_id  uuid;
  v_inv_number  text;
  v_subtotal    numeric(14,2) := 0;
  v_maint       numeric(14,2) := 0;
  v_prev_bal    numeric(14,2) := 0;
  v_order       integer := 0;
  v_trip        record;
  v_charge      record;
  v_sr          record;
  v_fm_rate     record;
  v_amount      numeric;
BEGIN
  -- Remove any existing DRAFT invoice for this subsidiary/period (re-runnable).
  -- Issued/paid invoices are left alone (must be voided first).
  SELECT id INTO v_existing_id
  FROM app.invoices
  WHERE subsidiary_id = p_subsidiary_id
    AND period_start = p_period_start
    AND period_end   = p_period_end
    AND status = 'draft';

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM app.invoice_line_items WHERE invoice_id = v_existing_id;
    DELETE FROM app.invoices WHERE id = v_existing_id;
  END IF;

  -- Previous outstanding balance — sum all invoices for this subsidiary
  -- with status in (issued, partially_paid, overdue)
  SELECT COALESCE(SUM(total_due - amount_paid), 0) INTO v_prev_bal
  FROM app.invoices
  WHERE subsidiary_id = p_subsidiary_id
    AND status IN ('issued','partially_paid','overdue')
    AND period_end < p_period_start;

  v_inv_number := app.fn_next_invoice_number(p_subsidiary_id, p_period_start);

  INSERT INTO app.invoices (
    invoice_number, subsidiary_id, period_start, period_end,
    status, currency, subtotal, maintenance_credit, previous_balance, total_due,
    generated_by
  ) VALUES (
    v_inv_number, p_subsidiary_id, p_period_start, p_period_end,
    'draft', 'USD', 0, 0, v_prev_bal, v_prev_bal,
    p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  -- 1. Trip charges — exclude critical reconciliations, exclude trips
  --    where reconciliation_status = 'critical' from automatic billing
  FOR v_trip IN
    SELECT t.id, t.vehicle_id, t.started_at
    FROM app.trips t
    LEFT JOIN app.reconciliations r ON r.trip_id = t.id AND r.is_current
    WHERE t.subsidiary_id = p_subsidiary_id
      AND t.status = 'completed'
      AND t.completed_at::date >= p_period_start
      AND t.completed_at::date <  p_period_end
      AND COALESCE(r.status, 'accepted') <> 'critical'
    ORDER BY t.completed_at
  LOOP
    FOR v_charge IN SELECT * FROM app.fn_trip_charge(v_trip.id)
    LOOP
      IF v_charge.quantity > 0 AND v_charge.unit_amount > 0 THEN
        INSERT INTO app.invoice_line_items (
          invoice_id, line_type, trip_id,
          description, quantity, unit_amount, sort_order
        ) VALUES (
          v_invoice_id, 'trip', v_trip.id,
          v_charge.description, v_charge.quantity, v_charge.unit_amount, v_order
        );
        v_order := v_order + 1;
        v_subtotal := v_subtotal + ROUND(v_charge.quantity * v_charge.unit_amount, 2);
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Fixed monthly fees — one per vehicle with a fixed_monthly rate
  FOR v_fm_rate IN
    SELECT DISTINCT ON (r.vehicle_id)
           r.vehicle_id, r.rate_amount, v.plate_number, v.make, v.model
    FROM app.billing_rates r
    JOIN app.vehicles v ON v.id = r.vehicle_id
    WHERE r.mode = 'fixed_monthly'
      AND COALESCE(r.subsidiary_id, v.default_subsidiary_id) = p_subsidiary_id
      AND r.effective_from <= p_period_end
      AND (r.effective_until IS NULL OR r.effective_until > p_period_start)
    ORDER BY r.vehicle_id, r.effective_from DESC
  LOOP
    INSERT INTO app.invoice_line_items (
      invoice_id, line_type,
      description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'fixed_fee',
      format('%s · %s %s monthly fee', v_fm_rate.plate_number, v_fm_rate.make, v_fm_rate.model),
      1, v_fm_rate.rate_amount, v_order
    );
    v_order := v_order + 1;
    v_subtotal := v_subtotal + v_fm_rate.rate_amount;
  END LOOP;

  -- 3. Maintenance reimbursable to this subsidiary in period — credit (negative)
  FOR v_sr IN
    SELECT sr.id, sr.performed_at, sr.total_amount, sr.summary, v.plate_number
    FROM app.service_records sr
    JOIN app.vehicles v ON v.id = sr.vehicle_id
    WHERE sr.reimburse_from_subsidiary_id = p_subsidiary_id
      AND sr.performed_at >= p_period_start
      AND sr.performed_at <  p_period_end
    ORDER BY sr.performed_at
  LOOP
    INSERT INTO app.invoice_line_items (
      invoice_id, line_type, service_record_id,
      description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'maintenance_credit', v_sr.id,
      format('%s · Maintenance · %s', v_sr.plate_number, COALESCE(v_sr.summary, 'Service')),
      1, -v_sr.total_amount, v_order
    );
    v_order := v_order + 1;
    v_maint := v_maint + v_sr.total_amount;
  END LOOP;

  -- 4. Previous balance line item (if any)
  IF v_prev_bal > 0 THEN
    INSERT INTO app.invoice_line_items (
      invoice_id, line_type,
      description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'previous_balance',
      'Brought forward from prior periods',
      1, v_prev_bal, v_order
    );
  END IF;

  -- Update invoice totals
  UPDATE app.invoices
  SET subtotal = v_subtotal,
      maintenance_credit = v_maint,
      total_due = v_subtotal - v_maint + v_prev_bal
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_next_invoice_number(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_trip_charge(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_generate_invoice(uuid, date, date, uuid) TO authenticated, service_role;

-- Allow service_role to bypass the line-item RLS check that only allows
-- inserts when invoice status='draft' (this function inserts as it's creating)
-- — already true since SECURITY DEFINER runs as schema owner.
