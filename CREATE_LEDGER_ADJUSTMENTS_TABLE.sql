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
    type VARCHAR(10) NOT NULL CHECK (lower(trim(type)) IN ('credit', 'debit')),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX idx_ledger_adjustments_date ON ledger_adjustments(entry_date DESC);

-- Create index for account filtering
CREATE INDEX idx_ledger_adjustments_account ON ledger_adjustments(account);

-- Disable Row Level Security (consistent with expenses/daily_entries)
-- NOTE: if inserts return 401/403 despite this line, check the RLS toggle directly in the Supabase Table Editor for this table — it was found still enabled here once despite this ALTER having been run.
ALTER TABLE ledger_adjustments DISABLE ROW LEVEL SECURITY;

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'ledger_adjustments'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================

-- ============================================
-- RETROFIT: run this once against the already-live table
-- ============================================
-- The table above was already created in production before these CHECK
-- constraints existed. Run the two ALTERs below once against the live
-- database to add them retroactively.
--
-- Safe to run against current live data: the existing real row
-- (2026-07-24, AP Cash, "Credit", 192902.00) will NOT be rejected by the
-- type constraint since lower(trim('Credit')) = 'credit', and its amount
-- (192902.00) is positive.
ALTER TABLE ledger_adjustments ADD CONSTRAINT ledger_adjustments_type_check CHECK (lower(trim(type)) IN ('credit', 'debit'));
ALTER TABLE ledger_adjustments ADD CONSTRAINT ledger_adjustments_amount_check CHECK (amount > 0);
