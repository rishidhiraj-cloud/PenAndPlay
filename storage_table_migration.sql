-- Migration: Update item_name column to support 500 characters
-- Execute this in Supabase SQL Editor if the table already exists

ALTER TABLE storage_items
ALTER COLUMN item_name TYPE VARCHAR(500);
