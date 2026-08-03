// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Analyse Sales.js loaded successfully');

// ----- Formatting helpers -----
function formatIndianNumber(num) {
    const n = parseFloat(num || 0).toFixed(2);
    const parts = n.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    let lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    if (otherNumbers !== '') lastThree = ',' + lastThree;
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

function getCssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) return new Date(savedMonth);
    return new Date();
}

// ----- Item-merging algorithm (see design spec for validation history) -----
function normalizeItem(s) {
    s = s.trim().toLowerCase();
    s = s.replace(/[.,/]/g, '');
    s = s.replace(/\s+/g, ' ');
    return s;
}

function compactItem(s) {
    return s.replace(/\s+/g, '');
}

function singularItem(s) {
    if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
    return s;
}

// Ratcliff/Obershelp similarity ratio — matches Python's difflib.SequenceMatcher.ratio()
function similarityRatio(a, b) {
    function findLongestMatch(aStr, bStr) {
        let best = { aStart: 0, bStart: 0, size: 0 };
        for (let i = 0; i < aStr.length; i++) {
            for (let j = 0; j < bStr.length; j++) {
                let k = 0;
                while (i + k < aStr.length && j + k < bStr.length && aStr[i + k] === bStr[j + k]) k++;
                if (k > best.size) best = { aStart: i, bStart: j, size: k };
            }
        }
        return best;
    }
    function matchBlocks(aStr, bStr) {
        const match = findLongestMatch(aStr, bStr);
        if (match.size === 0) return 0;
        let total = match.size;
        if (match.aStart > 0 && match.bStart > 0) {
            total += matchBlocks(aStr.slice(0, match.aStart), bStr.slice(0, match.bStart));
        }
        if (match.aStart + match.size < aStr.length && match.bStart + match.size < bStr.length) {
            total += matchBlocks(aStr.slice(match.aStart + match.size), bStr.slice(match.bStart + match.size));
        }
        return total;
    }
    if (a.length === 0 && b.length === 0) return 1;
    const m = matchBlocks(a, b);
    return (2 * m) / (a.length + b.length);
}

// rows: sales_log rows for the current period.
// synonymGroupRows: raw item_synonym_groups rows ({ canonical_name, variant_spelling }),
//   fetched once per page load via fetchItemSynonymGroups().
// Returns: [{ display, count, revenue, variants: string[], manual: boolean }]
function clusterItems(rows, synonymGroupRows) {
    const rawByNorm = new Map();
    rows.forEach(r => {
        const norm = normalizeItem(r.item);
        if (!rawByNorm.has(norm)) rawByNorm.set(norm, new Set());
        rawByNorm.get(norm).add(r.item.trim());
    });

    const norms = Array.from(rawByNorm.keys());
    const parent = new Map(norms.map(n => [n, n]));
    function find(x) {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    const compoundOnly = new Set();
    norms.forEach(n => {
        const raws = Array.from(rawByNorm.get(n));
        if (raws.every(r => r.includes(','))) compoundOnly.add(n);
    });

    for (let i = 0; i < norms.length; i++) {
        for (let j = i + 1; j < norms.length; j++) {
            const a = norms[i], b = norms[j];
            if (compoundOnly.has(a) || compoundOnly.has(b)) continue;
            if (a === b) { union(a, b); continue; }
            if (singularItem(a) === singularItem(b)) { union(a, b); continue; }
            if (compactItem(a) === compactItem(b)) { union(a, b); continue; }
            if (Math.min(a.length, b.length) >= 5 && similarityRatio(a, b) >= 0.86) {
                union(a, b);
            }
        }
    }

    // Group the flat item_synonym_groups rows into { canonical_name -> [variant_spelling, ...] }.
    const synonymGroups = new Map();
    (synonymGroupRows || []).forEach(row => {
        if (!synonymGroups.has(row.canonical_name)) synonymGroups.set(row.canonical_name, []);
        synonymGroups.get(row.canonical_name).push(row.variant_spelling);
    });

    // Match via compactItem(normalizeItem(...)) on BOTH sides, not an exact
    // string comparison — a stored variant_spelling keeps its natural
    // casing/punctuation (e.g. "P.Out") for display in the management UI,
    // so it must be normalized the same way diary text is before comparing.
    // This is the same fix that was required for the old hardcoded
    // SYNONYM_GROUPS array (Print/P.Out only merged once compared via
    // compactItem instead of an exact literal match).
    //
    // Each manual group also carries a canonical display-name override
    // (canonicalOverride), applied after clustering below — this is how a
    // Dhiraj-managed group controls exactly what name Insights shows,
    // instead of falling back to whichever raw spelling occurred most.
    const canonicalOverride = new Map();
    synonymGroups.forEach((variants, canonicalName) => {
        const groupCompacts = variants.map(v => compactItem(normalizeItem(v)));
        const present = norms.filter(n => groupCompacts.includes(compactItem(n)));
        for (let k = 1; k < present.length; k++) union(present[k], present[0]);
        if (present.length > 0) {
            canonicalOverride.set(find(present[0]), canonicalName);
        }
    });

    const clusters = new Map();
    rows.forEach(r => {
        const root = find(normalizeItem(r.item));
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(r);
    });

    const result = [];
    clusters.forEach((clusterRows, root) => {
        const rawCounts = new Map();
        clusterRows.forEach(r => {
            const raw = r.item.trim();
            rawCounts.set(raw, (rawCounts.get(raw) || 0) + 1);
        });
        let display = '', maxCount = -1;
        rawCounts.forEach((count, raw) => { if (count > maxCount) { maxCount = count; display = raw; } });
        if (canonicalOverride.has(root)) display = canonicalOverride.get(root);
        const variants = Array.from(rawCounts.keys()).filter(r => r !== display);
        const revenue = clusterRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        result.push({ display, count: clusterRows.length, revenue, variants, manual: canonicalOverride.has(root) });
    });

    return result;
}

// ----- DOM -----
const periodTillDateBtn = document.getElementById('periodTillDateBtn');
const periodViewingMonthBtn = document.getElementById('periodViewingMonthBtn');
const periodContextEl = document.getElementById('periodContext');
const loadErrorMsgEl = document.getElementById('loadErrorMsg');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

const kpiItemsSoldEl = document.getElementById('kpiItemsSold');
const kpiDistinctItemsEl = document.getElementById('kpiDistinctItems');
const kpiDistinctItemsSubEl = document.getElementById('kpiDistinctItemsSub');
const kpiAvgPerDayEl = document.getElementById('kpiAvgPerDay');
const kpiDaysCapturedEl = document.getElementById('kpiDaysCaptured');

const bottomTableBodyEl = document.getElementById('bottomTableBody');

const askForm = document.getElementById('askForm');
const askChips = document.querySelectorAll('.ask-chip');

const manageGroupsBtn = document.getElementById('manageGroupsBtn');
const groupsModal = document.getElementById('groupsModal');
const groupsModalClose = document.getElementById('groupsModalClose');
const existingGroupsList = document.getElementById('existingGroupsList');
const createGroupLabel = document.getElementById('createGroupLabel');
const cancelAddToGroupBtn = document.getElementById('cancelAddToGroupBtn');
const newGroupName = document.getElementById('newGroupName');
const newGroupPickerSearch = document.getElementById('newGroupPickerSearch');
const newGroupPickerList = document.getElementById('newGroupPickerList');
const newGroupSelectedLabel = document.getElementById('newGroupSelectedLabel');
const newGroupSelectedChips = document.getElementById('newGroupSelectedChips');
const createGroupBtn = document.getElementById('createGroupBtn');

let currentPeriod = 'till-date';
let currentStats = null;
let dailyTrendChart = null;
let topRevenueChart = null;
let topQuantityChart = null;
let synonymGroupRows = [];
let allTimeItemCounts = null;              // Map<rawSpelling, count>, lazily fetched on first modal open
let addToGroupMode = null;                 // canonical_name string when adding to an existing group, else null
let selectedNewGroupSpellings = new Set(); // spellings currently selected in the picker

const CATEGORIES = ['Stationery', 'Sports', 'Toys', 'Seasonal'];
let itemCategories = new Map();     // Map<item_name (canonical display), category>
let categoryQuantityChart = null;
let categoryRevenueChart = null;

// ----- Data fetch -----
async function fetchSalesData(period) {
    let query = supabaseClient.from('sales_log').select('*').order('entry_date', { ascending: true });
    if (period === 'viewing-month') {
        const selectedMonth = getSelectedMonth();
        const year = selectedMonth.getFullYear();
        const monthNum = String(selectedMonth.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${monthNum}-01`;
        const lastDay = new Date(year, selectedMonth.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${monthNum}-${lastDay}`;
        query = query.gte('entry_date', startDate).lte('entry_date', endDate);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// All item_synonym_groups rows, fetched once per page load — the manual
// merge/rename layer that used to be the hardcoded SYNONYM_GROUPS array.
async function fetchItemSynonymGroups() {
    const { data, error } = await supabaseClient
        .from('item_synonym_groups')
        .select('*')
        .order('canonical_name', { ascending: true });
    if (error) throw error;
    return data || [];
}

// All-time (not period-scoped) distinct item spellings with their raw
// occurrence counts — used by the Manage Item Groups modal's spelling
// picker and existing-group count subtitles. Independent of the page's
// Till Date / Viewing Month toggle since group management is a global
// configuration action, not scoped to whatever period is being viewed.
async function fetchAllTimeItemCounts() {
    const { data, error } = await supabaseClient.from('sales_log').select('item');
    if (error) throw error;
    const counts = new Map();
    (data || []).forEach(r => {
        const raw = r.item.trim();
        counts.set(raw, (counts.get(raw) || 0) + 1);
    });
    return counts;
}

// All item_categories rows, fetched once per page load — maps each
// canonical/merged item name to one of the 4 fixed categories.
async function fetchItemCategories() {
    const { data, error } = await supabaseClient.from('item_categories').select('*');
    if (error) throw error;
    const map = new Map();
    (data || []).forEach(r => map.set(r.item_name, r.category));
    return map;
}

// ----- Stats -----
function computeStats(rows, clusters) {
    const totalItemsSold = rows.length;
    const rawDistinct = new Set(rows.map(r => normalizeItem(r.item))).size;
    const distinctItems = clusters.length;

    const dailyMap = new Map();
    rows.forEach(r => {
        dailyMap.set(r.entry_date, (dailyMap.get(r.entry_date) || 0) + 1);
    });
    const dailyCounts = Array.from(dailyMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const daysCaptured = dailyCounts.length;
    const avgPerDay = daysCaptured > 0 ? Math.round(totalItemsSold / daysCaptured) : 0;

    const byRevenue = clusters.slice().sort((a, b) => b.revenue - a.revenue);
    const byQuantity = clusters.slice().sort((a, b) => b.count - a.count);
    const bottomItems = clusters.slice().sort((a, b) => a.count - b.count).slice(0, 10);

    return { totalItemsSold, rawDistinct, distinctItems, dailyCounts, daysCaptured, avgPerDay, byRevenue, byQuantity, bottomItems };
}

// ----- Rendering -----
function renderKpis(stats) {
    kpiItemsSoldEl.textContent = stats.totalItemsSold;
    kpiDistinctItemsEl.textContent = stats.distinctItems;
    kpiDistinctItemsSubEl.textContent = `${stats.rawDistinct} as written, merged`;
    kpiAvgPerDayEl.textContent = stats.avgPerDay;
    kpiDaysCapturedEl.textContent = stats.daysCaptured;
}

function renderDailyTrendChart(dailyCounts) {
    const canvas = document.getElementById('dailyTrendCanvas');
    const olive = getCssVar('--olive');
    if (dailyTrendChart) dailyTrendChart.destroy();
    dailyTrendChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dailyCounts.map(d => new Date(d.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })),
            datasets: [{
                label: 'Items Sold',
                data: dailyCounts.map(d => d.count),
                borderColor: olive,
                backgroundColor: hexToRgba(olive, 0.18),
                fill: true,
                tension: 0.25,
                pointRadius: 3,
                pointBackgroundColor: olive
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                x: { grid: { display: false }, ticks: { color: getCssVar('--ink-faint') } }
            }
        }
    });
}

function renderTopChart(canvasId, existingChart, clusters, color, valueKey, formatValue) {
    if (existingChart) existingChart.destroy();
    const canvas = document.getElementById(canvasId);
    // Reversed so #1 (first in the already-sorted-descending array) renders at the top —
    // Chart.js horizontal bars (indexAxis: 'y') plot the first label at the bottom otherwise.
    const ordered = clusters.slice(0, 10).slice().reverse();
    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ordered.map(c => c.display),
            datasets: [{
                data: ordered.map(c => c[valueKey]),
                backgroundColor: color,
                borderRadius: 3,
                barThickness: 16
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => formatValue(item.raw) } }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                y: { grid: { display: false }, ticks: { color: getCssVar('--ink-soft') } }
            }
        }
    });
}

function renderBottomTable(bottomItems) {
    bottomTableBodyEl.innerHTML = bottomItems.map(c => `
        <tr>
            <td>${escapeHtml(c.display)}</td>
            <td class="num">${c.count}×</td>
        </tr>
    `).join('');
}

// Groups already-computed clusters by category (falling back to
// "Uncategorized" for anything not yet tagged), summing quantity and
// revenue per bucket. Pure re-grouping of data already in memory — no
// separate fetch, so this respects whatever period is currently loaded.
function bucketByCategory(clusters, categoryMap) {
    const buckets = new Map();
    CATEGORIES.concat(['Uncategorized']).forEach(cat => buckets.set(cat, { count: 0, revenue: 0 }));
    clusters.forEach(c => {
        const cat = categoryMap.get(c.display) || 'Uncategorized';
        const bucket = buckets.get(cat);
        bucket.count += c.count;
        bucket.revenue += c.revenue;
    });
    return buckets;
}

function renderCategoryChart(canvasId, existingChart, buckets, valueKey, formatValue) {
    if (existingChart) existingChart.destroy();
    const canvas = document.getElementById(canvasId);
    const labels = CATEGORIES.concat(['Uncategorized']);
    const colors = [getCssVar('--blue'), getCssVar('--olive'), getCssVar('--red'), getCssVar('--gold'), getCssVar('--ink-faint')];
    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: labels.map(l => buckets.get(l)[valueKey]),
                backgroundColor: colors,
                borderRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => formatValue(item.raw) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: getCssVar('--rule') }, ticks: { color: getCssVar('--ink-faint') } },
                x: { grid: { display: false }, ticks: { color: getCssVar('--ink-soft') } }
            }
        }
    });
}

function updatePeriodContext() {
    if (currentPeriod === 'viewing-month') {
        const selectedMonth = getSelectedMonth();
        periodContextEl.textContent = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
        periodContextEl.textContent = 'All captured data';
    }
}

// ----- Orchestration -----
async function loadAndRender() {
    pageLoader.classList.remove('hidden');
    loadErrorMsgEl.classList.add('hidden');
    updatePeriodContext();
    try {
        const rows = await fetchSalesData(currentPeriod);
        const clusters = clusterItems(rows, synonymGroupRows);
        currentStats = computeStats(rows, clusters);

        renderKpis(currentStats);
        renderDailyTrendChart(currentStats.dailyCounts);
        topRevenueChart = renderTopChart('topRevenueCanvas', topRevenueChart, currentStats.byRevenue, getCssVar('--olive'), 'revenue', v => '₹' + formatIndianNumber(v));
        topQuantityChart = renderTopChart('topQuantityCanvas', topQuantityChart, currentStats.byQuantity, getCssVar('--blue'), 'count', v => v + '×');
        renderBottomTable(currentStats.bottomItems);

        const categoryBuckets = bucketByCategory(clusters, itemCategories);
        categoryQuantityChart = renderCategoryChart('categoryQuantityCanvas', categoryQuantityChart, categoryBuckets, 'count', v => v + '×');
        categoryRevenueChart = renderCategoryChart('categoryRevenueCanvas', categoryRevenueChart, categoryBuckets, 'revenue', v => '₹' + formatIndianNumber(v));
    } catch (err) {
        console.error('❌ Error loading sales insights:', err);
        loadErrorMsgEl.textContent = 'Error loading sales data: ' + err.message;
        loadErrorMsgEl.classList.remove('hidden');
    } finally {
        pageLoader.classList.add('hidden');
    }
}

function initPeriodToggle() {
    [periodTillDateBtn, periodViewingMonthBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            [periodTillDateBtn, periodViewingMonthBtn].forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            loadAndRender();
        });
    });
}

const askInput = document.getElementById('askInput');
const askSendBtn = document.getElementById('askSendBtn');
const askAnswerEl = document.getElementById('askAnswer');

function currentPeriodLabel() {
    return currentPeriod === 'viewing-month' ? periodContextEl.textContent : 'Till Date';
}

function buildAskContext() {
    if (!currentStats) return null;
    return {
        period: currentPeriodLabel(),
        totalItemsSold: currentStats.totalItemsSold,
        distinctItems: currentStats.distinctItems,
        topByRevenue: currentStats.byRevenue.slice(0, 10).map(c => ({ display: c.display, revenue: c.revenue, count: c.count })),
        topByQuantity: currentStats.byQuantity.slice(0, 10).map(c => ({ display: c.display, count: c.count, revenue: c.revenue })),
        bottomItems: currentStats.bottomItems.slice(0, 10).map(c => ({ display: c.display, count: c.count })),
        dailyCounts: currentStats.dailyCounts
    };
}

function renderAskAnswer(question, answerText, isError) {
    askAnswerEl.innerHTML = `
        <span class="ask-q">${escapeHtml(question)}</span>
        ${escapeHtml(answerText)}
    `;
    askAnswerEl.classList.remove('hidden');
    askAnswerEl.classList.toggle('is-error', !!isError);
}

async function handleAskSales(e) {
    e.preventDefault();

    const question = askInput.value.trim();
    if (!question) return;

    const context = buildAskContext();
    if (!context) {
        renderAskAnswer(question, 'Data abhi load ho rahi hai, thoda ruk kar phir try karein.', true);
        return;
    }

    askSendBtn.disabled = true;
    askSendBtn.textContent = 'Poochh rahe…';

    try {
        const response = await fetch('/api/ask-sales-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, context })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }

        renderAskAnswer(question, result.answer, false);
    } catch (err) {
        console.error('❌ Ask error:', err);
        renderAskAnswer(question, 'Maaf kijiye, jawaab nahi mil paaya: ' + err.message, true);
    } finally {
        askSendBtn.disabled = false;
        askSendBtn.textContent = 'Poochho';
    }
}

askForm.addEventListener('submit', handleAskSales);

askChips.forEach(chip => {
    chip.addEventListener('click', () => {
        askInput.value = chip.textContent;
        askForm.requestSubmit();
    });
});

// ============================================================
// Manage Item Groups (Dhiraj-only)
// ============================================================

// Sum the all-time occurrence count of every raw diary spelling that
// normalizes to the same form as `variantSpelling` — keeps the modal's
// counts consistent with clusterItems()'s own matching logic, regardless
// of exact casing/punctuation differences between a stored variant and
// however it happens to appear in the diary.
function countForVariant(variantSpelling) {
    const target = compactItem(normalizeItem(variantSpelling));
    let total = 0;
    allTimeItemCounts.forEach((count, raw) => {
        if (compactItem(normalizeItem(raw)) === target) total += count;
    });
    return total;
}

// Group the flat synonymGroupRows into { canonical_name -> [row, ...] }
function groupedSynonymRows() {
    const map = new Map();
    synonymGroupRows.forEach(row => {
        if (!map.has(row.canonical_name)) map.set(row.canonical_name, []);
        map.get(row.canonical_name).push(row);
    });
    return map;
}

function renderExistingGroups() {
    const groups = groupedSynonymRows();
    if (groups.size === 0) {
        existingGroupsList.innerHTML = '<div class="empty-state">No groups yet — create one below.</div>';
        return;
    }
    const cardsHtml = Array.from(groups.entries()).map(([canonicalName, variantRows]) => {
        const totalCount = variantRows.reduce((s, v) => s + countForVariant(v.variant_spelling), 0);
        const chipsHtml = variantRows.map(v => `
            <span class="chip">
                ${escapeHtml(v.variant_spelling)} <span class="chip-count">(${countForVariant(v.variant_spelling)})</span>
                <span class="chip-x" data-remove-row-id="${v.id}" title="Remove this spelling">✕</span>
            </span>
        `).join('');
        return `
            <div class="group-card">
                <div class="group-card-top">
                    <div class="group-name-row">
                        <span class="group-name">${escapeHtml(canonicalName)}</span>
                        <span class="group-count">${totalCount} sale${totalCount === 1 ? '' : 's'} across ${variantRows.length} spelling${variantRows.length === 1 ? '' : 's'}</span>
                    </div>
                    <div class="group-actions">
                        <button type="button" class="group-icon-btn" data-rename="${escapeHtml(canonicalName)}">Rename</button>
                        <button type="button" class="group-icon-btn danger" data-delete-group="${escapeHtml(canonicalName)}">Delete Group</button>
                    </div>
                </div>
                <div class="variant-chips">
                    ${chipsHtml}
                    <button type="button" class="chip-add" data-add-to-group="${escapeHtml(canonicalName)}">+ Add spelling</button>
                </div>
            </div>
        `;
    }).join('');
    existingGroupsList.innerHTML = cardsHtml;
    wireExistingGroupsEvents();
}

// Renders the shared spelling picker used by both "Create New Group" and
// "Add spelling to existing group" mode. Excludes spellings already
// selected in this session and (in add-to-group mode) spellings already
// present in the target group.
function renderSpellingPicker() {
    const query = normalizeItem(newGroupPickerSearch.value || '');
    const alreadyInTargetGroup = addToGroupMode
        ? new Set((groupedSynonymRows().get(addToGroupMode) || []).map(v => compactItem(normalizeItem(v.variant_spelling))))
        : new Set();

    const entries = Array.from(allTimeItemCounts.entries())
        .filter(([raw]) => !query || normalizeItem(raw).includes(query))
        .filter(([raw]) => !alreadyInTargetGroup.has(compactItem(normalizeItem(raw))))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    newGroupPickerList.innerHTML = entries.length
        ? entries.map(([raw, count]) => `
            <div class="picker-item${selectedNewGroupSpellings.has(raw) ? ' selected' : ''}" data-spelling="${escapeHtml(raw)}">
                <span class="picker-item-name">${escapeHtml(raw)}</span>
                <span class="picker-item-count">${count} sale${count === 1 ? '' : 's'}</span>
            </div>
        `).join('')
        : '<div class="picker-item"><span class="picker-item-name">No matches</span></div>';

    newGroupPickerList.querySelectorAll('.picker-item[data-spelling]').forEach(item => {
        item.addEventListener('click', () => {
            const spelling = item.dataset.spelling;
            if (selectedNewGroupSpellings.has(spelling)) selectedNewGroupSpellings.delete(spelling);
            else selectedNewGroupSpellings.add(spelling);
            renderSpellingPicker();
            renderSelectedPreview();
            updateCreateGroupButtonState();
        });
    });
}

function renderSelectedPreview() {
    const selected = Array.from(selectedNewGroupSpellings);
    newGroupSelectedLabel.textContent = `Selected (${selected.length})`;
    newGroupSelectedChips.innerHTML = selected.map(spelling => `
        <span class="chip">
            ${escapeHtml(spelling)} <span class="chip-count">(${countForVariant(spelling)})</span>
            <span class="chip-x" data-deselect="${escapeHtml(spelling)}">✕</span>
        </span>
    `).join('');
    newGroupSelectedChips.querySelectorAll('.chip-x[data-deselect]').forEach(x => {
        x.addEventListener('click', () => {
            selectedNewGroupSpellings.delete(x.dataset.deselect);
            renderSpellingPicker();
            renderSelectedPreview();
            updateCreateGroupButtonState();
        });
    });
}

function updateCreateGroupButtonState() {
    const hasName = addToGroupMode ? true : newGroupName.value.trim().length > 0;
    createGroupBtn.disabled = !hasName || selectedNewGroupSpellings.size === 0;
}

function enterAddToGroupMode(canonicalName) {
    addToGroupMode = canonicalName;
    selectedNewGroupSpellings = new Set();
    createGroupLabel.textContent = `Add Spelling to "${canonicalName}"`;
    newGroupName.value = canonicalName;
    newGroupName.disabled = true;
    cancelAddToGroupBtn.classList.remove('hidden');
    createGroupBtn.textContent = 'Add Spelling(s)';
    newGroupPickerSearch.value = '';
    renderSpellingPicker();
    renderSelectedPreview();
    updateCreateGroupButtonState();
    createGroupLabel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitAddToGroupMode() {
    addToGroupMode = null;
    selectedNewGroupSpellings = new Set();
    createGroupLabel.textContent = 'Create New Group';
    newGroupName.value = '';
    newGroupName.disabled = false;
    cancelAddToGroupBtn.classList.add('hidden');
    createGroupBtn.textContent = 'Create Group';
    newGroupPickerSearch.value = '';
    renderSpellingPicker();
    renderSelectedPreview();
    updateCreateGroupButtonState();
}

function wireExistingGroupsEvents() {
    existingGroupsList.querySelectorAll('[data-rename]').forEach(btn => {
        btn.addEventListener('click', () => handleRenameGroup(btn.dataset.rename));
    });
    existingGroupsList.querySelectorAll('[data-delete-group]').forEach(btn => {
        btn.addEventListener('click', () => handleDeleteGroup(btn.dataset.deleteGroup));
    });
    existingGroupsList.querySelectorAll('[data-remove-row-id]').forEach(x => {
        x.addEventListener('click', () => handleRemoveVariant(x.dataset.removeRowId));
    });
    existingGroupsList.querySelectorAll('[data-add-to-group]').forEach(btn => {
        btn.addEventListener('click', () => enterAddToGroupMode(btn.dataset.addToGroup));
    });
}

function handleRenameGroup(canonicalName) {
    const newName = prompt('Enter new group name:', canonicalName);
    if (!newName || newName.trim() === '') return;
    if (newName.trim() === canonicalName) return;
    renameGroup(canonicalName, newName.trim());
}

async function renameGroup(oldName, newName) {
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .update({ canonical_name: newName })
            .eq('canonical_name', oldName);
        if (error) throw error;
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error renaming group:', err);
        alert('Failed to rename group: ' + err.message);
    }
}

async function handleDeleteGroup(canonicalName) {
    if (!confirm(`Delete the "${canonicalName}" group? Its spellings will no longer be merged/renamed. This cannot be undone.`)) return;
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .delete()
            .eq('canonical_name', canonicalName);
        if (error) throw error;
        if (addToGroupMode === canonicalName) exitAddToGroupMode();
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error deleting group:', err);
        alert('Failed to delete group: ' + err.message);
    }
}

async function handleRemoveVariant(rowId) {
    if (!confirm('Remove this spelling from its group?')) return;
    try {
        const { error } = await supabaseClient
            .from('item_synonym_groups')
            .delete()
            .eq('id', rowId);
        if (error) throw error;
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error removing variant:', err);
        alert('Failed to remove this spelling: ' + err.message);
    }
}

async function handleCreateOrAddGroup() {
    const canonicalName = addToGroupMode || newGroupName.value.trim();
    const spellings = Array.from(selectedNewGroupSpellings);
    if (!canonicalName || spellings.length === 0) return;

    const wasAddMode = !!addToGroupMode;
    createGroupBtn.disabled = true;
    createGroupBtn.textContent = 'Saving…';

    try {
        const rowsToInsert = spellings.map(variant_spelling => ({ canonical_name: canonicalName, variant_spelling }));
        const { error } = await supabaseClient.from('item_synonym_groups').insert(rowsToInsert);
        if (error) throw error;

        exitAddToGroupMode();
        await refreshGroupsAndInsights();
    } catch (err) {
        console.error('Error saving group:', err);
        alert('Failed to save: ' + err.message);
        createGroupBtn.textContent = wasAddMode ? 'Add Spelling(s)' : 'Create Group';
        createGroupBtn.disabled = false;
    }
}

// Re-fetch synonym groups + all-time counts, then refresh both the modal's
// own lists and the underlying Insights page (KPIs/charts/table) so any
// change is visible immediately without a page reload.
async function refreshGroupsAndInsights() {
    synonymGroupRows = await fetchItemSynonymGroups();
    allTimeItemCounts = await fetchAllTimeItemCounts();
    renderExistingGroups();
    renderSpellingPicker();
    renderSelectedPreview();
    await loadAndRender();
}

async function openGroupsModal() {
    groupsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    existingGroupsList.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
        if (!allTimeItemCounts) allTimeItemCounts = await fetchAllTimeItemCounts();
        exitAddToGroupMode();
        renderExistingGroups();
    } catch (err) {
        console.error('Error opening groups modal:', err);
        existingGroupsList.innerHTML = `<div class="empty-state">Could not load groups: ${escapeHtml(err.message)}</div>`;
    }
}

function closeGroupsModal() {
    groupsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function initManageGroupsButton() {
    const isDhiraj = window.washiAuth && window.washiAuth.getUsername() === 'Dhiraj';
    if (isDhiraj && manageGroupsBtn) {
        manageGroupsBtn.classList.remove('hidden');
        manageGroupsBtn.addEventListener('click', openGroupsModal);
    }
    if (groupsModalClose) groupsModalClose.addEventListener('click', closeGroupsModal);
    if (groupsModal) {
        groupsModal.addEventListener('click', (e) => {
            if (e.target === groupsModal) closeGroupsModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && groupsModal && !groupsModal.classList.contains('hidden')) {
            closeGroupsModal();
        }
    });
    if (newGroupPickerSearch) newGroupPickerSearch.addEventListener('input', renderSpellingPicker);
    if (newGroupName) newGroupName.addEventListener('input', updateCreateGroupButtonState);
    if (cancelAddToGroupBtn) cancelAddToGroupBtn.addEventListener('click', exitAddToGroupMode);
    if (createGroupBtn) createGroupBtn.addEventListener('click', handleCreateOrAddGroup);
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

document.addEventListener('DOMContentLoaded', async () => {
    initBurgerMenu();
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initPeriodToggle();
    initManageGroupsButton();
    try {
        synonymGroupRows = await fetchItemSynonymGroups();
    } catch (err) {
        console.error('Failed to load item synonym groups:', err);
        synonymGroupRows = [];
    }
    try {
        itemCategories = await fetchItemCategories();
    } catch (err) {
        console.error('Failed to load item categories:', err);
        itemCategories = new Map();
    }
    loadAndRender();
});
