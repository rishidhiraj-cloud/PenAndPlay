console.log('✅ generate_bill.js loaded');

// ----- Indian number formatter -----
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const sign = parseFloat(n) < 0 ? '-' : '';
    const parts = n.replace('-', '').split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);

    if (otherNumbers !== '') lastThree = ',' + lastThree;

    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return sign + formatted + '.' + decimalPart;
}

// ----- DOM refs -----
const billDateInput = document.getElementById('billDate');
const customerNameInput = document.getElementById('customerName');
const itemsListEl = document.getElementById('itemsList');
const addItemBtn = document.getElementById('addItemBtn');
const grandTotalEl = document.getElementById('grandTotal');
const generateBtn = document.getElementById('generateBtn');
const previewSection = document.getElementById('previewSection');
const previewImg = document.getElementById('previewImg');
const downloadBtn = document.getElementById('downloadBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

let lastJpegBlobUrl = null;
let lastJpegBlob = null;
let lastBillFileName = 'bill.jpg';

// ----- Item rows -----
function addItemRow(prefill = {}) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
        <div class="form-group grp-item">
            <label>Item</label>
            <input type="text" class="inp-item" placeholder="e.g. Notebook" value="${escapeAttr(prefill.item || '')}">
        </div>
        <div class="form-group grp-qty">
            <label>Qty</label>
            <input type="number" class="inp-qty" min="0" step="1" inputmode="numeric" value="${prefill.qty ?? 1}">
        </div>
        <div class="form-group grp-rate">
            <label>Rate (₹)</label>
            <input type="number" class="inp-rate" min="0" step="0.01" inputmode="decimal" value="${prefill.rate ?? ''}">
        </div>
        <div class="form-group grp-total">
            <label>Amount</label>
            <div class="item-total">₹0.00</div>
        </div>
        <button type="button" class="remove-item-btn" title="Remove">×</button>
    `;
    itemsListEl.appendChild(row);

    const qtyInput = row.querySelector('.inp-qty');
    const rateInput = row.querySelector('.inp-rate');
    const itemTotalEl = row.querySelector('.item-total');
    const removeBtn = row.querySelector('.remove-item-btn');

    function recalc() {
        const qty = parseFloat(qtyInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        const total = qty * rate;
        itemTotalEl.textContent = '₹' + formatIndianNumber(total);
        recalcGrandTotal();
    }

    qtyInput.addEventListener('input', recalc);
    rateInput.addEventListener('input', recalc);
    removeBtn.addEventListener('click', () => {
        row.remove();
        recalcGrandTotal();
        if (itemsListEl.children.length === 0) addItemRow();
    });

    recalc();
}

function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function recalcGrandTotal() {
    let total = 0;
    itemsListEl.querySelectorAll('.item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.inp-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.inp-rate').value) || 0;
        total += qty * rate;
    });
    grandTotalEl.textContent = '₹' + formatIndianNumber(total);
}

function readBillData() {
    const date = billDateInput.value;
    const customerName = customerNameInput.value.trim();
    const items = [];
    itemsListEl.querySelectorAll('.item-row').forEach(row => {
        const name = row.querySelector('.inp-item').value.trim();
        const qty = parseFloat(row.querySelector('.inp-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.inp-rate').value) || 0;
        if (name && qty > 0 && rate >= 0) {
            items.push({ name, qty, rate, amount: qty * rate });
        }
    });
    const total = items.reduce((s, i) => s + i.amount, 0);
    return { date, customerName, items, total };
}

// ----- Logo loader (cached) -----
// The actual file on disk is "Logo.png" (capital L). On case-sensitive
// hosts (Linux/Vercel) "logo.png" 404s. We try multiple casings, prefer
// the header img's actual src (which we know works on the page), and
// load via a data URL so the canvas isn't tainted (toBlob keeps working).
let logoImgPromise = null;
function loadLogo() {
    if (logoImgPromise) return logoImgPromise;

    const headerImg = document.querySelector('.header-logo-right img');
    const candidateUrls = [];
    if (headerImg && headerImg.src) candidateUrls.push(headerImg.src);
    candidateUrls.push('Logo.png');
    candidateUrls.push('/Logo.png');
    candidateUrls.push('logo.png');
    candidateUrls.push('/logo.png');

    async function tryFetchToDataUrlImage(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            const img = await new Promise(resolve => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = () => resolve(null);
                i.src = dataUrl;
            });
            if (img && (img.naturalWidth > 0 || img.width > 0)) {
                console.log('[loadLogo] ✅ via fetch+dataURL:', url,
                    img.naturalWidth + 'x' + img.naturalHeight);
                return img;
            }
        } catch (err) {
            console.warn('[loadLogo] fetch failed for', url, err);
        }
        return null;
    }

    async function tryCorsImage(url) {
        return await new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (img.naturalWidth > 0) {
                    console.log('[loadLogo] ✅ via CORS img:', url,
                        img.naturalWidth + 'x' + img.naturalHeight);
                    resolve(img);
                } else {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    logoImgPromise = (async () => {
        for (const url of candidateUrls) {
            const img = await tryFetchToDataUrlImage(url);
            if (img) return img;
        }
        // Last-ditch: CORS-anonymous Image (works if server sends CORS headers)
        for (const url of candidateUrls) {
            const img = await tryCorsImage(url);
            if (img) return img;
        }
        console.warn('[loadLogo] Logo could not be loaded — rendering without it');
        return null;
    })();
    return logoImgPromise;
}

// ----- Date helpers -----
function pad2(n) { return String(n).padStart(2, '0'); }
function ddmmyyyy(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${pad2(d)}/${pad2(m)}/${y}`;
}
function billNumberFor(dateStr) {
    const now = new Date();
    const stamp = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    return `${(dateStr || '').replace(/-/g, '')}-${stamp}`;
}

// ----- Canvas rendering -----
// A4 portrait at 150 DPI = 1240 × 1754 px. This is the printable JPEG.
async function renderBillCanvas(bill) {
    const W = 1240;
    const H = 1754;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Outer border
    const MARGIN = 50;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2);

    // ===== Header band =====
    const HEADER_TOP = MARGIN + 30;
    const HEADER_H = 210;

    // Logo (top right)
    const logo = await loadLogo();
    if (logo) {
        const natW = logo.naturalWidth || logo.width || 0;
        const natH = logo.naturalHeight || logo.height || 0;
        if (natW > 0 && natH > 0) {
            const maxLogoH = 160;
            const maxLogoW = 280;
            const ratio = natW / natH;
            let logoH, logoW;
            if (ratio > maxLogoW / maxLogoH) {
                logoW = maxLogoW;
                logoH = logoW / ratio;
            } else {
                logoH = maxLogoH;
                logoW = logoH * ratio;
            }
            const lx = W - MARGIN - 20 - logoW;
            const ly = HEADER_TOP + (HEADER_H - logoH) / 2;
            ctx.drawImage(logo, lx, ly, logoW, logoH);
        }
    }

    // Shop name (BOLD) + address + contact (smaller font)
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 54px Helvetica, Arial, sans-serif';
    ctx.fillText('Pen & Play Club', MARGIN + 20, HEADER_TOP + 56);

    ctx.fillStyle = '#4b5563';
    ctx.font = '500 20px Helvetica, Arial, sans-serif';
    ctx.fillText(
        'Shop No-11, Shikhar Heights Market, Siddharth Vihar, Ghaziabad',
        MARGIN + 20,
        HEADER_TOP + 92
    );

    ctx.fillStyle = '#4b5563';
    ctx.font = '500 20px Helvetica, Arial, sans-serif';
    ctx.fillText(
        'Contact No : 9871265836',
        MARGIN + 20,
        HEADER_TOP + 122
    );

    ctx.fillStyle = '#6b7280';
    ctx.font = '600 18px Helvetica, Arial, sans-serif';
    ctx.fillText('Cash Memo / Bill', MARGIN + 20, HEADER_TOP + 154);

    // Header divider
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN + 10, HEADER_TOP + HEADER_H);
    ctx.lineTo(W - MARGIN - 10, HEADER_TOP + HEADER_H);
    ctx.stroke();

    // ===== Bill meta row =====
    const META_Y = HEADER_TOP + HEADER_H + 50;
    ctx.fillStyle = '#1f2937';

    // Date
    ctx.textAlign = 'left';
    ctx.font = '700 22px Helvetica, Arial, sans-serif';
    ctx.fillText('Date:', MARGIN + 20, META_Y);
    ctx.font = '500 22px Helvetica, Arial, sans-serif';
    ctx.fillText(ddmmyyyy(bill.date) || '—', MARGIN + 90, META_Y);

    // Bill #
    ctx.textAlign = 'right';
    ctx.font = '700 22px Helvetica, Arial, sans-serif';
    ctx.fillText('Bill #:', W - MARGIN - 270, META_Y);
    ctx.font = '500 22px Helvetica, Arial, sans-serif';
    ctx.fillText(billNumberFor(bill.date), W - MARGIN - 20, META_Y);

    // Customer
    ctx.textAlign = 'left';
    ctx.font = '700 22px Helvetica, Arial, sans-serif';
    ctx.fillText('Bill To:', MARGIN + 20, META_Y + 42);
    ctx.font = '600 24px Helvetica, Arial, sans-serif';
    ctx.fillText(bill.customerName || '—', MARGIN + 110, META_Y + 42);

    // ===== Items table =====
    const TABLE_X = MARGIN;
    const TABLE_Y = META_Y + 88;
    const TABLE_W = W - MARGIN * 2;
    const ROW_H = 54;
    const HEADER_ROW_H = 58;

    // Column layout
    const cols = [
        { key: 'sno',    label: '#',      x: TABLE_X + 14,   w: 60,  align: 'left'  },
        { key: 'item',   label: 'Item',   x: TABLE_X + 84,   w: 560, align: 'left'  },
        { key: 'qty',    label: 'Qty',    x: TABLE_X + 654,  w: 80,  align: 'right' },
        { key: 'rate',   label: 'Rate',   x: TABLE_X + 754,  w: 170, align: 'right' },
        { key: 'amount', label: 'Amount', x: TABLE_X + 944,  w: 180, align: 'right' }
    ];

    // Header background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(TABLE_X, TABLE_Y, TABLE_W, HEADER_ROW_H);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 20px Helvetica, Arial, sans-serif';
    cols.forEach(c => {
        ctx.textAlign = c.align;
        const tx = c.align === 'right' ? c.x + c.w : c.x;
        ctx.fillText(c.label, tx, TABLE_Y + HEADER_ROW_H / 2 + 7);
    });

    // Body rows
    let curY = TABLE_Y + HEADER_ROW_H;

    bill.items.forEach((it, idx) => {
        if (idx % 2 === 1) {
            ctx.fillStyle = '#f3f4f6';
            ctx.fillRect(TABLE_X, curY, TABLE_W, ROW_H);
        }
        ctx.fillStyle = '#1f2937';
        ctx.font = '500 19px Helvetica, Arial, sans-serif';

        const cellY = curY + ROW_H / 2 + 7;

        // #
        ctx.textAlign = 'left';
        ctx.fillText(String(idx + 1), cols[0].x, cellY);

        // Item (truncate if too wide)
        const itemText = truncateForWidth(ctx, it.name, cols[1].w - 10);
        ctx.fillText(itemText, cols[1].x, cellY);

        // Qty
        ctx.textAlign = 'right';
        ctx.fillText(String(it.qty), cols[2].x + cols[2].w, cellY);

        // Rate
        ctx.fillText('₹' + formatIndianNumber(it.rate), cols[3].x + cols[3].w, cellY);

        // Amount
        ctx.font = '700 19px Helvetica, Arial, sans-serif';
        ctx.fillText('₹' + formatIndianNumber(it.amount), cols[4].x + cols[4].w, cellY);

        curY += ROW_H;
    });

    // Pad with empty rows
    const MIN_ROWS = 14;
    if (bill.items.length < MIN_ROWS) {
        const padCount = MIN_ROWS - bill.items.length;
        for (let i = 0; i < padCount; i++) {
            if ((bill.items.length + i) % 2 === 1) {
                ctx.fillStyle = '#f3f4f6';
                ctx.fillRect(TABLE_X, curY, TABLE_W, ROW_H);
            }
            curY += ROW_H;
        }
    }

    // Table outer border
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.strokeRect(TABLE_X, TABLE_Y, TABLE_W, curY - TABLE_Y);

    // Vertical column separators
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    const vLines = [
        TABLE_X + 74,
        TABLE_X + 644,
        TABLE_X + 744,
        TABLE_X + 934
    ];
    vLines.forEach(vx => {
        ctx.beginPath();
        ctx.moveTo(vx, TABLE_Y + HEADER_ROW_H);
        ctx.lineTo(vx, curY);
        ctx.stroke();
    });

    // ===== Total payable =====
    const TOTAL_Y = curY + 56;
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'right';
    ctx.font = '800 28px Helvetica, Arial, sans-serif';
    ctx.fillText('Total Payable:', TABLE_X + TABLE_W - 240, TOTAL_Y);
    ctx.font = '900 32px Helvetica, Arial, sans-serif';
    ctx.fillText('₹' + formatIndianNumber(bill.total), TABLE_X + TABLE_W - 14, TOTAL_Y);

    // Underline the total
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(TABLE_X + TABLE_W - 420, TOTAL_Y + 12);
    ctx.lineTo(TABLE_X + TABLE_W, TOTAL_Y + 12);
    ctx.stroke();

    // ===== Footer =====
    const FOOTER_Y = H - MARGIN - 60;
    ctx.fillStyle = '#4b5563';
    ctx.textAlign = 'center';
    ctx.font = 'italic 600 22px Helvetica, Arial, sans-serif';
    ctx.fillText('Thank you for your visit!', W / 2, FOOTER_Y);

    ctx.font = '600 16px Helvetica, Arial, sans-serif';
    ctx.fillText('Pen & Play Club  •  Shop No-11, Shikhar Heights Market, Siddharth Vihar, Ghaziabad  •  Contact: 9871265836', W / 2, FOOTER_Y + 30);

    return canvas;
}

function truncateForWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const t = text.substring(0, mid) + '…';
        if (ctx.measureText(t).width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.substring(0, lo) + '…';
}

// ----- Generate flow -----
async function generate() {
    const bill = readBillData();
    if (!bill.date) { alert('Please pick a date.'); return; }
    if (!bill.customerName) { alert('Please enter customer name.'); return; }
    if (bill.items.length === 0) { alert('Please add at least one item with quantity and rate.'); return; }

    pageLoader.classList.remove('hidden');
    try {
        const canvas = await renderBillCanvas(bill);

        // Build JPEG blob
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
        if (lastJpegBlobUrl) URL.revokeObjectURL(lastJpegBlobUrl);
        lastJpegBlob = blob;
        lastJpegBlobUrl = URL.createObjectURL(blob);

        const safeName = (bill.customerName || 'customer').replace(/[^\w\-]+/g, '_');
        lastBillFileName = `Bill_${bill.date}_${safeName}.jpg`;

        previewImg.src = lastJpegBlobUrl;
        previewSection.classList.remove('hidden');
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        console.error('❌ Bill generation failed:', err);
        alert('Could not generate bill: ' + err.message);
    } finally {
        pageLoader.classList.add('hidden');
    }
}

function download() {
    if (!lastJpegBlobUrl) return;
    const a = document.createElement('a');
    a.href = lastJpegBlobUrl;
    a.download = lastBillFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Share the bill JPEG via WhatsApp.
// - Mobile/modern browsers: use the Web Share API with files. The OS share
//   sheet appears — user picks WhatsApp — the JPEG is attached as a real
//   image along with the summary text.
// - Desktop / unsupported: fall back to downloading the JPEG and opening
//   WhatsApp Web with the text, so the user can drag the image in manually.
async function shareWhatsApp() {
    if (!lastJpegBlob) {
        alert('Please generate the bill first.');
        return;
    }

    const bill = readBillData();
    const summary =
        `*Pen & Play Club — Bill*\n` +
        `Date: ${ddmmyyyy(bill.date)}\n` +
        (bill.customerName ? `Customer: ${bill.customerName}\n` : '') +
        `Total: ₹${formatIndianNumber(bill.total)}`;

    // Strategy 1: Web Share API with the JPEG file attached. On Android/iOS
    // this brings up the share sheet — picking WhatsApp attaches the image.
    try {
        const file = new File([lastJpegBlob], lastBillFileName, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Pen & Play Club — Bill',
                text: summary
            });
            return;
        }
    } catch (err) {
        if (err && err.name === 'AbortError') return; // user cancelled the share
        console.warn('Web Share API failed, falling back:', err);
    }

    // Strategy 2 (fallback): no file-share support — download the JPEG and
    // open WhatsApp with the text. User attaches the image manually.
    download();

    const encodedText = encodeURIComponent(summary + '\n(Please find the bill image attached.)');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `whatsapp://send?text=${encodedText}`;
    } else {
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    }
}

// ----- Dark mode & burger -----
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

// ----- Init -----
function init() {
    // Default today's date
    const today = new Date();
    billDateInput.value = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    // Add a first empty item row
    addItemRow();

    addItemBtn.addEventListener('click', () => addItemRow());
    generateBtn.addEventListener('click', generate);
    downloadBtn.addEventListener('click', download);
    const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
    if (shareWhatsappBtn) shareWhatsappBtn.addEventListener('click', shareWhatsApp);
    regenerateBtn.addEventListener('click', () => {
        previewSection.classList.add('hidden');
        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    initDarkMode();
    if (darkModeToggle) darkModeToggle.addEventListener('click', toggleDarkMode);

    initBurgerMenu();
    pageLoader.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);
