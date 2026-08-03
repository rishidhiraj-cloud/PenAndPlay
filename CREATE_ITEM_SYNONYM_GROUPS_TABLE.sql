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
