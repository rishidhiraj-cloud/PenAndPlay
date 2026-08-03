# Item Categories (Tag Items) — Design Spec

## Goal

Let Dhiraj classify every diary item into one of 4 fixed categories
(Stationery, Sports, Toys, Seasonal), via a browser tagging interface, and
show category-wise sales (quantity + revenue) on the Analyse Sales
(Insights) page.

## Background

The Manage Item Groups feature (shipped) already merges spelling variants
of the same diary item and gives each merged item a single canonical
`display` name via `clusterItems(rows, synonymGroupRows)`. This feature
adds an independent, orthogonal layer on top: tagging each of those
canonical items into one of 4 categories.

Per user decision: tagging happens at the **canonical/merged item level**
(the exact string `clusterItems()` produces as `display`), not per raw
diary spelling — tagging "Print" once covers every spelling folded into
it (P.Out, etc.), and a new misspelling of an already-tagged item does not
reappear in the tagging list.

## Data Model

New table `item_categories` — one row per tagged item:

```sql
CREATE TABLE item_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('Stationery', 'Sports', 'Toys', 'Seasonal')),
    created_at TIMESTAMP DEFAULT NOW()
);
```

- `item_name` is the exact `display` string from `clusterItems()` — unique,
  since each item has exactly one category.
- `category` is constrained to the 4 fixed values via `CHECK`. This is a
  closed set per explicit requirement — no "manage categories" UI, no
  user-defined categories (YAGNI; only 4 were ever requested).
- Tagging = `UPSERT` on `item_name` (insert if new, update `category` if
  re-tagging an already-tagged item via "Change").
- RLS disabled, consistent with every other table in this app.

## Reusing Existing Infrastructure (no new fetch logic needed)

`fetchSalesData(period)` already returns every `sales_log` row ever
recorded when `period !== 'viewing-month'` (no date filter applied) —
i.e. `fetchSalesData('till-date')` **is** the all-time fetch. Running
that through the already-shipped `clusterItems(rows, synonymGroupRows)`
produces the complete, correctly-merged, all-time universe of distinct
items — the exact same shape and display-name logic used everywhere else
on the page. No new clustering logic is needed; the tagging feature is
purely a lookup layer on top of clusters that already exist.

**Needs Tagging list** = all-time clusters whose `display` is NOT a key in
the fetched `item_categories` map.

**Already Tagged list** = all-time clusters whose `display` IS a key in
that map, shown with their current category and a "Change" control.

**Category-wise sales section** (Insights page, period-scoped) = the
*already-computed* clusters for the currently selected period (from
`loadAndRender()`'s existing `currentStats`), re-bucketed by looking up
each cluster's `display` in the `item_categories` map (falling back to
"Uncategorized" if untagged), summing `count` and `revenue` per bucket.
Respects the page's existing Till Date / Viewing Month toggle, same as
every other chart on the page — this is not a separate fetch, just a
re-grouping of data already in memory.

## UI

### Entry point

A `🏷 Tag Items` button next to the existing `⚙ Manage Item Groups`
button, same Dhiraj-only gating (`window.washiAuth.getUsername() ===
'Dhiraj'`, hidden via CSS by default, only un-hidden by JS for Dhiraj —
same pattern as every other admin gate in this app).

### Modal

Same full-screen modal mechanics as the Manage Item Groups / Day View
modals (fixed backdrop, centered card, close on backdrop click or
Escape).

**Progress strip** at the top: "`N` of `M` items tagged" + a progress bar
+ "`M-N` left" — gives Dhiraj a sense of how much tagging remains.

**Needs Tagging section** — one row per untagged item: item name, its
all-time sale count, and 4 category buttons (Stationery / Sports / Toys /
Seasonal). Tapping a button immediately upserts that category for the
item and removes the row from this list (optimistic UI + refresh).

**Already Tagged section** — one row per tagged item: item name, all-time
sale count, a color-coded category badge, and a "Change" link. Clicking
"Change" reveals the same 4-button picker inline for that row (replacing
the badge temporarily), letting Dhiraj re-tag an item without needing a
separate flow. This directly addresses the possibility of a mis-tag
without introducing a whole new UI mode — same interaction shape as
tagging, just re-entered.

### Category-wise sales (Insights page)

Two new bar charts, matching the page's existing Top-10-by-Revenue /
Top-10-by-Quantity pattern:
- **Category-wise Sales (Quantity)** — 5 bars: Stationery, Sports, Toys,
  Seasonal, Uncategorized.
- **Category-wise Sales (Revenue)** — same 5 bars, by revenue.

Placed as the last two `<section>`s on the Insights page, immediately
after the existing "Bottom 10 Selling Items" section — a category-level
summary reads naturally as the final, most-zoomed-out view after the
page's existing per-item detail sections.

## Files Touched

- `CREATE_ITEM_CATEGORIES_TABLE.sql` — new table (new file, matching this
  project's one-file-per-table convention).
- `analyse_sales.js` — new `CATEGORIES` constant, `fetchItemCategories()`,
  category-bucketing logic for the two new charts, all Tag Items modal
  logic (render Needs Tagging / Already Tagged, tag/re-tag handlers,
  refresh cycle), wiring into `loadAndRender()` and `DOMContentLoaded`.
- `analyse_sales.html` — new button + modal markup, two new `<section>`s
  with canvases for the category charts.
- `analyse_sales-style.css` — styles for the button, modal, tag rows,
  category badges/buttons (matching the approved mockup's color coding:
  Stationery=blue, Sports=olive, Toys=red, Seasonal=gold — a new `--gold`
  design token, since the existing palette only has 3 named accents).

## Out of Scope (explicit, per design decisions made)

- No user-defined/editable category list — exactly these 4, fixed.
- No bulk-tagging (e.g. "tag all remaining as Stationery") — one item at a
  time, per the mockup.
- No category-based filtering elsewhere on the page (e.g. Top 10 charts
  don't gain a "filter by category" control) — category-wise sales is its
  own new section, additive only.

## Manual Verification

Verify locally over `http://localhost:8765` (never `file://`) against
real Supabase data before deploying:
1. As Dhiraj: confirm "🏷 Tag Items" appears beside "⚙ Manage Item
   Groups"; as any other user, confirm it does not appear.
2. Open the modal — confirm every real distinct item from the shop's
   all-time data appears in either Needs Tagging or Already Tagged (none
   missing, none duplicated).
3. Tag a real untagged item into a category — confirm it moves from Needs
   Tagging to Already Tagged immediately, and the progress strip updates.
4. Use "Change" on an already-tagged item to re-categorize it — confirm
   the badge updates and the item stays in Already Tagged (does not
   revert to Needs Tagging).
5. Close the modal and confirm the two new category-wise charts on the
   Insights page reflect the tagging correctly, for both Till Date and
   Viewing Month periods.
