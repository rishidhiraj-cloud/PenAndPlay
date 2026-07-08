-- ============================================================
-- PASSPORT PHOTO LOG WITH THUMBNAILS — Supabase setup
-- Run this whole script in the Supabase SQL Editor.
-- Plus create the Storage bucket in the dashboard (see step 3).
-- ============================================================

-- 1) Add photo_url column to the existing passport_photo_log table.
ALTER TABLE passport_photo_log
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2) Storage bucket policies (assumes bucket 'passport-photos' exists — see step 3).
-- Reuses the same pattern as the receipts bucket: public read + anon write,
-- so the app's anon-key client can upload and the public URLs are viewable.

DROP POLICY IF EXISTS "Public can read passport photos" ON storage.objects;
CREATE POLICY "Public can read passport photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'passport-photos');

DROP POLICY IF EXISTS "Anon can upload passport photos" ON storage.objects;
CREATE POLICY "Anon can upload passport photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'passport-photos');

DROP POLICY IF EXISTS "Anon can update passport photos" ON storage.objects;
CREATE POLICY "Anon can update passport photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'passport-photos');

DROP POLICY IF EXISTS "Anon can delete passport photos" ON storage.objects;
CREATE POLICY "Anon can delete passport photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'passport-photos');

-- ============================================================
-- 3) MANUAL STEP (Supabase Dashboard):
-- ============================================================
-- a) Storage  ->  New bucket
-- b) Name:     passport-photos       (lowercase, hyphenated, exactly this)
-- c) Public:   YES (toggle ON)
-- d) File size limit: 2 MB
-- e) Allowed MIME types: image/jpeg
-- f) Save.
--
-- Then re-run this whole SQL once more so the policies attach to the bucket.
-- ============================================================
