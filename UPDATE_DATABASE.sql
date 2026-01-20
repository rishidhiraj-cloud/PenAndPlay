-- ============================================
-- ADD NEW COLUMNS TO DATABASE
-- ============================================
-- Run this SQL in your Supabase SQL Editor

-- Add AP Cash column
ALTER TABLE daily_entries
ADD COLUMN ap_cash DECIMAL(10, 2) DEFAULT 0;

-- Add Cash Total column
ALTER TABLE daily_entries
ADD COLUMN cash_total DECIMAL(10, 2) DEFAULT 0;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'daily_entries';

-- ============================================
-- DONE! Now refresh your app.
-- ============================================
