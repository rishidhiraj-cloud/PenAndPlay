-- Storage Items Table Schema
-- Execute this in Supabase SQL Editor to create the storage_items table

CREATE TABLE storage_items (
  id BIGSERIAL PRIMARY KEY,
  storage_area VARCHAR(50) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster searches
CREATE INDEX idx_storage_items_storage_area ON storage_items(storage_area);
CREATE INDEX idx_storage_items_item_name ON storage_items(item_name);
CREATE INDEX idx_storage_items_created_at ON storage_items(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE storage_items ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on storage_items" ON storage_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: For production, you should implement proper authentication and authorization policies
-- Example of more restrictive policies:
-- CREATE POLICY "Allow authenticated users to read storage_items" ON storage_items
--   FOR SELECT
--   USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated users to insert storage_items" ON storage_items
--   FOR INSERT
--   WITH CHECK (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated users to update storage_items" ON storage_items
--   FOR UPDATE
--   USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated users to delete storage_items" ON storage_items
--   FOR DELETE
--   USING (auth.role() = 'authenticated');
