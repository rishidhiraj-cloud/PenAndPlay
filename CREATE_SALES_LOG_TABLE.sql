-- ============================================
-- CREATE SALES LOG TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor.
-- One row per confirmed sale line, captured via sales_log.html's
-- photo-upload + AI-OCR + review flow. Standalone record — no
-- relationship to daily_entries/expenses/Statement.

CREATE TABLE sales_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    item TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX idx_sales_log_date ON sales_log(entry_date DESC);

-- Disable Row Level Security (consistent with every other table in this app)
-- NOTE: if inserts return 401/403 despite this line, check the RLS toggle
-- directly in the Supabase Table Editor for this table — this has happened
-- on two prior tables (ledger_adjustments, rent_income) despite this exact
-- ALTER having been run.
ALTER TABLE sales_log DISABLE ROW LEVEL SECURITY;

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sales_log'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
