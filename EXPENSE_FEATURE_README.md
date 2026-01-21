# Expense Tracking Feature

## Overview
A complete expense tracking module has been added to your Pen & Play Club Cash Register app. This allows you to record and manage daily expenses alongside your income entries.

---

## 🚀 Setup Instructions

### Step 1: Create Database Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create expenses table
CREATE TABLE expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_date DATE NOT NULL,
    expense_by VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paid_from VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_by ON expenses(expense_by);

-- Disable RLS (for simple setup)
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
```

**OR** simply run the file: `CREATE_EXPENSES_TABLE.sql`

### Step 2: Access the Feature

Navigate to any page of your app and click the **💸 Expense** button!

---

## 📋 Features

### Expense Entry Form

**Fields:**
1. **Expense Date** - Calendar date picker (defaults to today)
2. **Expense By** - Dropdown with options:
   - Abhishek
   - Neha
   - Priyanka
   - Dhiraj
3. **Amount** - Numeric input (required, must be > 0)
4. **Paid From** - Radio buttons:
   - Bank
   - AP Cash
   - Self
5. **Description** - Optional text area for details

**Validation:**
- All fields except description are required
- Amount must be greater than 0
- Clear error messages shown for invalid data

### Expense History

**Displays:**
- Date of expense
- Amount (in red to distinguish from income)
- Who made the expense
- Payment method (color-coded):
  - 🔵 Bank (Blue)
  - 🟠 AP Cash (Orange)
  - 🟢 Self (Green)
- Description (if provided)
- Delete button for each expense

**Sorting:**
- Most recent expenses shown first
- Easy to scan and review

---

## 🎨 Design

**Mobile-First:**
- Large, touch-friendly buttons
- Responsive layout
- Easy navigation

**Consistent Styling:**
- Matches existing app design
- Purple gradient header
- Clean white cards
- Professional appearance

**Color Coding:**
- Amounts in **red** (expenses vs income in green)
- Payment methods color-coded for quick identification

---

## 📁 Files Created

1. **expense.html** - Main expense page
2. **expense.js** - JavaScript logic
3. **expense-style.css** - Styling
4. **CREATE_EXPENSES_TABLE.sql** - Database setup

**Files Modified:**
- `index.html` - Added Expense navigation button
- `history.html` - Added Expense navigation button
- `dashboard.html` - Added Expense navigation button

---

## 🔧 Technical Details

### Database Schema

```
expenses
├── id (UUID, Primary Key)
├── expense_date (DATE)
├── expense_by (VARCHAR)
├── amount (DECIMAL)
├── paid_from (VARCHAR)
├── description (TEXT, nullable)
└── created_at (TIMESTAMP)
```

### Key Functions

**expense.js:**
- `init()` - Initialize page, set today's date
- `handleSubmit()` - Validate and save expense
- `loadExpenseHistory()` - Fetch all expenses from database
- `displayExpenses()` - Render expense list
- `deleteExpense()` - Delete expense record
- `showStatusMessage()` - Display success/error messages

### Data Flow

1. User fills form
2. JavaScript validates input
3. Data sent to Supabase
4. Success message shown
5. Form cleared
6. History refreshed automatically

---

## 🧪 Testing

### Test the Feature:

1. **Add an Expense:**
   - Go to Expense page
   - Fill in all required fields
   - Click "Save Expense"
   - Check for success message

2. **View History:**
   - Scroll down to see expense list
   - Verify all details are correct

3. **Delete an Expense:**
   - Click Delete button
   - Confirm deletion
   - Verify expense removed from list

4. **Validation:**
   - Try submitting without required fields
   - Try entering 0 or negative amount
   - Verify error messages appear

---

## 🎯 Usage Tips

**For Users:**
- Add expenses daily to keep accurate records
- Use description field for additional context
- Review payment methods to track spending sources

**For Administrators:**
- Export data from Supabase for reports
- Track spending by person
- Analyze payment method distribution

---

## 🔐 Security

**Current Setup:**
- Row Level Security (RLS) is disabled for simplicity
- Suitable for internal/trusted use

**For Production:**
Consider enabling RLS with policies:
```sql
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations"
ON expenses FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

---

## 📊 Future Enhancements (Optional)

**Possible additions:**
- Expense categories (Utilities, Supplies, etc.)
- Monthly expense summaries
- Expense vs Income dashboard comparison
- Export to CSV/PDF
- Search and filter capabilities
- Expense approval workflow

---

## ✅ Checklist

- [ ] Run SQL to create expenses table
- [ ] Hard refresh all pages (Cmd+Shift+R)
- [ ] Test adding an expense
- [ ] Test viewing expense history
- [ ] Test deleting an expense
- [ ] Verify navigation works from all pages

---

## 🆘 Troubleshooting

**Problem:** Can't save expenses
- **Solution:** Make sure you ran the SQL to create the table
- Check browser console for errors (F12)

**Problem:** "Table does not exist" error
- **Solution:** Run CREATE_EXPENSES_TABLE.sql in Supabase

**Problem:** Navigation button not visible
- **Solution:** Hard refresh the page (Cmd+Shift+R)

---

## 📞 Support

If you encounter issues:
1. Check browser console (F12)
2. Verify Supabase table exists
3. Confirm RLS is disabled on expenses table
4. Check that all files are in the correct folder

---

**Expense tracking is now live! 💸✨**
