-- 0040_photos_bucket_limit.sql
-- ---------------------------------------------------------------------------
-- Raise the photos bucket per-file size limit so high-quality phone photos
-- upload without hitting a cap. Accident/fault photos now upload DIRECTLY from
-- the browser to Storage (the photos_insert_authenticated policy already allows
-- it), so they no longer pass through the Server Action / Vercel body limit.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB
WHERE id = 'photos';

COMMIT;
