-- Migration: Add reimbursed column to expenses table
-- Execute this in Supabase SQL Editor

ALTER TABLE expenses
ADD COLUMN reimbursed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX idx_expenses_reimbursed ON expenses(reimbursed);
