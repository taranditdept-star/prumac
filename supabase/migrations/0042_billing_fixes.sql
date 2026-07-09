-- 0042_billing_fixes.sql
-- ---------------------------------------------------------------------------
-- Billing-engine correctness fixes (audit ranks 1, 3, 8):
--  (1) Carry-forward compounded: it SUMmed (total_due-amount_paid) over ALL
--      prior outstanding invoices, but each prior total_due already embeds its
--      own carried balance -> geometric growth; and period_end < start dropped
--      the adjacent month. Fix: carry only the SINGLE most-recent prior
--      invoice's balance_outstanding, boundary period_end <= start.
--  (8) Trips could be billed on more than one invoice (overlapping/custom
--      periods). Fix: exclude trips already on a non-void invoice line.
--  (3) Net-credit months (maintenance credit > charges) made total_due
--      negative and violated invoices_paid_le_total -> whole generate rolled
--      back. Fix: relax the CHECK to bound amount_paid by GREATEST(total_due,0)
--      so a credit invoice (negative total, 0 paid, negative balance carried
--      forward) is allowed.
-- ---------------------------------------------------------------------------
BEGIN;

-- (3) allow net-credit invoices while still bounding amount_paid for positives.
ALTER TABLE app.invoices DROP CONSTRAINT IF EXISTS invoices_paid_le_total;
ALTER TABLE app.invoices
  ADD CONSTRAINT invoices_paid_le_total CHECK (amount_paid <= GREATEST(total_due, 0) + 0.01);

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
BEGIN
  -- Re-runnable: wipe any existing DRAFT for this subsidiary/period.
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

  -- (1) Running-ledger carry: bring forward ONLY the single most-recent prior
  -- outstanding invoice's balance (which already rolls up everything before it).
  SELECT balance_outstanding INTO v_prev_bal
  FROM app.invoices
  WHERE subsidiary_id = p_subsidiary_id
    AND status IN ('issued', 'partially_paid', 'overdue')
    AND period_end <= p_period_start
  ORDER BY period_end DESC, issued_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND OR v_prev_bal IS NULL THEN
    v_prev_bal := 0;
  END IF;

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

  -- 1. Trip charges — completed, non-critical, and NOT already billed elsewhere.
  FOR v_trip IN
    SELECT t.id, t.vehicle_id, t.started_at
    FROM app.trips t
    LEFT JOIN app.reconciliations r ON r.trip_id = t.id AND r.is_current
    WHERE t.subsidiary_id = p_subsidiary_id
      AND t.status = 'completed'
      AND t.completed_at::date >= p_period_start
      AND t.completed_at::date <  p_period_end
      AND COALESCE(r.status, 'accepted') <> 'critical'
      AND NOT EXISTS (
        SELECT 1 FROM app.invoice_line_items li
        JOIN app.invoices i ON i.id = li.invoice_id
        WHERE li.trip_id = t.id
          AND i.subsidiary_id = p_subsidiary_id
          AND i.status <> 'void'
          AND i.id <> v_invoice_id
      )
    ORDER BY t.completed_at
  LOOP
    FOR v_charge IN SELECT * FROM app.fn_trip_charge(v_trip.id)
    LOOP
      IF v_charge.quantity > 0 AND v_charge.unit_amount > 0 THEN
        INSERT INTO app.invoice_line_items (
          invoice_id, line_type, trip_id, description, quantity, unit_amount, sort_order
        ) VALUES (
          v_invoice_id, 'trip', v_trip.id, v_charge.description, v_charge.quantity, v_charge.unit_amount, v_order
        );
        v_order := v_order + 1;
        v_subtotal := v_subtotal + ROUND(v_charge.quantity * v_charge.unit_amount, 2);
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Fixed monthly fees.
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
      invoice_id, line_type, description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'fixed_fee',
      format('%s · %s %s monthly fee', v_fm_rate.plate_number, v_fm_rate.make, v_fm_rate.model),
      1, v_fm_rate.rate_amount, v_order
    );
    v_order := v_order + 1;
    v_subtotal := v_subtotal + v_fm_rate.rate_amount;
  END LOOP;

  -- 3. Reimbursable maintenance — credit (negative).
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
      invoice_id, line_type, service_record_id, description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'maintenance_credit', v_sr.id,
      format('%s · Maintenance · %s', v_sr.plate_number, COALESCE(v_sr.summary, 'Service')),
      1, -v_sr.total_amount, v_order
    );
    v_order := v_order + 1;
    v_maint := v_maint + v_sr.total_amount;
  END LOOP;

  -- 4. Previous-balance line item (if any).
  IF v_prev_bal > 0 THEN
    INSERT INTO app.invoice_line_items (
      invoice_id, line_type, description, quantity, unit_amount, sort_order
    ) VALUES (
      v_invoice_id, 'previous_balance', 'Brought forward from prior periods', 1, v_prev_bal, v_order
    );
  END IF;

  UPDATE app.invoices
  SET subtotal = v_subtotal,
      maintenance_credit = v_maint,
      total_due = v_subtotal - v_maint + v_prev_bal
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_generate_invoice(uuid, date, date, uuid) TO authenticated, service_role;

COMMIT;
