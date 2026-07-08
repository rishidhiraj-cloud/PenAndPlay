-- ============================================================
-- RECEIPT PHOTO FEATURE — Supabase setup
-- Run this whole script in the Supabase SQL Editor.
-- Plus: create the Storage bucket in the dashboard (see step 3).
-- ============================================================

-- 1) Add receipt_url column to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 2) Storage bucket policies (assumes bucket named 'receipts' exists — see step 3)
-- Allow anyone to read receipts (so the public URL works without auth)
-- and allow the anon role to upload, since this app uses the anon key.

-- Read policy
DROP POLICY IF EXISTS "Public can read receipts" ON storage.objects;
CREATE POLICY "Public can read receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

-- Insert/upload policy
DROP POLICY IF EXISTS "Anon can upload receipts" ON storage.objects;
CREATE POLICY "Anon can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts');

-- Update / delete (so we can replace or clean up later)
DROP POLICY IF EXISTS "Anon can update receipts" ON storage.objects;
CREATE POLICY "Anon can update receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Anon can delete receipts" ON storage.objects;
CREATE POLICY "Anon can delete receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts');

-- ============================================================
-- 3) MANUAL STEP (Supabase Dashboard):
-- ============================================================
-- a) Go to: Storage  ->  Create new bucket
-- b) Name: receipts
-- c) Public bucket: YES (toggle ON so receipt URLs are viewable)
-- d) File size limit: 5 MB (the app already compresses to ~300-800 KB)
-- e) Allowed MIME types: image/jpeg, image/png, image/webp
-- f) Click Save.
--
-- After the bucket exists, re-run this script (it'll apply the policies).
-- ============================================================
