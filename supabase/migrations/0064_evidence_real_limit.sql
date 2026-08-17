-- 0064_evidence_real_limit.sql
-- ---------------------------------------------------------------------------
-- Align the evidence bucket with the PROJECT-wide storage ceiling, measured
-- empirically against the live project: a 40 MB video uploads fine, a 60 MB one
-- is rejected with "The object exceeded the maximum allowed size". The project
-- cap is 50 MB (Supabase Free-plan default), and a bucket limit above the
-- project limit has no effect — it only makes the app promise something Storage
-- will refuse. Set the bucket to the truth so the UI can pre-check accurately.
--
-- To allow bigger files: raise the project storage limit in the Supabase
-- dashboard (Settings → Storage). That requires a paid plan; then bump this
-- value and MAX_UPLOAD_BYTES in lib/evidence/limits.ts to match.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'evidence';

COMMIT;
