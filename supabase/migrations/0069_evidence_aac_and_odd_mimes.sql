-- 0069_evidence_aac_and_odd_mimes.sql
-- ---------------------------------------------------------------------------
-- A real rejection from the field: a WhatsApp .aac recording (11.1 MB) failed
-- with "mime type audio/vnd.dlna.adts is not supported" — Windows reports that
-- registry type for ADTS/AAC audio instead of audio/aac.
--
-- The primary fix is in the app (lib/evidence/limits.ts now derives the content
-- type from the FILE EXTENSION, so a .aac is stored as audio/aac). This migration
-- is the safety net: whitelist the OS-specific aliases too, so an odd type can
-- never again block a legitimate recording.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types = allowed_mime_types || ARRAY[
     -- AAC / ADTS as named by Windows and some Android builds
     'audio/vnd.dlna.adts','audio/aacp','audio/x-hx-aac-adts','audio/x-aac','audio/adts',
     -- other OS aliases seen in the wild
     'audio/x-mpeg','audio/mpeg3','audio/x-mpeg-3','audio/vnd.wav','audio/wave',
     'audio/x-ms-wma','audio/basic','audio/x-opus+ogg','audio/ogg; codecs=opus',
     'video/x-msvideo','video/avi','video/x-quicktime'
   ]
 WHERE id = 'evidence'
   AND NOT (allowed_mime_types @> ARRAY['audio/vnd.dlna.adts']);

COMMIT;
