-- 0066_evidence_attribution.sql
-- ---------------------------------------------------------------------------
-- Attribution for accident evidence: WHO provided each item.
--
-- uploaded_by (the app account that did the upload) was already stored but never
-- displayed. That answers "who clicked upload", which is not the same question as
-- "whose evidence is this" — a committee member may upload photos taken by the
-- police, or a statement recorded from the driver. So:
--
--   source        — where the item came from (committee / driver / police / …)
--   source_detail — free text, e.g. 'Mr Vuranda — committee interview'
--
-- Existing rows are back-filled to 'committee', which is accurate: every row so
-- far was attached from the ops accident page by the PRUMAC committee.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE app.accident_media
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'committee'
    CHECK (source IN ('committee', 'driver', 'police', 'insurer', 'workshop', 'witness', 'other')),
  ADD COLUMN IF NOT EXISTS source_detail text;

COMMIT;
