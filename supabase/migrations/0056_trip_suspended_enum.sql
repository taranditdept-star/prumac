-- 0056_trip_suspended_enum.sql
-- ---------------------------------------------------------------------------
-- Add a 'suspended' trip status — a manager lock that a driver cannot lift
-- themselves (distinct from the driver's own pause/resume).
-- ALTER TYPE ... ADD VALUE cannot be USED in the same transaction it is added
-- in, so this migration ONLY adds the value. The state-machine + index changes
-- that reference it live in 0057 (applied after this commits). No BEGIN/COMMIT
-- here — the single statement auto-commits.
-- ---------------------------------------------------------------------------
ALTER TYPE app.trip_status ADD VALUE IF NOT EXISTS 'suspended';
