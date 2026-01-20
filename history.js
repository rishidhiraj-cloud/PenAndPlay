// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ History.js loaded successfully');

// DOM Elements
const historyContainer = document.getElementById('historyContainer');

// Initialize History Page
async function init() {
    console.log('🚀 Loading history...');
    await loadHistory();
}

// Load History Entries
async function loadHistory() {
    try {
        historyContainer.innerHTML = '<div class="loading-spinner">Loading entries...</div>';

        // Fetch all entries ordered by date (newest first)
        const { data, error } = await supabaseClient
            .from('daily_entries')
            .select('*')
            .order('date', { ascending: false });

        console.log('📊 History query result:', { data, error });

        if (error) {
            console.error('❌ Error loading history:', error);
            throw error;
        }

        if (data && data.length > 0) {
            console.log(`✅ Found ${data.length} entries`);
            displayHistory(data);
        } else {
            console.log('ℹ️ No entries found');
            displayNoEntries();
        }
    } catch (err) {
        console.error('❌ Exception loading history:', err);
        historyContainer.innerHTML = `
            <div class="no-entries">
                <p style="color: #721c24;">Error loading entries: ${err.message}</p>
                <p>Please check the browser console for details.</p>
            </div>
        `;
    }
}

// Display History Entries
function displayHistory(entries) {
    console.log('📝 Displaying', entries.length, 'entries');

    const historyHTML = entries.map(entry => {
        const date = new Date(entry.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
            <div class="history-item">
                <div class="history-date">${date}</div>
                <div class="history-details">
                    <div class="detail-item">
                        <span class="detail-label">Cash on Hand:</span>
                        <span class="detail-value">₹${parseFloat(entry.cash_amount).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Cash on Day:</span>
                        <span class="detail-value">₹${parseFloat(entry.cash_total || 0).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">UPI:</span>
                        <span class="detail-value">₹${parseFloat(entry.upi_amount).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Card:</span>
                        <span class="detail-value">₹${parseFloat(entry.card_amount).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">AP Cash:</span>
                        <span class="detail-value">₹${parseFloat(entry.ap_cash || 0).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Petty Cash:</span>
                        <span class="detail-value">₹${parseFloat(entry.petty_cash).toFixed(2)}</span>
                    </div>
                </div>
                <div class="history-total">
                    <span class="detail-label">Total Income:</span>
                    <span class="detail-value">₹${parseFloat(entry.total_income).toFixed(2)}</span>
                </div>
                <button class="delete-btn" onclick="deleteEntry('${entry.date}')">Delete</button>
            </div>
        `;
    }).join('');

    historyContainer.innerHTML = `<div class="history-list">${historyHTML}</div>`;
}

// Display No Entries Message
function displayNoEntries() {
    historyContainer.innerHTML = `
        <div class="no-entries">
            <p>No entries found.</p>
            <a href="index.html" class="btn-primary" style="display: inline-block; text-decoration: none; padding: 12px 24px;">Create First Entry</a>
        </div>
    `;
}

// Delete Entry
async function deleteEntry(date) {
    if (!confirm('Are you sure you want to delete this entry?')) {
        return;
    }

    console.log('🗑️ Deleting entry for date:', date);

    try {
        const { error } = await supabaseClient
            .from('daily_entries')
            .delete()
            .eq('date', date);

        if (error) {
            console.error('❌ Delete error:', error);
            throw error;
        }

        console.log('✅ Entry deleted successfully');

        // Reload history
        await loadHistory();
    } catch (err) {
        console.error('❌ Error deleting entry:', err);
        alert('Error deleting entry: ' + err.message);
    }
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', init);
