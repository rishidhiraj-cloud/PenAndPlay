# Rent Income Feature — Design Spec

## Problem

The shop earns rent income that is real cash/bank inflow but is **not a sale** — it shouldn't be counted in the dashboard's sales/income analytics (which are all driven from `daily_entries`), but it IS real money that needs to show up on the BoB/AP Cash account statements as a credit, dated to whenever it was received.

There is currently no page or table for this. Manually adding it to `daily_entries` would incorrectly count it as a sale in dashboard analytics; adding it to `expenses` would incorrectly show it as a debit.

## Goal

A new "Rent Income" page where the user logs each rent receipt (account, amount, remarks, date) into its own table, which then automatically shows up as a **Credit** in the Statement page's ledger for the chosen account/date — using the same fetch/merge pattern already used for `ledger_adjustments` — while remaining completely invisible to the dashboard's sales analytics (which only ever reads `daily_entries`, so this is true by construction — no exclusion logic needed).

## Database

New table `rent_income`:

```sql
CREATE TABLE rent_income (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_date DATE NOT NULL,
    account VARCHAR(20) NOT NULL CHECK (account IN ('BoB', 'AP Cash')),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rent_income_date ON rent_income(entry_date DESC);
CREATE INDEX idx_rent_income_account ON rent_income(account);

ALTER TABLE rent_income DISABLE ROW LEVEL SECURITY;
```

Unlike `ledger_adjustments` (populated by hand, no UI), this table is written exclusively through the app's own form, so the `CHECK` constraints on `account`/`amount` are added up front rather than retrofitted — same lesson as the `ledger_adjustments` incident, applied proactively. There is no `type` column: every row is, by definition, a credit.

## New page: `rent_income.html` + `rent_income.js` + `rent_income-style.css`

Follows the existing page skeleton (header, burger menu, month indicator, footer scripts) used by every other page. Page-specific layout (radio group, history list) goes in a new `rent_income-style.css`; shared form/button/status-message styling comes from the existing `style.css` (`.form-group`, `.btn-primary`, `.status-message`, `.form-section h2` are already global, confirmed present in `style.css`).

### Form (`#rentIncomeForm`)

| Field | Input type | Required | Notes |
|---|---|---|---|
| Account | radio (`BoB` / `AP Cash`) | yes | no default selection |
| Amount | `number`, `step="0.01"`, `min="0.01"` | yes | |
| Remarks | `textarea` | no | free text |
| Date | `date` | yes | defaults to today |

On submit: insert into `rent_income`, show success/error via the existing `.status-message` pattern (see `expense.js`), clear the form, and refresh the history list below.

### History list

- Scoped to the app-wide selected month, same convention already shared by `dashboard.js`/`statement.js`/`expense.js` (`getSelectedMonth()` reading `localStorage['selectedMonth']`).
- Each row shows: date, account, amount, remarks.
- **No edit or delete** — add-only through this UI (matches `expense.html`'s existing behavior; corrections happen via direct Supabase edits, same as `ledger_adjustments`).
- A running total for the visible month, same idea as Expense History's `.total-expense` badge.

### Burger menu

Add `<a href="rent_income.html" ...>Rent Income</a>` immediately after Expenses, before Statement, in **all 10** existing HTML pages that carry a burger menu nav block, plus the new `rent_income.html` itself:

- 8 pages use `data-num` (`index.html`, `entry.html`, `history.html`, `expense.html`, `statement.html`, `storage.html`, `outofstock.html`, `generate_bill.html`) — these renumber `04`–`09` (Statement…Generate Bill) up to `05`–`10`, with Rent Income becoming `04`.
- 2 pages (`passport_photo_generator.html`, `collage.html`) use a different nav format (emoji-prefixed links, no `data-num` attribute) — insert `<a href="rent_income.html">🏠 Rent Income</a>` after the Expenses line, no renumbering needed since these pages don't number items.

## Code changes — `statement.js`

### New fetch function

```js
async function fetchRentIncome(account, startStr, endStr) {
    const { data, error } = await supabaseClient
        .from('rent_income')
        .select('*')
        .eq('account', account)
        .gte('entry_date', startStr)
        .lte('entry_date', endStr)
        .order('entry_date', { ascending: true });

    if (error) { console.error('❌ Error fetching rent income:', error); return []; }

    return (data || []).map(e => ({
        date: e.entry_date,
        sortKey: e.entry_date + ' 00:00:00',
        type: 'credit',
        description: e.remarks ? `Rent Income — ${e.remarks}` : 'Rent Income',
        amount: parseFloat(e.amount) || 0
    }));
}
```

`type` is hardcoded to `'credit'` — the DB's `CHECK` constraint plus the fact that entry is exclusively through this app's own form (no manual Supabase entry, unlike `ledger_adjustments`) means there's no casing/typo risk to normalize against.

### Call sites

Same two call sites as `fetchAdjustments`, now a fourth parallel source:

1. `computeOpeningBalance`'s walk-forward loop — add `fetchRentIncome` to the `Promise.all`, merge into `allRows` alongside credits/debits/adjustments.
2. `renderStatement` — add `fetchRentIncome` to its `Promise.all`, spread into `txns` alongside the other three sources.

No changes to sort, running-balance, or table-rendering logic — this is purely another array merged in via the existing generic `{date, sortKey, type, description, amount}` shape.

## Out of scope

- No edit/delete UI for `rent_income` rows.
- No dashboard.js changes — exclusion from sales analytics is structural (dashboard only ever reads `daily_entries`), not a new filter.
- No retroactive backfill of historical rent income; `SEED_OPENING` values untouched.
