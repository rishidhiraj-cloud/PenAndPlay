-- ============================================
-- CREATE RENT INCOME TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor.
-- Rows are entered through the app's own rent_income.html form (no manual
-- Supabase entry expected), and always represent a credit — there is no
-- 'type' column because every row is income by definition.

CREATE TABLE rent_income (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    account VARCHAR(20) NOT NULL CHECK (account IN ('BoB', 'AP Cash')),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX idx_rent_income_date ON rent_income(entry_date DESC);

-- Create index for account filtering
CREATE INDEX idx_rent_income_account ON rent_income(account);

-- Disable Row Level Security (consistent with expenses/daily_entries/ledger_adjustments)
-- NOTE: if inserts return 401/403 despite this line, check the RLS toggle
-- directly in the Supabase Table Editor for this table — it was found
-- still enabled once on a prior table (ledger_adjustments) despite this
-- exact ALTER having been run.
ALTER TABLE rent_income DISABLE ROW LEVEL SECURITY;

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rent_income'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
