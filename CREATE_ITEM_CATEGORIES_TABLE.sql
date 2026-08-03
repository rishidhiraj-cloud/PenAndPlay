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
