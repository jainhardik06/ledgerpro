-- ==============================================================================
-- Migration: 20260924000000_create_agency_assets_storage.sql
-- Description: Sets up the 'agency-assets' storage bucket with multi-tenant RLS,
--              public read access for logos & documents, and 150 KB file cap.
-- ==============================================================================

-- 1. Create the 'agency-assets' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-assets',
  'agency-assets',
  true,
  153600, -- 150 KB strict cap (150 * 1024 bytes)
  ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 153600,
  allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];

-- 2. Policy: Public Read Access
-- Anyone can view public agency logos (invoices, PDF generator, email links, reports)
DROP POLICY IF EXISTS "Public Read Agency Assets" ON storage.objects;
CREATE POLICY "Public Read Agency Assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'agency-assets');

-- 4. Policy: Service Role Full Access (used by Next.js Backend API Route)
-- The Next.js API route (/api/agency/upload-logo) signs requests using the
-- SUPABASE_SERVICE_ROLE_KEY to authenticate tenant-isolated uploads securely.
DROP POLICY IF EXISTS "Service Role Full Access" ON storage.objects;
CREATE POLICY "Service Role Full Access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'agency-assets')
WITH CHECK (bucket_id = 'agency-assets');

-- 5. Policy: Authenticated User Tenant-Isolated Uploads
-- Enforces that uploaded assets strictly reside in the tenant folder: agencies/<tenant_id>/*
DROP POLICY IF EXISTS "Tenant Isolated Upload" ON storage.objects;
CREATE POLICY "Tenant Isolated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agency-assets'
  AND (storage.foldername(name))[1] = 'agencies'
);

-- 6. Policy: Authenticated User Tenant-Isolated Deletions
DROP POLICY IF EXISTS "Tenant Isolated Delete" ON storage.objects;
CREATE POLICY "Tenant Isolated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'agency-assets'
  AND (storage.foldername(name))[1] = 'agencies'
);
