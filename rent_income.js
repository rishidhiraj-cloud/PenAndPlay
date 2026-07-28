// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Rent Income.js loaded successfully');

// Format number in Indian style
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const parts = n.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);

    if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
    }

    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return formatted + '.' + decimalPart;
}

// DOM Elements
const form = document.getElementById('rentIncomeForm');
const rentDateInput = document.getElementById('rentDate');
const rentAmountInput = document.getElementById('rentAmount');
const rentRemarksInput = document.getElementById('rentRemarks');
const submitBtn = document.getElementById('rentSubmitBtn');
const statusMessage = document.getElementById('statusMessage');
const rentIncomeHistoryEl = document.getElementById('rentIncomeHistory');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');
const totalRentIncomeEl = document.getElementById('totalRentIncome');

// Get selected month from localStorage or use current month
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// Initialize App
function init() {
    console.log('🚀 Initializing rent income tracker...');

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    rentDateInput.value = today;

    // Get and display selected month
    const selectedMonth = getSelectedMonth();
    const monthName = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    currentMonthLabelEl.textContent = monthName;

    // Form submission
    form.addEventListener('submit', handleSubmit);

    // Enforce single-select behaviour on Account checkboxes
    document.querySelectorAll('input[name="rentAccount"]').forEach(cb => {
        cb.addEventListener('change', function () {
            if (this.checked) {
                document.querySelectorAll('input[name="rentAccount"]').forEach(other => {
                    if (other !== this) other.checked = false;
                });
            }
        });
    });

    // Load rent income history
    loadRentIncomeHistory();

    console.log('✅ Rent income tracker initialized');
}

// Handle Form Submission
async function handleSubmit(e) {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    hideStatusMessage();

    try {
        const entryDate = rentDateInput.value;
        const account = document.querySelector('input[name="rentAccount"][type="checkbox"]:checked')?.value;
        const amount = parseFloat(rentAmountInput.value.replace(/,/g, '')) || 0;
        const remarks = rentRemarksInput.value.trim();

        if (!entryDate) {
            showStatusMessage('Please select a date.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        if (!account) {
            showStatusMessage('Please select an account.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        if (amount <= 0) {
            showStatusMessage('Please enter a valid amount greater than 0.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Rent Income';
            return;
        }

        const rentIncomeData = {
            entry_date: entryDate,
            account: account,
            amount: amount,
            remarks: remarks || null
        };

        const { error } = await supabaseClient
            .from('rent_income')
            .insert([rentIncomeData])
            .select();

        if (error) {
            console.error('❌ Insert error:', error);
            throw error;
        }

        showStatusMessage('Rent income saved successfully!', 'success');

        // Clear form
        form.reset();
        rentDateInput.value = new Date().toISOString().split('T')[0];

        // Reload history
        await loadRentIncomeHistory();

    } catch (err) {
        console.error('❌ ERROR:', err);
        showStatusMessage('Error: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Rent Income';
    }
}

// Load Rent Income History
async function loadRentIncomeHistory() {
    try {
        pageLoader.classList.remove('hidden');
        rentIncomeHistoryEl.innerHTML = '<div class="loading-spinner">Loading rent income...</div>';

        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;

        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;

        const { data, error } = await supabaseClient
            .from('rent_income')
            .select('*')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error loading rent income:', error);
            throw error;
        }

        if (data && data.length > 0) {
            displayRentIncome(data);
        } else {
            displayNoRentIncome();
        }
    } catch (err) {
        console.error('❌ Exception loading rent income:', err);
        totalRentIncomeEl.textContent = '₹0.00';
        rentIncomeHistoryEl.innerHTML = `
            <div class="empty-state">
                <p style="color: #721c24;">Error loading rent income: ${err.message}</p>
                <p>Please check the browser console for details.</p>
            </div>
        `;
    } finally {
        pageLoader.classList.add('hidden');
    }
}

// Display Rent Income entries
function displayRentIncome(entries) {
    const total = entries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
    totalRentIncomeEl.textContent = `₹${formatIndianNumber(total)}`;

    const entriesHTML = entries.map(entry => {
        const date = new Date(entry.entry_date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return `
            <div class="rent-item">
                <div class="rent-header">
                    <div class="rent-date">${date}</div>
                    <div class="rent-amount">₹${formatIndianNumber(entry.amount)}</div>
                </div>
                <div class="rent-details">
                    <div class="rent-detail-row">
                        <span class="rent-label">Account:</span>
                        <span class="rent-value">${escapeHtml(entry.account)}</span>
                    </div>
                    ${entry.remarks ? `
                    <div class="rent-detail-row">
                        <span class="rent-label">Remarks:</span>
                        <span class="rent-value">${escapeHtml(entry.remarks)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    rentIncomeHistoryEl.innerHTML = entriesHTML;
}

// Display No Rent Income Message
function displayNoRentIncome() {
    totalRentIncomeEl.textContent = '₹0.00';
    rentIncomeHistoryEl.innerHTML = `
        <div class="empty-state">
            <p>No rent income recorded yet.</p>
            <p style="color: #666; font-size: 14px;">Add your first entry using the form above.</p>
        </div>
    `;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Show Status Message
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            hideStatusMessage();
        }, 3000);
    }
}

// Hide Status Message
function hideStatusMessage() {
    statusMessage.className = 'status-message';
    statusMessage.textContent = '';
}

// Dark Mode
function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️ Light Mode';
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    darkModeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
}

// Burger Menu
function initBurgerMenu() {
    const burgerIcon = document.getElementById('burgerIcon');
    const burgerMenu = document.getElementById('burgerMenu');
    const burgerOverlay = document.getElementById('burgerOverlay');

    if (burgerIcon && burgerMenu && burgerOverlay) {
        burgerIcon.addEventListener('click', () => {
            burgerMenu.classList.toggle('active');
            burgerOverlay.classList.toggle('active');
        });

        burgerOverlay.addEventListener('click', () => {
            burgerMenu.classList.remove('active');
            burgerOverlay.classList.remove('active');
        });
    }
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    init();
});
