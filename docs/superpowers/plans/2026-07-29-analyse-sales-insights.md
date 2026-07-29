# Analyse Sales — Insights Page (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only `analyse_sales.html` insights page over the existing `sales_log` table — item-name merging (automatic + confirmed manual), a Period toggle, real Chart.js charts, top/bottom item rankings, and a real (not mocked) Hinglish Q&A box backed by a new serverless function — reachable via a new "Insights" button on the Sales Log page.

**Architecture:** All computation (fetching, merging, aggregating) happens client-side in `analyse_sales.js` against `sales_log` rows fetched directly from Supabase, exactly like every other page in this app. A second serverless function, `api/ask-sales-insights.js`, mirrors `api/ocr-sales.js`'s pattern (Anthropic proxy, key stays server-side) for the Q&A box — it receives a compact JSON summary of already-computed insights, never raw rows.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (CDN), Chart.js 4.4.1 (CDN, same version `dashboard.html` already loads), a Node.js Vercel serverless function using native `fetch` (no new dependency).

## Global Constraints

- No new Supabase table — reads only from the existing `sales_log` table (Task 1/Task 2 of the prior Sales Log plan).
- No new `ANTHROPIC_API_KEY` setup — it's already configured on this Vercel project for all three environments from the Sales Log feature.
- `analyse_sales.html` is **not** added to any burger menu, on this page or any other (confirmed decision) — it carries the exact same standard 11-item burger-menu nav every other page currently has (for its own navigability), but no other file's nav gains an "Insights" entry.
- The item-merging algorithm, its exact code, and the three confirmed `SYNONYM_GROUPS` entries are fixed by the approved spec (`docs/superpowers/specs/2026-07-29-analyse-sales-insights-design.md`) — implement it verbatim, do not "improve" the thresholds or matching rules.
- The compound-entry exclusion rule (never merge a normalized item if every raw diary line it came from contains a comma) is a hard requirement, not a heuristic to relax.
- `/api/ask-sales-insights` receives only the compact context summary described below — never raw `sales_log` rows (keeps the prompt small and avoids sending the shop's full sales history verbatim on every question).
- This project has no automated test framework — verification is manual: `vercel dev` for anything touching `/api`, plain static server otherwise, live Supabase for data, real diary-derived test rows chosen specifically to exercise both merge layers and the compound-exclusion rule.

---

### Task 1: Build the `/api/ask-sales-insights` serverless function

**Files:**
- Create: `api/ask-sales-insights.js`

**Interfaces:**
- Consumes: `process.env.ANTHROPIC_API_KEY` (already set).
- Produces: `POST /api/ask-sales-insights` accepting `{ question: string, context: object }`, responding `{ answer: string }` on success or `{ error: string }` with a 4xx/5xx status on failure.

- [ ] **Step 1: Write `api/ask-sales-insights.js`**

```js
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

function buildPrompt(question, context) {
    return `You are answering a shopkeeper's question about their sales data, in Hinglish (Hindi written in Latin/Roman script, mixed naturally with English — not pure Hindi script, not pure English).

Here is a summary of their sales data for the period "${context.period}":
${JSON.stringify(context, null, 2)}

Rules:
- Answer ONLY using the numbers in the JSON above. Never invent or guess figures not present there.
- Respond in Hinglish, written in Roman/Latin script.
- Keep the answer to 1-2 sentences — short and direct, not a report.
- If the question cannot be answered from the data above (asks about something outside this summary), say so honestly in Hinglish rather than guessing.

Question: ${question}

Respond with ONLY the answer text, no preamble, no markdown formatting.`;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        res.status(500).json({ error: 'Server is not configured with an Anthropic API key.' });
        return;
    }

    const { question, context } = req.body || {};

    if (typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Request body must include a non-empty "question" string.' });
        return;
    }
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        res.status(400).json({ error: 'Request body must include a "context" object.' });
        return;
    }

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 512,
                messages: [{ role: 'user', content: buildPrompt(question, context) }]
            })
        });

        const json = await response.json();

        if (!response.ok) {
            console.error('❌ Anthropic API error:', json);
            res.status(502).json({ error: 'Could not get an answer from the AI service.' });
            return;
        }

        const textBlock = Array.isArray(json.content) ? json.content.find(block => block && block.type === 'text') : null;
        const answer = textBlock && textBlock.text ? textBlock.text.trim() : '';

        if (!answer) {
            res.status(502).json({ error: 'AI service returned no answer text.' });
            return;
        }

        res.status(200).json({ answer });
    } catch (err) {
        console.error('❌ Error calling Anthropic API:', err);
        res.status(502).json({ error: 'Could not reach the AI service.' });
    }
};
```

Note: this picks the `type === 'text'` content block explicitly from the start (not `content[0]`) — `api/ocr-sales.js` shipped with the `content[0]` bug and it was found the hard way during Sales Log's Task 3; don't repeat it here.

- [ ] **Step 2: Verify via `vercel dev`**

```bash
cd /Users/dhiraj/Documents/TestVibe && vercel dev --listen 3111 --yes &
sleep 5
```

Success case:

```bash
curl -s -X POST http://localhost:3111/api/ask-sales-insights \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Sabse zyada kya bikta hai?",
    "context": {
      "period": "Till Date",
      "totalItemsSold": 362,
      "distinctItems": 168,
      "topByQuantity": [
        {"display": "Print", "count": 43, "revenue": 1214},
        {"display": "Pen", "count": 39, "revenue": 2796},
        {"display": "Stationery", "count": 22, "revenue": 3602}
      ]
    }
  }'
```

Expected: HTTP 200, `{"answer": "..."}` with a short Hinglish-ish response that references "Print" (the top item in the provided context) — read it and confirm it makes sense as an answer to the question, not just that JSON parsed.

Error paths:

```bash
curl -s -X POST http://localhost:3111/api/ask-sales-insights -H "Content-Type: application/json" -d '{"context": {}}'
# Expected: HTTP 400, missing "question"

curl -s -X POST http://localhost:3111/api/ask-sales-insights -H "Content-Type: application/json" -d '{"question": "test"}'
# Expected: HTTP 400, missing "context"

curl -s http://localhost:3111/api/ask-sales-insights
# Expected: HTTP 405
```

Stop `vercel dev` when done.

- [ ] **Step 3: Commit**

```bash
git add api/ask-sales-insights.js
git commit -m "Add /api/ask-sales-insights serverless function for the Hinglish Q&A box"
```

---

### Task 2: Build the Analyse Sales page — insights display (Ask box present but inert)

**Files:**
- Create: `analyse_sales.html`
- Create: `analyse_sales.js`
- Create: `analyse_sales-style.css`

**Interfaces:**
- Consumes: `sales_log` table via `supabaseClient`.
- Produces: `clusterItems(rows)` and its helpers (`normalizeItem`, `compactItem`, `singularItem`, `similarityRatio`, `SYNONYM_GROUPS`) — Task 3 does not need these directly, but they must exist under these exact names since Task 3's report references them. Also produces the Ask-in-Hinglish markup (`#askForm`, `#askInput`, `#askSendBtn`, `#askAnswer`) with only a `preventDefault`-only submit handler — Task 3 replaces that handler with the real one.

- [ ] **Step 1: Write `analyse_sales.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analyse Sales - Pen & Play Club</title>
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="analyse_sales-style.css">
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
                    <p class="subtitle">Analyse Sales</p>
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
                <a href="sales_log.html" data-num="11">Sales Log</a>
                <button id="darkModeToggle" class="dark-mode-toggle-btn">🌙 Dark Mode</button>
            </nav>
        </div>

        <main>
            <div class="back-to-dashboard">
                <a href="index.html">« Back To Dashboard</a>
            </div>

            <!-- Period Toggle -->
            <div class="period-toggle">
                <button type="button" class="period-btn active" data-period="till-date" id="periodTillDateBtn">Till Date</button>
                <button type="button" class="period-btn" data-period="viewing-month" id="periodViewingMonthBtn">Viewing Month</button>
            </div>
            <p class="period-context" id="periodContext">Loading…</p>

            <p class="empty-state hidden" id="loadErrorMsg"></p>

            <!-- KPI tiles -->
            <section>
                <div class="kpi-grid">
                    <div class="kpi-tile">
                        <p class="kpi-label">Items Sold</p>
                        <p class="kpi-value" id="kpiItemsSold">—</p>
                    </div>
                    <div class="kpi-tile">
                        <p class="kpi-label">Distinct Items</p>
                        <p class="kpi-value" id="kpiDistinctItems">—<span class="was" id="kpiDistinctItemsSub"></span></p>
                    </div>
                    <div class="kpi-tile">
                        <p class="kpi-label">Avg Items / Day</p>
                        <p class="kpi-value" id="kpiAvgPerDay">—</p>
                    </div>
                    <div class="kpi-tile">
                        <p class="kpi-label">Days Captured</p>
                        <p class="kpi-value" id="kpiDaysCaptured">—</p>
                    </div>
                </div>
            </section>

            <!-- Daily trend -->
            <section>
                <h2>Daily Items Sold</h2>
                <p class="section-sub">Number of items sold per captured day</p>
                <div class="chart-container">
                    <canvas id="dailyTrendCanvas"></canvas>
                </div>
            </section>

            <!-- Top 10 by revenue -->
            <section>
                <h2>Top 10 Selling Items (By Revenue)</h2>
                <p class="section-sub">The only revenue-based view on this page — everything else is quantity-based</p>
                <div class="chart-container tall">
                    <canvas id="topRevenueCanvas"></canvas>
                </div>
            </section>

            <!-- Top 10 by quantity -->
            <section>
                <h2>Top 10 Selling Items (By Quantity)</h2>
                <p class="section-sub">Sold the most times — not always the same items as by revenue</p>
                <div class="chart-container tall">
                    <canvas id="topQuantityCanvas"></canvas>
                </div>
            </section>

            <!-- Bottom 10 -->
            <section>
                <h2>Bottom 10 Selling Items</h2>
                <p class="section-sub">Lowest quantity in the period — one-off or slow-moving items</p>
                <div class="table-wrap">
                    <table class="plain" id="bottomTable">
                        <thead>
                            <tr><th>Item</th><th class="num">Times Sold</th></tr>
                        </thead>
                        <tbody id="bottomTableBody"></tbody>
                    </table>
                </div>
            </section>

            <!-- Auto-merged panel -->
            <section>
                <div class="callout">
                    <div class="callout-head">
                        <span class="callout-flag">Auto-merged</span>
                        <span class="callout-title">Spelling &amp; typo matches</span>
                    </div>
                    <p class="section-sub" style="margin-bottom:0;">Caught automatically — same text once trimmed, plural vs singular, spacing-only differences, or a close typo match:</p>
                    <div class="merge-list" id="autoMergeList"></div>
                </div>
            </section>

            <!-- Manual synonym panel -->
            <section>
                <div class="callout callout-olive">
                    <div class="callout-head">
                        <span class="callout-flag callout-flag-neutral">You confirmed</span>
                        <span class="callout-title">Same item, different words</span>
                    </div>
                    <p class="section-sub" style="margin-bottom:0;">Different words for the same real item — text-similarity alone can't catch these, so they're a maintained list:</p>
                    <div class="merge-list" id="manualMergeList"></div>
                    <p class="callout-note">Multi-item diary lines (e.g. "Study Table, Car") are always excluded from automatic merging, so a word inside one never gets pulled into an unrelated single-item cluster like "Car."</p>
                </div>
            </section>

            <!-- Ask in Hinglish -->
            <section class="ask-section">
                <h2>Ask in Hinglish</h2>
                <p class="section-sub">Type a question about your sales the way you'd actually ask it</p>
                <form id="askForm" class="ask-box">
                    <div class="ask-input-row">
                        <input type="text" id="askInput" class="ask-input" placeholder="Sabse zyada kya bikta hai?" autocomplete="off">
                        <button type="submit" id="askSendBtn" class="ask-send">Poochho</button>
                    </div>
                </form>
                <div id="askAnswer" class="ask-answer hidden"></div>
            </section>
        </main>
    </div>

    <!-- Supabase SDK -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
    <script src="auth.js"></script>
    <script src="analyse_sales.js"></script>
    <!-- Vercel Speed Insights -->
    <script>
        window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `analyse_sales.js`**

```js
// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Analyse Sales.js loaded successfully');

// ----- Formatting helpers -----
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const parts = n.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    if (otherNumbers !== '') lastThree = ',' + lastThree;
    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return formatted + '.' + decimalPart;
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

function getCssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) return new Date(savedMonth);
    return new Date();
}

// ----- Item-merging algorithm (see design spec for validation history) -----
function normalizeItem(s) {
    s = s.trim().toLowerCase();
    s = s.replace(/[.,/]/g, '');
    s = s.replace(/\s+/g, ' ');
    return s;
}

function compactItem(s) {
    return s.replace(/\s+/g, '');
}

function singularItem(s) {
    if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
    return s;
}

const SYNONYM_GROUPS = [
    ['print', 'p out'],
    ['rapping', 'packing', 'gift packing'],
    ['stationery', 'stat'],
];

// Ratcliff/Obershelp similarity ratio — matches Python's difflib.SequenceMatcher.ratio()
function similarityRatio(a, b) {
    function findLongestMatch(aStr, bStr) {
        let best = { aStart: 0, bStart: 0, size: 0 };
        for (let i = 0; i < aStr.length; i++) {
            for (let j = 0; j < bStr.length; j++) {
                let k = 0;
                while (i + k < aStr.length && j + k < bStr.length && aStr[i + k] === bStr[j + k]) k++;
                if (k > best.size) best = { aStart: i, bStart: j, size: k };
            }
        }
        return best;
    }
    function matchBlocks(aStr, bStr) {
        const match = findLongestMatch(aStr, bStr);
        if (match.size === 0) return 0;
        let total = match.size;
        if (match.aStart > 0 && match.bStart > 0) {
            total += matchBlocks(aStr.slice(0, match.aStart), bStr.slice(0, match.bStart));
        }
        if (match.aStart + match.size < aStr.length && match.bStart + match.size < bStr.length) {
            total += matchBlocks(aStr.slice(match.aStart + match.size), bStr.slice(match.bStart + match.size));
        }
        return total;
    }
    if (a.length === 0 && b.length === 0) return 1;
    const m = matchBlocks(a, b);
    return (2 * m) / (a.length + b.length);
}

// rows: sales_log rows for the current period.
// Returns: [{ display, count, revenue, variants: string[], manual: boolean }]
function clusterItems(rows) {
    const rawByNorm = new Map();
    rows.forEach(r => {
        const norm = normalizeItem(r.item);
        if (!rawByNorm.has(norm)) rawByNorm.set(norm, new Set());
        rawByNorm.get(norm).add(r.item.trim());
    });

    const norms = Array.from(rawByNorm.keys());
    const parent = new Map(norms.map(n => [n, n]));
    function find(x) {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    const compoundOnly = new Set();
    norms.forEach(n => {
        const raws = Array.from(rawByNorm.get(n));
        if (raws.every(r => r.includes(','))) compoundOnly.add(n);
    });

    for (let i = 0; i < norms.length; i++) {
        for (let j = i + 1; j < norms.length; j++) {
            const a = norms[i], b = norms[j];
            if (compoundOnly.has(a) || compoundOnly.has(b)) continue;
            if (a === b) { union(a, b); continue; }
            if (singularItem(a) === singularItem(b)) { union(a, b); continue; }
            if (compactItem(a) === compactItem(b)) { union(a, b); continue; }
            if (Math.min(a.length, b.length) >= 5 && similarityRatio(a, b) >= 0.86) {
                union(a, b);
            }
        }
    }

    // Snapshot Layer-1-only roots before the synonym pass, so we can tell
    // afterward which final clusters exist ONLY because of a manual merge.
    const layer1Root = new Map();
    norms.forEach(n => layer1Root.set(n, find(n)));

    SYNONYM_GROUPS.forEach(group => {
        const present = group.filter(g => parent.has(g));
        for (let k = 1; k < present.length; k++) union(present[k], present[0]);
    });

    const finalRootToLayer1Roots = new Map();
    norms.forEach(n => {
        const finalRoot = find(n);
        if (!finalRootToLayer1Roots.has(finalRoot)) finalRootToLayer1Roots.set(finalRoot, new Set());
        finalRootToLayer1Roots.get(finalRoot).add(layer1Root.get(n));
    });
    const manualRoots = new Set();
    finalRootToLayer1Roots.forEach((l1roots, finalRoot) => {
        if (l1roots.size > 1) manualRoots.add(finalRoot);
    });

    const clusters = new Map();
    rows.forEach(r => {
        const root = find(normalizeItem(r.item));
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(r);
    });

    const result = [];
    clusters.forEach((clusterRows, root) => {
        const rawCounts = new Map();
        clusterRows.forEach(r => {
            const raw = r.item.trim();
            rawCounts.set(raw, (rawCounts.get(raw) || 0) + 1);
        });
        let display = '', maxCount = -1;
        rawCounts.forEach((count, raw) => { if (count > maxCount) { maxCount = count; display = raw; } });
        const variants = Array.from(rawCounts.keys()).filter(r => r !== display);
        const revenue = clusterRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        result.push({ display, count: clusterRows.length, revenue, variants, manual: manualRoots.has(root) });
    });

    return result;
}

// ----- DOM -----
const periodTillDateBtn = document.getElementById('periodTillDateBtn');
const periodViewingMonthBtn = document.getElementById('periodViewingMonthBtn');
const periodContextEl = document.getElementById('periodContext');
const loadErrorMsgEl = document.getElementById('loadErrorMsg');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

const kpiItemsSoldEl = document.getElementById('kpiItemsSold');
const kpiDistinctItemsEl = document.getElementById('kpiDistinctItems');
const kpiDistinctItemsSubEl = document.getElementById('kpiDistinctItemsSub');
const kpiAvgPerDayEl = document.getElementById('kpiAvgPerDay');
const kpiDaysCapturedEl = document.getElementById('kpiDaysCaptured');

const bottomTableBodyEl = document.getElementById('bottomTableBody');
const autoMergeListEl = document.getElementById('autoMergeList');
const manualMergeListEl = document.getElementById('manualMergeList');

const askForm = document.getElementById('askForm');

let currentPeriod = 'till-date';
let currentStats = null;
let dailyTrendChart = null;
let topRevenueChart = null;
let topQuantityChart = null;

// ----- Data fetch -----
async function fetchSalesData(period) {
    let query = supabaseClient.from('sales_log').select('*').order('entry_date', { ascending: true });
    if (period === 'viewing-month') {
        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;
        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;
        query = query.gte('entry_date', startDate).lte('entry_date', endDate);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// ----- Stats -----
function computeStats(rows, clusters) {
    const totalItemsSold = rows.length;
    const rawDistinct = new Set(rows.map(r => normalizeItem(r.item))).size;
    const distinctItems = clusters.length;

    const dailyMap = new Map();
    rows.forEach(r => {
        dailyMap.set(r.entry_date, (dailyMap.get(r.entry_date) || 0) + 1);
    });
    const dailyCounts = Array.from(dailyMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const daysCaptured = dailyCounts.length;
    const avgPerDay = daysCaptured > 0 ? Math.round(totalItemsSold / daysCaptured) : 0;

    const byRevenue = clusters.slice().sort((a, b) => b.revenue - a.revenue);
    const byQuantity = clusters.slice().sort((a, b) => b.count - a.count);
    const bottomItems = clusters.slice().sort((a, b) => a.count - b.count).slice(0, 10);

    return { totalItemsSold, rawDistinct, distinctItems, dailyCounts, daysCaptured, avgPerDay, byRevenue, byQuantity, bottomItems };
}

// ----- Rendering -----
function renderKpis(stats) {
    kpiItemsSoldEl.textContent = stats.totalItemsSold;
    kpiDistinctItemsEl.textContent = stats.distinctItems;
    kpiDistinctItemsSubEl.textContent = `${stats.rawDistinct} as written, merged`;
    kpiAvgPerDayEl.textContent = stats.avgPerDay;
    kpiDaysCapturedEl.textContent = stats.daysCaptured;
}

function renderDailyTrendChart(dailyCounts) {
    const canvas = document.getElementById('dailyTrendCanvas');
    const olive = getCssVar('--olive');
    if (dailyTrendChart) dailyTrendChart.destroy();
    dailyTrendChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dailyCounts.map(d => new Date(d.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })),
            datasets: [{
                label: 'Items Sold',
                data: dailyCounts.map(d => d.count),
                borderColor: olive,
                backgroundColor: hexToRgba(olive, 0.18),
                fill: true,
                tension: 0.25,
                pointRadius: 3,
                pointBackgroundColor: olive
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                x: { grid: { display: false }, ticks: { color: getCssVar('--ink-faint') } }
            }
        }
    });
}

function renderTopChart(canvasId, existingChart, clusters, color, valueKey, formatValue) {
    if (existingChart) existingChart.destroy();
    const canvas = document.getElementById(canvasId);
    // Reversed so #1 (first in the already-sorted-descending array) renders at the top —
    // Chart.js horizontal bars (indexAxis: 'y') plot the first label at the bottom otherwise.
    const ordered = clusters.slice(0, 10).slice().reverse();
    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ordered.map(c => c.display),
            datasets: [{
                data: ordered.map(c => c[valueKey]),
                backgroundColor: color,
                borderRadius: 3,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => formatValue(item.raw) } }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                y: { grid: { display: false }, ticks: { color: getCssVar('--ink-soft') } }
            }
        }
    });
}

function renderBottomTable(bottomItems) {
    bottomTableBodyEl.innerHTML = bottomItems.map(c => `
        <tr>
            <td>${escapeHtml(c.display)}</td>
            <td class="num">${c.count}×</td>
        </tr>
    `).join('');
}

function mergeRowHtml(c) {
    const variantText = c.variants.length > 2
        ? `${escapeHtml(c.variants[0])}, +${c.variants.length - 1} more`
        : c.variants.map(escapeHtml).join(', ');
    return `
        <div class="merge-row">
            <span class="merge-names">${escapeHtml(c.display)}<span class="plus">+</span>${variantText}</span>
            <span class="merge-qty">${c.count}×</span>
        </div>
    `;
}

function renderMergePanels(clusters) {
    const merged = clusters.filter(c => c.variants.length > 0);
    const auto = merged.filter(c => !c.manual).sort((a, b) => b.count - a.count);
    const manual = merged.filter(c => c.manual).sort((a, b) => b.count - a.count);

    autoMergeListEl.innerHTML = auto.length > 0
        ? auto.map(mergeRowHtml).join('')
        : '<div class="empty-state">No spelling variants found in this period.</div>';

    manualMergeListEl.innerHTML = manual.length > 0
        ? manual.map(mergeRowHtml).join('')
        : '<div class="empty-state">No confirmed synonym merges applied in this period.</div>';
}

function updatePeriodContext() {
    if (currentPeriod === 'viewing-month') {
        const selectedMonth = getSelectedMonth();
        periodContextEl.textContent = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
        periodContextEl.textContent = 'All captured data';
    }
}

// ----- Orchestration -----
async function loadAndRender() {
    pageLoader.classList.remove('hidden');
    loadErrorMsgEl.classList.add('hidden');
    updatePeriodContext();
    try {
        const rows = await fetchSalesData(currentPeriod);
        const clusters = clusterItems(rows);
        currentStats = computeStats(rows, clusters);

        renderKpis(currentStats);
        renderDailyTrendChart(currentStats.dailyCounts);
        topRevenueChart = renderTopChart('topRevenueCanvas', topRevenueChart, currentStats.byRevenue, getCssVar('--olive'), 'revenue', v => '₹' + formatIndianNumber(v));
        topQuantityChart = renderTopChart('topQuantityCanvas', topQuantityChart, currentStats.byQuantity, getCssVar('--blue'), 'count', v => v + '×');
        renderBottomTable(currentStats.bottomItems);
        renderMergePanels(clusters);
    } catch (err) {
        console.error('❌ Error loading sales insights:', err);
        loadErrorMsgEl.textContent = 'Error loading sales data: ' + err.message;
        loadErrorMsgEl.classList.remove('hidden');
    } finally {
        pageLoader.classList.add('hidden');
    }
}

function initPeriodToggle() {
    [periodTillDateBtn, periodViewingMonthBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            [periodTillDateBtn, periodViewingMonthBtn].forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            loadAndRender();
        });
    });
}

// Ask in Hinglish — inert for now, Task 3 replaces this handler with the real one.
askForm.addEventListener('submit', (e) => { e.preventDefault(); });

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
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    loadAndRender();
});
```

- [ ] **Step 3: Write `analyse_sales-style.css`**

```css
/* ─────────────────────────────────────────────
   WASHI — Analyse Sales Page
   ───────────────────────────────────────────── */

/* ─── Period Toggle ────────────────────────── */
.period-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
}

.period-btn {
    font-family: var(--mono);
    font-size: 11.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
    background: var(--cream-mid);
    border: 1px solid var(--rule-mid);
    padding: 7px 14px;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.15s;
}

.period-btn.active {
    color: var(--cream);
    background: var(--olive);
    border-color: var(--olive);
}

.period-btn:hover:not(.active) { border-color: var(--olive); color: var(--olive); }

.period-context {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-faint);
    margin: 6px 0 18px;
}

/* ─── Sections ─────────────────────────────── */
section {
    padding: 20px 0;
    border-bottom: 1px solid var(--rule);
}
section:last-of-type { border-bottom: none; }

h2 {
    font-family: var(--serif);
    font-size: 19px;
    font-weight: 600;
    font-style: italic;
    color: var(--ink);
    margin: 0 0 4px;
}

.section-sub {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-faint);
    margin: 0 0 12px;
    letter-spacing: 0.01em;
}

/* ─── KPI tiles ────────────────────────────── */
.kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--rule-mid);
    border: 1px solid var(--rule-mid);
}

.kpi-tile { background: var(--cream); padding: 16px 14px; }

.kpi-label {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin: 0 0 6px;
}

.kpi-value {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 21px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.01em;
}

.kpi-value .was { font-size: 11px; font-weight: 400; color: var(--ink-faint); display: block; margin-top: 2px; }

/* ─── Charts ───────────────────────────────── */
.chart-container { position: relative; height: 220px; margin-top: 4px; }
.chart-container.tall { height: 300px; }

/* ─── Table ────────────────────────────────── */
.table-wrap { overflow-x: auto; }

table.plain { width: 100%; border-collapse: collapse; }

table.plain th {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    text-align: left;
    padding: 0 8px 8px 0;
    border-bottom: 1.5px solid var(--ink);
    font-weight: 500;
}
table.plain th.num { text-align: right; padding-right: 0; }

table.plain td {
    font-family: var(--serif);
    font-style: italic;
    font-size: 14px;
    padding: 7px 8px 7px 0;
    border-bottom: 1px dotted var(--rule-mid);
    color: var(--ink-soft);
}
table.plain td.num {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-style: normal;
    text-align: right;
    color: var(--ink);
    padding-right: 0;
}
table.plain tr:last-child td { border-bottom: none; }

/* ─── Merge callouts ───────────────────────── */
.callout {
    border: 1px solid var(--rule-strong);
    background: var(--cream-mid);
    padding: 16px;
    border-radius: 2px;
}
.callout-olive { border-color: rgba(124, 140, 94, 0.40); background: var(--olive-light); }

.callout-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }

.callout-flag {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--olive);
    border: 1px solid rgba(124, 140, 94, 0.40);
    padding: 2px 7px;
    border-radius: 1px;
    flex-shrink: 0;
}
.callout-flag-neutral { color: var(--ink); border-color: var(--rule-strong); }

.callout-title { font-family: var(--serif); font-style: italic; font-size: 16px; color: var(--ink); }

.merge-list { display: flex; flex-direction: column; gap: 0; margin-top: 10px; }

.merge-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px dotted var(--rule-mid);
}
.merge-row:first-child { padding-top: 0; border-top: none; }

.merge-names { font-family: var(--mono); font-size: 12.5px; color: var(--ink-soft); }
.merge-names .plus { color: var(--ink-faint); margin: 0 4px; }

.merge-qty {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    text-align: right;
}

.callout-note {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-faint);
    margin-top: 12px;
    line-height: 1.6;
}

/* ─── Ask in Hinglish ──────────────────────── */
.ask-box {
    border: 1px solid var(--rule-strong);
    border-radius: 2px;
    background: var(--cream-mid);
    overflow: hidden;
}

.ask-input-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }

.ask-input {
    flex: 1;
    font-family: var(--serif);
    font-style: italic;
    font-size: 15px;
    color: var(--ink);
    background: transparent;
    border: none;
}
.ask-input:focus { outline: none; }
.ask-input::placeholder { color: var(--ink-faint); }

.ask-send {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cream);
    background: var(--olive);
    border: none;
    padding: 8px 12px;
    border-radius: 1px;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;
}
.ask-send:disabled { opacity: 0.6; cursor: default; }

.ask-answer {
    margin-top: 10px;
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--ink-soft);
    line-height: 1.6;
    background: var(--cream-mid);
    border-left: 2px solid var(--olive);
    padding: 10px 12px;
    border-radius: 0 2px 2px 0;
}
.ask-answer.hidden { display: none; }
.ask-answer .ask-q { font-family: var(--serif); font-style: italic; font-size: 14px; color: var(--ink); display: block; margin-bottom: 6px; }
.ask-answer.is-error { border-left-color: var(--red); color: var(--red); }

@media (max-width: 768px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 4: Verify locally**

```bash
cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765
```

(Plain static server is fine for this task — nothing here calls `/api` yet; Chart.js loads from its own CDN regardless of how the page itself is served.)

Insert temporary test rows via curl designed to exercise BOTH merge layers and the compound-exclusion rule in one go:

```bash
curl -s -X POST "https://sckgsgakyyosgjxoctlb.supabase.co/rest/v1/sales_log" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '[
    {"entry_date": "2026-07-29", "item": "Toy", "amount": 100},
    {"entry_date": "2026-07-29", "item": "Toys", "amount": 50},
    {"entry_date": "2026-07-29", "item": "Print", "amount": 10},
    {"entry_date": "2026-07-29", "item": "P.Out", "amount": 20},
    {"entry_date": "2026-07-29", "item": "Car", "amount": 500},
    {"entry_date": "2026-07-29", "item": "Study Table, Car", "amount": 900}
  ]'
```

Note the returned `id`s for cleanup. Open `http://localhost:8765/analyse_sales.html`. Confirm:
- KPI tiles populate (Items Sold: 6, Distinct Items: fewer than 6 due to merging, etc. — exact number depends on any real data also present, but should visibly reflect merging)
- Daily trend chart renders a point for 2026-07-29
- Top 10 by Revenue and Top 10 by Quantity charts render, with "Toy" showing quantity 2 (Toy+Toys merged) and revenue 150
- Bottom 10 table renders
- **"Auto-merged" panel** shows `Toy + Toys` (2×) — this is the Layer-1-only case
- **"You confirmed" panel** shows `Print + P.Out` (2×) — this is the Layer-2/manual case, and must NOT also appear in the auto-merged panel
- "Car" in either chart shows quantity **1**, not 2 — confirming "Study Table, Car" was correctly excluded from merging into it
- Toggling to "Viewing Month" and back to "Till Date" re-renders correctly (assuming today's date falls in the current viewing month — if not, note this in your report rather than treating it as a failure, since it depends on what month is currently selected in `localStorage`)

Clean up all 6 test rows via curl DELETE, then confirm via GET that none remain (matching against their descriptions/amounts, or IDs captured earlier).

If you have real captured data from the Sales Log feature already in the table (there should be, from prior testing), also visually sanity-check that the page's numbers look plausible against it (don't need exact figures, just no crashes/blank sections).

- [ ] **Step 5: Commit**

```bash
git add analyse_sales.html analyse_sales.js analyse_sales-style.css
git commit -m "Add Analyse Sales insights page (KPIs, charts, merge panels, Ask box UI)"
```

---

### Task 3: Wire "Ask in Hinglish" to the real endpoint

**Files:**
- Modify: `analyse_sales.js` (replace the inert submit handler; add answer-rendering)
- Modify: `analyse_sales-style.css` (already has the needed `.ask-answer` styles from Task 2 — this task should need zero new CSS; confirm before adding any)

**Interfaces:**
- Consumes: `POST /api/ask-sales-insights` (Task 1); `currentStats`, `currentPeriod` (module-level state already set by `loadAndRender()` in Task 2).
- Produces: a working Ask-in-Hinglish box that sends the current period's computed stats as context and renders the real answer.

- [ ] **Step 1: Replace the inert handler in `analyse_sales.js`**

Find:
```js
// Ask in Hinglish — inert for now, Task 3 replaces this handler with the real one.
askForm.addEventListener('submit', (e) => { e.preventDefault(); });
```

Replace with:
```js
const askInput = document.getElementById('askInput');
const askSendBtn = document.getElementById('askSendBtn');
const askAnswerEl = document.getElementById('askAnswer');

function currentPeriodLabel() {
    return currentPeriod === 'viewing-month' ? periodContextEl.textContent : 'Till Date';
}

function buildAskContext() {
    if (!currentStats) return null;
    return {
        period: currentPeriodLabel(),
        totalItemsSold: currentStats.totalItemsSold,
        distinctItems: currentStats.distinctItems,
        topByRevenue: currentStats.byRevenue.slice(0, 10).map(c => ({ display: c.display, revenue: c.revenue, count: c.count })),
        topByQuantity: currentStats.byQuantity.slice(0, 10).map(c => ({ display: c.display, count: c.count, revenue: c.revenue })),
        bottomItems: currentStats.bottomItems.slice(0, 10).map(c => ({ display: c.display, count: c.count })),
        dailyCounts: currentStats.dailyCounts
    };
}

function renderAskAnswer(question, answerText, isError) {
    askAnswerEl.innerHTML = `
        <span class="ask-q">${escapeHtml(question)}</span>
        ${escapeHtml(answerText)}
    `;
    askAnswerEl.classList.remove('hidden');
    askAnswerEl.classList.toggle('is-error', !!isError);
}

async function handleAskSales(e) {
    e.preventDefault();

    const question = askInput.value.trim();
    if (!question) return;

    const context = buildAskContext();
    if (!context) {
        renderAskAnswer(question, 'Data abhi load ho rahi hai, thoda ruk kar phir try karein.', true);
        return;
    }

    askSendBtn.disabled = true;
    askSendBtn.textContent = 'Poochh rahe…';

    try {
        const response = await fetch('/api/ask-sales-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, context })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }

        renderAskAnswer(question, result.answer, false);
    } catch (err) {
        console.error('❌ Ask error:', err);
        renderAskAnswer(question, 'Maaf kijiye, jawaab nahi mil paaya: ' + err.message, true);
    } finally {
        askSendBtn.disabled = false;
        askSendBtn.textContent = 'Poochho';
    }
}

askForm.addEventListener('submit', handleAskSales);
```

- [ ] **Step 2: Verify via `vercel dev`**

```bash
cd /Users/dhiraj/Documents/TestVibe && vercel dev --listen 3111 --yes &
sleep 5
```

Since driving real browser input isn't reliable in this sandbox, verify in two complementary ways:

1. **Static correctness check**: re-read the modified `analyse_sales.js` and confirm `buildAskContext()` correctly references `currentStats` fields that actually exist (matching Task 2's `computeStats` return shape exactly — `byRevenue`, `byQuantity`, `bottomItems`, `dailyCounts`, `totalItemsSold`, `distinctItems`), and that `handleAskSales` posts to the correct URL with the correct body shape.
2. **Live simulation**: POST directly to the endpoint with a context shaped exactly like `buildAskContext()` would produce (use realistic numbers, e.g. from the Sales Log feature's real captured data if present, or synthetic ones matching the shape), confirming the same success/error handling paths Task 1 already verified still work when called with this exact context shape:

```bash
curl -s -X POST http://localhost:3111/api/ask-sales-insights \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Konsa din sabse busy tha?",
    "context": {
      "period": "Till Date",
      "totalItemsSold": 362,
      "distinctItems": 168,
      "topByRevenue": [{"display": "Toy", "revenue": 8040, "count": 11}],
      "topByQuantity": [{"display": "Print", "count": 43, "revenue": 1214}],
      "bottomItems": [{"display": "A4", "count": 1}],
      "dailyCounts": [{"date": "2026-07-19", "count": 42}, {"date": "2026-07-26", "count": 65}]
    }
  }'
```

Expected: HTTP 200, `{"answer": "..."}` referencing 26 Jul (the day with count 65, the highest in this sample) if the question is answered correctly from the provided `dailyCounts`.

Stop `vercel dev` when done.

- [ ] **Step 3: Commit**

```bash
git add analyse_sales.js
git commit -m "Wire Ask in Hinglish to /api/ask-sales-insights"
```

---

### Task 4: Add the "Insights" button to Sales Log

**Files:**
- Modify: `sales_log.html`

**Interfaces:**
- None — pure markup/CSS addition linking to `analyse_sales.html`.

- [ ] **Step 1: Update the month-indicator row in `sales_log.html`**

Find:
```html
            <!-- Month Indicator -->
            <div class="month-indicator"><span class="mi-label">Viewing Month:</span> <span id="currentMonthLabel" class="mi-value">Loading...</span></div>
```

Replace with:
```html
            <!-- Month Indicator -->
            <div class="month-indicator">
                <span class="mi-label">Viewing Month:</span> <span id="currentMonthLabel" class="mi-value">Loading...</span>
                <a href="analyse_sales.html" class="insights-btn">Insights</a>
            </div>
```

- [ ] **Step 2: Add the layout + button CSS to `sales_log-style.css`**

Find the existing `.month-indicator` rule:
```css
.month-indicator {
    border-bottom: 1px solid var(--rule-mid);
    padding-bottom: 12px;
    margin-bottom: 16px;
}
```

Replace with:
```css
.month-indicator {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 1px solid var(--rule-mid);
    padding-bottom: 12px;
    margin-bottom: 16px;
}

.insights-btn {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--olive);
    border: 1px solid rgba(124, 140, 94, 0.40);
    padding: 5px 11px;
    border-radius: 1px;
    text-decoration: none;
    transition: all 0.15s;
}

.insights-btn:hover { background: var(--olive-light); border-color: var(--olive); }
```

- [ ] **Step 3: Verify**

```bash
cd /Users/dhiraj/Documents/TestVibe && python3 -m http.server 8765
```

Open `http://localhost:8765/sales_log.html`. Confirm: the "Viewing Month" label and the new "Insights" button sit on the same row, button aligned to the top right; clicking it navigates to `analyse_sales.html` and the page loads correctly. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add sales_log.html sales_log-style.css
git commit -m "Add Insights button to the Sales Log page"
```
