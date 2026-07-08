// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('%c✅ Expense.js v20260514-receipts-4-anchor loaded',
    'background:#16a34a;color:white;padding:4px 8px;border-radius:4px;font-weight:bold');

// Format number in Indian style
function formatIndianNumber(num) {
    const n = parseFloat(num).toFixed(2);
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
const filterExpenseByInput = document.getElementById('filterExpenseBy');
const totalExpenseEl = document.getElementById('totalExpense');

// Receipt photo elements
const receiptFileInput = document.getElementById('receiptFile');
const receiptCaptureBtn = document.getElementById('receiptCaptureBtn');
const receiptClearBtn = document.getElementById('receiptClearBtn');
const receiptPreview = document.getElementById('receiptPreview');
const receiptPreviewGrid = document.getElementById('receiptPreviewGrid');
const receiptSizeLabel = document.getElementById('receiptSizeLabel');
const receiptLightbox = document.getElementById('receiptLightbox');
const receiptLightboxImg = document.getElementById('receiptLightboxImg');
const receiptLightboxClose = document.getElementById('receiptLightboxClose');

// In-memory: array of { blob, previewUrl } pending upload
let pendingReceipts = [];

// Get selected month from localStorage or use current month
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// ----- Receipt: compress, preview, clear -----
async function compressImage(file, maxDim = 1600, quality = 0.85) {
    // Load file into Image
    const imgUrl = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Could not read image'));
            i.src = imgUrl;
        });

        const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        return blob;
    } finally {
        URL.revokeObjectURL(imgUrl);
    }
}

function renderReceiptPreviews() {
    receiptPreviewGrid.innerHTML = '';
    pendingReceipts.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'receipt-preview-item';

        const img = document.createElement('img');
        img.src = item.previewUrl;
        img.alt = `Receipt ${idx + 1}`;
        img.addEventListener('click', () => openReceiptLightbox(item.previewUrl));

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-one-btn';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removeReceiptAt(idx));

        div.appendChild(img);
        div.appendChild(removeBtn);
        receiptPreviewGrid.appendChild(div);
    });

    const count = pendingReceipts.length;
    const totalKb = Math.round(pendingReceipts.reduce((s, r) => s + r.blob.size, 0) / 1024);
    receiptSizeLabel.textContent = count > 0 ? `${count} image${count > 1 ? 's' : ''} · ${totalKb} KB ready to upload` : '';

    if (count > 0) {
        receiptPreview.classList.remove('hidden');
        receiptClearBtn.classList.remove('hidden');
        receiptCaptureBtn.textContent = '📷 Add More Photos';
    } else {
        receiptPreview.classList.add('hidden');
        receiptClearBtn.classList.add('hidden');
        receiptCaptureBtn.textContent = '📷 Add Receipt Photo(s)';
    }
}

function removeReceiptAt(idx) {
    URL.revokeObjectURL(pendingReceipts[idx].previewUrl);
    pendingReceipts.splice(idx, 1);
    receiptFileInput.value = '';
    renderReceiptPreviews();
}

function clearPendingReceipt() {
    pendingReceipts.forEach(r => URL.revokeObjectURL(r.previewUrl));
    pendingReceipts = [];
    receiptFileInput.value = '';
    renderReceiptPreviews();
}

async function onReceiptFilesChosen(files) {
    if (!files || files.length === 0) return;
    receiptCaptureBtn.textContent = 'Processing…';
    for (const file of Array.from(files)) {
        if (!/^image\//.test(file.type)) {
            alert(`${file.name} is not an image and was skipped.`);
            continue;
        }
        try {
            const blob = await compressImage(file);
            if (!blob) throw new Error('Compression failed');
            const previewUrl = URL.createObjectURL(blob);
            pendingReceipts.push({ blob, previewUrl });
        } catch (err) {
            console.error('Receipt processing failed:', err);
            alert(`Could not process ${file.name}: ${err.message}`);
        }
    }
    renderReceiptPreviews();
}

async function uploadReceipt(blob) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    const fileName = `receipt_${stamp}_${rand}.jpg`;

    const { error: uploadError } = await supabaseClient
        .storage
        .from('receipts')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: pub } = supabaseClient.storage.from('receipts').getPublicUrl(fileName);
    return pub.publicUrl;
}

// Lightbox view
function openReceiptLightbox(url) {
    if (!url) {
        console.warn('[lightbox] no url provided');
        return;
    }
    console.log('[lightbox] opening', url);
    receiptLightboxImg.onload = () => {
        console.log('[lightbox] image loaded',
            receiptLightboxImg.naturalWidth, 'x', receiptLightboxImg.naturalHeight);
    };
    receiptLightboxImg.onerror = (e) => {
        console.error('[lightbox] image failed to load:', url, e);
    };
    receiptLightboxImg.src = url;
    receiptLightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeReceiptLightbox() {
    receiptLightbox.classList.add('hidden');
    receiptLightboxImg.src = '';
    document.body.style.overflow = '';
}
window.viewReceipt = openReceiptLightbox;

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

    // Filter change
    filterExpenseByInput.addEventListener('change', loadExpenseHistory);

    // Enforce single-select behaviour on Paid From checkboxes
    document.querySelectorAll('input[name="paidFrom"]').forEach(cb => {
        cb.addEventListener('change', function () {
            if (this.checked) {
                document.querySelectorAll('input[name="paidFrom"]').forEach(other => {
                    if (other !== this) other.checked = false;
                });
            }
        });
    });

    // Receipt photo wiring
    if (receiptFileInput) {
        receiptFileInput.addEventListener('change', (e) => {
            onReceiptFilesChosen(e.target.files);
        });
    }
    if (receiptClearBtn) {
        receiptClearBtn.addEventListener('click', clearPendingReceipt);
    }
    if (receiptLightboxClose) {
        receiptLightboxClose.addEventListener('click', closeReceiptLightbox);
    }
    if (receiptLightbox) {
        receiptLightbox.addEventListener('click', (e) => {
            if (e.target === receiptLightbox) closeReceiptLightbox();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeReceiptLightbox();
    });

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
        const amount = parseFloat(amountInput.value.replace(/,/g, '')) || 0;
        const paidFrom = document.querySelector('input[name="paidFrom"][type="checkbox"]:checked')?.value;
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

        // If receipt photos were selected, upload them FIRST so we can store the URLs.
        // Done before the row insert so a failed upload doesn't leave a dangling row.
        let receiptUrl = null;
        if (pendingReceipts.length > 0) {
            submitBtn.textContent = 'Uploading receipt…';
            try {
                const urls = await Promise.all(pendingReceipts.map(r => uploadReceipt(r.blob)));
                receiptUrl = urls.length === 1 ? urls[0] : JSON.stringify(urls);
                console.log('🧾 Receipt(s) uploaded:', receiptUrl);
            } catch (uErr) {
                console.error('Receipt upload failed:', uErr);
                showStatusMessage('Receipt upload failed: ' + uErr.message + ' (expense not saved)', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Expense';
                return;
            }
        }

        // Prepare data object
        const expenseData = {
            expense_date: expenseDate,
            expense_by: expenseBy,
            amount: amount,
            paid_from: paidFrom,
            description: description || null,
            receipt_url: receiptUrl
        };

        console.log('Inserting expense:', expenseData);
        submitBtn.textContent = 'Saving…';

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

        // Clear form (including the pending receipt)
        form.reset();
        clearPendingReceipt();
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

        // Get filter value
        const filterBy = filterExpenseByInput.value;

        // Build query
        let query = supabaseClient
            .from('expenses')
            .select('*')
            .gte('expense_date', startDate)
            .lte('expense_date', endDate);

        // Apply filter if selected
        if (filterBy) {
            query = query.eq('expense_by', filterBy);
        }

        // Fetch expenses for selected month ordered by date (newest first)
        const { data, error } = await query
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
        totalExpenseEl.textContent = '₹0.00';
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

    // Calculate total excluding reimbursed expenses
    const totalExpense = expenses.reduce((total, expense) => {
        if (!expense.reimbursed) {
            return total + parseFloat(expense.amount);
        }
        return total;
    }, 0);

    // Update total expense display
    totalExpenseEl.textContent = `₹${formatIndianNumber(totalExpense)}`;

    const expensesHTML = expenses.map(expense => {
        const date = new Date(expense.expense_date).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const reimbursedBadge = expense.reimbursed
            ? `<span class="reimbursed-badge">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5"/><polyline points="20 6 9 17 4 12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                Reimbursed
               </span>`
            : '';

        return `
            <div class="expense-item${expense.reimbursed ? ' expense-item--reimbursed' : ''}">
                <div class="expense-header">
                    <div class="expense-date">${date}</div>
                    ${reimbursedBadge}
                    <div class="expense-amount">₹${formatIndianNumber(expense.amount)}</div>
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
                    ${expense.receipt_url ? (() => {
                        let urls;
                        try { urls = JSON.parse(expense.receipt_url); if (!Array.isArray(urls)) urls = [expense.receipt_url]; }
                        catch { urls = [expense.receipt_url]; }
                        return `<div class="expense-detail-row receipt-row">
                        <span class="expense-label">Receipt:</span>
                        <div class="receipt-thumbs">
                            ${urls.map((url, i) => `
                            <a href="${url}" target="_blank" rel="noopener" class="receipt-thumb-link" title="Open receipt ${urls.length > 1 ? i + 1 : ''}">
                                <img class="receipt-thumb" src="${url}" alt="Receipt${urls.length > 1 ? ' ' + (i+1) : ''}" onerror="this.closest('.receipt-thumb-link').style.display='none'">
                                <span class="receipt-open-hint">↗ Open</span>
                            </a>`).join('')}
                        </div>
                    </div>`;
                    })() : ''}
                </div>
                ${expense.paid_from === 'Self' && !expense.reimbursed ? `
                    <button class="reimburse-btn" onclick="markAsReimbursed('${expense.id}')">Mark as Reimbursed</button>
                ` : ''}
            </div>
        `;
    }).join('');

    expenseHistoryEl.innerHTML = expensesHTML;
    // Thumbnails are wrapped in <a target="_blank"> so clicking is handled
    // natively by the browser — no JS click listener needed.
}

// Display No Expenses Message
function displayNoExpenses() {
    totalExpenseEl.textContent = '₹0.00';
    expenseHistoryEl.innerHTML = `
        <div class="empty-state">
            <p>No expenses recorded yet.</p>
            <p style="color: #666; font-size: 14px;">Add your first expense using the form above.</p>
        </div>
    `;
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

// Mark as Reimbursed
window.markAsReimbursed = async function(expenseId) {
    console.log('markAsReimbursed called with ID:', expenseId);

    if (!confirm('Mark this expense as reimbursed?')) return;

    console.log('User confirmed, updating expense...');

    try {
        // First, fetch the original expense to get its details
        const { data: originalExpense, error: fetchError } = await supabaseClient
            .from('expenses')
            .select('*')
            .eq('id', expenseId)
            .single();

        if (fetchError) {
            console.error('Error fetching original expense:', fetchError);
            throw fetchError;
        }

        console.log('Original expense:', originalExpense);

        // Mark the original expense as reimbursed
        const { data, error } = await supabaseClient
            .from('expenses')
            .update({ reimbursed: true })
            .eq('id', expenseId)
            .select();

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }

        console.log('Update successful:', data);

        // Create a new expense entry for the reimbursement
        const today = new Date().toISOString().split('T')[0];
        const reimbursementData = {
            expense_date: today,
            expense_by: 'Neha',
            amount: originalExpense.amount,
            paid_from: 'Bank',
            description: originalExpense.description || `Reimbursement for expense by ${originalExpense.expense_by}`,
            reimbursed: false
        };

        console.log('Creating reimbursement entry:', reimbursementData);

        const { data: reimbursementResult, error: reimbursementError } = await supabaseClient
            .from('expenses')
            .insert([reimbursementData])
            .select();

        if (reimbursementError) {
            console.error('Error creating reimbursement entry:', reimbursementError);
            throw reimbursementError;
        }

        console.log('Reimbursement entry created:', reimbursementResult);
        showStatusMessage('Expense marked as reimbursed & reimbursement entry created!', 'success');
        loadExpenseHistory();
    } catch (err) {
        console.error('Error marking as reimbursed:', err);
        alert('Failed to mark as reimbursed. Error: ' + err.message + '. Please run the migration SQL in Supabase first.');
    }
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

    /* Auto-fill Expense By from saved login */
    try {
        const savedUser = JSON.parse(localStorage.getItem('washi_auth'))?.username;
        if (savedUser && expenseByInput) expenseByInput.value = savedUser;
    } catch (e) {}
});
