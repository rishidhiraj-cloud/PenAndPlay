// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Sales Log.js loaded successfully');

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

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// DOM Elements
const captureForm = document.getElementById('captureForm');
const salesDateInput = document.getElementById('salesDate');
const salesImagesInput = document.getElementById('salesImages');
const extractBtn = document.getElementById('extractBtn');
const statusMessage = document.getElementById('statusMessage');
const reviewSection = document.getElementById('reviewSection');
const reviewTableEl = document.getElementById('reviewTable');
const addRowBtn = document.getElementById('addRowBtn');
const saveSalesBtn = document.getElementById('saveSalesBtn');
const salesLogHistoryEl = document.getElementById('salesLogHistory');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');
const photoCaptureBtn = document.getElementById('photoCaptureBtn');
const photoClearBtn = document.getElementById('photoClearBtn');
const photoPreview = document.getElementById('photoPreview');
const photoPreviewGrid = document.getElementById('photoPreviewGrid');
const photoCountLabel = document.getElementById('photoCountLabel');

// In-memory review state: array of { item, amount }
let extractedLines = [];

// In-memory: File objects accumulated across repeated camera/gallery picks,
// since each camera invocation only returns one photo — tapping "Add Photo(s)"
// again appends to this list rather than replacing it.
let pendingImages = [];

// Get selected month from localStorage or use current month
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// ----- Compress an image file to a base64 JPEG data URL -----
async function compressImageToBase64(file, maxDim = 1600, quality = 0.85) {
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

        return canvas.toDataURL('image/jpeg', quality);
    } finally {
        URL.revokeObjectURL(imgUrl);
    }
}

// ----- Pending photos: accumulate, preview, remove -----
function renderPhotoPreviews() {
    photoPreviewGrid.innerHTML = '';
    pendingImages.forEach((file, idx) => {
        const div = document.createElement('div');
        div.className = 'photo-preview-item';

        const img = document.createElement('img');
        const url = URL.createObjectURL(file);
        img.src = url;
        img.alt = `Photo ${idx + 1}`;
        img.onload = () => URL.revokeObjectURL(url);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'photo-remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removePhotoAt(idx));

        div.appendChild(img);
        div.appendChild(removeBtn);
        photoPreviewGrid.appendChild(div);
    });

    const count = pendingImages.length;
    photoCountLabel.textContent = count > 0 ? `${count} photo${count > 1 ? 's' : ''} ready` : '';

    if (count > 0) {
        photoPreview.classList.remove('hidden');
        photoClearBtn.classList.remove('hidden');
        photoCaptureBtn.textContent = '📷 Add More Photo(s)';
    } else {
        photoPreview.classList.add('hidden');
        photoClearBtn.classList.add('hidden');
        photoCaptureBtn.textContent = '📷 Add Photo(s)';
    }
}

function removePhotoAt(idx) {
    pendingImages.splice(idx, 1);
    salesImagesInput.value = '';
    renderPhotoPreviews();
}

function clearPendingPhotos() {
    pendingImages = [];
    salesImagesInput.value = '';
    renderPhotoPreviews();
}

function onPhotoFilesChosen(files) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
        if (!/^image\//.test(file.type)) {
            alert(`${file.name} is not an image and was skipped.`);
            continue;
        }
        pendingImages.push(file);
    }
    // Reset so choosing the same file again later still fires a change event.
    salesImagesInput.value = '';
    renderPhotoPreviews();
}

// Initialize App
function init() {
    console.log('🚀 Initializing sales log...');

    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    const today = new Date().toISOString().split('T')[0];
    salesDateInput.value = today;

    const selectedMonth = getSelectedMonth();
    currentMonthLabelEl.textContent = selectedMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    captureForm.addEventListener('submit', handleExtract);
    addRowBtn.addEventListener('click', addEmptyRow);
    saveSalesBtn.addEventListener('click', handleSaveSalesLog);
    salesImagesInput.addEventListener('change', (e) => onPhotoFilesChosen(e.target.files));
    photoClearBtn.addEventListener('click', clearPendingPhotos);

    loadSalesLogHistory();

    console.log('✅ Sales log initialized');
}

// ----- Extract: compress images, call the OCR function -----
async function handleExtract(e) {
    e.preventDefault();

    if (pendingImages.length === 0) {
        showStatusMessage('Please add at least one diary page photo.', 'error');
        return;
    }

    extractBtn.disabled = true;
    extractBtn.textContent = 'Reading diary page(s)…';
    hideStatusMessage();

    try {
        const images = await Promise.all(pendingImages.map(f => compressImageToBase64(f)));

        const response = await fetch('/api/ocr-sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'OCR request failed');
        }

        extractedLines = (result.lines || []).map(l => ({ item: l.item, amount: l.amount }));
        reviewSection.classList.remove('hidden');
        renderReviewTable();

        if (extractedLines.length === 0) {
            showStatusMessage('No sale lines could be read from the photo(s) — add rows manually below.', 'error');
        } else {
            showStatusMessage(`Extracted ${extractedLines.length} line${extractedLines.length > 1 ? 's' : ''} — review before saving.`, 'success');
        }
    } catch (err) {
        console.error('❌ Extract error:', err);
        showStatusMessage('Error extracting sales: ' + err.message, 'error');
    } finally {
        extractBtn.disabled = false;
        extractBtn.textContent = 'Extract Sales';
    }
}

// ----- Review table rendering -----
function renderReviewTable() {
    if (extractedLines.length === 0) {
        reviewTableEl.innerHTML = '<div class="empty-state">No rows yet — extract a photo or add a row manually.</div>';
        return;
    }

    reviewTableEl.innerHTML = extractedLines.map((line, idx) => `
        <div class="review-row" data-idx="${idx}">
            <input type="text" class="review-item-input" value="${escapeHtml(line.item)}" placeholder="Item">
            <input type="number" class="review-amount-input" value="${line.amount}" step="0.01" min="0.01" placeholder="Amount">
            <button type="button" class="review-remove-btn" data-idx="${idx}">✕</button>
        </div>
    `).join('');

    reviewTableEl.querySelectorAll('.review-item-input').forEach((input, idx) => {
        input.addEventListener('input', () => { extractedLines[idx].item = input.value; });
    });
    reviewTableEl.querySelectorAll('.review-amount-input').forEach((input, idx) => {
        input.addEventListener('input', () => { extractedLines[idx].amount = parseFloat(input.value) || 0; });
    });
    reviewTableEl.querySelectorAll('.review-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            extractedLines.splice(parseInt(btn.dataset.idx, 10), 1);
            renderReviewTable();
        });
    });
}

function addEmptyRow() {
    extractedLines.push({ item: '', amount: 0 });
    reviewSection.classList.remove('hidden');
    renderReviewTable();
}

// ----- Save confirmed rows -----
async function handleSaveSalesLog() {
    const entryDate = salesDateInput.value;

    if (!entryDate) {
        showStatusMessage('Please select a date.', 'error');
        return;
    }

    const validRows = extractedLines.filter(l => l.item && l.item.trim() && l.amount > 0);

    if (validRows.length === 0) {
        showStatusMessage('No valid rows to save — each row needs an item and an amount greater than 0.', 'error');
        return;
    }

    saveSalesBtn.disabled = true;
    saveSalesBtn.textContent = 'Saving…';

    try {
        const rows = validRows.map(l => ({
            entry_date: entryDate,
            item: l.item.trim(),
            amount: l.amount
        }));

        const { error } = await supabaseClient.from('sales_log').insert(rows);

        if (error) {
            console.error('❌ Insert error:', error);
            throw error;
        }

        showStatusMessage(`Saved ${rows.length} sale${rows.length > 1 ? 's' : ''}!`, 'success');

        extractedLines = [];
        renderReviewTable();
        reviewSection.classList.add('hidden');
        clearPendingPhotos();

        await loadSalesLogHistory();
    } catch (err) {
        console.error('❌ ERROR:', err);
        showStatusMessage('Error saving: ' + err.message, 'error');
    } finally {
        saveSalesBtn.disabled = false;
        saveSalesBtn.textContent = 'Save Sales Log';
    }
}

// ----- Load Sales Log History -----
async function loadSalesLogHistory() {
    try {
        pageLoader.classList.remove('hidden');
        salesLogHistoryEl.innerHTML = '<div class="loading-spinner">Loading sales log...</div>';

        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;

        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;

        const { data, error } = await supabaseClient
            .from('sales_log')
            .select('*')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .order('entry_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error loading sales log:', error);
            throw error;
        }

        if (data && data.length > 0) {
            displaySalesLog(data);
        } else {
            displayNoSalesLog();
        }
    } catch (err) {
        console.error('❌ Exception loading sales log:', err);
        salesLogHistoryEl.innerHTML = `
            <div class="empty-state">
                <p style="color: #721c24;">Error loading sales log: ${escapeHtml(err.message)}</p>
                <p>Please check the browser console for details.</p>
            </div>
        `;
    } finally {
        pageLoader.classList.add('hidden');
    }
}

// Display Sales Log history — one row per date, with a View button for that day's items.
// Entries are permanent once saved: no edit, except Dhiraj can delete a
// whole day's log (all rows for that entry_date) after confirmation.
function displaySalesLog(entries) {
    const byDate = new Map();
    entries.forEach(entry => {
        if (!byDate.has(entry.entry_date)) byDate.set(entry.entry_date, []);
        byDate.get(entry.entry_date).push(entry);
    });

    const canDelete = window.washiAuth && window.washiAuth.getUsername() === 'Dhiraj';

    const dayRowsHTML = Array.from(byDate.entries()).map(([entryDate, dayEntries]) => {
        const date = new Date(entryDate).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return `
            <div class="sales-day-row">
                <div class="sales-day-date">${date}</div>
                <div class="sales-day-count">Items Sold: ${dayEntries.length}</div>
                <button type="button" class="view-day-btn" data-date="${entryDate}">View</button>
                ${canDelete ? `<button type="button" class="delete-day-btn" data-date="${entryDate}">Delete</button>` : ''}
            </div>
        `;
    }).join('');

    salesLogHistoryEl.innerHTML = dayRowsHTML;

    salesLogHistoryEl.querySelectorAll('.view-day-btn').forEach(btn => {
        btn.addEventListener('click', () => openDayModal(btn.dataset.date, byDate.get(btn.dataset.date)));
    });
    salesLogHistoryEl.querySelectorAll('.delete-day-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteSalesLogDay(btn.dataset.date, byDate.get(btn.dataset.date).length));
    });
}

// Delete an entire day's sales log (Dhiraj-only; the Delete button is only
// rendered for Dhiraj, but this check is defense-in-depth against someone
// calling the function directly from the console).
async function deleteSalesLogDay(entryDate, itemCount) {
    if (!window.washiAuth || window.washiAuth.getUsername() !== 'Dhiraj') return;

    const dateLabel = new Date(entryDate).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    if (!confirm(`Delete all ${itemCount} item(s) logged for ${dateLabel}? This cannot be undone.`)) return;

    try {
        const { error } = await supabaseClient
            .from('sales_log')
            .delete()
            .eq('entry_date', entryDate);

        if (error) throw error;

        await loadSalesLogHistory();
    } catch (err) {
        console.error('Error deleting sales log day:', err);
        alert('Failed to delete this day\'s log: ' + err.message);
    }
}

// ----- Day View Modal -----
const dayViewModal = document.getElementById('dayViewModal');
const dayViewTitle = document.getElementById('dayViewTitle');
const dayViewList = document.getElementById('dayViewList');
const dayViewClose = document.getElementById('dayViewClose');

function openDayModal(entryDate, dayEntries) {
    const date = new Date(entryDate).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    dayViewTitle.textContent = date;

    dayViewList.innerHTML = dayEntries.map(entry => `
        <div class="day-view-item">
            <span class="day-view-item-name">${escapeHtml(entry.item)}</span>
            <span class="day-view-item-amount">₹${formatIndianNumber(entry.amount)}</span>
        </div>
    `).join('');

    dayViewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeDayModal() {
    dayViewModal.classList.add('hidden');
    document.body.style.overflow = '';
}

dayViewClose.addEventListener('click', closeDayModal);
dayViewModal.addEventListener('click', (e) => {
    if (e.target === dayViewModal) closeDayModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDayModal();
});

function displayNoSalesLog() {
    salesLogHistoryEl.innerHTML = `
        <div class="empty-state">
            <p>No sales recorded yet.</p>
            <p style="color: #666; font-size: 14px;">Capture your first diary page using the form above.</p>
        </div>
    `;
}

// Show/Hide Status Message
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            hideStatusMessage();
        }, 3000);
    }
}

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
