# Reimbursement Feature Setup

## IMPORTANT: Database Migration Required

Before the "Mark as Reimbursed" feature will work, you MUST run the migration SQL in Supabase.

## Steps:

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Execute the following SQL:

```sql
-- Add reimbursed column to expenses table
ALTER TABLE expenses
ADD COLUMN reimbursed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX idx_expenses_reimbursed ON expenses(reimbursed);
```

OR simply copy and execute the contents of: `expense_reimbursement_migration.sql`

## Verification:

After running the migration:
1. Refresh the expense page
2. Click "Mark as Reimbursed" on any Self-paid expense
3. The button should disappear and a green ✓ should appear

## Troubleshooting:

If you see an error like "column reimbursed does not exist":
- The migration hasn't been run yet
- Run the SQL above in Supabase SQL Editor

If you see other errors:
- Check browser console (F12) for error details
- Verify Supabase connection is working
