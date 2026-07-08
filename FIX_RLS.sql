-- ============================================
-- COPY AND RUN THIS ENTIRE SQL IN SUPABASE
-- ============================================
-- This will fix the "entries not saving" issue

-- Step 1: Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'daily_entries';

-- Step 2: Disable Row Level Security (simplest fix)
ALTER TABLE daily_entries DISABLE ROW LEVEL SECURITY;

-- Step 3: Verify RLS is now disabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'daily_entries';
-- You should see rowsecurity = false

-- ============================================
-- DONE! Your app should now work.
-- ============================================
-- Go back to index.html and try saving an entry.
