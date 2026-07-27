-- ============================================
-- CREATE LEDGER ADJUSTMENTS TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor.
-- Rows in this table are entered manually (no app UI) and represent
-- one-off credit/debit adjustments to the BoB or AP Cash ledger shown
-- on statement.html, outside of daily_entries / expenses.

CREATE TABLE ledger_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    account VARCHAR(20) NOT NULL,      -- 'BoB' or 'AP Cash'
    type VARCHAR(10) NOT NULL,         -- 'credit' or 'debit'
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX idx_ledger_adjustments_date ON ledger_adjustments(entry_date DESC);

-- Create index for account filtering
CREATE INDEX idx_ledger_adjustments_account ON ledger_adjustments(account);

-- Disable Row Level Security (consistent with expenses/daily_entries)
ALTER TABLE ledger_adjustments DISABLE ROW LEVEL SECURITY;

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'ledger_adjustments'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
