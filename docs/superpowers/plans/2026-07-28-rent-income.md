# Rent Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Rent Income" page where rent receipts (account, amount, remarks, date) are logged into a new `rent_income` table, shown in that page's own history list, and automatically reflected as a Credit on the Statement page's ledger for the chosen account/date — without ever touching the dashboard's sales analytics.

**Architecture:** One new Postgres table (`rent_income`) written through a real form (`rent_income.html` + `rent_income.js`, no manual Supabase entry), a fourth `statement.js` fetch function (`fetchRentIncome`) merged into the existing ledger pipeline exactly like `fetchAdjustments` was, and a burger-menu link added across all 10 existing pages.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (CDN), plain CSS following this app's existing per-page stylesheet convention (each page has its own small `<page>-style.css` for `.month-indicator` etc., layered on top of the shared `style.css`).

## Global Constraints

- No edit/delete UI for `rent_income` rows — add-only through the form, matching `expense.html`'s existing behavior (per approved spec).
- `rent_income` has DB-level `CHECK` constraints on `account` (`IN ('BoB', 'AP Cash')`) and `amount` (`> 0`) from the start — this table is written exclusively through this app's own form, so these constraints double as the form's server-side validation backstop.
- Dashboard sales analytics (`dashboard.js`) must NOT be touched — exclusion from sales analytics is structural (dashboard only ever reads `daily_entries.total_income`), not a new filter to build.
- `statement.js`'s existing sort/running-balance/render pipeline must not change — `fetchRentIncome` rows use the same `{date, sortKey, type, description, amount}` shape as `fetchCredits`/`fetchDebits`/`fetchAdjustments`, with `type` hardcoded to `'credit'`.
- Burger-menu placement: "Rent Income" goes immediately after "Expenses", before "Statement", in all 10 existing pages that carry a burger-menu nav block (`index.html`, `entry.html`, `history.html`, `expense.html`, `statement.html`, `storage.html`, `outofstock.html`, `generate_bill.html` — these 8 use `data-num` and must renumber `04`–`09` up to `05`–`10`; `passport_photo_generator.html` and `collage.html` use an emoji-prefixed format with no `data-num`, just insert the new link, no renumbering).
- This project has no automated test framework and is a live production tool with a live Supabase instance backing it — all verification below is manual (local static server + Supabase REST API via the anon key already public in every page's JS), with any test data inserted during verification cleaned up immediately after.

---

### Task 1: Create the `rent_income` table

**Files:**
- Create: `CREATE_RENT_INCOME_TABLE.sql`

**Interfaces:**
- Produces: a Postgres table `rent_income` with columns `id, entry_date, account, amount, remarks, created_at`, queryable via the existing `supabaseClient` pattern (same Supabase project as every other table in this app).

- [ ] **Step 1: Write the SQL file**

```sql
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
```

- [ ] **Step 2: Run the SQL in Supabase**

This DDL must be run manually in the Supabase SQL Editor — there is no CLI/service-role credential available in this environment. Confirm the final `SELECT` returns 6 rows (one per column: `id, entry_date, account, amount, remarks, created_at`).

- [ ] **Step 3: Verify the table is reachable and constraints work**

```bash
curl -s "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income?select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Expected: HTTP 200, body `[]`.

Then confirm the CHECK constraints reject bad data (this also catches a repeat of the RLS-toggle issue early, before Tasks 2-3 build on top of it):

```bash
curl -s -X POST "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM" \
  -H "Content-Type: application/json" \
  -d '[{"entry_date": "2026-07-28", "account": "Cash", "amount": 100, "remarks": "should be rejected"}]'
```

Expected: HTTP 400ish with `"code":"23514"` (check_violation) mentioning `rent_income_account_check` — `'Cash'` is not `'BoB'`/`'AP Cash'`. If instead you get an RLS error (`42501`) or the row is accepted, STOP and report BLOCKED — do not proceed to Task 2 on top of a broken table.

- [ ] **Step 4: Commit**

```bash
git add CREATE_RENT_INCOME_TABLE.sql
git commit -m "Add rent_income table for the Rent Income feature"
```

---

### Task 2: Build the Rent Income page

**Files:**
- Create: `rent_income.html`
- Create: `rent_income.js`
- Create: `rent_income-style.css`

**Interfaces:**
- Consumes: `window.supabase` (Supabase JS SDK, loaded via CDN script tag, same as every other page), `auth.js` (page-agnostic auth gate — no changes needed, it works off standard `.header-text`/`.burger-menu nav a`/`.back-to-dashboard` classes already used below).
- Produces: a working add-only form + month-scoped history list against the `rent_income` table created in Task 1. No interface consumed by other tasks (Task 3 talks to the `rent_income` table directly, not to this page).

- [ ] **Step 1: Write `rent_income.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rent Income - Pen & Play Club</title>
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="rent_income-style.css">
</head>
<body>
    <!-- Loader -->
    <div id="pageLoader" class="page-loader">
        <div class="loader-spinner"></div>
    </div>

    <div class="container">
        <header>
            <div class="header-content">
                <div class="burger-menu-container">
                    <div class="burger-icon" id="burgerIcon">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div class="header-text">
                    <h1>Pen & Play Club</h1>
                    <p class="subtitle">Rent Income</p>
                </div>
                <div class="header-logo-right">
                    <img src="Logo.png" alt="Shop Logo">
                </div>
            </div>
        </header>

        <div class="burger-overlay" id="burgerOverlay"></div>
        <div class="burger-menu" id="burgerMenu">
            <nav>
                <a href="entry.html" data-num="01">New Entry</a>
                <a href="history.html" data-num="02">History</a>
                <a href="expense.html" data-num="03">Expenses</a>
                <a href="rent_income.html" data-num="04">Rent Income</a>
                <a href="statement.html" data-num="05">Statement</a>
                <a href="storage.html" data-num="06">Manage Storage</a>
                <a href="outofstock.html" data-num="07">Out of Stock</a>
                <a href="passport_photo_generator.html" data-num="08">Passport Photo</a>
                <a href="collage.html" data-num="09">Collage</a>
                <a href="generate_bill.html" data-num="10">Generate Bill</a>
                <button id="darkModeToggle" class="dark-mode-toggle-btn">🌙 Dark Mode</button>
            </nav>
        </div>

        <main>
            <div class="back-to-dashboard">
                <a href="index.html">« Back To Dashboard</a>
            </div>

            <!-- Month Indicator -->
            <div class="month-indicator"><span class="mi-label">Viewing Month:</span> <span id="currentMonthLabel" class="mi-value">Loading...</span></div>

            <!-- Rent Income Entry Form -->
            <div class="form-section">
                <h2>Add Rent Income</h2>
                <form id="rentIncomeForm">
                    <!-- Date -->
                    <div class="form-group">
                        <label for="rentDate">Date</label>
                        <input type="date"
                               id="rentDate"
                               name="rentDate"
                               required>
                    </div>

                    <!-- Account -->
                    <div class="form-group">
                        <label>Account</label>
                        <div class="account-radio-group">
                            <label class="account-radio-item">
                                <input type="radio" id="rentAccountBoB" name="rentAccount" value="BoB" required>
                                BoB
                            </label>
                            <label class="account-radio-item">
                                <input type="radio" id="rentAccountApCash" name="rentAccount" value="AP Cash">
                                AP Cash
                            </label>
                        </div>
                    </div>

                    <!-- Amount -->
                    <div class="form-group">
                        <label for="rentAmount">Amount</label>
                        <input type="number"
                               id="rentAmount"
                               name="rentAmount"
                               placeholder="0.00"
                               step="0.01"
                               min="0.01"
                               inputmode="decimal"
                               required>
                    </div>

                    <!-- Remarks -->
                    <div class="form-group">
                        <label for="rentRemarks">Remarks <span class="optional-hint">(optional)</span></label>
                        <textarea id="rentRemarks"
                                  name="rentRemarks"
                                  rows="3"
                                  placeholder="Enter remarks..."></textarea>
                    </div>

                    <!-- Submit Button -->
                    <button type="submit" class="btn-primary" id="rentSubmitBtn">
                        Save Rent Income
                    </button>
                </form>

                <!-- Status Message -->
                <div id="statusMessage" class="status-message"></div>
            </div>

            <!-- Rent Income History -->
            <div class="history-section">
                <div class="history-header">
                    <h2>Rent Income History</h2>
                    <span class="total-rent-income" id="totalRentIncome">₹0.00</span>
                </div>

                <div id="rentIncomeHistory" class="rent-income-list">
                    <div class="loading-spinner">Loading rent income...</div>
                </div>
            </div>
        </main>
    </div>

    <!-- Supabase SDK -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="auth.js"></script>
    <script src="rent_income.js"></script>
    <!-- Vercel Speed Insights -->
    <script>
        window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `rent_income.js`**

```js
// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Rent Income.js loaded successfully');

// Format number in Indian style
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const parts = n.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);

    if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
    }

    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return formatted + '.' + decimalPart;
}

// DOM Elements
const form = document.getElementById('rentIncomeForm');
const rentDateInput = document.getElementById('rentDate');
const rentAmountInput = document.getElementById('rentAmount');
const rentRemarksInput = document.getElementById('rentRemarks');
const submitBtn = document.getElementById('rentSubmitBtn');
const statusMessage = document.getElementById('statusMessage');
const rentIncomeHistoryEl = document.getElementById('rentIncomeHistory');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');
const totalRentIncomeEl = document.getElementById('totalRentIncome');

// Get selected month from localStorage or use current month
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// Initialize App
function init() {
    console.log('🚀 Initializing rent income tracker...');

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    rentDateInput.value = today;

    // Get and display selected month
    const selectedMonth = getSelectedMonth();
    const monthName = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    currentMonthLabelEl.textContent = monthName;

    // Form submission
    form.addEventListener('submit', handleSubmit);

    // Load rent income history
    loadRentIncomeHistory();

    console.log('✅ Rent income tracker initialized');
}

// Handle Form Submission
async function handleSubmit(e) {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    hideStatusMessage();

    try {
        const entryDate = rentDateInput.value;
        const account = document.querySelector('input[name="rentAccount"]:checked')?.value;
        const amount = parseFloat(rentAmountInput.value.replace(/,/g, '')) || 0;
        const remarks = rentRemarksInput.value.trim();

        if (!entryDate) {
            showStatusMessage('Please select a date.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        if (!account) {
            showStatusMessage('Please select an account.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        if (amount <= 0) {
            showStatusMessage('Please enter a valid amount greater than 0.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        const rentIncomeData = {
            entry_date: entryDate,
            account: account,
            amount: amount,
            remarks: remarks || null
        };

        const { error } = await supabaseClient
            .from('rent_income')
            .insert([rentIncomeData])
            .select();

        if (error) {
            console.error('❌ Insert error:', error);
            throw error;
        }

        showStatusMessage('Rent income saved successfully!', 'success');

        // Clear form
        form.reset();
        rentDateInput.value = new Date().toISOString().split('T')[0];

        // Reload history
        await loadRentIncomeHistory();

    } catch (err) {
        console.error('❌ ERROR:', err);
        showStatusMessage('Error: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Rent Income';
    }
}

// Load Rent Income History
async function loadRentIncomeHistory() {
    try {
        pageLoader.classList.remove('hidden');
        rentIncomeHistoryEl.innerHTML = '<div class="loading-spinner">Loading rent income...</div>';

        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;

        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;

        const { data, error } = await supabaseClient
            .from('rent_income')
            .select('*')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error loading rent income:', error);
            throw error;
        }

        if (data && data.length > 0) {
            displayRentIncome(data);
        } else {
            displayNoRentIncome();
        }
    } catch (err) {
        console.error('❌ Exception loading rent income:', err);
        totalRentIncomeEl.textContent = '₹0.00';
        rentIncomeHistoryEl.innerHTML = `
            <div class="empty-state">
                <p style="color: #721c24;">Error loading rent income: ${err.message}</p>
                <p>Please check the browser console for details.</p>
            </div>
        `;
    } finally {
        pageLoader.classList.add('hidden');
    }
}

// Display Rent Income entries
function displayRentIncome(entries) {
    const total = entries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
    totalRentIncomeEl.textContent = `₹${formatIndianNumber(total)}`;

    const entriesHTML = entries.map(entry => {
        const date = new Date(entry.entry_date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return `
            <div class="rent-item">
                <div class="rent-header">
                    <div class="rent-date">${date}</div>
                    <div class="rent-amount">₹${formatIndianNumber(entry.amount)}</div>
                </div>
                <div class="rent-details">
                    <div class="rent-detail-row">
                        <span class="rent-label">Account:</span>
                        <span class="rent-value">${escapeHtml(entry.account)}</span>
                    </div>
                    ${entry.remarks ? `
                    <div class="rent-detail-row">
                        <span class="rent-label">Remarks:</span>
                        <span class="rent-value">${escapeHtml(entry.remarks)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    rentIncomeHistoryEl.innerHTML = entriesHTML;
}

// Display No Rent Income Message
function displayNoRentIncome() {
    totalRentIncomeEl.textContent = '₹0.00';
    rentIncomeHistoryEl.innerHTML = `
        <div class="empty-state">
            <p>No rent income recorded yet.</p>
            <p style="color: #666; font-size: 14px;">Add your first entry using the form above.</p>
        </div>
    `;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Show Status Message
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            hideStatusMessage();
        }, 3000);
    }
}

// Hide Status Message
function hideStatusMessage() {
    statusMessage.className = 'status-message';
    statusMessage.textContent = '';
}

// Dark Mode
function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️ Light Mode';
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    darkModeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
}

// Burger Menu
function initBurgerMenu() {
    const burgerIcon = document.getElementById('burgerIcon');
    const burgerMenu = document.getElementById('burgerMenu');
    const burgerOverlay = document.getElementById('burgerOverlay');

    if (burgerIcon && burgerMenu && burgerOverlay) {
        burgerIcon.addEventListener('click', () => {
            burgerMenu.classList.toggle('active');
            burgerOverlay.classList.toggle('active');
        });

        burgerOverlay.addEventListener('click', () => {
            burgerMenu.classList.remove('active');
            burgerOverlay.classList.remove('active');
        });
    }
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    init();
});
```

Note: `escapeHtml` is used for `account`/`remarks` (user-entered free text rendered into innerHTML) even though `account` is DB-constrained to two known values — cheap and consistent with how `statement.js` already escapes rendered text, and `remarks` genuinely needs it since it's free-form.

- [ ] **Step 3: Write `rent_income-style.css`**

```css
/* ─────────────────────────────────────────────
   WASHI — Rent Income Page
   ───────────────────────────────────────────── */

.month-indicator {
    border-bottom: 1px solid var(--rule-mid);
    padding-bottom: 12px;
    margin-bottom: 16px;
}

.mi-label {
    font-family: var(--mono);
    font-size: 15px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--olive);
}

.mi-value {
    font-family: var(--serif);
    font-size: 15px;
    font-weight: 600;
    font-style: italic;
    color: var(--ink);
    margin-left: 8px;
}

/* ─── Form & History Sections ─────────────── */
.form-section {
    padding-bottom: 20px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--rule-mid);
}

.history-section {
    padding-bottom: 20px;
    margin-bottom: 16px;
}

.optional-hint {
    font-family: var(--mono);
    font-size: 15px;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
    margin-left: 4px;
    text-transform: lowercase;
}

textarea {
    width: 100%;
    padding: 10px;
    font-size: 16px;
    font-family: var(--mono);
    border: 1px solid var(--rule-mid);
    border-radius: 2px;
    background: var(--cream-mid);
    color: var(--ink);
    resize: vertical;
    transition: border-color var(--transition);
}

textarea:focus { outline: none; border-color: var(--ink); }

/* ─── Account Radio Group ─────────────────── */
.account-radio-group {
    display: flex;
    flex-direction: row;
    gap: 20px;
    flex-wrap: wrap;
    align-items: center;
}

.account-radio-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 14px;
    color: var(--ink);
    cursor: pointer;
}

.account-radio-item input[type="radio"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--ink);
    flex-shrink: 0;
}

/* ─── History Header ──────────────────────── */
.history-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1.5px solid var(--ink);
}

.total-rent-income {
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 700;
    color: var(--olive);
    letter-spacing: -0.02em;
}

/* ─── Rent Income List ────────────────────── */
.rent-income-list { display: flex; flex-direction: column; }

.rent-item {
    padding: 11px 0;
    border-bottom: 1px solid var(--rule);
}

.rent-item:first-child { border-top: 1px solid var(--rule-mid); }

.rent-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
}

.rent-date {
    font-family: var(--mono);
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
}

.rent-amount {
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
}

.rent-details {
    display: flex;
    flex-direction: column;
    margin-bottom: 6px;
}

.rent-detail-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    border-bottom: 1px dotted var(--rule-mid);
}

.rent-label {
    font-family: var(--mono);
    font-size: 15px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
}

.rent-value {
    font-family: var(--serif);
    font-size: 16px;
    font-style: italic;
    color: var(--ink-soft);
}

@media (max-width: 768px) {
    .rent-detail-row { flex-direction: column; gap: 2px; padding: 4px 0; }
}
```

Note: `.loading-spinner` and `.empty-state` are NOT redefined here — they're already global in `style.css:605` and `style.css:615`. (`expense-style.css` redundantly redefines them; don't copy that redundancy into this new file.)

- [ ] **Step 4: Verify locally**

```bash
cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765
```

Open `http://localhost:8765/rent_income.html` directly (it's not linked from any menu yet — that's Task 4). Confirm:
- Page loads, auth gate appears (log in same as any other page)
- Form renders: Date (defaulted to today), Account radio (BoB/AP Cash), Amount, Remarks
- Submitting with no account selected shows the "Please select an account" error and does NOT insert a row
- Submitting a valid entry (e.g. account BoB, amount 1500, remarks "test — safe to delete", today's date) shows the success message, clears the form, and the entry appears in the history list below with the correct total
- Dark mode toggle and burger menu open/close work (burger menu won't have a working link to itself's own nav yet in OTHER pages, but this page's own menu should render all 10 items including itself)

Then clean up the test row via curl (same anon key as Task 1):

```bash
curl -s "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income?select=id,remarks&remarks=eq.test%20%E2%80%94%20safe%20to%20delete" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Take the returned `id` and:

```bash
curl -s -X DELETE "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income?id=eq.<id>" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Stop the local server. If a `browser-use` skill/tool is available in your environment, use it to drive the form-fill/submit/verify steps instead of manual instructions to a human — but note this task has no OTHER task depending on its output, so a careful static read-through plus the curl-based data check is an acceptable fallback if browser automation isn't available (state clearly which method was used).

- [ ] **Step 5: Commit**

```bash
git add rent_income.html rent_income.js rent_income-style.css
git commit -m "Add Rent Income page (form + history)"
```

---

### Task 3: Wire Rent Income into the Statement ledger

**Files:**
- Modify: `statement.js:125` (after `fetchDebits`/`fetchAdjustments` — insert `fetchRentIncome` after whichever is currently last; check the file, since `fetchAdjustments` was added by a prior feature and its exact position needs to be located, not assumed)
- Modify: `statement.js` — `computeOpeningBalance`'s walk-forward loop
- Modify: `statement.js` — `renderStatement`'s merge

**Interfaces:**
- Consumes: `supabaseClient` (module-level); the `rent_income` table from Task 1 (independent of Task 2 — this task talks to the table directly via curl for verification, doesn't need the UI).
- Produces: `fetchRentIncome(account, startStr, endStr) -> Promise<Array<{date, sortKey, type: 'credit', description, amount}>>`, consumed by `computeOpeningBalance` and `renderStatement` exactly like `fetchAdjustments`.

- [ ] **Step 1: Read the current state of `statement.js`**

The file currently has `fetchCredits`, `fetchDebits`, and `fetchAdjustments` (added in a prior feature), each merged into `computeOpeningBalance` and `renderStatement`. Read the file in full before editing — do not assume line numbers from an earlier plan, since they've shifted.

- [ ] **Step 2: Add `fetchRentIncome`**

Insert after `fetchAdjustments`'s closing brace:

```js
// ----- Pull rent income (always a credit) for a given range -----
// Entered through rent_income.html — a real form, not manual Supabase entry,
// so unlike fetchAdjustments's `type` there's no casing/typo risk to guard —
// every row here is income by definition (DB CHECK constraint on `account`,
// no `type` column at all).
async function fetchRentIncome(account, startStr, endStr) {
    const { data, error } = await supabaseClient
        .from('rent_income')
        .select('*')
        .eq('account', account)
        .gte('entry_date', startStr)
        .lte('entry_date', endStr)
        .order('entry_date', { ascending: true });

    if (error) {
        console.error('❌ Error fetching rent income:', error);
        return [];
    }

    return (data || []).map(e => ({
        date: e.entry_date,
        sortKey: e.entry_date + ' 00:00:00',
        type: 'credit',
        description: e.remarks ? `Rent Income — ${e.remarks}` : 'Rent Income',
        amount: parseFloat(e.amount) || 0
    }));
}
```

- [ ] **Step 3: Wire it into `computeOpeningBalance`'s walk-forward loop**

Find the loop that currently fetches `credits`, `debits`, `adjustments` in a `Promise.all` and merges them into `allRows` before computing `totalCredit`/`totalDebit`. Add `fetchRentIncome(account, startStr, endStr)` as a fourth entry in that `Promise.all`, and include its result in the `allRows` spread. The `totalCredit`/`totalDebit` computation (`allRows.filter(r => r.type === 'credit'|'debit').reduce(...)`) needs no change — it already operates generically on whatever's in `allRows`.

- [ ] **Step 4: Wire it into `renderStatement`**

Find the `Promise.all` that fetches `credits`, `debits`, `adjustments` for the visible month, and the `txns` array that spreads them together before sorting. Add `fetchRentIncome(account, startStr, endStr)` as a fourth entry in the `Promise.all`, and spread its result into `txns` alongside the other three. No other changes — sort, running balance, and rendering all operate generically on `txns`.

- [ ] **Step 5: Insert a temporary test row and verify live**

```bash
curl -s -X POST "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '[{"entry_date": "2026-07-28", "account": "BoB", "amount": 3000, "remarks": "TEST - safe to delete"}]'
```

Note the returned `id`. Serve locally (`cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765`), open `http://localhost:8765/statement.html`, select "BoB". Confirm a row dated 28/07/2026 with description "Rent Income — TEST - safe to delete" appears in the **Credit** column showing `₹3,000.00`, and the closing balance reflects the +3000. Stop the server.

Delete the test row:

```bash
curl -s -X DELETE "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/rent_income?id=eq.<id>" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM"
```

Confirm cleanup: `GET` `rent_income?select=*&entry_date=eq.2026-07-28` returns `[]` (note: `ledger_adjustments` and `rent_income` are different tables — this check is against `rent_income`, and won't affect the pre-existing real row in `ledger_adjustments` from the prior feature).

- [ ] **Step 6: Commit**

```bash
git add statement.js
git commit -m "Merge rent_income rows into the statement ledger as credits"
```

---

### Task 4: Add "Rent Income" to the burger menu on all existing pages

**Files:**
- Modify: `index.html`, `entry.html`, `history.html`, `expense.html`, `statement.html`, `storage.html`, `outofstock.html`, `generate_bill.html` (8 files, `data-num` format)
- Modify: `passport_photo_generator.html`, `collage.html` (2 files, emoji-prefixed format, no `data-num`)

**Interfaces:**
- None — this is a pure markup change, no JS/data interface produced or consumed. (`rent_income.html`'s own nav was already built correct in Task 2 — this task does not touch it.)

- [ ] **Step 1: Update the 8 `data-num` pages**

In each of `index.html`, `entry.html`, `history.html`, `expense.html`, `statement.html`, `storage.html`, `outofstock.html`, `generate_bill.html`, find this exact block (confirmed identical across all 8 as of this plan being written — verify it's still identical before editing, since drift is possible):

```html
                <a href="statement.html" data-num="04">Statement</a>
                <a href="storage.html" data-num="05">Manage Storage</a>
                <a href="outofstock.html" data-num="06">Out of Stock</a>
                <a href="passport_photo_generator.html" data-num="07">Passport Photo</a>
                <a href="collage.html" data-num="08">Collage</a>
                <a href="generate_bill.html" data-num="09">Generate Bill</a>
```

Replace with:

```html
                <a href="rent_income.html" data-num="04">Rent Income</a>
                <a href="statement.html" data-num="05">Statement</a>
                <a href="storage.html" data-num="06">Manage Storage</a>
                <a href="outofstock.html" data-num="07">Out of Stock</a>
                <a href="passport_photo_generator.html" data-num="08">Passport Photo</a>
                <a href="collage.html" data-num="09">Collage</a>
                <a href="generate_bill.html" data-num="10">Generate Bill</a>
```

(The `Expenses` line above this block, `data-num="03"`, is unchanged — Rent Income is inserted right after it.)

- [ ] **Step 2: Update the 2 emoji-format pages**

In both `passport_photo_generator.html` and `collage.html`, find:

```html
                <a href="expense.html">💸 Expenses</a>
                <a href="statement.html">📒 Statement</a>
```

Replace with:

```html
                <a href="expense.html">💸 Expenses</a>
                <a href="rent_income.html">🏠 Rent Income</a>
                <a href="statement.html">📒 Statement</a>
```

- [ ] **Step 3: Verify**

```bash
grep -l 'data-num="10">Generate Bill' /Users/dhiraj/Documents/TestVibe/*.html
```

Expected: exactly 9 files (the 8 modified in Step 1 plus `rent_income.html` from Task 2, which was already built with this numbering).

```bash
grep -c 'rent_income.html' /Users/dhiraj/Documents/TestVibe/index.html /Users/dhiraj/Documents/TestVibe/entry.html /Users/dhiraj/Documents/TestVibe/history.html /Users/dhiraj/Documents/TestVibe/expense.html /Users/dhiraj/Documents/TestVibe/statement.html /Users/dhiraj/Documents/TestVibe/storage.html /Users/dhiraj/Documents/TestVibe/outofstock.html /Users/dhiraj/Documents/TestVibe/generate_bill.html /Users/dhiraj/Documents/TestVibe/passport_photo_generator.html /Users/dhiraj/Documents/TestVibe/collage.html /Users/dhiraj/Documents/TestVibe/rent_income.html
```

Expected: `1` for every file (each links to `rent_income.html` exactly once in its nav — `rent_income.html` itself will show `1` too, from its own self-referencing nav link built in Task 2).

Serve locally and click through the burger menu on at least 2 of the modified pages (one `data-num` page, one emoji page) to confirm "Rent Income" appears in the right position and navigates correctly:

```bash
cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765
```

Open `http://localhost:8765/index.html` and `http://localhost:8765/collage.html`, open the burger menu on each, confirm "Rent Income" is present and clicking it loads `rent_income.html`. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add index.html entry.html history.html expense.html statement.html storage.html outofstock.html generate_bill.html passport_photo_generator.html collage.html
git commit -m "Add Rent Income to the burger menu on all existing pages"
```
