-- =============================================================================
-- 0005_finance.sql
-- Billing rates (versioned), reconciliations, maintenance records, invoices.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- billing_rates — what PRUMAC charges
-- A rate row is keyed by (vehicle_id, subsidiary_id, effective_from).
-- subsidiary_id may be NULL meaning "default rate for this vehicle for any
-- subsidiary without a specific override".
-- Rates are versioned: we never UPDATE an existing row; we INSERT a new one
-- with a later effective_from. The "current" rate for a vehicle+subsidiary
-- at time T is the most recent row where effective_from <= T.
-- ---------------------------------------------------------------------------
CREATE TABLE app.billing_rates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    subsidiary_id       uuid REFERENCES app.subsidiaries(id) ON DELETE RESTRICT,
                                                            -- NULL = default rate for the vehicle
    mode                app.billing_mode NOT NULL,
    rate_amount         numeric(12,4) NOT NULL CHECK (rate_amount >= 0),
    currency            text NOT NULL DEFAULT 'USD',

    -- Mode-specific configuration (kept as columns rather than jsonb so
    -- check constraints can validate them):
    --   per_km:           only rate_amount used
    --   per_litre_100km:  only rate_amount used; trip.fuel_litres required
    --   per_load:         radius_km drives invoice validation
    --   fixed_monthly:    rate_amount is the monthly fee
    radius_km           numeric(6,2) CHECK (radius_km IS NULL OR radius_km > 0),

    effective_from      date NOT NULL,
    effective_until     date,                               -- NULL = open-ended
    notes               text,
    created_by          uuid REFERENCES app.profiles(id),
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT rates_period_valid
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT rates_radius_for_per_load
        CHECK ((mode = 'per_load') = (radius_km IS NOT NULL))
);

-- Prevent overlapping rate rows for the same (vehicle, subsidiary)
ALTER TABLE app.billing_rates
    ADD CONSTRAINT rates_no_overlap
    EXCLUDE USING gist (
        vehicle_id WITH =,
        COALESCE(subsidiary_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    );

CREATE INDEX rates_vehicle_idx    ON app.billing_rates (vehicle_id);
CREATE INDEX rates_subsidiary_idx ON app.billing_rates (subsidiary_id);
CREATE INDEX rates_effective_idx  ON app.billing_rates (effective_from DESC);

COMMENT ON TABLE app.billing_rates IS
    'What PRUMAC charges, by vehicle and optionally by subsidiary. '
    'Versioned by effective_from; never updated in place. Exclusion '
    'constraint ensures no overlapping periods for the same key.';

SELECT app.fn_attach_audit('app.billing_rates');

-- Helper: resolve the rate in effect for a (vehicle, subsidiary, date)
CREATE OR REPLACE FUNCTION app.fn_effective_rate(
    p_vehicle_id    uuid,
    p_subsidiary_id uuid,
    p_at            date DEFAULT CURRENT_DATE
)
RETURNS app.billing_rates
LANGUAGE sql STABLE
AS $$
    -- Prefer a subsidiary-specific rate; fall back to the default (NULL subsidiary).
    SELECT * FROM app.billing_rates
    WHERE vehicle_id = p_vehicle_id
      AND (subsidiary_id = p_subsidiary_id OR subsidiary_id IS NULL)
      AND effective_from <= p_at
      AND (effective_until IS NULL OR effective_until > p_at)
    ORDER BY subsidiary_id IS NULL,    -- specific overrides default
             effective_from DESC
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- reconciliations — GPS vs odometer per trip
-- One row per (trip, computed_at). The latest row is canonical; older rows
-- are kept for audit (we may recompute when late GPS pings arrive).
-- ---------------------------------------------------------------------------
CREATE TABLE app.reconciliations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             uuid NOT NULL REFERENCES app.trips(id) ON DELETE CASCADE,
    odometer_km         numeric(10,2) NOT NULL,
    gps_km              numeric(10,2) NOT NULL,
    difference_km       numeric(10,2) GENERATED ALWAYS AS (odometer_km - gps_km) STORED,
    variance_pct        numeric(7,4) NOT NULL,         -- absolute, decimal (0.05 = 5%)
    status              app.reconciliation_status NOT NULL,
    reason_codes        text[] NOT NULL DEFAULT '{}',  -- e.g. {'gps_offline_suspected'}
    ping_count          integer NOT NULL CHECK (ping_count >= 0),
    avg_accuracy_m      numeric(8,2),
    is_current          boolean NOT NULL DEFAULT true,
    computed_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reconciliation_variance_consistent
        CHECK (variance_pct >= 0)
);

-- Exactly one current reconciliation row per trip
CREATE UNIQUE INDEX reconciliations_one_current_per_trip
    ON app.reconciliations (trip_id) WHERE is_current;

CREATE INDEX reconciliations_status_idx ON app.reconciliations (status, computed_at DESC)
    WHERE is_current;
CREATE INDEX reconciliations_trip_idx   ON app.reconciliations (trip_id, computed_at DESC);

COMMENT ON TABLE app.reconciliations IS
    'Computed per trip after status=completed. Older rows kept; is_current '
    'flags the canonical one. Recomputation produces a new row and clears '
    'is_current on the prior.';

SELECT app.fn_attach_audit('app.reconciliations');

-- Trigger: when a new reconciliation is inserted as current, clear is_current
-- on all previous reconciliations for the same trip
CREATE OR REPLACE FUNCTION app.fn_reconciliations_supersede()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_current THEN
        UPDATE app.reconciliations
           SET is_current = false
         WHERE trip_id = NEW.trip_id
           AND id <> NEW.id
           AND is_current;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER reconciliations_supersede
    AFTER INSERT ON app.reconciliations
    FOR EACH ROW EXECUTE FUNCTION app.fn_reconciliations_supersede();

-- Reviews of flagged/critical reconciliations
CREATE TABLE app.reconciliation_reviews (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id   uuid NOT NULL REFERENCES app.reconciliations(id) ON DELETE CASCADE,
    reviewer_id         uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    decision            text NOT NULL CHECK (decision IN ('accept_anyway','re_request','adjust_billing','escalate')),
    notes               text NOT NULL,
    billing_adjustment_km numeric(10,2),                   -- manual override of distance billed
    reviewed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reconciliation_reviews_reconciliation_idx
    ON app.reconciliation_reviews (reconciliation_id);

SELECT app.fn_attach_audit('app.reconciliation_reviews');

-- ---------------------------------------------------------------------------
-- service_records — maintenance log
-- Mirrors the "VEHICLES MANTAINANCE" columns from the spreadsheets.
-- ---------------------------------------------------------------------------
CREATE TABLE app.service_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    performed_at        date NOT NULL,
    odometer_km         integer CHECK (odometer_km >= 0),
    is_routine_service  boolean NOT NULL DEFAULT false,    -- the "service kit" type
    workshop            text,
    invoice_reference   text,
    total_amount        numeric(12,2) NOT NULL CHECK (total_amount >= 0),
    currency            text NOT NULL DEFAULT 'USD',
    -- Whether to reimburse from the running subsidiary at month-end
    reimburse_from_subsidiary_id uuid REFERENCES app.subsidiaries(id) ON DELETE SET NULL,
    summary             text,
    created_by          uuid REFERENCES app.profiles(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER service_records_touch BEFORE UPDATE ON app.service_records
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX service_records_vehicle_idx ON app.service_records (vehicle_id, performed_at DESC);
CREATE INDEX service_records_period_idx  ON app.service_records (performed_at);

SELECT app.fn_attach_audit('app.service_records');

-- Itemised parts/labour
CREATE TABLE app.service_record_items (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_record_id  uuid NOT NULL REFERENCES app.service_records(id) ON DELETE CASCADE,
    description        text NOT NULL,
    quantity           numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_amount        numeric(12,2) NOT NULL CHECK (unit_amount >= 0),
    line_amount        numeric(12,2) GENERATED ALWAYS AS (quantity * unit_amount) STORED
);

CREATE INDEX service_record_items_parent_idx ON app.service_record_items (service_record_id);

-- When the parent total is set we don't necessarily have items; the sheets
-- often have a total without each item enumerated, so we permit both modes.

-- ---------------------------------------------------------------------------
-- invoices — monthly per subsidiary
-- ---------------------------------------------------------------------------
CREATE TABLE app.invoices (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number     text NOT NULL UNIQUE,             -- 'PRUMAC-2026-02-CT_MAGAZINE-001'
    subsidiary_id      uuid NOT NULL REFERENCES app.subsidiaries(id) ON DELETE RESTRICT,
    period_start       date NOT NULL,
    period_end         date NOT NULL,
    issued_at          date,
    due_at             date,
    status             app.invoice_status NOT NULL DEFAULT 'draft',
    currency           text NOT NULL DEFAULT 'USD',

    -- Totals (computed by the engine from invoice_line_items; cached here)
    subtotal           numeric(14,2) NOT NULL DEFAULT 0,
    maintenance_credit numeric(14,2) NOT NULL DEFAULT 0,
    previous_balance   numeric(14,2) NOT NULL DEFAULT 0,
    total_due          numeric(14,2) NOT NULL DEFAULT 0,
    amount_paid        numeric(14,2) NOT NULL DEFAULT 0,
    balance_outstanding numeric(14,2) GENERATED ALWAYS AS (total_due - amount_paid) STORED,

    pdf_path           text,
    notes              text,

    generated_by       uuid REFERENCES app.profiles(id),
    issued_by          uuid REFERENCES app.profiles(id),
    voided_by          uuid REFERENCES app.profiles(id),
    voided_at          timestamptz,
    voided_reason      text,

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT invoices_period_valid CHECK (period_end > period_start),
    CONSTRAINT invoices_paid_le_total CHECK (amount_paid <= total_due + 0.01)
);

CREATE TRIGGER invoices_touch BEFORE UPDATE ON app.invoices
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

-- Only one invoice per subsidiary per period
CREATE UNIQUE INDEX invoices_one_per_subsidiary_period
    ON app.invoices (subsidiary_id, period_start, period_end)
    WHERE status <> 'void';

CREATE INDEX invoices_subsidiary_idx ON app.invoices (subsidiary_id, period_start DESC);
CREATE INDEX invoices_status_idx     ON app.invoices (status);
CREATE INDEX invoices_overdue_idx    ON app.invoices (due_at)
    WHERE status IN ('issued','partially_paid');

SELECT app.fn_attach_audit('app.invoices');

-- Line items: trip charges (debit), maintenance reimbursements (credit),
-- previous balance carry (debit), adjustments.
CREATE TABLE app.invoice_line_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          uuid NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
    line_type           text NOT NULL CHECK (line_type IN ('trip','maintenance_credit','previous_balance','adjustment','fixed_fee')),
    trip_id             uuid REFERENCES app.trips(id) ON DELETE RESTRICT,
    service_record_id   uuid REFERENCES app.service_records(id) ON DELETE RESTRICT,
    description         text NOT NULL,
    quantity            numeric(12,4) NOT NULL DEFAULT 1,
    unit_amount         numeric(12,4) NOT NULL,           -- can be negative for credits
    line_amount         numeric(14,2) GENERATED ALWAYS AS (quantity * unit_amount) STORED,
    sort_order          integer NOT NULL DEFAULT 0,

    CONSTRAINT line_trip_ref     CHECK ((line_type = 'trip') = (trip_id IS NOT NULL)),
    CONSTRAINT line_maint_ref    CHECK ((line_type = 'maintenance_credit') = (service_record_id IS NOT NULL))
);

CREATE INDEX invoice_line_items_invoice_idx ON app.invoice_line_items (invoice_id, sort_order);

SELECT app.fn_attach_audit('app.invoice_line_items');

-- Payments — partial payments tracked separately
CREATE TABLE app.invoice_payments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      uuid NOT NULL REFERENCES app.invoices(id) ON DELETE RESTRICT,
    amount          numeric(14,2) NOT NULL CHECK (amount > 0),
    currency        text NOT NULL DEFAULT 'USD',
    paid_at         date NOT NULL,
    method          text,                                 -- 'bank_transfer','cheque','cash','internal'
    reference       text,
    recorded_by     uuid NOT NULL REFERENCES app.profiles(id),
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_payments_invoice_idx ON app.invoice_payments (invoice_id);

SELECT app.fn_attach_audit('app.invoice_payments');

-- When a payment is inserted, recalc the invoice's amount_paid and status
CREATE OR REPLACE FUNCTION app.fn_invoice_payments_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice app.invoices%ROWTYPE;
    v_total_paid numeric(14,2);
BEGIN
    SELECT * INTO v_invoice FROM app.invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM app.invoice_payments WHERE invoice_id = v_invoice.id;

    UPDATE app.invoices
       SET amount_paid = v_total_paid,
           status = CASE
                      WHEN status = 'void' THEN 'void'
                      WHEN v_total_paid >= total_due THEN 'paid'
                      WHEN v_total_paid > 0          THEN 'partially_paid'
                      WHEN due_at IS NOT NULL AND due_at < CURRENT_DATE THEN 'overdue'
                      WHEN status = 'draft' THEN 'draft'
                      ELSE 'issued'
                    END
     WHERE id = v_invoice.id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_payments_recalc
    AFTER INSERT OR UPDATE OR DELETE ON app.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION app.fn_invoice_payments_recalc();

COMMIT;
