# Troubleshooting Guide - Cash Register App

## The test-connection.html page will automatically diagnose your issue!

Follow these steps in order:

---

## Step 1: Check Your API Key

**Your anon key should:**
- Start with `eyJ` (it's a JWT token)
- Be VERY long (300+ characters)
- Look like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...` (much longer)

**If your key is short or doesn't start with `eyJ`:**

1. Go to your Supabase project: https://app.supabase.com
2. Click on your project
3. Go to **Settings** (gear icon on left sidebar)
4. Click **API** section
5. Find the **Project API keys** section
6. Copy the `anon` `public` key (the long one!)
7. Update both `app.js` and `history.js` with the correct key

---

## Step 2: Verify Table Exists

Run this in Supabase SQL Editor:

```sql
SELECT * FROM daily_entries LIMIT 1;
```

**If you get "table does not exist":**

Run the CREATE TABLE SQL from README.md:

```sql
CREATE TABLE daily_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    cash_amount DECIMAL(10, 2) NOT NULL,
    upi_amount DECIMAL(10, 2) NOT NULL,
    card_amount DECIMAL(10, 2) NOT NULL,
    petty_cash DECIMAL(10, 2) NOT NULL,
    total_income DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_daily_entries_date ON daily_entries(date DESC);
```

---

## Step 3: Fix Row Level Security (RLS)

This is the MOST COMMON issue!

Run this in Supabase SQL Editor:

```sql
ALTER TABLE daily_entries DISABLE ROW LEVEL SECURITY;
```

That's it! This allows public access to the table.

---

## Step 4: Test Again

1. Open `test-connection.html` in your browser
2. Look at the automatic diagnostics
3. Click "Test Connection" button
4. Click "Test Insert" button
5. Follow any error messages shown

---

## Still Not Working?

Open your browser's Developer Console:
- Chrome/Edge: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- Look at the **Console** tab
- Click "Save Entry" in your app
- Copy any red error messages

Common errors and fixes:

### Error: "Invalid API key"
→ You have the wrong key. See Step 1 above.

### Error: "new row violates row-level security policy"
→ RLS is still enabled. Run the SQL from Step 3.

### Error: "relation 'daily_entries' does not exist"
→ Table not created. Run the SQL from Step 2.

### Error: "duplicate key value violates unique constraint"
→ Great! This means INSERT works. You're trying to save the same date twice.
→ Your app is working! Try a different date or update the existing entry.

---

## Quick Checklist

- [ ] Correct anon key (starts with `eyJ`, very long)
- [ ] Table created with CREATE TABLE SQL
- [ ] RLS disabled with ALTER TABLE SQL
- [ ] Refreshed the browser page
- [ ] Checked browser console for errors

---

## Contact Info

If you're still stuck after following all steps, share:
1. What the test-connection.html page shows
2. Any browser console errors
3. Screenshot of your Supabase API settings page (hide the keys!)
