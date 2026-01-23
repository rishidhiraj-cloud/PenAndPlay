# Storage Management Module

## Overview
Complete inventory/storage management system for tracking items across multiple storage locations.

## Database Setup
Execute `storage_table_schema.sql` in Supabase SQL Editor to create the required table.

## Storage Areas
- Rack 1 to Rack 20 (20 racks)
- DG Home
- AP Home
- Almirah

Total: 23 predefined storage locations

## Features

### 1. Add Item to Storage
- Select storage area from dropdown
- Enter item name (free text)
- Items saved to Supabase `storage_items` table
- Instant feedback on success/failure

### 2. View Items by Storage
- Select any storage area
- View all items in that location
- Delete items with confirmation
- Real-time updates from database

### 3. Search Item Across Storages
- Case-insensitive search
- Shows all storage locations containing the item
- Results grouped by storage area
- Shows count per storage location

## Technical Implementation

### Files Created
- `storage.html` - Main UI with 3 tabs (Add, View, Search)
- `storage.js` - Business logic and Supabase integration
- `storage-style.css` - Styling for storage module
- `storage_table_schema.sql` - Database schema

### Files Modified
- `index.html` - Added burger menu link
- `entry.html` - Added burger menu link
- `history.html` - Added burger menu link
- `expense.html` - Added burger menu link

### Database Schema
```sql
CREATE TABLE storage_items (
  id BIGSERIAL PRIMARY KEY,
  storage_area VARCHAR(50) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Functions
- `handleAddItem()` - Insert new item
- `loadStorageItems()` - Load items by storage area
- `deleteItem()` - Delete item with confirmation
- `handleSearch()` - Search items across all storages
- Case-insensitive search using `ilike`

## Navigation
Access via burger menu: "📦 Manage Storage" (below Expenses)

## Dark Mode
Fully compatible with existing dark mode implementation.

## Data Persistence
- Uses existing Supabase connection
- Same credentials as other modules
- Real-time database operations
- Indexed for fast searches

## Security
- Row Level Security (RLS) enabled
- Configurable policies in SQL schema
- Input sanitization (HTML escaping)
- Confirmation dialogs for destructive actions
