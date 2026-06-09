-- 0038_app_settings.sql
-- ---------------------------------------------------------------------------
-- Runtime configuration editable by an admin (no redeploy). Key/value JSON.
-- Everyone signed in can read (so server code can apply a threshold); only
-- admins write.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS app.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES app.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_read ON app.app_settings;
CREATE POLICY app_settings_read ON app.app_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_write ON app.app_settings;
CREATE POLICY app_settings_write ON app.app_settings
  FOR ALL TO authenticated
  USING (app.role_is('admin'))
  WITH CHECK (app.role_is('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.app_settings TO authenticated;
GRANT ALL ON app.app_settings TO service_role;

-- Seed defaults (mirrors the previous hard-coded constants).
INSERT INTO app.app_settings (key, value) VALUES
  ('odometer_jump_threshold_km', '1500'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
