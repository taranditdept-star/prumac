-- 0034_import_staging.sql
-- ---------------------------------------------------------------------------
-- Excel → Supabase import pipeline, Layer 1 (raw preservation) + parsed staging.
--
-- A dedicated `import` schema keeps the raw workbook capture separate from the
-- live `app` schema. These tables are written only by the server-side import
-- scripts (direct pg connection via DATABASE_URL — the service-role key is
-- never shipped to the browser). RLS is enabled with admin-only policies in
-- case the schema is ever exposed via PostgREST.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE SCHEMA IF NOT EXISTS import;
GRANT USAGE ON SCHEMA import TO service_role;

-- ── Raw preservation ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import.batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_filename text NOT NULL,
    file_sha256     text NOT NULL UNIQUE,
    sheet_count     integer,
    status          text NOT NULL DEFAULT 'raw',   -- raw | parsed | normalized
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import.sheets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        uuid NOT NULL REFERENCES import.batches(id) ON DELETE CASCADE,
    sheet_index     integer NOT NULL,
    sheet_name      text NOT NULL,
    ref             text,
    row_count       integer,
    detected_layout text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_id, sheet_index)
);

CREATE TABLE IF NOT EXISTS import.raw_rows (
    id        bigserial PRIMARY KEY,
    sheet_id  uuid NOT NULL REFERENCES import.sheets(id) ON DELETE CASCADE,
    row_index integer NOT NULL,
    cells     jsonb NOT NULL                       -- ordered array of cell values
);
CREATE INDEX IF NOT EXISTS raw_rows_sheet_idx ON import.raw_rows (sheet_id, row_index);

CREATE TABLE IF NOT EXISTS import.errors (
    id         bigserial PRIMARY KEY,
    batch_id   uuid REFERENCES import.batches(id) ON DELETE CASCADE,
    sheet_name text,
    row_index  integer,
    severity   text NOT NULL DEFAULT 'warning',    -- info | warning | error
    code       text,
    message    text NOT NULL,
    context    jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS errors_batch_idx ON import.errors (batch_id, severity);

-- ── Parsed staging (normalised but not yet promoted to app.*) ──────────────
CREATE TABLE IF NOT EXISTS import.stg_vehicles (
    id              bigserial PRIMARY KEY,
    batch_id        uuid NOT NULL REFERENCES import.batches(id) ON DELETE CASCADE,
    plate           text,
    make            text,
    driver_name     text,
    driver_phone    text,
    colour          text,
    chassis_number  text,
    engine_number   text,
    mileage_km      numeric,
    last_service_km numeric,
    licence_expiry  date,
    insurance_type  text,
    condition_notes text,
    suspension_note text
);

CREATE TABLE IF NOT EXISTS import.stg_trip_logs (
    id            bigserial PRIMARY KEY,
    batch_id      uuid NOT NULL REFERENCES import.batches(id) ON DELETE CASCADE,
    sheet_name    text NOT NULL,
    row_index     integer NOT NULL,
    log_date      date,
    plate         text,
    driver_token  text,
    vehicle_make  text,
    start_km      numeric,
    end_km        numeric,
    route         text,
    fuel_raw      text,
    distance_km   numeric,
    charge_per_km numeric,
    total_amount  numeric
);
CREATE INDEX IF NOT EXISTS stg_trip_logs_batch_idx ON import.stg_trip_logs (batch_id, plate, log_date);

CREATE TABLE IF NOT EXISTS import.stg_vehicle_charges (
    id             bigserial PRIMARY KEY,
    batch_id       uuid NOT NULL REFERENCES import.batches(id) ON DELETE CASCADE,
    sheet_name     text NOT NULL,
    plate          text,
    vehicle_make   text,
    department     text,
    km_travelled   numeric,
    charge_per_km  numeric,
    total_amount   numeric,
    maintenance    numeric,
    amount_payable numeric
);

-- Tracks which app.* rows each batch created/enriched, for idempotency + audit.
CREATE TABLE IF NOT EXISTS import.entity_map (
    id           bigserial PRIMARY KEY,
    batch_id     uuid NOT NULL REFERENCES import.batches(id) ON DELETE CASCADE,
    kind         text NOT NULL,                    -- vehicle | trip | ...
    natural_key  text NOT NULL,
    app_id       uuid,
    action       text NOT NULL,                    -- inserted | enriched | skipped
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, natural_key)
);

-- RLS (admin-only; scripts use the owner connection which bypasses RLS) -----
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'batches','sheets','raw_rows','errors',
    'stg_vehicles','stg_trip_logs','stg_vehicle_charges','entity_map'])
  LOOP
    EXECUTE format('ALTER TABLE import.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON import.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_admin ON import.%I FOR ALL TO authenticated
                      USING (app.role_is('admin')) WITH CHECK (app.role_is('admin'))$p$, t, t);
    EXECUTE format('GRANT ALL ON import.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
