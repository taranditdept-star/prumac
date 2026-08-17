-- 0063_accident_evidence.sql
-- ---------------------------------------------------------------------------
-- Accident evidence + password-protected sharing.
--
-- WHY a new bucket: 'photos' allows ONLY image/jpeg|png|webp|heic (50 MB) and
-- 'documents' only application/pdf + images (10 MB) — a video or a voice
-- recording is rejected outright (HTTP 415). The new 'evidence' bucket accepts
-- video, audio, documents and images.
--
--   1. storage bucket 'evidence' (private) + manager/admin object policies
--   2. app.accident_media      — any file attached to an accident, by an admin
--   3. app.accident_shares     — a password-protected link to one report
--   4. app.accident_verdicts   — the CEO/HR/committee's verdict on that report
--
-- Anonymous viewers NEVER touch these tables or Storage directly: the public
-- report page reads them with the service client after verifying the link
-- password, and streams media through short-lived service-minted signed URLs.
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. evidence bucket -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence', 'evidence', false, 209715200,  -- 200 MB per file (see note below)
  ARRAY[
    -- video
    'video/mp4','video/quicktime','video/webm','video/x-matroska','video/3gpp','video/mpeg',
    -- audio (voice recordings of a driver's statement)
    'audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/x-m4a','audio/3gpp','audio/flac',
    -- documents
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain',
    -- images
    'image/jpeg','image/png','image/webp','image/heic','image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = false;
-- NOTE: a bucket limit can never exceed the PROJECT-wide storage limit, which
-- lives in the Supabase dashboard (not in SQL). If that ceiling is 50 MB, a
-- larger file still fails with 413 regardless of the value above.

DROP POLICY IF EXISTS evidence_ops_read ON storage.objects;
CREATE POLICY evidence_ops_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND EXISTS (SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND p.is_active
                  AND p.role IN ('fleet_manager','admin'))
  );

DROP POLICY IF EXISTS evidence_ops_insert ON storage.objects;
CREATE POLICY evidence_ops_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND EXISTS (SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND p.is_active
                  AND p.role IN ('fleet_manager','admin'))
  );

DROP POLICY IF EXISTS evidence_ops_delete ON storage.objects;
CREATE POLICY evidence_ops_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND EXISTS (SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND p.is_active
                  AND p.role IN ('fleet_manager','admin'))
  );

-- 2. accident_media --------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.accident_media (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id       uuid NOT NULL REFERENCES app.accidents(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('photo','video','audio','document')),
  bucket            text NOT NULL DEFAULT 'evidence',
  file_path         text NOT NULL,
  original_filename text,
  mime_type         text,
  size_bytes        bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration_seconds  numeric(10,2),
  caption           text,
  uploaded_by       uuid REFERENCES app.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accident_media_accident_idx ON app.accident_media (accident_id, created_at);

ALTER TABLE app.accident_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accident_media_read_managers ON app.accident_media;
CREATE POLICY accident_media_read_managers ON app.accident_media
  FOR SELECT TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'));

DROP POLICY IF EXISTS accident_media_write_managers ON app.accident_media;
CREATE POLICY accident_media_write_managers ON app.accident_media
  FOR ALL TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'))
  WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- The reporting driver may see evidence attached to their own accident.
DROP POLICY IF EXISTS accident_media_read_own ON app.accident_media;
CREATE POLICY accident_media_read_own ON app.accident_media
  FOR SELECT TO authenticated
  USING (accident_id IN (SELECT id FROM app.accidents WHERE reported_by = app.current_driver_id()));

SELECT app.fn_attach_audit('app.accident_media');

-- 3. accident_shares ------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.accident_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id     uuid NOT NULL REFERENCES app.accidents(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,          -- the opaque part of the URL
  password_hash   text NOT NULL,                 -- scrypt, hex
  password_salt   text NOT NULL,
  recipient_label text,                          -- e.g. 'CEO', 'HR', 'Committee — R. Chikore'
  allow_verdict   boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES app.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,                   -- links never expire; they are revoked
  last_viewed_at  timestamptz,
  view_count      integer NOT NULL DEFAULT 0,
  failed_attempts integer NOT NULL DEFAULT 0,    -- brute-force throttle
  locked_until    timestamptz
);
CREATE INDEX IF NOT EXISTS accident_shares_accident_idx ON app.accident_shares (accident_id, created_at DESC);

ALTER TABLE app.accident_shares ENABLE ROW LEVEL SECURITY;

-- Admins manage links; managers may SEE that a report has been shared.
DROP POLICY IF EXISTS accident_shares_read_managers ON app.accident_shares;
CREATE POLICY accident_shares_read_managers ON app.accident_shares
  FOR SELECT TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'));

DROP POLICY IF EXISTS accident_shares_write_admin ON app.accident_shares;
CREATE POLICY accident_shares_write_admin ON app.accident_shares
  FOR ALL TO authenticated
  USING (app.role_is('admin'))
  WITH CHECK (app.role_is('admin'));

SELECT app.fn_attach_audit('app.accident_shares');

-- 4. accident_verdicts ----------------------------------------------------
CREATE TABLE IF NOT EXISTS app.accident_verdicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id  uuid NOT NULL REFERENCES app.accidents(id) ON DELETE CASCADE,
  share_id     uuid REFERENCES app.accident_shares(id) ON DELETE SET NULL,
  author_name  text NOT NULL,
  author_role  text,                             -- free text: 'CEO', 'HR', 'Committee'
  verdict      text NOT NULL CHECK (verdict IN (
                 'driver_at_fault','not_driver_fault','shared_fault','inconclusive',
                 'needs_more_info','disciplinary','insurance_claim','no_further_action')),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accident_verdicts_accident_idx ON app.accident_verdicts (accident_id, created_at DESC);

ALTER TABLE app.accident_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accident_verdicts_read_managers ON app.accident_verdicts;
CREATE POLICY accident_verdicts_read_managers ON app.accident_verdicts
  FOR SELECT TO authenticated
  USING (app.role_is('fleet_manager') OR app.role_is('admin'));
-- Verdicts arrive from anonymous (password-verified) viewers, so they are only
-- ever written by the service client — no INSERT policy for authenticated.

SELECT app.fn_attach_audit('app.accident_verdicts');

COMMIT;
