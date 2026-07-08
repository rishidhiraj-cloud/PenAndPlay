-- ============================================================
-- Collage Counter — table setup
-- ============================================================
-- Run this ONCE in your Supabase SQL Editor.
-- Each successful collage generation inserts one row, so
-- "Collages Made Till Date" = count(*).
-- ============================================================

CREATE TABLE IF NOT EXISTS collage_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast date-bounded queries
CREATE INDEX IF NOT EXISTS collage_log_created_at_idx
    ON collage_log (created_at DESC);

-- ============================================================
-- Row Level Security policies (matches the pattern used by
-- daily_entries / passport_photo_log in this project)
-- ============================================================
ALTER TABLE collage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert" ON collage_log;
CREATE POLICY "Allow public insert"
    ON collage_log
    FOR INSERT
    TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public select" ON collage_log;
CREATE POLICY "Allow public select"
    ON collage_log
    FOR SELECT
    TO public
    USING (true);

-- ============================================================
-- Verify
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'collage_log';
-- SELECT COUNT(*) FROM collage_log;
