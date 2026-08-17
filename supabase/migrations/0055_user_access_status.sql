-- 0055_user_access_status.sql
-- ---------------------------------------------------------------------------
-- Distinguish a temporary SUSPENSION from a permanent DEACTIVATION, and record
-- WHY and by WHOM. Login blocking still rides on the Supabase auth ban + the
-- is_active flag (RLS); these columns add the human-facing status + reason that
-- the admin Accounts screen shows. No backfill: existing inactive accounts keep
-- access_status='active' and the UI falls back to "Deactivated" for them.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'suspended', 'deactivated')),
  ADD COLUMN IF NOT EXISTS access_reason text,
  ADD COLUMN IF NOT EXISTS access_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_changed_by uuid REFERENCES app.profiles(id);

COMMIT;
