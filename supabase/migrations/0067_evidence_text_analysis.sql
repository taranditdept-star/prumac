-- 0067_evidence_text_analysis.sql
-- ---------------------------------------------------------------------------
-- Hold the TEXT pulled out of evidence, so statements can be compared.
--
--   accident_media.extracted_text  — the words lifted out of a .docx/.txt (the
--                                    committee's interview report), or OCR'd from
--                                    a photo. Populated on demand, never guessed.
--   accident_media.extracted_at    — when, so stale extractions are obvious.
--
-- Chitsano's own assessment is stored as an ordinary row in app.accident_verdicts
-- with author_name = 'Chitsano AI', so it appears alongside the CEO/HR/committee
-- verdicts instead of in a special place.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.accident_media
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_at   timestamptz;

-- Only ONE Chitsano assessment per accident — re-running replaces it rather than
-- stacking duplicates next to the human verdicts.
CREATE UNIQUE INDEX IF NOT EXISTS accident_verdicts_one_chitsano
  ON app.accident_verdicts (accident_id)
  WHERE author_name = 'Chitsano AI';

COMMIT;
