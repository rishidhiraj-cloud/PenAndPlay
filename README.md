# Daily Cash Register Web Application

A mobile-first, responsive web application for maintaining daily cash register entries for small shops.

## Features

- **Mobile-First Design**: Optimized for smartphones with large, touch-friendly inputs
- **Real-Time Calculation**: Automatically calculates total income as you type
- **Smart Logic**: Automatically subtracts yesterday's petty cash from today's total
- **Persistent Storage**: All data saved to Supabase backend
- **Entry History**: View and manage past entries
- **Update Capability**: Edit existing entries by selecting the date

## Business Logic

**Total Income Formula:**
```
Total Income = Cash Amount + UPI Amount + Card Amount - Yesterday's Petty Cash
```

- Yesterday's petty cash is automatically fetched from the database
- If no previous entry exists, yesterday's petty cash defaults to 0

## Setup Instructions

### 1. Create Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. In the SQL Editor, run this query to create the table:

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

-- Create index for faster date queries
CREATE INDEX idx_daily_entries_date ON daily_entries(date DESC);
```

### 2. Configure Application

1. Get your Supabase credentials:
   - Go to Project Settings → API
   - Copy the **Project URL** and **anon/public key**

2. Update configuration in **both** `app.js` and `history.js`:
   ```javascript
   const SUPABASE_URL = 'your-project-url';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```

### 3. Run the Application

Simply open `index.html` in a web browser. For best results:
- Use a local web server (Live Server in VS Code, or Python's `python -m http.server`)
- Or deploy to any static hosting (Netlify, Vercel, GitHub Pages)

## Usage

### Creating an Entry

1. Date defaults to today (can be changed)
2. Enter Cash, UPI, Card, and Petty Cash amounts
3. Yesterday's petty cash loads automatically
4. Total income calculates in real-time
5. Click "Save Entry" to store in database

### Updating an Entry

1. Select a date that has an existing entry
2. Form will auto-populate with saved data
3. Make changes and click "Update Entry"

### Viewing History

- Click "View History" to see all past entries
- Entries are sorted by date (newest first)
- Delete entries with the delete button

## Files Structure

```
├── index.html          # Main entry form page
├── history.html        # History view page
├── style.css           # Main styles (mobile-first)
├── history-style.css   # History page styles
├── app.js              # Main application logic
├── history.js          # History page logic
└── README.md           # This file
```

## Browser Compatibility

- Chrome (Android/Desktop)
- Safari (iOS/Desktop)
- Firefox (Android/Desktop)
- Edge

## Security Notes

- The anon key is safe to expose in client-side code
- Set up Row Level Security (RLS) in Supabase for production use
- For production, consider adding authentication

## Support

For issues or questions, refer to:
- [Supabase Documentation](https://supabase.com/docs)
- [MDN Web Docs](https://developer.mozilla.org)
