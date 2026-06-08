-- 0031_handover_enums.sql
-- ---------------------------------------------------------------------------
-- inspection_type values for the vehicle handover/takeover process.
-- ALTER TYPE ... ADD VALUE cannot run in a transaction nor be referenced in the
-- same transaction, so these live in their own migration ahead of 0032.
-- ---------------------------------------------------------------------------
ALTER TYPE app.inspection_type ADD VALUE IF NOT EXISTS 'handover';
ALTER TYPE app.inspection_type ADD VALUE IF NOT EXISTS 'takeover';
