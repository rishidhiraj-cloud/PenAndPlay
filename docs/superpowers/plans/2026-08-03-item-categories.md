# Item Categories (Tag Items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Dhiraj classify every merged/canonical diary item into one of 4 fixed categories (Stationery, Sports, Toys, Seasonal) via a Dhiraj-only modal, and show category-wise sales (quantity + revenue) on the Analyse Sales (Insights) page.

**Architecture:** A new Supabase table `item_categories` maps a canonical item name (the exact `display` string `clusterItems()` already produces) to one of the 4 categories. The tagging modal's "every item ever sold" list is produced by running `fetchSalesData('till-date')` (already returns full history) through the existing `clusterItems()` — no new clustering logic. The Insights page gains two new bar charts that re-bucket the already-computed period-scoped clusters by category.

**Tech Stack:** Vanilla JS + Supabase + Chart.js (same as the rest of this page), no build step.

## Global Constraints

- Tagging is at the canonical/merged item level (`clusterItems()`'s `display` string), never per raw diary spelling.
- The category list is exactly `['Stationery', 'Sports', 'Toys', 'Seasonal']` — fixed, not user-editable. No "manage categories" UI.
- `item_categories.item_name` is `UNIQUE` — tagging is an `upsert` (`onConflict: 'item_name'`), so both first-time tagging and re-tagging ("Change") use the identical write path.
- The "Tag Items" button and modal are hidden via CSS by default and only un-hidden by JS when `window.washiAuth.getUsername() === 'Dhiraj'` — same DOM-presence pattern as every other admin gate in this app (Manage Item Groups, Expenses delete, Sales Log day-delete).
- Category-wise charts are period-scoped (respect the page's existing Till Date / Viewing Month toggle) — computed from clusters already in memory inside `loadAndRender()`, not a separate fetch.
- The tagging modal's "Needs Tagging" / "Already Tagged" lists are all-time (not period-scoped) — a global configuration action, independent of whatever period is being viewed, matching the precedent set by Manage Item Groups' all-time spelling picker.
- All writes go directly from the client to Supabase (no new serverless function) — consistent with every other admin write in this app.
- Test locally via `http://localhost:8765` (`python3 -m http.server 8765` from the project root) — never `file://`.
- **After Task 1, the human must run the new SQL migration in Supabase and confirm before Task 2 is dispatched** — Task 2's code cannot be verified against live data until the `item_categories` table actually exists.
- Never use `git add -A` or `git add .` — stage only the specific files each task touches.

---

### Task 1: Database table

**Files:**
- Create: `CREATE_ITEM_CATEGORIES_TABLE.sql`

**Interfaces:**
- Produces: a Supabase table `item_categories` with columns `id` (UUID PK), `item_name` (TEXT UNIQUE), `category` (TEXT, CHECK-constrained to the 4 fixed values), `created_at` (TIMESTAMP) — consumed by Task 2's `fetchItemCategories()` and Task 3's tag/re-tag writes.

- [ ] **Step 1: Write the SQL file**

Create `CREATE_ITEM_CATEGORIES_TABLE.sql`:

```sql
-- ============================================
-- CREATE ITEM CATEGORIES TABLE
-- ============================================
-- Run this SQL in your Supabase SQL Editor.
-- Backs the "Tag Items" feature on the Analyse Sales (Insights) page —
-- lets Dhiraj classify each merged/canonical diary item into one of 4
-- fixed categories, and powers the category-wise sales charts.
--
-- One row per tagged item. item_name is the exact "display" string
-- clusterItems() produces (the canonical/merged item name, not a raw
-- diary spelling) — UNIQUE, since each item has exactly one category.

CREATE TABLE item_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('Stationery', 'Sports', 'Toys', 'Seasonal')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Disable Row Level Security (consistent with every other table in this app)
-- NOTE: if writes return 401/403 despite this line, check the RLS toggle
-- directly in the Supabase Table Editor for this table — this has
-- happened before on other tables in this app despite this exact ALTER
-- having been run.
ALTER TABLE item_categories DISABLE ROW LEVEL SECURITY;

-- No seed data — starts empty; every item begins as "Uncategorized"
-- until Dhiraj tags it via the Tag Items modal.

-- Verify table was created
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'item_categories'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Table is ready to use.
-- ============================================
```

- [ ] **Step 2: Run the SQL in Supabase and verify**

Tell the user (Dhiraj) to run this file's SQL in the Supabase SQL Editor for this project, then confirm:
1. The final `SELECT` shows the 4 columns (`id`, `item_name`, `category`, `created_at`) with the expected types.
2. In the Supabase Table Editor, open `item_categories` → Table settings and confirm Row Level Security shows **disabled**. If it shows enabled despite the `ALTER TABLE` above, toggle it off manually there.

Wait for the user to confirm "done" before proceeding to Task 2 — Task 2's live-data verification cannot succeed against a table that doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add CREATE_ITEM_CATEGORIES_TABLE.sql
git commit -m "Add item_categories table for Tag Items feature"
```

---

### Task 2: Category-wise sales charts

**Files:**
- Modify: `analyse_sales.js`
- Modify: `analyse_sales.html`

**Interfaces:**
- Consumes: `item_categories` table from Task 1 (columns `item_name`, `category`), and `clusterItems`, `currentStats`/`loadAndRender()`, `getCssVar`, `formatIndianNumber`, `escapeHtml` (all already defined in `analyse_sales.js`).
- Produces: `CATEGORIES` (const array), `fetchItemCategories(): Promise<Map<string, string>>`, `bucketByCategory(clusters, categoryMap): Map<string, {count, revenue}>`, `itemCategories` (module state) — all consumed by Task 3's Tag Items modal code.

- [ ] **Step 1: Add the `CATEGORIES` constant and `itemCategories`/chart state**

In `analyse_sales.js`, in the state block (currently ending with `let selectedNewGroupSpellings = new Set();`), add:

```js
const CATEGORIES = ['Stationery', 'Sports', 'Toys', 'Seasonal'];
let itemCategories = new Map();     // Map<item_name (canonical display), category>
let categoryQuantityChart = null;
let categoryRevenueChart = null;
```

- [ ] **Step 2: Add `fetchItemCategories()`**

Add this right after `fetchAllTimeItemCounts()` (which currently ends the "Data fetch" section):

```js
// All item_categories rows, fetched once per page load — maps each
// canonical/merged item name to one of the 4 fixed categories.
async function fetchItemCategories() {
    const { data, error } = await supabaseClient.from('item_categories').select('*');
    if (error) throw error;
    const map = new Map();
    (data || []).forEach(r => map.set(r.item_name, r.category));
    return map;
}
```

- [ ] **Step 3: Add `bucketByCategory()` and `renderCategoryChart()`**

Add these right after `renderBottomTable()`:

```js
// Groups already-computed clusters by category (falling back to
// "Uncategorized" for anything not yet tagged), summing quantity and
// revenue per bucket. Pure re-grouping of data already in memory — no
// separate fetch, so this respects whatever period is currently loaded.
function bucketByCategory(clusters, categoryMap) {
    const buckets = new Map();
    CATEGORIES.concat(['Uncategorized']).forEach(cat => buckets.set(cat, { count: 0, revenue: 0 }));
    clusters.forEach(c => {
        const cat = categoryMap.get(c.display) || 'Uncategorized';
        const bucket = buckets.get(cat);
        bucket.count += c.count;
        bucket.revenue += c.revenue;
    });
    return buckets;
}

function renderCategoryChart(canvasId, existingChart, buckets, valueKey, formatValue) {
    if (existingChart) existingChart.destroy();
    const canvas = document.getElementById(canvasId);
    const labels = CATEGORIES.concat(['Uncategorized']);
    const colors = [getCssVar('--blue'), getCssVar('--olive'), getCssVar('--red'), getCssVar('--gold'), getCssVar('--ink-faint')];
    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: labels.map(l => buckets.get(l)[valueKey]),
                backgroundColor: colors,
                borderRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => formatValue(item.raw) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                x: { grid: { display: false }, ticks: { color: getCssVar('--ink-soft') } }
            }
        }
    });
}
```

- [ ] **Step 4: Wire the category charts into `loadAndRender()`**

In `loadAndRender()`, change:
```js
        renderKpis(currentStats);
        renderDailyTrendChart(currentStats.dailyCounts);
        topRevenueChart = renderTopChart('topRevenueCanvas', topRevenueChart, currentStats.byRevenue, getCssVar('--olive'), 'revenue', v => '₹' + formatIndianNumber(v));
        topQuantityChart = renderTopChart('topQuantityCanvas', topQuantityChart, currentStats.byQuantity, getCssVar('--blue'), 'count', v => v + '×');
        renderBottomTable(currentStats.bottomItems);
```
to:
```js
        renderKpis(currentStats);
        renderDailyTrendChart(currentStats.dailyCounts);
        topRevenueChart = renderTopChart('topRevenueCanvas', topRevenueChart, currentStats.byRevenue, getCssVar('--olive'), 'revenue', v => '₹' + formatIndianNumber(v));
        topQuantityChart = renderTopChart('topQuantityCanvas', topQuantityChart, currentStats.byQuantity, getCssVar('--blue'), 'count', v => v + '×');
        renderBottomTable(currentStats.bottomItems);

        const categoryBuckets = bucketByCategory(clusters, itemCategories);
        categoryQuantityChart = renderCategoryChart('categoryQuantityCanvas', categoryQuantityChart, categoryBuckets, 'count', v => v + '×');
        categoryRevenueChart = renderCategoryChart('categoryRevenueCanvas', categoryRevenueChart, categoryBuckets, 'revenue', v => '₹' + formatIndianNumber(v));
```

- [ ] **Step 5: Fetch `itemCategories` on page load**

In the `DOMContentLoaded` handler, change:
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
to:
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
    try {
        itemCategories = await fetchItemCategories();
    } catch (err) {
        console.error('Failed to load item categories:', err);
        itemCategories = new Map();
    }
    loadAndRender();
});
```

(Task 3 will add `initTagItemsButton();` to this same handler — not this task's concern.)

- [ ] **Step 6: Add the two new HTML sections**

In `analyse_sales.html`, right after the "Bottom 10" `</section>` and before `</main>`, add:

```html
            <!-- Category-wise sales (Quantity) -->
            <section>
                <h2>Category-wise Sales (Quantity)</h2>
                <p class="section-sub">Items sold per category — includes an Uncategorized bucket for anything not yet tagged</p>
                <div class="chart-container tall">
                    <canvas id="categoryQuantityCanvas"></canvas>
                </div>
            </section>

            <!-- Category-wise sales (Revenue) -->
            <section>
                <h2>Category-wise Sales (Revenue)</h2>
                <p class="section-sub">Revenue per category for the selected period</p>
                <div class="chart-container tall">
                    <canvas id="categoryRevenueCanvas"></canvas>
                </div>
            </section>
```

- [ ] **Step 7: Verify**

Run: `node --check analyse_sales.js`
Expected: no output (syntax OK).

Start the local server and open `http://localhost:8765/analyse_sales.html`:
Expected: the page loads with no console errors; two new chart sections appear after "Bottom 10 Selling Items", each showing 5 bars (Stationery, Sports, Toys, Seasonal, Uncategorized). Since `item_categories` is empty at this point (Task 1 just created it, nothing tagged yet), every item should fall into "Uncategorized" — confirm the Uncategorized bar's value matches the page's own "Items Sold" KPI (quantity chart) and a plausible total revenue (revenue chart), and all 4 real category bars show 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add analyse_sales.js analyse_sales.html
git commit -m "Add category-wise sales charts to Analyse Sales"
```

---

### Task 3: Tag Items modal

**Files:**
- Modify: `analyse_sales.html`
- Modify: `analyse_sales-style.css`
- Modify: `analyse_sales.js`

**Interfaces:**
- Consumes: `CATEGORIES`, `fetchItemCategories()`, `itemCategories`, `fetchSalesData`, `clusterItems`, `synonymGroupRows`, `escapeHtml`, `loadAndRender()` from Task 2 / earlier tasks.
- Produces: none consumed by later tasks (final task).

- [ ] **Step 1: HTML — button and modal markup**

In `analyse_sales.html`, replace:
```html
            <div class="back-to-dashboard-row">
                <div class="back-to-dashboard">
                    <a href="index.html">« Back To Dashboard</a>
                </div>
                <button type="button" id="manageGroupsBtn" class="manage-groups-link hidden">⚙ Manage Item Groups</button>
            </div>
```
with:
```html
            <div class="back-to-dashboard-row">
                <div class="back-to-dashboard">
                    <a href="index.html">« Back To Dashboard</a>
                </div>
                <div class="page-actions">
                    <button type="button" id="manageGroupsBtn" class="manage-groups-link hidden">⚙ Manage Item Groups</button>
                    <button type="button" id="tagItemsBtn" class="manage-groups-link hidden">🏷 Tag Items</button>
                </div>
            </div>
```

Then, right after the closing `</div>` of the `#groupsModal` (Manage Item Groups modal), and before the `<!-- Supabase SDK -->` comment, add:

```html

    <!-- Tag Items Modal (Dhiraj-only) -->
    <div id="tagItemsModal" class="groups-modal hidden">
        <div class="groups-modal-card">
            <div class="groups-modal-header">
                <h3>Tag Items</h3>
                <button type="button" class="groups-modal-close" id="tagItemsModalClose" aria-label="Close">✕</button>
            </div>
            <div class="groups-modal-body">
                <div class="tag-progress-strip">
                    <span class="tag-progress-label" id="tagProgressLabel">Loading…</span>
                    <div class="tag-progress-track"><div class="tag-progress-fill" id="tagProgressFill"></div></div>
                    <span class="tag-progress-label" id="tagProgressLeftLabel"></span>
                </div>

                <p class="groups-section-label">Needs Tagging</p>
                <p class="section-sub">Every item ever sold that doesn't have a category yet — tap a category to assign it</p>
                <div id="needsTaggingList"></div>

                <hr class="groups-divider">

                <p class="groups-section-label">Already Tagged</p>
                <p class="section-sub">Tap "Change" to move an item to a different category</p>
                <div id="alreadyTaggedList"></div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: CSS**

Append to `analyse_sales-style.css`:

```css
/* ─── Tag Items: gold accent (page-scoped token) ──── */
:root {
    --gold: #B4842E;
    --gold-light: rgba(180, 132, 46, 0.12);
}
body.dark-mode {
    --gold: #D4A857;
    --gold-light: rgba(212, 168, 87, 0.14);
}

/* ─── Tag Items: entry point row ──────────── */
.page-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

/* ─── Tag Items: progress strip ───────────── */
.tag-progress-strip {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    background: var(--cream-mid);
    border: 1px solid var(--rule-mid);
    border-radius: 4px;
    margin-bottom: 20px;
}
.tag-progress-track {
    flex: 1;
    height: 8px;
    background: var(--rule);
    border-radius: 20px;
    overflow: hidden;
}
.tag-progress-fill {
    height: 100%;
    background: var(--olive);
    border-radius: 20px;
    transition: width 0.25s ease;
}
.tag-progress-label {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-soft);
    white-space: nowrap;
}

/* ─── Tag Items: needs-tagging rows ───────── */
.tag-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--rule-mid);
    border-radius: 4px;
    background: var(--cream-mid);
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.tag-row-item { display: flex; align-items: baseline; gap: 8px; }
.tag-row-name {
    font-family: var(--serif);
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
}
.tag-row-count {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-faint);
}
.tag-btn-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.tag-btn {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: transparent;
    border: 1px solid var(--rule-strong);
    padding: 6px 11px;
    border-radius: 20px;
    cursor: pointer;
    color: var(--ink-soft);
}
.tag-btn.stationery:hover { background: var(--blue-light); border-color: var(--blue); color: var(--blue); }
.tag-btn.sports:hover { background: var(--olive-light); border-color: var(--olive); color: var(--olive); }
.tag-btn.toys:hover { background: var(--red-light); border-color: var(--red); color: var(--red); }
.tag-btn.seasonal:hover { background: var(--gold-light); border-color: var(--gold); color: var(--gold); }

/* ─── Tag Items: already-tagged rows ──────── */
.tagged-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 14px;
    border: 1px solid var(--rule-mid);
    border-radius: 4px;
    margin-bottom: 6px;
    flex-wrap: wrap;
}
.tagged-row-item { display: flex; align-items: baseline; gap: 8px; }
.tagged-row-name {
    font-family: var(--serif);
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
}
.tagged-row-count {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-faint);
}
.tagged-row-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}
.category-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 700;
}
.category-badge.stationery { background: var(--blue-light); color: var(--blue); }
.category-badge.sports { background: var(--olive-light); color: var(--olive); }
.category-badge.toys { background: var(--red-light); color: var(--red); }
.category-badge.seasonal { background: var(--gold-light); color: var(--gold); }

.change-link {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-faint);
    background: transparent;
    border: none;
    cursor: pointer;
    text-decoration: underline;
}
.change-link:hover { color: var(--ink); }
```

- [ ] **Step 3: JS — DOM refs**

In `analyse_sales.js`, add these DOM refs right after the existing `createGroupBtn` ref declaration:

```js
const tagItemsBtn = document.getElementById('tagItemsBtn');
const tagItemsModal = document.getElementById('tagItemsModal');
const tagItemsModalClose = document.getElementById('tagItemsModalClose');
const needsTaggingList = document.getElementById('needsTaggingList');
const alreadyTaggedList = document.getElementById('alreadyTaggedList');
const tagProgressLabel = document.getElementById('tagProgressLabel');
const tagProgressFill = document.getElementById('tagProgressFill');
const tagProgressLeftLabel = document.getElementById('tagProgressLeftLabel');
```

- [ ] **Step 4: JS — Tag Items modal logic**

Add this whole block at the very end of the file, right after `initManageGroupsButton()`'s closing brace and before the `// Dark Mode` section:

```js
// ============================================================
// Tag Items (Dhiraj-only)
// ============================================================

// All-time clusters (every item ever sold, correctly merged/renamed) —
// the same clustering pipeline used everywhere else on the page, just
// run over the full history instead of the currently selected period.
// This guarantees the tagging list's item identity can never drift from
// what Insights actually displays.
async function fetchAllTimeClusters() {
    const allRows = await fetchSalesData('till-date');
    return clusterItems(allRows, synonymGroupRows);
}

function renderTagItemsModal(allTimeClusters) {
    const needsTagging = allTimeClusters.filter(c => !itemCategories.has(c.display));
    const alreadyTagged = allTimeClusters.filter(c => itemCategories.has(c.display));

    const total = allTimeClusters.length;
    const taggedCount = alreadyTagged.length;
    tagProgressLabel.textContent = `${taggedCount} of ${total} items tagged`;
    tagProgressFill.style.width = total > 0 ? `${Math.round((taggedCount / total) * 100)}%` : '0%';
    tagProgressLeftLabel.textContent = `${total - taggedCount} left`;

    needsTaggingList.innerHTML = needsTagging.length
        ? needsTagging.map(c => `
            <div class="tag-row">
                <div class="tag-row-item">
                    <span class="tag-row-name">${escapeHtml(c.display)}</span>
                    <span class="tag-row-count">${c.count} sale${c.count === 1 ? '' : 's'} all-time</span>
                </div>
                <div class="tag-btn-group">
                    ${CATEGORIES.map(cat => `<button type="button" class="tag-btn ${cat.toLowerCase()}" data-tag="${escapeHtml(c.display)}" data-category="${cat}">${cat}</button>`).join('')}
                </div>
            </div>
        `).join('')
        : '<div class="empty-state">Everything is tagged — nice work.</div>';

    alreadyTaggedList.innerHTML = alreadyTagged.length
        ? alreadyTagged.map(c => {
            const cat = itemCategories.get(c.display);
            return `
                <div class="tagged-row">
                    <div class="tagged-row-item">
                        <span class="tagged-row-name">${escapeHtml(c.display)}</span>
                        <span class="tagged-row-count">${c.count} sale${c.count === 1 ? '' : 's'}</span>
                    </div>
                    <div class="tagged-row-actions">
                        <span class="category-badge ${cat.toLowerCase()}">${escapeHtml(cat)}</span>
                        <button type="button" class="change-link" data-change="${escapeHtml(c.display)}">Change</button>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="empty-state">Nothing tagged yet.</div>';

    wireTagItemsEvents();
}

function wireTagItemsEvents() {
    needsTaggingList.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => handleTagItem(btn.dataset.tag, btn.dataset.category));
    });
    alreadyTaggedList.querySelectorAll('[data-change]').forEach(btn => {
        btn.addEventListener('click', () => enterChangeMode(btn));
    });
}

// Replaces an already-tagged row's badge with the same 4-button picker,
// inline, so re-tagging uses the identical interaction as first-time
// tagging rather than a separate flow. Takes the clicked button directly
// (not a selector lookup by item name) so item names containing special
// characters never need escaping for a CSS attribute-selector query.
function enterChangeMode(changeBtn) {
    const itemName = changeBtn.dataset.change;
    const row = changeBtn.closest('.tagged-row');
    if (!row) return;
    const actions = row.querySelector('.tagged-row-actions');
    actions.innerHTML = `
        <div class="tag-btn-group">
            ${CATEGORIES.map(cat => `<button type="button" class="tag-btn ${cat.toLowerCase()}" data-tag="${escapeHtml(itemName)}" data-category="${cat}">${cat}</button>`).join('')}
        </div>
    `;
    actions.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => handleTagItem(btn.dataset.tag, btn.dataset.category));
    });
}

async function handleTagItem(itemName, category) {
    try {
        const { error } = await supabaseClient
            .from('item_categories')
            .upsert({ item_name: itemName, category }, { onConflict: 'item_name' });
        if (error) throw error;
        await refreshTagItemsAndInsights();
    } catch (err) {
        console.error('Error tagging item:', err);
        alert('Failed to tag item: ' + err.message);
    }
}

// Re-fetch categories + all-time clusters, then refresh both the modal's
// own lists and the underlying Insights page (category charts) so any
// change is visible immediately without a page reload.
async function refreshTagItemsAndInsights() {
    itemCategories = await fetchItemCategories();
    const allTimeClusters = await fetchAllTimeClusters();
    renderTagItemsModal(allTimeClusters);
    await loadAndRender();
}

async function openTagItemsModal() {
    tagItemsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    needsTaggingList.innerHTML = '<div class="loading-spinner">Loading…</div>';
    alreadyTaggedList.innerHTML = '';
    try {
        const allTimeClusters = await fetchAllTimeClusters();
        renderTagItemsModal(allTimeClusters);
    } catch (err) {
        console.error('Error opening tag items modal:', err);
        needsTaggingList.innerHTML = `<div class="empty-state">Could not load items: ${escapeHtml(err.message)}</div>`;
    }
}

function closeTagItemsModal() {
    tagItemsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function initTagItemsButton() {
    const isDhiraj = window.washiAuth && window.washiAuth.getUsername() === 'Dhiraj';
    if (isDhiraj && tagItemsBtn) {
        tagItemsBtn.classList.remove('hidden');
        tagItemsBtn.addEventListener('click', openTagItemsModal);
    }
    if (tagItemsModalClose) tagItemsModalClose.addEventListener('click', closeTagItemsModal);
    if (tagItemsModal) {
        tagItemsModal.addEventListener('click', (e) => {
            if (e.target === tagItemsModal) closeTagItemsModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tagItemsModal && !tagItemsModal.classList.contains('hidden')) {
            closeTagItemsModal();
        }
    });
}
```

- [ ] **Step 5: JS — init wiring**

In the `DOMContentLoaded` handler (from Task 2 Step 5), add `initTagItemsButton();` right after `initManageGroupsButton();` — final version:

```js
document.addEventListener('DOMContentLoaded', async () => {
    initBurgerMenu();
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    initManageGroupsButton();
    initTagItemsButton();
    try {
        synonymGroupRows = await fetchItemSynonymGroups();
    } catch (err) {
        console.error('Failed to load item synonym groups:', err);
        synonymGroupRows = [];
    }
    try {
        itemCategories = await fetchItemCategories();
    } catch (err) {
        console.error('Failed to load item categories:', err);
        itemCategories = new Map();
    }
    loadAndRender();
});
```

- [ ] **Step 6: Verify**

Run: `node --check analyse_sales.js`
Expected: no output (syntax OK).

Start the local server and open `http://localhost:8765/analyse_sales.html` in a browser:

1. **Visibility gating:** Log in as **Dhiraj**. Expected: "🏷 Tag Items" button visible next to "⚙ Manage Item Groups". Switch to any other user (e.g. Neha, via clearing/resetting `localStorage` key `washi_auth`). Expected: the button is absent (still has class `hidden`, never un-hidden).
2. **View items:** As Dhiraj, click "🏷 Tag Items". Expected: the progress strip shows real numbers (e.g. "0 of N items tagged" if nothing tagged yet from Task 2's verification), and every real distinct item from the shop's all-time data appears in either Needs Tagging or Already Tagged (none missing, none duplicated).
3. **Tag an item:** Pick a real untagged item, click one of its 4 category buttons. Expected: it disappears from Needs Tagging and appears in Already Tagged with the correct badge; the progress strip updates.
4. **Re-tag via Change:** Click "Change" on that same item, pick a different category. Expected: the badge updates to the new category; the item does not revert to Needs Tagging.
5. **Insights reflects tagging:** Close the modal. Expected: on the Insights page, the category-wise charts (added in Task 2) now show the tagged item's quantity/revenue moved out of "Uncategorized" and into its assigned category's bar, for both Till Date and Viewing Month periods.

- [ ] **Step 7: Commit**

```bash
cd /Users/dhiraj/Documents/TestVibe
git add analyse_sales.html analyse_sales-style.css analyse_sales.js
git commit -m "Add Dhiraj-only Tag Items modal to Analyse Sales"
```
