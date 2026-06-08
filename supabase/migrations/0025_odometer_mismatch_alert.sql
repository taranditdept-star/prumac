-- =============================================================================
-- 0025_odometer_mismatch_alert.sql
-- Anti-fraud: flag odometer tampering at trip start.
--
-- The driver must photograph the odometer when starting a trip (stored in the
-- already-existing app.trips.start_odometer_photo_path column). The startTrip
-- server action compares the entered reading against the vehicle's last known
-- odometer and raises an `odometer_mismatch` alert when the reading was rolled
-- back or jumped implausibly. This migration only adds the new alert kind.
--
-- ALTER TYPE ... ADD VALUE must run OUTSIDE a transaction (autocommit) so the
-- label is committed before anything references it — mirrors 0020.
-- =============================================================================

ALTER TYPE app.alert_kind ADD VALUE IF NOT EXISTS 'odometer_mismatch';
