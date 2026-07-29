# Analyse Sales — Insights Page (Phase 2) — Design Spec

## Problem

Phase 1 (Sales Log) captures itemized sales via diary-photo OCR into the `sales_log` table. There's no way yet to see what any of it means — top/bottom sellers, trends, or ask a question about it. Item names are also hand-typed via OCR and vary in spelling ("Toy"/"Toys", "P.Out"/"Print"), which would make naive per-name aggregation misleading.

This spec covers Phase 2: a read-only insights page over the existing `sales_log` data, with automatic + confirmed manual name-merging, and a Hinglish natural-language Q&A box backed by a second serverless function.

## Design history

Built iteratively as an HTML mockup (Claude Artifact) against the user's real captured data (362 rows, 8 days, 19–26 Jul 2026), refined across three rounds:
1. Initial mockup: revenue + frequency views, a flagged (not-yet-applied) data-quality callout.
2. User: focus on items/quantity, not revenue — except keep exactly one revenue-based chart ("Top 10 Selling Items (By Revenue)"). Automatic near-duplicate merging should actually be applied, not just flagged. Add a real "Ask in Hinglish" concept.
3. User: four concrete corrections against the real data — merge Print+P.Out, merge Rapping+Packing+Gift Packing, merge Stationery+Stat., and do NOT merge "Study Table, Car" into "Car". This exposed that automatic text-similarity matching only catches typos/spacing/plurals, not semantic synonyms (abbreviations, shop shorthand) — those need to be told, not guessed, and multi-item diary lines (comma-separated) must never be pulled into a single-item cluster.

The validated algorithm and content below are the direct result of that process, ported from a Python prototype run against the real data to a JS implementation for this spec.

## Scope

- New page `analyse_sales.html` + `analyse_sales.js` + `analyse_sales-style.css`.
- New serverless function `api/ask-sales-insights.js` for the Hinglish Q&A box (real, not mocked — confirmed in this round).
- One new button on `sales_log.html`; no other existing file changes (not added to the burger menu — confirmed).

## Data scope: Period toggle

Two pills, "Till Date" (default) and "Viewing Month":
- **Till Date**: no date filter — every `sales_log` row ever captured.
- **Viewing Month**: filtered to the app-wide selected month (`getSelectedMonth()` / `localStorage['selectedMonth']`), same convention as Statement/Rent Income/Sales Log.

Switching the toggle re-queries `sales_log` and re-renders every section below (KPIs, trend, top/bottom lists, merge panels). The Hinglish Q&A box answers against whichever period is currently selected.

## Item merging — the algorithm (ported to JS, ships as part of `analyse_sales.js`)

Two layers, kept visually and conceptually separate on the page:

**Layer 1 — automatic (spelling/typo/plural/spacing).** A normalized string is clustered with another when:
- Exact match after normalize (trim, lowercase, strip `.`/`,`/`/`, collapse whitespace)
- Singular/plural match (strip a trailing non-`ss` `s` when length > 3)
- Spacing-only match (compare with all whitespace removed)
- Similarity ratio ≥ 0.86 (Ratcliff/Obershelp — same algorithm as Python's `difflib.SequenceMatcher.ratio()`) — only attempted when both strings are 5+ characters, to avoid short-name false positives (an earlier pass at a lower length floor wrongly merged "Car" into "Cards")

**Compound-entry exclusion:** a normalized item is never merged (into anything, by either layer) if every raw diary line it came from contains a comma — e.g. "Study Table, Car" must never be pulled into the standalone "Car" cluster. This was a direct, confirmed requirement.

**Layer 2 — manual (confirmed semantic synonyms).** A small hardcoded list in `analyse_sales.js`, applied after Layer 1:
```js
const SYNONYM_GROUPS = [
    ['print', 'p out'],                       // Print & P.Out are the same (P.Out = "Print Out")
    ['rapping', 'packing', 'gift packing'],   // Rapping, Packing & Gift Wrapping are the same
    ['stationery', 'stat'],                   // Stationery & Stat. are the same
];
```
Editing this list is how future confirmed synonyms get added — no UI for it in this version, no new table. Each entry is a normalized-form string (post-Layer-1-normalize), and the group gets unioned into one cluster the same way Layer 1 clusters do.

**Full algorithm** (verified against the real dataset: 192 raw distinct spellings → 168 merged items):

```js
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

// rows: sales_log rows for the current period, each {item, amount, entry_date, ...}
// Returns: array of { display, count, revenue, variants: string[] }, one per merged cluster.
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

    SYNONYM_GROUPS.forEach(group => {
        const present = group.filter(g => parent.has(g));
        for (let k = 1; k < present.length; k++) union(present[k], present[0]);
    });

    const clusters = new Map();
    rows.forEach(r => {
        const root = find(normalizeItem(r.item));
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(r);
    });

    const result = [];
    clusters.forEach((clusterRows) => {
        const rawCounts = new Map();
        clusterRows.forEach(r => {
            const raw = r.item.trim();
            rawCounts.set(raw, (rawCounts.get(raw) || 0) + 1);
        });
        let display = '', maxCount = -1;
        rawCounts.forEach((count, raw) => { if (count > maxCount) { maxCount = count; display = raw; } });
        const variants = Array.from(rawCounts.keys()).filter(r => r !== display);
        const revenue = clusterRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        result.push({ display, count: clusterRows.length, revenue, variants });
    });

    return result;
}
```

To distinguish "Layer 1" vs "Layer 2" merges for the two separate transparency panels on the page, tag each `SYNONYM_GROUPS` pairing at merge time (track which unions came from the synonym pass vs the automatic pass) rather than re-deriving it after the fact — the implementation should record, per cluster, whether any of its members were joined via `SYNONYM_GROUPS` (manual) as opposed to purely via the automatic rules (layer 1 only).

## The page — `analyse_sales.html` + `analyse_sales.js`

Follows the existing page skeleton (header, month indicator area repurposed as the Period toggle — see below, footer scripts) but has **no burger-menu link** (confirmed: not added to the nav; the only entry point is the button on Sales Log) and **no burger menu markup at all is required to change elsewhere** — this page still includes the standard burger menu markup itself (for the dark-mode toggle and consistency with `auth.js`'s expectations) but simply isn't linked *to* from other pages' menus.

### Header area

Standard header (logo, title "Analyse Sales"), then a **Period toggle** row (replaces the plain month-indicator used elsewhere):

```html
<div class="period-toggle">
    <button type="button" class="period-btn active" data-period="till-date">Till Date</button>
    <button type="button" class="period-btn" data-period="viewing-month">Viewing Month</button>
</div>
```

Clicking a pill sets it active, re-fetches `sales_log` for that scope, and re-runs `clusterItems` + all rendering.

Then `<div class="back-to-dashboard"><a href="index.html">« Back To Dashboard</a></div>`, matching every other page exactly.

### Sections (in order, content/copy already validated in the mockup)

1. **KPI tiles** (2×2 grid): Items Sold, Distinct Items (merged count, with "N as written" sub-line), Avg Items/Day, Days Captured.
2. **Daily Items Sold** — Chart.js line chart (quantity per day, not revenue), area fill, single olive series, native Chart.js tooltip on hover. Loaded via `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>` — same CDN URL `dashboard.html` already uses.
3. **Top 10 Selling Items (By Revenue)** — Chart.js horizontal bar chart, merged clusters, single olive series. The one revenue view kept per the user's explicit instruction.
4. **Top 10 Selling Items (By Quantity)** — Chart.js horizontal bar chart, merged clusters, single blue series (`--blue`), distinguishing it visually from the revenue chart.
5. **Bottom 10 Selling Items** — plain table, quantity only (items sold exactly once, or lowest count in the period), no revenue column.
6. **Auto-merged (Layer 1) panel** — list of clusters that have variants purely from automatic matching, each showing the merged quantity.
7. **You confirmed (Layer 2) panel** — list of clusters whose merge involved a `SYNONYM_GROUPS` entry, each showing merged quantity, plus the compound-entry-exclusion note as explanatory copy (not a separate section — folds into this panel's note, matching the finalized mockup).
8. **Ask in Hinglish** — real, functional: text input + send button + answer area. See below.

### Ask in Hinglish — wiring

On submit: client already has the full `clusterItems` result and daily/KPI numbers for the current period in memory (just rendered from them) — build a compact JSON summary (NOT raw rows) and POST it alongside the question to the new function:

```js
async function handleAskSales(e) {
    e.preventDefault();
    const question = askInput.value.trim();
    if (!question) return;

    const context = {
        period: currentPeriodLabel(),          // e.g. "Till Date" or "July 2026"
        totalItemsSold: currentStats.totalItemsSold,
        distinctItems: currentStats.distinctItems,
        topByRevenue: currentStats.topByRevenue.slice(0, 10),   // [{display, revenue, count}]
        topByQuantity: currentStats.topByQuantity.slice(0, 10), // [{display, count, revenue}]
        bottomItems: currentStats.bottomItems.slice(0, 10),     // [{display, count}]
        dailyCounts: currentStats.dailyCounts,                  // [{date, count}]
    };

    askSendBtn.disabled = true;
    askAnswerEl.textContent = '';
    try {
        const response = await fetch('/api/ask-sales-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, context })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Request failed');
        renderAskAnswer(question, result.answer);
    } catch (err) {
        renderAskAnswer(question, 'Maaf kijiye, jawaab nahi mil paaya: ' + err.message);
    } finally {
        askSendBtn.disabled = false;
    }
}
```

## `api/ask-sales-insights.js` — the serverless function

**Request:** `POST { question: string, context: object }` (the compact summary shape above — never raw `sales_log` rows).

**Behavior:**
1. Validate `question` (non-empty string) and `context` (object) are present → 400 otherwise.
2. Call the Claude API (Messages endpoint, same `ANTHROPIC_API_KEY` env var already configured for `/api/ocr-sales` — no new env var setup needed) with a system-style instruction embedded in the prompt:
   - Answer ONLY using the numbers in the provided `context` JSON — never invent figures.
   - Respond in Hinglish (Hindi written in Latin/Roman script, mixed naturally with English, matching how the shopkeeper writes — not pure Hindi script, not pure English).
   - Keep the answer short — a sentence or two, not a report.
   - If the question can't be answered from the given context (e.g. asks about something outside the provided summary), say so honestly in Hinglish rather than guessing.
3. Return `{ answer: string }` on success.
4. On any Claude API failure, return `502 { error: string }` — same pattern as `/api/ocr-sales`'s all-images-failed case, so the client can distinguish "service failed" from a real answer.

**Auth/trust model:** same as `/api/ocr-sales` — no authentication of its own, accepted tradeoff already established for this app; each call spends Anthropic credit (text-only, much cheaper than a vision call).

## Navigation — `sales_log.html`

Add an "Insights" button to the existing month-indicator row (top right), linking to `analyse_sales.html`:

```html
<div class="month-indicator">
    <span class="mi-label">Viewing Month:</span> <span id="currentMonthLabel" class="mi-value">Loading...</span>
    <a href="analyse_sales.html" class="insights-btn">Insights</a>
</div>
```

(Exact layout/CSS to make this sit at the top right of the row is an implementation detail for the plan, not re-specified here — `.month-indicator` becomes a flex row with `justify-content: space-between`.)

No other file changes. `analyse_sales.html` is not added to any burger menu.

## Out of scope

- Editable synonym-list UI (Layer 2 stays a hardcoded array for this version).
- Multi-turn conversation for Ask in Hinglish (single question → single answer, no history).
- Month-over-month / day-of-week analyses (flagged in the mockup as needing more captured weeks of data).
- Any change to `sales_log`'s own capture/history flow.
