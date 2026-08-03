# Manage Item Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Dhiraj view and manage manual item-name synonym groups (used to merge diary spelling variants in Analyse Sales) from the browser, replacing the hardcoded `SYNONYM_GROUPS` array in `analyse_sales.js`.

**Architecture:** A new Supabase table `item_synonym_groups` (one row per canonical-name/variant-spelling pair) replaces the hardcoded array. `clusterItems()` fetches it once per page load and uses each group's `canonical_name` to override the display name of any cluster containing one of its variants. A Dhiraj-only modal on the Insights page provides full CRUD over this table, writing directly to Supabase like every other admin action in this app.

**Tech Stack:** Vanilla JS + Supabase (same as the rest of the app), no build step.

## Global Constraints

- The Manage Item Groups button is hidden via CSS by default and only un-hidden by JS when `window.washiAuth.getUsername() === 'Dhiraj'` — the same DOM-presence pattern already used (and approved) for the Expenses, Sales Log, and Passport Photo delete buttons elsewhere in this app. It must never be un-hidden for any other user.
- A group's `canonical_name` is free text the user types — it does not need to match any existing diary spelling.
- Matching a stored `variant_spelling` against real diary item text must go through `compactItem(normalizeItem(...))` on both sides, never an exact string/case-sensitive comparison — this is the same punctuation/case-insensitivity fix already required for the old hardcoded `SYNONYM_GROUPS` (Print vs P.Out).
- No ability to override/undo automatic (layer 1) similarity-based merging — out of scope, confirmed with the user.
- All writes go directly from the client to Supabase (no new serverless function) — consistent with every other admin write in this app (Expenses delete, Sales Log day delete, Storage rename/delete).
- Test locally via `http://localhost:8765` (`python3 -m http.server 8765` from the project root) — never open `analyse_sales.html` via `file://`, per this app's standing Supabase-fetch-origin constraint.
- Never use `git add -A` or `git add .` — stage only the specific files each task touches.

---

### Task 1: Database table

**Files:**
- Create: `CREATE_ITEM_SYNONYM_GROUPS_TABLE.sql`

**Interfaces:**
- Produces: a Supabase table `item_synonym_groups` with columns `id` (UUID PK), `canonical_name` (TEXT), `variant_spelling` (TEXT), `created_at` (TIMESTAMP) — consumed by Task 2's `fetchItemSynonymGroups()`.

- [ ] **Step 1: Write the SQL file**

Create `CREATE_ITEM_SYNONYM_GROUPS_TABLE.sql`:

```sql
-- ============================================
-- CREATE ITEM SYNONYM GROUPS TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor.
-- Backs the "Manage Item Groups" feature on the Analyse Sales (Insights)
-- page — lets Dhiraj group different diary spellings of the same item
-- under one display name, from the browser, without code changes.
--
-- One row per (canonical display name, variant spelling) pair. Multiple
-- rows sharing the same canonical_name form a group.

CREATE TABLE item_synonym_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    variant_spelling TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Speeds up fetching/updating/deleting all rows for a given group
CREATE INDEX idx_item_synonym_groups_canonical ON item_synonym_groups(canonical_name);

-- Disable Row Level Security (consistent with every other table in this app)
-- NOTE: if inserts/updates/deletes return 401/403 despite this line, check
-- the RLS toggle directly in the Supabase Table Editor for this table —
-- this has happened before on other tables in this app despite this exact
-- ALTER having been run.
ALTER TABLE item_synonym_groups DISABLE ROW LEVEL SECURITY;

-- Seed the groups that were previously hardcoded in analyse_sales.js's
-- SYNONYM_GROUPS array, so removing that array is not a regression.
-- Stored with natural casing/punctuation (not pre-normalized) — matching
-- against real diary text always goes through compactItem(normalizeItem(...))
-- at read time, so exact stored casing doesn't matter for matching, only
-- for how the spelling displays as a chip in the management UI.
INSERT INTO item_synonym_groups (canonical_name, variant_spelling) VALUES
    ('Print', 'Print'),
    ('Print', 'P.Out'),
    ('Gift Wrapping', 'Rapping'),
    ('Gift Wrapping', 'Packing'),
    ('Gift Wrapping', 'Gift Packing'),
    ('Stationery', 'Stationery'),
    ('Stationery', 'Stat.');

-- Verify table was created and seeded
SELECT canonical_name, variant_spelling FROM item_synonym_groups ORDER BY canonical_name;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
```

- [ ] **Step 2: Run the SQL in Supabase and verify**

Tell the user (Dhiraj) to run this file's SQL in the Supabase SQL Editor for this project, then confirm:
1. The final `SELECT` returns 7 rows (Print×2, Gift Wrapping×3, Stationery×2).
2. In the Supabase Table Editor, open `item_synonym_groups` → Table settings and confirm Row Level Security shows **disabled**. If it shows enabled despite the `ALTER TABLE` above, toggle it off manually there (this has happened on other tables in this app before).

Wait for the user to confirm "done" before proceeding to Task 2.

- [ ] **Step 3: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add CREATE_ITEM_SYNONYM_GROUPS_TABLE.sql
git commit -m "Add item_synonym_groups table for Manage Item Groups feature"
```

---

### Task 2: Core clustering refactor

**Files:**
- Modify: `analyse_sales.js`

**Interfaces:**
- Consumes: `item_synonym_groups` table from Task 1 (columns `id`, `canonical_name`, `variant_spelling`).
- Produces: `fetchItemSynonymGroups(): Promise<Array<{id, canonical_name, variant_spelling, created_at}>>`, `fetchAllTimeItemCounts(): Promise<Map<string, number>>` (raw trimmed spelling → all-time occurrence count), `clusterItems(rows, synonymGroupRows)` (new second parameter) — all consumed by Task 3's modal code and by `loadAndRender()`.

- [ ] **Step 1: Remove the hardcoded `SYNONYM_GROUPS` array**

In `analyse_sales.js`, delete these lines (currently right after `singularItem`):

```js
const SYNONYM_GROUPS = [
    ['print', 'p out'],
    ['rapping', 'packing', 'gift packing'],
    ['stationery', 'stat'],
];
```

- [ ] **Step 2: Add the two new fetch functions**

Add these right after `fetchSalesData` (which currently ends around line 238):

```js
// All item_synonym_groups rows, fetched once per page load — the manual
// merge/rename layer that used to be the hardcoded SYNONYM_GROUPS array.
async function fetchItemSynonymGroups() {
    const { data, error } = await supabaseClient
        .from('item_synonym_groups')
        .select('*')
        .order('canonical_name', { ascending: true });
    if (error) throw error;
    return data || [];
}

// All-time (not period-scoped) distinct item spellings with their raw
// occurrence counts — used by the Manage Item Groups modal's spelling
// picker and existing-group count subtitles. Independent of the page's
// Till Date / Viewing Month toggle since group management is a global
// configuration action, not scoped to whatever period is being viewed.
async function fetchAllTimeItemCounts() {
    const { data, error } = await supabaseClient.from('sales_log').select('item');
    if (error) throw error;
    const counts = new Map();
    (data || []).forEach(r => {
        const raw = r.item.trim();
        counts.set(raw, (counts.get(raw) || 0) + 1);
    });
    return counts;
}
```

- [ ] **Step 3: Replace `clusterItems()`**

Replace the entire existing `clusterItems(rows)` function with:

```js
// rows: sales_log rows for the current period.
// synonymGroupRows: raw item_synonym_groups rows ({ canonical_name, variant_spelling }),
//   fetched once per page load via fetchItemSynonymGroups().
// Returns: [{ display, count, revenue, variants: string[], manual: boolean }]
function clusterItems(rows, synonymGroupRows) {
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

    // Group the flat item_synonym_groups rows into { canonical_name -> [variant_spelling, ...] }.
    const synonymGroups = new Map();
    (synonymGroupRows || []).forEach(row => {
        if (!synonymGroups.has(row.canonical_name)) synonymGroups.set(row.canonical_name, []);
        synonymGroups.get(row.canonical_name).push(row.variant_spelling);
    });

    // Match via compactItem(normalizeItem(...)) on BOTH sides, not an exact
    // string comparison — a stored variant_spelling keeps its natural
    // casing/punctuation (e.g. "P.Out") for display in the management UI,
    // so it must be normalized the same way diary text is before comparing.
    // This is the same fix that was required for the old hardcoded
    // SYNONYM_GROUPS array (Print/P.Out only merged once compared via
    // compactItem instead of an exact literal match).
    //
    // Each manual group also carries a canonical display-name override
    // (canonicalOverride), applied after clustering below — this is how a
    // Dhiraj-managed group controls exactly what name Insights shows,
    // instead of falling back to whichever raw spelling occurred most.
    const canonicalOverride = new Map();
    synonymGroups.forEach((variants, canonicalName) => {
        const groupCompacts = variants.map(v => compactItem(normalizeItem(v)));
        const present = norms.filter(n => groupCompacts.includes(compactItem(n)));
        for (let k = 1; k < present.length; k++) union(present[k], present[0]);
        if (present.length > 0) {
            canonicalOverride.set(find(present[0]), canonicalName);
        }
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
        if (canonicalOverride.has(root)) display = canonicalOverride.get(root);
        const variants = Array.from(rawCounts.keys()).filter(r => r !== display);
        const revenue = clusterRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        result.push({ display, count: clusterRows.length, revenue, variants, manual: canonicalOverride.has(root) });
    });

    return result;
}
```

- [ ] **Step 4: Wire the synonym groups into page state and `loadAndRender()`**

In the state block (currently `let currentPeriod = 'till-date'; let currentStats = null; ...`), add:

```js
let synonymGroupRows = [];
```

In `loadAndRender()`, change:
```js
const clusters = clusterItems(rows);
```
to:
```js
const clusters = clusterItems(rows, synonymGroupRows);
```

In the `DOMContentLoaded` handler at the bottom of the file, change:
```js
document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    loadAndRender();
});
```
to:
```js
document.addEventListener('DOMContentLoaded', async () => {
    initBurgerMenu();
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    try {
        synonymGroupRows = await fetchItemSynonymGroups();
    } catch (err) {
        console.error('Failed to load item synonym groups:', err);
        synonymGroupRows = [];
    }
    loadAndRender();
});
```

- [ ] **Step 5: Verify**

Run: `node --check analyse_sales.js`
Expected: no output (syntax OK).

Then start the local server and open the page:
```bash
cd /Users/dhiraj/Documents/TestVibe
python3 -m http.server 8765
```
Visit `http://localhost:8765/analyse_sales.html`. Expected: the page loads with no console errors, and the KPI tiles / Top 10 charts / Bottom 10 table look the same as before this change — specifically, "Print" and "P.Out" should still appear merged as a single "Print" entry, "Rapping"/"Packing"/"Gift Packing" should appear merged as a single "Gift Wrapping" entry (note: display name changes from whatever it showed before to "Gift Wrapping" — this is expected, since seeded groups now specify an explicit display name), and "Stationery"/"Stat." should appear merged as "Stationery".

- [ ] **Step 6: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add analyse_sales.js
git commit -m "Move manual item-synonym merging from hardcoded array to Supabase table"
```

---

### Task 3: Manage Item Groups modal

**Files:**
- Modify: `analyse_sales.html`
- Modify: `analyse_sales-style.css`
- Modify: `analyse_sales.js`

**Interfaces:**
- Consumes: `fetchItemSynonymGroups()`, `fetchAllTimeItemCounts()`, `normalizeItem`, `compactItem`, `escapeHtml`, `loadAndRender()`, `synonymGroupRows` (module state) from Task 2.
- Produces: none consumed by later tasks (this is the final task).

- [ ] **Step 1: HTML — button and modal markup**

In `analyse_sales.html`, replace:
```html
            <div class="back-to-dashboard">
                <a href="index.html">« Back To Dashboard</a>
            </div>
```
with:
```html
            <div class="back-to-dashboard-row">
                <div class="back-to-dashboard">
                    <a href="index.html">« Back To Dashboard</a>
                </div>
                <button type="button" id="manageGroupsBtn" class="manage-groups-link hidden">⚙ Manage Item Groups</button>
            </div>
```

Then, right after the closing `</div>` of `.container` (immediately before the `<!-- Supabase SDK -->` comment), add:
```html

    <!-- Manage Item Groups Modal (Dhiraj-only) -->
    <div id="groupsModal" class="groups-modal hidden">
        <div class="groups-modal-card">
            <div class="groups-modal-header">
                <h3>Manage Item Groups</h3>
                <button type="button" class="groups-modal-close" id="groupsModalClose" aria-label="Close">✕</button>
            </div>
            <div class="groups-modal-body">
                <p class="groups-section-label">Existing Groups</p>
                <div id="existingGroupsList"></div>

                <hr class="groups-divider">

                <p class="groups-section-label" id="createGroupLabel">Create New Group</p>
                <div class="create-group-form">
                    <div class="group-form-row group-name-field-row">
                        <div>
                            <label class="group-field-label" for="newGroupName">Display name</label>
                            <input type="text" id="newGroupName" class="group-text-input" placeholder="e.g. Print">
                        </div>
                        <button type="button" id="cancelAddToGroupBtn" class="group-icon-btn hidden">Cancel</button>
                    </div>
                    <div class="group-form-row">
                        <label class="group-field-label">Spellings to include</label>
                        <div class="picker-box">
                            <input type="text" id="newGroupPickerSearch" class="picker-search" placeholder="Search diary item spellings…">
                            <div id="newGroupPickerList" class="picker-list"></div>
                        </div>
                        <div class="selected-preview">
                            <label class="group-field-label" id="newGroupSelectedLabel">Selected (0)</label>
                            <div id="newGroupSelectedChips" class="variant-chips"></div>
                        </div>
                    </div>
                    <button type="button" id="createGroupBtn" class="group-btn-primary" disabled>Create Group</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: CSS**

Append to `analyse_sales-style.css`:

```css
/* ─── Manage Item Groups: entry point ─────── */
.back-to-dashboard-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 20px;
}
.back-to-dashboard-row .back-to-dashboard { margin-bottom: 0; }

.manage-groups-link {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
    background: transparent;
    border: 1px solid var(--rule-strong);
    padding: 6px 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s;
}
.manage-groups-link:hover { border-color: var(--olive); color: var(--olive); }
.manage-groups-link.hidden { display: none; }

/* ─── Manage Item Groups: modal ───────────── */
.groups-modal {
    position: fixed;
    inset: 0;
    background: rgba(28, 28, 30, 0.60);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
.groups-modal.hidden { display: none; }

.groups-modal-card {
    width: 100%;
    max-width: 720px;
    max-height: 85vh;
    background: var(--cream);
    border: 1px solid var(--rule-mid);
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.groups-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1.5px solid var(--ink);
}
.groups-modal-header h3 {
    font-family: var(--serif);
    font-size: 19px;
    font-style: italic;
    color: var(--ink);
    margin: 0;
}
.groups-modal-close {
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--ink-faint);
    cursor: pointer;
    padding: 4px 8px;
}
.groups-modal-close:hover { color: var(--ink); }

.groups-modal-body {
    overflow-y: auto;
    padding: 18px 20px 22px;
}

.groups-section-label {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--olive);
    margin: 0 0 12px;
}

.groups-divider {
    border: none;
    border-top: 1px solid var(--rule-mid);
    margin: 22px 0;
}

/* ─── Existing group cards ────────────────── */
.group-card {
    border: 1px solid var(--rule-mid);
    border-radius: 3px;
    padding: 14px 16px;
    margin-bottom: 12px;
    background: var(--cream-mid);
}
.group-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
    flex-wrap: wrap;
}
.group-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}
.group-name {
    font-family: var(--serif);
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
}
.group-count {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-faint);
}
.group-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}
.group-icon-btn {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: transparent;
    border: 1px solid var(--rule-strong);
    color: var(--ink-soft);
    padding: 4px 9px;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
}
.group-icon-btn:hover { background: var(--olive-light); border-color: var(--olive); color: var(--olive); }
.group-icon-btn.danger { color: var(--red); border-color: rgba(192,57,43,0.35); }
.group-icon-btn.danger:hover { background: var(--red-light); border-color: var(--red); color: var(--red); }
.group-icon-btn.hidden { display: none; }

/* ─── Variant / selected chips (shared) ───── */
.variant-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 12.5px;
    background: var(--cream);
    border: 1px solid var(--rule-mid);
    color: var(--ink-soft);
    padding: 4px 6px 4px 10px;
    border-radius: 20px;
}
.chip .chip-count { color: var(--ink-faint); }
.chip .chip-x {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--rule);
    color: var(--ink-faint);
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
}
.chip .chip-x:hover { background: var(--red-light); color: var(--red); }
.chip-add {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--blue);
    border: 1px dashed var(--rule-strong);
    background: transparent;
    padding: 4px 10px;
    border-radius: 20px;
    cursor: pointer;
}
.chip-add:hover { border-color: var(--blue); }

/* ─── Create / add-to-group form ──────────── */
.group-form-row { margin-bottom: 16px; }
.group-name-field-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
}
.group-name-field-row > div { flex: 1; }

.group-field-label {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin: 0 0 6px;
}
.group-text-input {
    width: 100%;
    font-family: var(--serif);
    font-size: 16px;
    color: var(--ink);
    background: var(--cream-mid);
    border: 1px solid var(--rule-strong);
    border-radius: 3px;
    padding: 9px 11px;
}
.group-text-input:disabled { opacity: 0.65; }

.picker-box {
    border: 1px solid var(--rule-strong);
    border-radius: 3px;
    background: var(--cream-mid);
    overflow: hidden;
}
.picker-search {
    width: 100%;
    font-family: var(--serif);
    font-size: 15px;
    color: var(--ink);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--rule-mid);
    padding: 9px 11px;
}
.picker-list {
    max-height: 170px;
    overflow-y: auto;
}
.picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 11px;
    border-bottom: 1px dotted var(--rule);
    cursor: pointer;
    font-size: 14.5px;
}
.picker-item:last-child { border-bottom: none; }
.picker-item:hover { background: var(--olive-light); }
.picker-item-name { color: var(--ink-soft); }
.picker-item-count {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-faint);
}
.picker-item.selected { background: var(--olive-light); }
.picker-item.selected .picker-item-name { color: var(--olive); font-weight: 700; }
.picker-item.selected::before { content: '✓ '; color: var(--olive); }

.selected-preview { margin-top: 12px; }

.group-btn-primary {
    font-family: var(--mono);
    font-size: 13px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: var(--olive);
    color: var(--cream);
    border: 1px solid var(--olive);
    padding: 10px 18px;
    border-radius: 3px;
    cursor: pointer;
    margin-top: 4px;
}
.group-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: JS — DOM refs and state**

In `analyse_sales.js`, add these DOM refs near the other DOM ref declarations (after the `askChips` line):

```js
const manageGroupsBtn = document.getElementById('manageGroupsBtn');
const groupsModal = document.getElementById('groupsModal');
const groupsModalClose = document.getElementById('groupsModalClose');
const existingGroupsList = document.getElementById('existingGroupsList');
const createGroupLabel = document.getElementById('createGroupLabel');
const cancelAddToGroupBtn = document.getElementById('cancelAddToGroupBtn');
const newGroupName = document.getElementById('newGroupName');
const newGroupPickerSearch = document.getElementById('newGroupPickerSearch');
const newGroupPickerList = document.getElementById('newGroupPickerList');
const newGroupSelectedLabel = document.getElementById('newGroupSelectedLabel');
const newGroupSelectedChips = document.getElementById('newGroupSelectedChips');
const createGroupBtn = document.getElementById('createGroupBtn');
```

Add this state near `let synonymGroupRows = [];`:

```js
let allTimeItemCounts = null;              // Map<rawSpelling, count>, lazily fetched on first modal open
let addToGroupMode = null;                 // canonical_name string when adding to an existing group, else null
let selectedNewGroupSpellings = new Set(); // spellings currently selected in the picker
```

- [ ] **Step 4: JS — rendering functions**

Add this whole block near the end of the file, just before the `// Dark Mode` section:

```js
// ============================================================
// Manage Item Groups (Dhiraj-only)
// ============================================================

// Sum the all-time occurrence count of every raw diary spelling that
// normalizes to the same form as `variantSpelling` — keeps the modal's
// counts consistent with clusterItems()'s own matching logic, regardless
// of exact casing/punctuation differences between a stored variant and
// however it happens to appear in the diary.
function countForVariant(variantSpelling) {
    const target = compactItem(normalizeItem(variantSpelling));
    let total = 0;
    allTimeItemCounts.forEach((count, raw) => {
        if (compactItem(normalizeItem(raw)) === target) total += count;
    });
    return total;
}

// Group the flat synonymGroupRows into { canonical_name -> [row, ...] }
function groupedSynonymRows() {
    const map = new Map();
    synonymGroupRows.forEach(row => {
        if (!map.has(row.canonical_name)) map.set(row.canonical_name, []);
        map.get(row.canonical_name).push(row);
    });
    return map;
}

function renderExistingGroups() {
    const groups = groupedSynonymRows();
    if (groups.size === 0) {
        existingGroupsList.innerHTML = '<div class="empty-state">No groups yet — create one below.</div>';
        return;
    }
    const cardsHtml = Array.from(groups.entries()).map(([canonicalName, variantRows]) => {
        const totalCount = variantRows.reduce((s, v) => s + countForVariant(v.variant_spelling), 0);
        const chipsHtml = variantRows.map(v => `
            <span class="chip">
                ${escapeHtml(v.variant_spelling)} <span class="chip-count">(${countForVariant(v.variant_spelling)})</span>
                <span class="chip-x" data-remove-row-id="${v.id}" title="Remove this spelling">✕</span>
            </span>
        `).join('');
        return `
            <div class="group-card">
                <div class="group-card-top">
                    <div class="group-name-row">
                        <span class="group-name">${escapeHtml(canonicalName)}</span>
                        <span class="group-count">${totalCount} sale${totalCount === 1 ? '' : 's'} across ${variantRows.length} spelling${variantRows.length === 1 ? '' : 's'}</span>
                    </div>
                    <div class="group-actions">
                        <button type="button" class="group-icon-btn" data-rename="${escapeHtml(canonicalName)}">Rename</button>
                        <button type="button" class="group-icon-btn danger" data-delete-group="${escapeHtml(canonicalName)}">Delete Group</button>
                    </div>
                </div>
                <div class="variant-chips">
                    ${chipsHtml}
                    <button type="button" class="chip-add" data-add-to-group="${escapeHtml(canonicalName)}">+ Add spelling</button>
                </div>
            </div>
        `;
    }).join('');
    existingGroupsList.innerHTML = cardsHtml;
    wireExistingGroupsEvents();
}

// Renders the shared spelling picker used by both "Create New Group" and
// "Add spelling to existing group" mode. Excludes spellings already
// selected in this session and (in add-to-group mode) spellings already
// present in the target group.
function renderSpellingPicker() {
    const query = normalizeItem(newGroupPickerSearch.value || '');
    const alreadyInTargetGroup = addToGroupMode
        ? new Set((groupedSynonymRows().get(addToGroupMode) || []).map(v => compactItem(normalizeItem(v.variant_spelling))))
        : new Set();

    const entries = Array.from(allTimeItemCounts.entries())
        .filter(([raw]) => !query || normalizeItem(raw).includes(query))
        .filter(([raw]) => !alreadyInTargetGroup.has(compactItem(normalizeItem(raw))))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    newGroupPickerList.innerHTML = entries.length
        ? entries.map(([raw, count]) => `
            <div class="picker-item${selectedNewGroupSpellings.has(raw) ? ' selected' : ''}" data-spelling="${escapeHtml(raw)}">
                <span class="picker-item-name">${escapeHtml(raw)}</span>
                <span class="picker-item-count">${count} sale${count === 1 ? '' : 's'}</span>
            </div>
        `).join('')
        : '<div class="picker-item"><span class="picker-item-name">No matches</span></div>';

    newGroupPickerList.querySelectorAll('.picker-item[data-spelling]').forEach(item => {
        item.addEventListener('click', () => {
            const spelling = item.dataset.spelling;
            if (selectedNewGroupSpellings.has(spelling)) selectedNewGroupSpellings.delete(spelling);
            else selectedNewGroupSpellings.add(spelling);
            renderSpellingPicker();
            renderSelectedPreview();
            updateCreateGroupButtonState();
        });
    });
}

function renderSelectedPreview() {
    const selected = Array.from(selectedNewGroupSpellings);
    newGroupSelectedLabel.textContent = `Selected (${selected.length})`;
    newGroupSelectedChips.innerHTML = selected.map(spelling => `
        <span class="chip">
            ${escapeHtml(spelling)} <span class="chip-count">(${countForVariant(spelling)})</span>
            <span class="chip-x" data-deselect="${escapeHtml(spelling)}">✕</span>
        </span>
    `).join('');
    newGroupSelectedChips.querySelectorAll('.chip-x[data-deselect]').forEach(x => {
        x.addEventListener('click', () => {
            selectedNewGroupSpellings.delete(x.dataset.deselect);
            renderSpellingPicker();
            renderSelectedPreview();
            updateCreateGroupButtonState();
        });
    });
}

function updateCreateGroupButtonState() {
    const hasName = addToGroupMode ? true : newGroupName.value.trim().length > 0;
    createGroupBtn.disabled = !hasName || selectedNewGroupSpellings.size === 0;
}
```

- [ ] **Step 5: JS — mode switching and event handlers**

Add this block right after Step 4's code:

```js
function enterAddToGroupMode(canonicalName) {
    addToGroupMode = canonicalName;
    selectedNewGroupSpellings = new Set();
    createGroupLabel.textContent = `Add Spelling to "${canonicalName}"`;
    newGroupName.value = canonicalName;
    newGroupName.disabled = true;
    cancelAddToGroupBtn.classList.remove('hidden');
    createGroupBtn.textContent = 'Add Spelling(s)';
    newGroupPickerSearch.value = '';
    renderSpellingPicker();
    renderSelectedPreview();
    updateCreateGroupButtonState();
    createGroupLabel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitAddToGroupMode() {
    addToGroupMode = null;
    selectedNewGroupSpellings = new Set();
    createGroupLabel.textContent = 'Create New Group';
    newGroupName.value = '';
    newGroupName.disabled = false;
    cancelAddToGroupBtn.classList.add('hidden');
    createGroupBtn.textContent = 'Create Group';
    newGroupPickerSearch.value = '';
    renderSpellingPicker();
    renderSelectedPreview();
    updateCreateGroupButtonState();
}

function wireExistingGroupsEvents() {
    existingGroupsList.querySelectorAll('[data-rename]').forEach(btn => {
        btn.addEventListener('click', () => handleRenameGroup(btn.dataset.rename));
    });
    existingGroupsList.querySelectorAll('[data-delete-group]').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteGroup(btn.dataset.deleteGroup));
    });
    existingGroupsList.querySelectorAll('[data-remove-row-id]').forEach(x => {
        x.addEventListener('click', () => handleRemoveVariant(x.dataset.removeRowId));
    });
    existingGroupsList.querySelectorAll('[data-add-to-group]').forEach(btn => {
        btn.addEventListener('click', () => enterAddToGroupMode(btn.dataset.addToGroup));
    });
}

function handleRenameGroup(canonicalName) {
    const newName = prompt('Enter new group name:', canonicalName);
    if (!newName || newName.trim() === '') return;
    if (newName.trim() === canonicalName) return;
    renameGroup(canonicalName, newName.trim());
}

async function renameGroup(oldName, newName) {
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .update({ canonical_name: newName })
            .eq('canonical_name', oldName);
        if (error) throw error;
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error renaming group:', err);
        alert('Failed to rename group: ' + err.message);
    }
}

async function handleDeleteGroup(canonicalName) {
    if (!confirm(`Delete the "${canonicalName}" group? Its spellings will no longer be merged/renamed. This cannot be undone.`)) return;
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .delete()
            .eq('canonical_name', canonicalName);
        if (error) throw error;
        if (addToGroupMode === canonicalName) exitAddToGroupMode();
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error deleting group:', err);
        alert('Failed to delete group: ' + err.message);
    }
}

async function handleRemoveVariant(rowId) {
    if (!confirm('Remove this spelling from its group?')) return;
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .delete()
            .eq('id', rowId);
        if (error) throw error;
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error removing variant:', err);
        alert('Failed to remove this spelling: ' + err.message);
    }
}

async function handleCreateOrAddGroup() {
    const canonicalName = addToGroupMode || newGroupName.value.trim();
    const spellings = Array.from(selectedNewGroupSpellings);
    if (!canonicalName || spellings.length === 0) return;

    const wasAddMode = !!addToGroupMode;
    createGroupBtn.disabled = true;
    createGroupBtn.textContent = 'Saving…';

    try {
        const rowsToInsert = spellings.map(variant_spelling => ({ canonical_name: canonicalName, variant_spelling }));
        const { error } = await supabaseClient.from('item_synonym_groups').insert(rowsToInsert);
        if (error) throw error;

        exitAddToGroupMode();
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error saving group:', err);
        alert('Failed to save: ' + err.message);
        createGroupBtn.textContent = wasAddMode ? 'Add Spelling(s)' : 'Create Group';
        createGroupBtn.disabled = false;
    }
}

// Re-fetch synonym groups + all-time counts, then refresh both the modal's
// own lists and the underlying Insights page (KPIs/charts/table) so any
// change is visible immediately without a page reload.
async function refreshGroupsAndInsights() {
    synonymGroupRows = await fetchItemSynonymGroups();
    allTimeItemCounts = await fetchAllTimeItemCounts();
    renderExistingGroups();
    renderSpellingPicker();
    renderSelectedPreview();
    await loadAndRender();
}
```

- [ ] **Step 6: JS — modal open/close and init wiring**

Add this block right after Step 5's code:

```js
async function openGroupsModal() {
    groupsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    existingGroupsList.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
        if (!allTimeItemCounts) allTimeItemCounts = await fetchAllTimeItemCounts();
        exitAddToGroupMode();
        renderExistingGroups();
    } catch (err) {
        console.error('Error opening groups modal:', err);
        existingGroupsList.innerHTML = `<div class="empty-state">Could not load groups: ${escapeHtml(err.message)}</div>`;
    }
}

function closeGroupsModal() {
    groupsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function initManageGroupsButton() {
    const isDhiraj = window.washiAuth && window.washiAuth.getUsername() === 'Dhiraj';
    if (isDhiraj && manageGroupsBtn) {
        manageGroupsBtn.classList.remove('hidden');
        manageGroupsBtn.addEventListener('click', openGroupsModal);
    }
    if (groupsModalClose) groupsModalClose.addEventListener('click', closeGroupsModal);
    if (groupsModal) {
        groupsModal.addEventListener('click', (e) => {
            if (e.target === groupsModal) closeGroupsModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && groupsModal && !groupsModal.classList.contains('hidden')) {
            closeGroupsModal();
        }
    });
    if (newGroupPickerSearch) newGroupPickerSearch.addEventListener('input', renderSpellingPicker);
    if (newGroupName) newGroupName.addEventListener('input', updateCreateGroupButtonState);
    if (cancelAddToGroupBtn) cancelAddToGroupBtn.addEventListener('click', exitAddToGroupMode);
    if (createGroupBtn) createGroupBtn.addEventListener('click', handleCreateOrAddGroup);
}
```

Then, in the `DOMContentLoaded` handler (modified in Task 2 Step 4), add `initManageGroupsButton();` — final version:

```js
document.addEventListener('DOMContentLoaded', async () => {
    initBurgerMenu();
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    initManageGroupsButton();
    try {
        synonymGroupRows = await fetchItemSynonymGroups();
    } catch (err) {
        console.error('Failed to load item synonym groups:', err);
        synonymGroupRows = [];
    }
    loadAndRender();
});
```

- [ ] **Step 7: Verify**

Run: `node --check analyse_sales.js`
Expected: no output (syntax OK).

Start the local server and open `http://localhost:8765/analyse_sales.html` in a browser:

1. **Visibility gating:** Log in as **Dhiraj**. Expected: "⚙ Manage Item Groups" button visible next to "« Back To Dashboard". Open DevTools, clear `localStorage` key `washi_auth` (or use a private window), log in as any other user (e.g. Neha). Expected: the button is entirely absent from the DOM (`document.getElementById('manageGroupsBtn')` still exists as an element since it's always in HTML, but check it has class `hidden` and was never un-hidden — confirm no way to trigger the modal without it).
2. **View existing groups:** As Dhiraj, click the button. Expected: modal opens showing 3 cards — Print (2 spellings), Gift Wrapping (3 spellings), Stationery (2 spellings) — each with a plausible sale count and chips for each spelling.
3. **Create a new group:** Type a display name, search for and select 1-2 real spellings from the picker, click "Create Group". Expected: a new card appears in Existing Groups; close the modal and confirm the Insights KPIs/charts now reflect the merge/rename.
4. **Add a spelling to an existing group:** Click "+ Add spelling" on a group card. Expected: the Create section switches to "Add Spelling to '<name>'" mode with the name field locked; pick a spelling, click "Add Spelling(s)"; expected: it appears as a new chip on that group's card, and the section reverts to normal "Create New Group" mode.
5. **Remove a spelling:** Click a chip's ✕ inside an existing group. Expected: confirm dialog, then that chip disappears and the group's sale count subtitle updates.
6. **Rename a group:** Click "Rename", enter a new name. Expected: the card's display name updates, and Insights reflects the new name.
7. **Delete a group:** Click "Delete Group", confirm. Expected: the card disappears entirely, and its spellings revert to being separate (unmerged) items in Insights.

- [ ] **Step 8: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add analyse_sales.html analyse_sales-style.css analyse_sales.js
git commit -m "Add Dhiraj-only Manage Item Groups modal to Analyse Sales"
```
