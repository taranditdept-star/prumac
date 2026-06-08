-- 0035_perf_indexes.sql
-- ---------------------------------------------------------------------------
-- Performance indexes for the now-large datasets (2k+ trips, 250 services,
-- 95 invoices). Targets the Trips list ordering/filters, invoice generation,
-- monthly-revenue reporting, driver history/scorecards and the maintenance
-- page. All IF NOT EXISTS + small tables, so creation is fast.
-- ---------------------------------------------------------------------------
BEGIN;

-- Trips: list ordering + period filters + per-vehicle/-driver/-subsidiary views
CREATE INDEX IF NOT EXISTS idx_trips_started_at        ON app.trips (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_completed_at      ON app.trips (completed_at)
    WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_trips_subsidiary_status ON app.trips (subsidiary_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle           ON app.trips (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver            ON app.trips (driver_id);

-- Invoice revenue rollup (fn_monthly_revenue / KPIs join line items by trip)
CREATE INDEX IF NOT EXISTS idx_ili_trip                ON app.invoice_line_items (trip_id);
CREATE INDEX IF NOT EXISTS idx_ili_invoice             ON app.invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sub_period     ON app.invoices (subsidiary_id, period_start);

-- Maintenance page (order by performed_at, filter by vehicle)
CREATE INDEX IF NOT EXISTS idx_service_performed_at    ON app.service_records (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_vehicle         ON app.service_records (vehicle_id);

-- Billing rate resolution by vehicle + effective window
CREATE INDEX IF NOT EXISTS idx_rates_vehicle_from      ON app.billing_rates (vehicle_id, effective_from DESC);

-- Fuel page
CREATE INDEX IF NOT EXISTS idx_fuel_vehicle_filled     ON app.fuel_logs (vehicle_id, filled_at DESC);

COMMIT;
