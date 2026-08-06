-- 0049_pool_vehicles.sql
-- ---------------------------------------------------------------------------
-- Pool / shared vehicles: cars that belong to a department (the vehicle's
-- subsidiary) rather than one regular driver, and can be driven by anyone.
-- The driver is chosen per trip instead of coming from a fixed assignment.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.vehicles
    ADD COLUMN is_pool boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.vehicles.is_pool IS
    'True for shared/department pool vehicles with no fixed driver — the driver is picked per trip.';

CREATE INDEX vehicles_pool_idx ON app.vehicles (is_pool) WHERE is_pool;

COMMIT;
