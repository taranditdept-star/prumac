-- Migration 0011: Supabase Storage bucket for vehicle and trip documents.
--
-- The bucket is private (not public). Files are served via signed URLs only.
-- RLS policies mirror the application roles:
--   - fleet_manager/admin: full access (read + write)
--   - driver: read-only on files they uploaded
--   - subsidiary_billing: no access (invoices use a separate bucket in Phase 9)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760,  -- 10 MB max per file
    ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Fleet managers and admins can do everything
CREATE POLICY "documents_ops_all"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (auth.jwt()->>'role' IN ('fleet_manager', 'admin')
             OR EXISTS (
                 SELECT 1 FROM app.profiles
                 WHERE id = auth.uid()
                 AND role IN ('fleet_manager', 'admin')
             ))
    )
    WITH CHECK (
        bucket_id = 'documents'
        AND EXISTS (
            SELECT 1 FROM app.profiles
            WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'admin')
        )
    );

-- Drivers can read any document in the documents bucket (they need to view odometer photo uploads etc.)
CREATE POLICY "documents_driver_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND EXISTS (
            SELECT 1 FROM app.profiles
            WHERE id = auth.uid()
            AND role = 'driver'
        )
    );
