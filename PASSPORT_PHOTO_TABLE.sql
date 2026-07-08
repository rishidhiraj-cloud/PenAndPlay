-- ============================================================
-- Passport Photo Counter — table setup
-- ============================================================
-- Run this ONCE in your Supabase SQL Editor.
-- Each successful passport-photo generation inserts one row, so
-- "total" = count(*) and "today" = count(*) for created_at today.
--
-- The table is intentionally minimal — id + timestamp only.
-- It can later support analytics (peak days, hourly trends, etc.)
-- without schema changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS passport_photo_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast "today" queries
CREATE INDEX IF NOT EXISTS passport_photo_log_created_at_idx
    ON passport_photo_log (created_at DESC);

-- ============================================================
-- Row Level Security policies (matches the pattern used by
-- daily_entries / other tables in this project)
-- ============================================================
ALTER TABLE passport_photo_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert" ON passport_photo_log;
CREATE POLICY "Allow public insert"
    ON passport_photo_log
    FOR INSERT
    TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select" ON passport_photo_log;
CREATE POLICY "Allow public select"
    ON passport_photo_log
    FOR SELECT
    TO public
    USING (true);

-- ============================================================
-- Verify
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'passport_photo_log';
-- SELECT COUNT(*) FROM passport_photo_log;
