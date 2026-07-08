-- ============================================
-- FIX FOR SUPABASE ROW LEVEL SECURITY (RLS)
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This is likely why your entries aren't saving

-- Option 1: Disable RLS completely (Simple, for personal/testing use)
ALTER TABLE daily_entries DISABLE ROW LEVEL SECURITY;

-- OR

-- Option 2: Enable RLS with permissive policies (More secure, recommended)
-- This allows public access for insert, update, select, and delete

-- First enable RLS
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow INSERT
CREATE POLICY "Allow public insert"
ON daily_entries
FOR INSERT
TO public
WITH CHECK (true);

-- Create policy to allow SELECT
CREATE POLICY "Allow public select"
ON daily_entries
FOR SELECT
TO public
USING (true);

-- Create policy to allow UPDATE
CREATE POLICY "Allow public update"
ON daily_entries
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Create policy to allow DELETE
CREATE POLICY "Allow public delete"
ON daily_entries
FOR DELETE
TO public
USING (true);

-- ============================================
-- After running the SQL above, your app should work!
-- ============================================

-- To verify the policies are created, run:
SELECT * FROM pg_policies WHERE tablename = 'daily_entries';
