# Manage Item Groups — Design Spec

## Goal

Let Dhiraj view and manage the manual item-name synonym groups used by the
Analyse Sales insights page, from the browser — no code changes or
redeploys required to add a new grouping.

## Background

`analyse_sales.js`'s `clusterItems()` merges spelling variants of the same
item in two layers:

1. **Automatic** — exact match, singular/plural, whitespace/punctuation
   match, and fuzzy similarity (≥86% for strings ≥5 chars). Out of scope
   for this feature — stays as-is, not user-editable.
2. **Manual** — a hardcoded `SYNONYM_GROUPS` array in `analyse_sales.js`:
   ```js
   const SYNONYM_GROUPS = [
       ['print', 'p out'],
       ['rapping', 'packing', 'gift packing'],
       ['stationery', 'stat'],
   ];
   ```
   Editing this today means changing code and redeploying.

This feature replaces layer 2's hardcoded array with a Supabase-backed
table, editable via a Dhiraj-only management modal on the Insights page.

## Data Model

New table `item_synonym_groups` — one row per (canonical display name,
variant spelling) pair. Multiple rows sharing the same `canonical_name`
form a group.

```sql
CREATE TABLE item_synonym_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    variant_spelling TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

- Adding a variant to a group = insert one row.
- Removing a variant = delete one row.
- Renaming a group's display name = `UPDATE ... SET canonical_name = ?
  WHERE canonical_name = <old name>` (updates every row in the group).
- Deleting a whole group = delete every row with that `canonical_name`.
- RLS disabled, consistent with every other table in this app.

The three existing `SYNONYM_GROUPS` entries are seeded into this table as
part of the same migration SQL, so removing the hardcoded array is not a
regression:

| canonical_name | variant_spelling |
|---|---|
| Print | Print |
| Print | P.Out |
| Gift Wrapping | Rapping |
| Gift Wrapping | Packing |
| Gift Wrapping | Gift Packing |
| Stationery | Stationery |
| Stationery | Stat. |

(Seed values keep their natural casing/punctuation — not pre-normalized —
so they display nicely as chips in the management UI. Matching in
`clusterItems()` is punctuation/case insensitive regardless, via
`compactItem(normalizeItem(...))` on both sides, so exact stored casing
never affects merge behavior, only display.)

## Integration into `clusterItems()`

`clusterItems(rows, synonymGroups)` gains a second parameter: the fetched
`item_synonym_groups` rows, grouped by `canonical_name` into
`{ canonical_name, variants: string[] }`.

For each group:
- Union every variant spelling present in the current period's data
  together, exactly as today's hardcoded-array pass does (via
  `compactItem` comparison, not exact string match — preserves the
  Print/P.Out punctuation-insensitivity fix).
- Record `canonicalOverride.set(finalRoot, canonical_name)` for that
  cluster's root.

When computing each cluster's `display` name (today: whichever raw
spelling occurred most often), a cluster with a `canonicalOverride` uses
that override instead. This also means a "group" with only one variant
present in the current period still applies — it acts as a plain rename of
that item's display label, which falls out naturally from the same logic
and is a reasonable generalization (confirmed acceptable, not explicitly
requested but not excluded either).

The synonym groups are fetched **once per page load** (not re-fetched per
period-toggle change), same as `sales_log` rows are re-fetched per toggle
but merge rules are period-independent.

## UI

### Entry point

A small `⚙ Manage Item Groups` button, visible **only** when
`window.washiAuth.getUsername() === 'Dhiraj'` — hidden entirely (not just
disabled) for every other user, matching the "Manage Item Groups... should
not be visible to anyone else apart from Dhiraj" requirement. Placed in
the `.back-to-dashboard` row (page-specific wrapper, not modifying the
shared `.back-to-dashboard` class used by other pages), top of the
Insights page.

### Modal

Full-screen modal (same pattern as Sales Log's Day View modal / Passport
Photo's log modal): dimmed backdrop, centered card, header with title +
✕ close, scrollable body, closes on backdrop click or Escape.

**Section 1 — Existing Groups.** One card per canonical group:
- Display name (bold) + a computed subtitle: total sale occurrences across
  all its variants (all-time, not period-scoped) and variant count.
- Variant spellings as chips, each with its own all-time occurrence count
  and a ✕ to remove just that variant (deletes one row; if it's the last
  remaining variant, removing it deletes the whole group).
- `+ Add spelling` chip — opens the same search-and-pick control as the
  create-group flow, scoped to adding into this existing group.
- `Rename` — inline edit of the canonical name (updates all rows).
- `Delete Group` — confirm dialog, then deletes every row for that group
  (the affected items simply stop being merged/renamed going forward —
  their diary rows are untouched).

**Section 2 — Create New Group.**
- Free-text `Display name` field — exactly what the user types is what
  Insights will show (per design decision — no requirement to match an
  existing diary spelling).
- A search box + scrollable picker listing **all-time distinct item
  spellings** from `sales_log` (not period-scoped — a spelling that only
  appeared 3 months ago should still be groupable), each row showing its
  own all-time occurrence count. Clicking a row toggles its selection
  (checkmark + highlight).
- Selected spellings shown as a live preview chip row above the submit
  button, each individually removable before saving.
- `Create Group` button — disabled until a display name is entered and at
  least one spelling is selected. On click: insert one row per selected
  spelling with the given `canonical_name`, then refresh both the modal's
  group list and the underlying Insights page data (KPIs/charts/table)
  so the change is visible immediately without a page reload.

All writes (create/rename/add-variant/remove-variant/delete-group) go
directly to Supabase from the client, matching every other admin action in
this app (Expenses delete, Sales Log day delete, Storage delete) — no new
serverless function needed.

### Distinct-spellings data source

A single query at modal-open time: `select item from sales_log` (all rows,
all time — no date filter), aggregated client-side into
`{ spelling, count }` grouped by the raw (trimmed) spelling text. Reused
for both the create-group picker and the existing-groups' occurrence-count
subtitles. Not scoped to the page's Till Date / Viewing Month toggle,
since group management is a global configuration action, independent of
whatever period is currently being viewed.

## Files Touched

- `CREATE_ITEM_SYNONYM_GROUPS_TABLE.sql` — new table + seed data (new file,
  matching this project's convention of one `CREATE_*_TABLE.sql` per
  table).
- `analyse_sales.js` — remove hardcoded `SYNONYM_GROUPS`; add
  `fetchItemSynonymGroups()`, `fetchAllTimeItemCounts()`; update
  `clusterItems()` signature and display-name logic; add all modal
  open/close/render/search/select/create/rename/add-variant/
  remove-variant/delete-group wiring.
- `analyse_sales.html` — add the Dhiraj-gated button + full modal markup.
- `analyse_sales-style.css` — add styles for the button, modal, group
  cards, chips, and picker list (matching the approved mockup).

## Out of Scope (explicit, per design decisions made)

- No ability to override/undo automatic (layer 1) similarity-based
  merges — automatic merging stays exactly as it works today.
- No non-Dhiraj visibility of groups at all — not even read-only. The
  button and modal do not exist in the DOM for other users.
- No bulk import/export of groups.

## Manual Verification

Since this reads/writes real Supabase data, verify locally over
`http://localhost:8765` (never `file://`, per this app's standing WASM/
fetch-origin constraint) before deploying:
1. As Dhiraj: open Insights, confirm the Manage Item Groups button
   appears; as any other user, confirm it does not appear in the DOM.
2. Create a new group from two real diary spellings; confirm the KPI/chart
   numbers update immediately to reflect the merge.
3. Add a spelling to an existing group; remove a spelling; rename a group;
   delete a group — confirm each persists after closing and reopening the
   modal, and that Insights numbers update accordingly each time.
4. Confirm the three seeded groups (Print, Gift Wrapping, Stationery)
   behave identically to the previous hardcoded `SYNONYM_GROUPS` output.
