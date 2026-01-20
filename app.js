// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ App.js loaded successfully');

// DOM Elements
const form = document.getElementById('cashRegisterForm');
const dateInput = document.getElementById('date');
const cashAmountInput = document.getElementById('cashAmount');
const yesterdayPettyCashInput = document.getElementById('yesterdayPettyCash');
const cashTotalInput = document.getElementById('cashTotal');
const upiAmountInput = document.getElementById('upiAmount');
const cardAmountInput = document.getElementById('cardAmount');
const apCashInput = document.getElementById('apCash');
const pettyCashAmountInput = document.getElementById('pettyCashAmount');
const totalIncomeInput = document.getElementById('totalIncome');
const submitBtn = document.getElementById('submitBtn');
const statusMessage = document.getElementById('statusMessage');

// Initialize App
function init() {
    console.log('🚀 Initializing app...');

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // Fetch yesterday's petty cash
    fetchYesterdayPettyCash(today);

    // Add event listeners for real-time calculation
    cashAmountInput.addEventListener('input', calculateAllFields);
    upiAmountInput.addEventListener('input', calculateAllFields);
    cardAmountInput.addEventListener('input', calculateAllFields);
    apCashInput.addEventListener('input', calculateAllFields);
    dateInput.addEventListener('change', onDateChange);

    // Form submission
    form.addEventListener('submit', handleSubmit);

    // Check if entry exists for today
    checkExistingEntry(today);

    console.log('✅ App initialized');
}

// Fetch Yesterday's Petty Cash
async function fetchYesterdayPettyCash(currentDate) {
    try {
        // Calculate yesterday's date
        const yesterday = new Date(currentDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Query Supabase for yesterday's entry
        const { data, error } = await supabaseClient
            .from('daily_entries')
            .select('petty_cash')
            .eq('date', yesterdayStr)
            .single();

        if (error) {
            yesterdayPettyCashInput.value = '0.00';
        } else {
            yesterdayPettyCashInput.value = parseFloat(data.petty_cash).toFixed(2);
        }

        calculateAllFields();
    } catch (err) {
        console.error('Error fetching yesterday petty cash:', err);
        yesterdayPettyCashInput.value = '0.00';
        calculateAllFields();
    }
}

// Calculate All Fields
function calculateAllFields() {
    const cash = parseFloat(cashAmountInput.value) || 0;
    const upi = parseFloat(upiAmountInput.value) || 0;
    const card = parseFloat(cardAmountInput.value) || 0;
    const apCash = parseFloat(apCashInput.value) || 0;
    const yesterdayPettyCash = parseFloat(yesterdayPettyCashInput.value) || 0;

    // Calculate Cash Total = Cash Amount - Yesterday's Petty Cash
    const cashTotal = cash - yesterdayPettyCash;
    cashTotalInput.value = cashTotal.toFixed(2);

    // Calculate Petty Cash Amount = Cash Amount - AP Cash
    const pettyCash = cash - apCash;
    pettyCashAmountInput.value = pettyCash.toFixed(2);

    // Calculate Total Income = Cash Amount + UPI Amount + Card Amount - Yesterday's Petty Cash
    const totalIncome = cash + upi + card - yesterdayPettyCash;
    totalIncomeInput.value = totalIncome.toFixed(2);
}

// Handle Date Change
function onDateChange() {
    const selectedDate = dateInput.value;
    fetchYesterdayPettyCash(selectedDate);
    checkExistingEntry(selectedDate);
}

// Check if Entry Exists for Selected Date
async function checkExistingEntry(date) {
    try {
        const { data, error } = await supabaseClient
            .from('daily_entries')
            .select('*')
            .eq('date', date)
            .single();

        if (data && !error) {
            // Entry exists, populate form
            cashAmountInput.value = data.cash_amount;
            upiAmountInput.value = data.upi_amount;
            cardAmountInput.value = data.card_amount;
            apCashInput.value = data.ap_cash || 0;
            calculateAllFields();

            submitBtn.textContent = 'Update Entry';
        } else {
            // No entry, clear form
            cashAmountInput.value = '';
            upiAmountInput.value = '';
            cardAmountInput.value = '';
            apCashInput.value = '';
            cashTotalInput.value = '0.00';
            pettyCashAmountInput.value = '0.00';
            totalIncomeInput.value = '0.00';

            submitBtn.textContent = 'Save Entry';
        }
    } catch (err) {
        console.error('Error checking existing entry:', err);
    }
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
        const date = dateInput.value;
        // Treat empty fields as 0
        const cashAmount = parseFloat(cashAmountInput.value) || 0;
        const upiAmount = parseFloat(upiAmountInput.value) || 0;
        const cardAmount = parseFloat(cardAmountInput.value) || 0;
        const apCash = parseFloat(apCashInput.value) || 0;
        const cashTotal = parseFloat(cashTotalInput.value) || 0;
        const pettyCash = parseFloat(pettyCashAmountInput.value) || 0;
        const totalIncome = parseFloat(totalIncomeInput.value) || 0;

        console.log('📊 Data to save:', {
            date,
            cashAmount,
            upiAmount,
            cardAmount,
            apCash,
            cashTotal,
            pettyCash,
            totalIncome
        });

        // Validate data - only check if date is provided
        if (!date) {
            console.error('❌ Validation failed - date is required');
            showStatusMessage('Please select a date.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Entry';
            return;
        }

        // Check for negative values
        if (cashAmount < 0 || upiAmount < 0 || cardAmount < 0 || apCash < 0) {
            console.error('❌ Validation failed - negative values not allowed');
            showStatusMessage('Negative values are not allowed.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Entry';
            return;
        }

        // Prepare data object
        const entryData = {
            date: date,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            card_amount: cardAmount,
            ap_cash: apCash,
            cash_total: cashTotal,
            petty_cash: pettyCash,
            total_income: totalIncome
        };

        // Check if entry already exists
        const { data: existingEntry, error: checkError } = await supabaseClient
            .from('daily_entries')
            .select('id')
            .eq('date', date)
            .single();

        console.log('🔍 Existing entry check:', existingEntry ? 'Found' : 'Not found');

        if (existingEntry) {
            // Update existing entry
            console.log('♻️  Updating existing entry...');
            const { data, error } = await supabaseClient
                .from('daily_entries')
                .update(entryData)
                .eq('date', date)
                .select();

            if (error) {
                console.error('❌ Update error:', error);
                throw error;
            }

            console.log('✅ UPDATE SUCCESS!');
            showStatusMessage('Entry updated successfully!', 'success');
        } else {
            // Insert new entry
            console.log('➕ Inserting new entry...');
            const { data, error } = await supabaseClient
                .from('daily_entries')
                .insert([entryData])
                .select();

            if (error) {
                console.error('❌ Insert error:', error);
                throw error;
            }

            console.log('✅ INSERT SUCCESS!');
            showStatusMessage('Entry saved successfully!', 'success');
        }

        submitBtn.textContent = 'Update Entry';
    } catch (err) {
        console.error('❌ ERROR:', err);
        showStatusMessage('Error: ' + err.message, 'error');
        submitBtn.textContent = 'Save Entry';
    } finally {
        submitBtn.disabled = false;
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

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', init);
