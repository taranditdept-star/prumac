-- 0058_trip_suspended_constraint.sql
-- ---------------------------------------------------------------------------
-- trips_ended_consistent required ended_at for any status NOT in
-- {planned, in_progress, paused, cancelled}. The new 'suspended' status is an
-- OPEN trip (not ended), so it must be allowed to have a NULL ended_at too —
-- otherwise suspendTrip() fails the check. Add 'suspended' to that list.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.trips DROP CONSTRAINT IF EXISTS trips_ended_consistent;
ALTER TABLE app.trips ADD CONSTRAINT trips_ended_consistent
  CHECK (
    status IN ('planned', 'in_progress', 'paused', 'suspended', 'cancelled')
    OR ended_at IS NOT NULL
  );

COMMIT;
