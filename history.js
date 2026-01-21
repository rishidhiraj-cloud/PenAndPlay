// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ History.js loaded successfully');

// DOM Elements
const historyContainer = document.getElementById('historyContainer');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

// Get selected month from localStorage
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// Initialize History Page
async function init() {
    console.log('🚀 Loading history...');

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    // Get and display selected month
    const selectedMonth = getSelectedMonth();
    const monthName = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    currentMonthLabelEl.textContent = monthName;

    await loadHistory();
}

// Load History Entries
async function loadHistory() {
    try {
        pageLoader.classList.remove('hidden');
        historyContainer.innerHTML = '<div class="loading-spinner">Loading entries...</div>';

        // Get selected month
        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;

        // Get last day of month
        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;

        console.log('Fetching history from', startDate, 'to', endDate);

        // Fetch entries for selected month ordered by date (newest first)
        const { data, error } = await supabaseClient
            .from('daily_entries')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
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
    } finally {
        pageLoader.classList.add('hidden');
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
                <div class="action-buttons">
                    <button class="delete-btn" onclick="deleteEntry('${entry.date}')">Delete</button>
                    <button class="whatsapp-btn" onclick='sendWhatsApp(${JSON.stringify(entry)})'>
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                    </button>
                </div>
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
            <a href="entry.html" class="btn-primary" style="display: inline-block; text-decoration: none; padding: 12px 24px;">Create First Entry</a>
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

// Send WhatsApp
async function sendWhatsApp(entry) {
    const date = new Date(entry.date);
    const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    let message = `*Pen & Play Cash Register - ${formattedDate}*

Cash on Hand: ₹${parseFloat(entry.cash_amount).toFixed(2)}
Cash on Day: ₹${parseFloat(entry.cash_total || 0).toFixed(2)}
UPI: ₹${parseFloat(entry.upi_amount).toFixed(2)}
Card: ₹${parseFloat(entry.card_amount).toFixed(2)}
AP Cash: ₹${parseFloat(entry.ap_cash || 0).toFixed(2)}
Petty Cash: ₹${parseFloat(entry.petty_cash).toFixed(2)}

*TOTAL INCOME : ₹${parseFloat(entry.total_income).toFixed(2)}*`;

    // Fetch expenses for this date based on created_at
    try {
        const startOfDay = `${entry.date}T00:00:00`;
        const endOfDay = `${entry.date}T23:59:59`;

        const { data: expenses, error } = await supabaseClient
            .from('expenses')
            .select('*')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay)
            .order('created_at', { ascending: false });

        if (!error && expenses && expenses.length > 0) {
            message += '\n\n*Expenses*\n';

            expenses.forEach((expense, index) => {
                const expDate = new Date(expense.expense_date);
                const expFormattedDate = `${String(expDate.getDate()).padStart(2, '0')}/${String(expDate.getMonth() + 1).padStart(2, '0')}/${expDate.getFullYear()}`;

                message += `\nExpense Date: ${expFormattedDate}
Expense By: ${expense.expense_by}
Amount: ₹${parseFloat(expense.amount).toFixed(2)}
Paid From: ${expense.paid_from}
Description: ${expense.description || 'N/A'}`;

                if (index < expenses.length - 1) {
                    message += '\n';
                }
            });
        }
    } catch (err) {
        console.error('Error fetching expenses:', err);
    }

    message += '\n\nFor Detailed data, Visit https://pen-and-play.vercel.app/index.html';

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
}

// Dark Mode
function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    darkModeToggle.textContent = isDark ? '☀️' : '🌙';
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', init);
