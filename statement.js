// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Statement.js loaded successfully');

// ----- Seed opening balances (as of SEED_MONTH start) -----
// Closing of one month = opening of the next, so we compute carry-forward
// dynamically from this seed.
const SEED_YEAR = 2026;
const SEED_MONTH_INDEX = 4; // May (0-indexed)
const SEED_OPENING = {
    'BoB':    122965.09,
    'AP Cash': -65662.00
};

// ----- Indian number formatter -----
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const parts = n.split('.');
    const integerPart = parts[0].replace('-', '');
    const sign = parseFloat(n) < 0 ? '-' : '';
    const decimalPart = parts[1];

    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);

    if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
    }

    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return sign + formatted + '.' + decimalPart;
}

// ----- DOM -----
const accountTypeEl = document.getElementById('accountType');
const statementContainerEl = document.getElementById('statementContainer');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

// ----- Helpers -----
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

function pad2(n) { return String(n).padStart(2, '0'); }

function ymd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function ddmmyyyy(dateStr) {
    // For date-only strings (YYYY-MM-DD) - parse as local date
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return `${pad2(d)}/${pad2(m)}/${y}`;
    }
    const d = new Date(dateStr);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function monthBounds(date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    // Local-time start of selected month (00:00 local)
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    // Local-time start of NEXT month (exclusive upper bound)
    const nextStart = new Date(y, m + 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = new Date(y, m, lastDay);
    return {
        startStr: ymd(start),       // YYYY-MM-DD for DATE columns
        endStr: ymd(end),
        startIso: start.toISOString(),       // absolute UTC ISO for TIMESTAMPTZ
        nextStartIso: nextStart.toISOString()
    };
}

// ----- Pull credits (income) for a given range -----
// BoB credit per day = upi_amount + card_amount from daily_entries.
// AP Cash credit per day = ap_cash from daily_entries.
async function fetchCredits(account, startStr, endStr) {
    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('date, upi_amount, card_amount, ap_cash')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true });

    if (error) {
        console.error('❌ Error fetching credits:', error);
        return [];
    }

    const rows = (data || []).map(e => {
        let amount = 0;
        if (account === 'BoB') {
            amount = (parseFloat(e.upi_amount) || 0) + (parseFloat(e.card_amount) || 0);
        } else if (account === 'AP Cash') {
            amount = parseFloat(e.ap_cash) || 0;
        }
        return {
            date: e.date,
            sortKey: e.date + ' 00:00:00',
            type: 'credit',
            description: `Income for ${ddmmyyyy(e.date)}`,
            amount
        };
    }).filter(r => r.amount > 0);

    return rows;
}

// ----- Pull debits (expenses) for a given range -----
// Date used = created_at (interpreted in the user's LOCAL timezone).
// Filtered by paid_from.
async function fetchDebits(account, startIso, nextStartIso) {
    const paidFrom = account === 'BoB' ? 'Bank' : 'AP Cash';

    const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .eq('paid_from', paidFrom)
        .gte('created_at', startIso)
        .lt('created_at', nextStartIso)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error fetching debits:', error);
        return [];
    }

    // Belt-and-suspenders: filter again in JS by the LOCAL calendar month so
    // any timezone weirdness on the server side can't leak adjacent-month rows.
    const startMs = new Date(startIso).getTime();
    const endMs   = new Date(nextStartIso).getTime();

    return (data || [])
        .filter(e => {
            if (!e.created_at) return false;
            const t = new Date(e.created_at).getTime();
            return t >= startMs && t < endMs;
        })
        .map(e => {
            const dt = new Date(e.created_at);
            // Build YYYY-MM-DD using the LOCAL parts of the timestamp
            const localDateStr = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
            return {
                date: localDateStr,
                sortKey: e.created_at,
                type: 'debit',
                description: e.description || (e.expense_by ? `Expense by ${e.expense_by}` : 'Expense'),
                amount: parseFloat(e.amount) || 0
            };
        });
}

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
        type: (e.type || '').trim().toLowerCase(), // entered by hand, no validation — a real prod row had "Credit" (capital C); normalize so downstream === 'credit' checks still hold
        description: e.description || 'Adjustment',
        amount: parseFloat(e.amount) || 0
    }));
}

// ----- Compute opening balance for a given month by walking from the seed -----
async function computeOpeningBalance(account, selectedMonth) {
    const seedStart = new Date(SEED_YEAR, SEED_MONTH_INDEX, 1);
    const selectedStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);

    // If we're at or before the seed month, opening = seed value.
    if (selectedStart <= seedStart) {
        return SEED_OPENING[account] || 0;
    }

    // Walk from seed up through the month BEFORE the selected month, accumulating
    // closing balances.
    let balance = SEED_OPENING[account] || 0;
    const cursor = new Date(seedStart);

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

    return balance;
}

// ----- Render the ledger for the selected account & month -----
async function renderStatement(account) {
    if (!account) {
        statementContainerEl.innerHTML = '';
        return;
    }

    statementContainerEl.innerHTML = '<div class="loading-spinner">Loading statement...</div>';
    pageLoader.classList.remove('hidden');

    try {
        const selectedMonth = getSelectedMonth();
        const { startStr, endStr, startIso, nextStartIso } = monthBounds(selectedMonth);

        const [openingBalance, credits, debits, adjustments] = await Promise.all([
            computeOpeningBalance(account, selectedMonth),
            fetchCredits(account, startStr, endStr),
            fetchDebits(account, startIso, nextStartIso),
            fetchAdjustments(account, startStr, endStr)
        ]);

        // Combine and sort: by date ascending, credits before debits on same date.
        const txns = [...credits, ...debits, ...adjustments].sort((a, b) => {
            if (a.sortKey < b.sortKey) return -1;
            if (a.sortKey > b.sortKey) return  1;
            if (a.type === b.type) return 0;
            return a.type === 'credit' ? -1 : 1;
        });

        // Compute running balance
        let running = openingBalance;
        const txnRows = txns.map(t => {
            if (t.type === 'credit') running += t.amount;
            else running -= t.amount;
            return { ...t, balanceAfter: running };
        });

        const totalCredit = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
        const totalDebit  = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
        const closingBalance = openingBalance + totalCredit - totalDebit;

        // Opening Balance is dated as the 1st of the selected month
        const openingDateStr = startStr;

        const summaryHTML = `
            <div class="ledger-summary">
                <div class="summary-card opening">
                    <div class="label">Opening Balance</div>
                    <div class="value">₹${formatIndianNumber(openingBalance)}</div>
                </div>
                <div class="summary-card credit">
                    <div class="label">Total Credit</div>
                    <div class="value">₹${formatIndianNumber(totalCredit)}</div>
                </div>
                <div class="summary-card debit">
                    <div class="label">Total Debit</div>
                    <div class="value">₹${formatIndianNumber(totalDebit)}</div>
                </div>
                <div class="summary-card closing" style="grid-column: 1 / -1;">
                    <div class="label">Closing Balance</div>
                    <div class="value">₹${formatIndianNumber(closingBalance)}</div>
                </div>
            </div>
        `;

        const txnHTML = txnRows.map(t => `
            <tr>
                <td class="date">${ddmmyyyy(t.date)}</td>
                <td class="description">${escapeHtml(t.description)}</td>
                <td class="amount debit">${t.type === 'debit'  ? '₹' + formatIndianNumber(t.amount) : '<span class="muted">—</span>'}</td>
                <td class="amount credit">${t.type === 'credit' ? '₹' + formatIndianNumber(t.amount) : '<span class="muted">—</span>'}</td>
                <td class="amount balance">₹${formatIndianNumber(t.balanceAfter)}</td>
            </tr>
        `).join('');

        const ledgerHTML = `
            ${summaryHTML}
            <div class="ledger-wrapper">
                <table class="ledger-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th class="amount">Debit</th>
                            <th class="amount">Credit</th>
                            <th class="amount">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="opening-row">
                            <td class="date">${ddmmyyyy(openingDateStr)}</td>
                            <td class="description">Opening Balance</td>
                            <td class="amount"><span class="muted">—</span></td>
                            <td class="amount"><span class="muted">—</span></td>
                            <td class="amount balance">₹${formatIndianNumber(openingBalance)}</td>
                        </tr>
                        ${txnRows.length === 0 ? `
                            <tr>
                                <td colspan="5" style="text-align:center; padding: 20px; color:#a0aec0;">
                                    No transactions for this month.
                                </td>
                            </tr>
                        ` : txnHTML}
                        <tr class="closing-row">
                            <td class="date">${ddmmyyyy(endStr)}</td>
                            <td class="description">Closing Balance</td>
                            <td class="amount">₹${formatIndianNumber(totalDebit)}</td>
                            <td class="amount">₹${formatIndianNumber(totalCredit)}</td>
                            <td class="amount balance">₹${formatIndianNumber(closingBalance)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        statementContainerEl.innerHTML = ledgerHTML;
    } catch (err) {
        console.error('❌ Error rendering statement:', err);
        statementContainerEl.innerHTML = `
            <div class="statement-empty">
                <p style="color:#c53030;">Error loading statement: ${escapeHtml(err.message || String(err))}</p>
            </div>
        `;
    } finally {
        pageLoader.classList.add('hidden');
    }
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

// ----- Init -----
async function init() {
    console.log('🚀 Loading statement page...');

    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    const selectedMonth = getSelectedMonth();
    currentMonthLabelEl.textContent = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    accountTypeEl.addEventListener('change', (e) => renderStatement(e.target.value));

    // No account selected by default — keep empty.
    statementContainerEl.innerHTML = '';
    pageLoader.classList.add('hidden');
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

document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    init();
});
