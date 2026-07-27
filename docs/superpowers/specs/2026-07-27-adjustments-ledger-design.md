# Manual Ledger Adjustments — Design Spec

## Problem

The Statement page (`statement.html` + `statement.js`) renders a running-balance ledger per account (BoB / AP Cash) by combining two sources:

- **Credits**: `daily_entries` (BoB = `upi_amount + card_amount`; AP Cash = `ap_cash`)
- **Debits**: `expenses`, filtered by `paid_from`

There's no way to record one-off adjustments that don't belong in either source (e.g. corrections, out-of-scope entries) while still having them flow through the same running balance, opening/closing balance, and month-to-month carry-forward logic.

## Goal

Add a third source of ledger rows — a manually-populated Supabase table — that participates in the existing ledger exactly like `daily_entries`/`expenses` do: included in the visible month's transaction list, and folded into the opening-balance walk-forward for all later months.

No UI is required. Rows are entered directly in the Supabase table editor.

## Database

New table `ledger_adjustments`, styled after the existing `expenses` table (`CREATE_EXPENSES_TABLE.sql`):

```sql
CREATE TABLE ledger_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    account VARCHAR(20) NOT NULL,      -- 'BoB' or 'AP Cash'
    type VARCHAR(10) NOT NULL,         -- 'credit' or 'debit'
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ledger_adjustments_date ON ledger_adjustments(entry_date DESC);
CREATE INDEX idx_ledger_adjustments_account ON ledger_adjustments(account);

ALTER TABLE ledger_adjustments DISABLE ROW LEVEL SECURITY;
```

- `account` gates which account's ledger the row appears in — matches the values already used elsewhere in the app (`'BoB'` / `'AP Cash'`).
- `type` is an explicit `'credit'`/`'debit'` string (not separate amount columns), matching how the app already models directional entries.
- `amount` is always a positive value; sign is determined by `type`, same as every other row in the ledger.

## Code changes — `statement.js`

### New fetch function

```js
async function fetchAdjustments(account, startStr, endStr) {
    const { data, error } = await supabaseClient
        .from('ledger_adjustments')
        .select('*')
        .eq('account', account)
        .gte('entry_date', startStr)
        .lte('entry_date', endStr)
        .order('entry_date', { ascending: true });

    if (error) { console.error('❌ Error fetching adjustments:', error); return []; }

    return (data || []).map(e => ({
        date: e.entry_date,
        sortKey: e.entry_date + ' 00:00:00',
        type: e.type,
        description: e.description || 'Adjustment',
        amount: parseFloat(e.amount) || 0
    }));
}
```

Row shape (`date`, `sortKey`, `type`, `description`, `amount`) matches exactly what `fetchCredits`/`fetchDebits` already produce, so it merges into the existing `txns` array, sort, and running-balance computation with zero changes to that logic.

### Call sites

1. **`computeOpeningBalance`** — inside the walk-forward loop, call `fetchAdjustments` alongside `fetchCredits`/`fetchDebits` for each historical month and net the result into `balance`, so adjustments correctly shift the opening balance of every subsequent month.
2. **`renderStatement`** — call `fetchAdjustments` alongside the existing credits/debits fetch for the visible month; concatenate its rows into `txns` before the existing sort step.

### Unchanged

- Sorting (`sortKey` comparison, credit-before-debit same-day tiebreak)
- Running balance computation
- Ledger table rendering (Date/Description/Debit/Credit/Balance columns)
- Summary cards (Opening/Total Credit/Total Debit/Closing)

These all operate on the generic `{date, sortKey, type, description, amount}` row shape and require no awareness of which of the three tables a row came from.

## Out of scope

- No UI for adding/editing/deleting adjustment rows (entered directly via Supabase table editor).
- No edit/delete UI on the Statement page for these rows.
- No retroactive backfill — adjustments only affect months from whenever rows are entered; the existing `SEED_OPENING` seed values are untouched.
