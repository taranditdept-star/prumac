-- 0068_evidence_audio_formats.sql
-- ---------------------------------------------------------------------------
-- Accept the audio formats people actually record on.
--
-- The committee's recordings come from WhatsApp, and a WhatsApp voice note on
-- Android is OPUS (.opus) — which the bucket rejected outright. Many Android
-- voice recorders produce AMR. Between that and a MIME-only `accept` attribute
-- (Windows often reports no MIME for .opus/.amr), audio looked impossible to
-- attach at all. Widen the whitelist to match lib/evidence/limits.ts.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     -- video
     'video/mp4','video/quicktime','video/webm','video/x-matroska','video/3gpp','video/mpeg',
     -- audio (WhatsApp voice notes, phone recorders, in-app recordings)
     'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/x-aac',
     'audio/ogg','audio/opus','audio/wav','audio/x-wav','audio/vnd.wave',
     'audio/webm','audio/x-m4a','audio/m4a','audio/3gpp','audio/3gpp2',
     'audio/amr','audio/AMR','audio/flac','audio/x-flac',
     -- documents
     'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain',
     -- images
     'image/jpeg','image/png','image/webp','image/heic','image/heif',
     -- last resort: some browsers send nothing for .opus/.amr and the object
     -- would be refused despite being a legitimate recording.
     'application/octet-stream'
   ]
 WHERE id = 'evidence';

COMMIT;
