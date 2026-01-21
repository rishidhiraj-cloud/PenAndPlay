// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Expense.js loaded successfully');

// DOM Elements
const form = document.getElementById('expenseForm');
const expenseDateInput = document.getElementById('expenseDate');
const expenseByInput = document.getElementById('expenseBy');
const amountInput = document.getElementById('amount');
const descriptionInput = document.getElementById('description');
const submitBtn = document.getElementById('submitBtn');
const statusMessage = document.getElementById('statusMessage');
const expenseHistoryEl = document.getElementById('expenseHistory');
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

// Initialize App
function init() {
    console.log('🚀 Initializing expense tracker...');

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    expenseDateInput.value = today;

    // Get and display selected month
    const selectedMonth = getSelectedMonth();
    const monthName = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    currentMonthLabelEl.textContent = monthName;

    // Form submission
    form.addEventListener('submit', handleSubmit);

    // Load expense history
    loadExpenseHistory();

    console.log('✅ Expense tracker initialized');
}

// Handle Form Submission
async function handleSubmit(e) {
    e.preventDefault();

    console.log('📝 Form submitted!');

    // Disable form during submission
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    hideStatusMessage();

    try {
        const expenseDate = expenseDateInput.value;
        const expenseBy = expenseByInput.value;
        const amount = parseFloat(amountInput.value) || 0;
        const paidFrom = document.querySelector('input[name="paidFrom"]:checked')?.value;
        const description = descriptionInput.value.trim();

        console.log('📊 Data to save:', {
            expenseDate,
            expenseBy,
            amount,
            paidFrom,
            description
        });

        // Validate data
        if (!expenseDate) {
            showStatusMessage('Please select expense date.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Expense';
            return;
        }

        if (!expenseBy) {
            showStatusMessage('Please select who made the expense.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Expense';
            return;
        }

        if (amount <= 0) {
            showStatusMessage('Please enter a valid amount greater than 0.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Expense';
            return;
        }

        if (!paidFrom) {
            showStatusMessage('Please select payment method.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Expense';
            return;
        }

        // Prepare data object
        const expenseData = {
            expense_date: expenseDate,
            expense_by: expenseBy,
            amount: amount,
            paid_from: paidFrom,
            description: description || null
        };

        console.log('Inserting expense:', expenseData);

        // Insert expense
        const { data, error } = await supabaseClient
            .from('expenses')
            .insert([expenseData])
            .select();

        if (error) {
            console.error('❌ Insert error:', error);
            throw error;
        }

        console.log('✅ INSERT SUCCESS!');
        showStatusMessage('Expense saved successfully!', 'success');

        // Clear form
        form.reset();
        expenseDateInput.value = new Date().toISOString().split('T')[0];

        // Reload history
        await loadExpenseHistory();

    } catch (err) {
        console.error('❌ ERROR:', err);
        showStatusMessage('Error: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Expense';
    }
}

// Load Expense History
async function loadExpenseHistory() {
    try {
        pageLoader.classList.remove('hidden');
        expenseHistoryEl.innerHTML = '<div class="loading-spinner">Loading expenses...</div>';

        console.log('📊 Loading expense history...');

        // Get selected month
        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;

        // Get last day of month
        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;

        console.log('Fetching expenses from', startDate, 'to', endDate);

        // Fetch expenses for selected month ordered by date (newest first)
        const { data, error } = await supabaseClient
            .from('expenses')
            .select('*')
            .gte('expense_date', startDate)
            .lte('expense_date', endDate)
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error loading expenses:', error);
            throw error;
        }

        console.log(`✅ Found ${data.length} expenses`);

        if (data && data.length > 0) {
            displayExpenses(data);
        } else {
            displayNoExpenses();
        }
    } catch (err) {
        console.error('❌ Exception loading expenses:', err);
        expenseHistoryEl.innerHTML = `
            <div class="empty-state">
                <p style="color: #721c24;">Error loading expenses: ${err.message}</p>
                <p>Please check the browser console for details.</p>
            </div>
        `;
    } finally {
        pageLoader.classList.add('hidden');
    }
}

// Display Expenses
function displayExpenses(expenses) {
    console.log('📝 Displaying', expenses.length, 'expenses');

    const expensesHTML = expenses.map(expense => {
        const date = new Date(expense.expense_date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return `
            <div class="expense-item">
                <div class="expense-header">
                    <div class="expense-date">${date}</div>
                    <div class="expense-amount">₹${parseFloat(expense.amount).toFixed(2)}</div>
                </div>
                <div class="expense-details">
                    <div class="expense-detail-row">
                        <span class="expense-label">By:</span>
                        <span class="expense-value">${expense.expense_by}</span>
                    </div>
                    <div class="expense-detail-row">
                        <span class="expense-label">Paid From:</span>
                        <span class="expense-value expense-paid-${expense.paid_from.toLowerCase().replace(' ', '-')}">${expense.paid_from}</span>
                    </div>
                    ${expense.description ? `
                    <div class="expense-detail-row">
                        <span class="expense-label">Description:</span>
                        <span class="expense-value">${expense.description}</span>
                    </div>
                    ` : ''}
                </div>
                <button class="delete-btn" onclick="deleteExpense('${expense.id}')">Delete</button>
            </div>
        `;
    }).join('');

    expenseHistoryEl.innerHTML = expensesHTML;
}

// Display No Expenses Message
function displayNoExpenses() {
    expenseHistoryEl.innerHTML = `
        <div class="empty-state">
            <p>No expenses recorded yet.</p>
            <p style="color: #666; font-size: 14px;">Add your first expense using the form above.</p>
        </div>
    `;
}

// Delete Expense
async function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }

    console.log('🗑️ Deleting expense:', id);

    try {
        const { error } = await supabaseClient
            .from('expenses')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ Delete error:', error);
            throw error;
        }

        console.log('✅ Expense deleted successfully');
        showStatusMessage('Expense deleted successfully!', 'success');

        // Reload history
        await loadExpenseHistory();
    } catch (err) {
        console.error('❌ Error deleting expense:', err);
        showStatusMessage('Error deleting expense: ' + err.message, 'error');
    }
}

// Show Status Message
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;

    // Auto-hide success messages after 3 seconds
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
