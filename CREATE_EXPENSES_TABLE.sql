-- ============================================
-- CREATE EXPENSES TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor

-- Create expenses table
CREATE TABLE expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_date DATE NOT NULL,
    expense_by VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paid_from VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster date queries
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);

-- Create index for expense_by for filtering
CREATE INDEX idx_expenses_by ON expenses(expense_by);

-- Disable Row Level Security (for simple setup)
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'expenses'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
