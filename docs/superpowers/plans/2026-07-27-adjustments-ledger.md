# Manual Ledger Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let manually-entered rows in a new `ledger_adjustments` Supabase table flow into the existing Statement page ledger (opening balance, transaction list, closing balance) for both BoB and AP Cash accounts, using the exact same merge/sort/running-balance logic that already handles `daily_entries` and `expenses`.

**Architecture:** One new Postgres table (`ledger_adjustments`, no UI — rows entered directly via Supabase's table editor) plus one new fetch function in `statement.js` (`fetchAdjustments`) that returns rows in the same `{date, sortKey, type, description, amount}` shape as the existing `fetchCredits`/`fetchDebits`. That shape is what makes the rest of the ledger pipeline (sort, running balance, rendering) work unmodified.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (`@supabase/supabase-js@2`, loaded via CDN in `statement.html`), plain SQL against Supabase Postgres.

## Global Constraints

- No UI for adding/editing/deleting adjustment rows — entry is via Supabase's table editor only, per the approved spec (`docs/superpowers/specs/2026-07-27-adjustments-ledger-design.md`).
- Schema/table style must match `CREATE_EXPENSES_TABLE.sql` exactly (same ID/timestamp pattern, indexes, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`).
- `type` column is an explicit `'credit'`/`'debit'` string; `amount` is always positive — sign comes from `type`.
- `type` must be read case/whitespace-insensitively (`.trim().toLowerCase()`) in `fetchAdjustments` — entries are manual with no app-level validation, and a real production row was already found with `"Credit"` (capital C), which the rest of the pipeline's strict `=== 'credit'` checks would otherwise mis-sort as a debit.
- Do not modify the existing sort, running-balance, or rendering logic in `statement.js` — the new rows must merge into the existing pipeline by matching its row shape, not by adding special-case branches.
- `SEED_OPENING` values are untouched; no retroactive backfill.
- This project has no automated test framework (`package.json` has no test script/deps) and is a live production tool for an actual shop backed by a live Supabase instance — verification below uses the Supabase REST API directly (via the anon key already public in `statement.js`) with a scoped insert/verify/delete cycle, not a persistent test fixture. Do not leave test rows behind.

---

### Task 1: Create the `ledger_adjustments` table

**Files:**
- Create: `CREATE_LEDGER_ADJUSTMENTS_TABLE.sql`

**Interfaces:**
- Produces: a Postgres table `ledger_adjustments` with columns `id, entry_date, account, type, amount, description, created_at`, queryable via the existing `supabaseClient` (same project as `daily_entries`/`expenses`).

- [ ] **Step 1: Write the SQL file**

```sql
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
```

- [ ] **Step 2: Run the SQL in Supabase**

This DDL must be run manually in the Supabase SQL Editor (Project → SQL Editor → paste the file contents → Run) — there is no CLI/service-role credential available in this environment to run it programmatically. Confirm the final `SELECT` in the script returns 7 rows (one per column: `id, entry_date, account, type, amount, description, created_at`).

- [ ] **Step 3: Verify the table is reachable via the app's Supabase client**

Run (uses the same public anon key already embedded in `statement.js:3`):

```bash
curl -s "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/ledger_adjustments?select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Expected: HTTP 200 with body `[]` (empty array — table exists, no rows yet). If you get a `relation "ledger_adjustments" does not exist` error, Step 2 wasn't applied — go back and run the SQL.

- [ ] **Step 4: Commit**

```bash
git add CREATE_LEDGER_ADJUSTMENTS_TABLE.sql
git commit -m "Add ledger_adjustments table for manual statement adjustments"
```

---

### Task 2: Wire adjustments into the Statement ledger

**Files:**
- Modify: `statement.js:125` (after `fetchDebits`, add `fetchAdjustments`)
- Modify: `statement.js:166-194` (`computeOpeningBalance`)
- Modify: `statement.js:197-234` (`renderStatement`)

**Interfaces:**
- Consumes: `supabaseClient` (module-level, `statement.js:5`); row shape produced by `fetchCredits`/`fetchDebits`: `{date: string, sortKey: string, type: 'credit'|'debit', description: string, amount: number}`.
- Produces: `fetchAdjustments(account, startStr, endStr) -> Promise<Array<{date, sortKey, type, description, amount}>>`, consumed by `computeOpeningBalance` and `renderStatement`.

- [ ] **Step 1: Add `fetchAdjustments` to `statement.js`**

Insert immediately after the closing brace of `fetchDebits` (after line 164, before the `// ----- Compute opening balance ...` comment on line 166):

```js
// ----- Pull manual adjustments (credit or debit) for a given range -----
// Rows are entered directly in Supabase's table editor (no app UI).
async function fetchAdjustments(account, startStr, endStr) {
    const { data, error } = await supabaseClient
        .from('ledger_adjustments')
        .select('*')
        .eq('account', account)
        .gte('entry_date', startStr)
        .lte('entry_date', endStr)
        .order('entry_date', { ascending: true });

    if (error) {
        console.error('❌ Error fetching adjustments:', error);
        return [];
    }

    return (data || []).map(e => ({
        date: e.entry_date,
        sortKey: e.entry_date + ' 00:00:00',
        type: (e.type || '').trim().toLowerCase(),
        description: e.description || 'Adjustment',
        amount: parseFloat(e.amount) || 0
    }));
}
```

`type` is normalized with `.trim().toLowerCase()` because rows are entered by hand with no app-level validation — a real production row was already found with `"Credit"` (capital C), which the rest of the pipeline's strict `=== 'credit'` checks would otherwise silently mis-handle (falling into the debit branch of the running-balance calculation and flipping its sign). Normalizing at the fetch boundary means `'Credit'`, `'CREDIT'`, `' credit '`, etc. all behave identically to `'credit'`, without touching the sort/running-balance/render logic downstream, which is why this belongs in `fetchAdjustments` rather than in the shared pipeline.

- [ ] **Step 2: Wire it into `computeOpeningBalance`'s walk-forward loop**

Current code (`statement.js:181-191`):

```js
    while (cursor < selectedStart) {
        const { startStr, endStr, startIso, nextStartIso } = monthBounds(cursor);
        const [credits, debits] = await Promise.all([
            fetchCredits(account, startStr, endStr),
            fetchDebits(account, startIso, nextStartIso)
        ]);
        const totalCredit = credits.reduce((s, r) => s + r.amount, 0);
        const totalDebit  = debits.reduce((s, r) => s + r.amount, 0);
        balance = balance + totalCredit - totalDebit;
        cursor.setMonth(cursor.getMonth() + 1);
    }
```

Replace with:

```js
    while (cursor < selectedStart) {
        const { startStr, endStr, startIso, nextStartIso } = monthBounds(cursor);
        const [credits, debits, adjustments] = await Promise.all([
            fetchCredits(account, startStr, endStr),
            fetchDebits(account, startIso, nextStartIso),
            fetchAdjustments(account, startStr, endStr)
        ]);
        const allRows = [...credits, ...debits, ...adjustments];
        const totalCredit = allRows.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
        const totalDebit  = allRows.filter(r => r.type === 'debit').reduce((s, r) => s + r.amount, 0);
        balance = balance + totalCredit - totalDebit;
        cursor.setMonth(cursor.getMonth() + 1);
    }
```

(Switching to `allRows.filter(r => r.type === ...)` instead of the old separate `credits`/`debits` reduces keeps this correct now that adjustments can be either type, without duplicating the credit/debit split logic.)

- [ ] **Step 3: Wire it into `renderStatement`**

Current code (`statement.js:210-214`):

```js
        const [openingBalance, credits, debits] = await Promise.all([
            computeOpeningBalance(account, selectedMonth),
            fetchCredits(account, startStr, endStr),
            fetchDebits(account, startIso, nextStartIso)
        ]);
```

Replace with:

```js
        const [openingBalance, credits, debits, adjustments] = await Promise.all([
            computeOpeningBalance(account, selectedMonth),
            fetchCredits(account, startStr, endStr),
            fetchDebits(account, startIso, nextStartIso),
            fetchAdjustments(account, startStr, endStr)
        ]);
```

Current code (`statement.js:216-217`):

```js
        // Combine and sort: by date ascending, credits before debits on same date.
        const txns = [...credits, ...debits].sort((a, b) => {
```

Replace with:

```js
        // Combine and sort: by date ascending, credits before debits on same date.
        const txns = [...credits, ...debits, ...adjustments].sort((a, b) => {
```

Everything below this line (`totalCredit`/`totalDebit`/`closingBalance` computation, table rendering) already operates on `txns` generically and needs no changes — those already sum by `t.type`, not by source array.

- [ ] **Step 4: Insert temporary test rows via the Supabase REST API**

Pick a date inside the currently-viewed month (today, 2026-07-27, works). Insert one credit for BoB and one debit for AP Cash, both clearly marked as test data:

```bash
curl -s -X POST "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/ledger_adjustments" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '[
    {"entry_date": "2026-07-27", "account": "BoB", "type": "Credit", "amount": 500, "description": "TEST - safe to delete"},
    {"entry_date": "2026-07-27", "account": "AP Cash", "type": "debit", "amount": 200, "description": "TEST - safe to delete"}
  ]'
```

Note the BoB row deliberately uses `"Credit"` (capital C), not lowercase — this exercises the `.trim().toLowerCase()` normalization in `fetchAdjustments` against the exact casing already found live in production (see Global Constraints).

Expected: HTTP 200/201 with a JSON array of the 2 inserted rows, each with a generated `id`. Note both `id` values for Step 6.

**Note:** `ledger_adjustments` already contains a real (non-test) production row — entered directly by the user, not part of this plan's test data: `entry_date 2026-07-24, account AP Cash, type "Credit", amount 192902.00, description "Adjustment made to nullify AP Cash negative balance."`. Do not delete or modify this row. Its presence is actually useful for Step 5: it's a real-world case of the exact casing bug the normalization fix addresses.

- [ ] **Step 5: Serve the app locally and verify in the browser**

```bash
cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765
```

Open `http://localhost:8765/statement.html`. For each account:

- **BoB**: select "BoB" in the dropdown. Confirm a row dated 27/07/2026 with description "TEST - safe to delete" appears in the **Credit** column showing `₹500.00` (proving the capital-C `"Credit"` type was normalized and treated as a credit, not a debit), and that the closing balance / running balance reflect the +500.
- **AP Cash**: select "AP Cash". Confirm two things: (1) a row dated 27/07/2026 with description "TEST - safe to delete" appears in the **Debit** column showing `₹200.00`; (2) the pre-existing real row dated 24/07/2026 ("Adjustment made to nullify AP Cash negative balance.") appears in the **Credit** column (not Debit) showing `₹1,92,902.00` — this confirms the normalization fix correctly handles the real production data, not just the freshly-inserted lowercase test row.

Stop the server (Ctrl-C) once confirmed.

- [ ] **Step 6: Delete the temporary test rows**

Using the `id` values captured in Step 4:

```bash
curl -s -X DELETE "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/ledger_adjustments?id=eq.<id-1>" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"

curl -s -X DELETE "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/ledger_adjustments?id=eq.<id-2>" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Confirm cleanup: re-run the Step 3 verification `GET` from Task 1, filtered to today's date (`?select=*&entry_date=eq.2026-07-27`) — expect `[]` (the pre-existing 2026-07-24 production row is untouched and will still be present in an unfiltered query).

- [ ] **Step 7: Commit**

```bash
git add statement.js
git commit -m "Merge manual ledger_adjustments rows into the statement ledger"
```
