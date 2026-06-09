-- 0036_push_subscriptions.sql
-- ---------------------------------------------------------------------------
-- Web Push subscriptions for emergency alerting (accidents).
-- Each row = one browser/device a manager or admin has opted in from. The
-- server (service client) reads every manager/admin subscription and pushes a
-- notification when a driver logs an accident, so it rings even with the app
-- closed.
--
-- RLS: a user can only see / manage their OWN subscriptions. Sends happen via
-- the service-role client which bypasses RLS.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS app.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile
  ON app.push_subscriptions (profile_id);

ALTER TABLE app.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner can read / insert / update / delete only their own subscriptions.
-- (auth.uid() = profiles.id because profiles.id is the auth user id.)
DROP POLICY IF EXISTS push_subscriptions_owner ON app.push_subscriptions;
CREATE POLICY push_subscriptions_owner ON app.push_subscriptions
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.push_subscriptions TO authenticated;

COMMIT;
