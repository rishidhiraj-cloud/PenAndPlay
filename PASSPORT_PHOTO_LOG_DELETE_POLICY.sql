-- ============================================================
-- Passport Photo Log — DELETE policy
-- Run this once in the Supabase SQL Editor. Without it, RLS
-- silently blocks the app's delete-image feature (Dhiraj-only).
-- ============================================================

DROP POLICY IF EXISTS "Allow public delete" ON passport_photo_log;
CREATE POLICY "Allow public delete"
    ON passport_photo_log
    FOR DELETE
    TO public
    USING (true);

-- ============================================================
-- Verify
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'passport_photo_log';
-- Expect to see policies: "Allow public insert", "Allow public select",
-- "Allow public delete".
