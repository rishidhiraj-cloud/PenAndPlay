// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Dashboard.js loaded successfully');

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

// Global variables
let currentMonth = new Date();
let chartInstance = null;
let monthlyIncomeChartInstance = null;
let monthlyAvgChartInstance = null;

// Get selected month from localStorage or use current month
function getSelectedMonth() {
    const savedMonth = localStorage.getItem('selectedMonth');
    if (savedMonth) {
        return new Date(savedMonth);
    }
    return new Date();
}

// Save selected month to localStorage
function saveSelectedMonth(month) {
    localStorage.setItem('selectedMonth', month.toISOString());
}

// DOM Elements
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const currentMonthDisplay = document.getElementById('currentMonthDisplay');
const totalIncomeThisMonthEl = document.getElementById('totalIncomeThisMonth');
const tillDateLastMonthEl = document.getElementById('tillDateLastMonth');
const tillDate2MonthsBeforeEl = document.getElementById('tillDate2MonthsBefore');
const vsLastMonthEl = document.getElementById('vsLastMonth');
const lastMonthLabelEl = document.getElementById('lastMonthLabel');
const twoMonthsBeforeLabelEl = document.getElementById('twoMonthsBeforeLabel');
const dailyBreakdownEl = document.getElementById('dailyBreakdown');
const pageLoader = document.getElementById('pageLoader');
const peakDaysEl = document.getElementById('peakDays');
const darkModeToggle = document.getElementById('darkModeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');

// Initialize Dashboard
async function init() {
    console.log('🚀 Initializing dashboard...');

    // Load selected month from localStorage
    currentMonth = getSelectedMonth();

    // Setup event listeners
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    // Settings
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
    });

    // Widget toggles
    initWidgetToggles();

    // Load current month data
    await loadDashboard();

    console.log('✅ Dashboard initialized');
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

// Widget Toggles
function initWidgetToggles() {
    const widgets = [
        { id: 'toggleSummaryCards', target: 'summary-cards', class: 'summary-cards' },
        { id: 'toggleChart', target: 'chart-container', class: 'chart-container' },
        { id: 'toggleMonthlyIncome', target: 'monthlyIncomeWidget', class: null },
        { id: 'toggleMonthlyAvg', target: 'monthlyAvgWidget', class: null },
        { id: 'togglePeakDays', target: 'peakDaysWidget', class: 'details-section' },
        { id: 'toggleDailyBreakdown', target: 'dailyBreakdownWidget', class: 'details-section' }
    ];

    widgets.forEach(widget => {
        const toggle = document.getElementById(widget.id);
        const savedState = localStorage.getItem(widget.id);

        if (savedState === 'false') {
            toggle.checked = false;
            const element = document.getElementById(widget.target) || document.querySelector(`.${widget.class}`);
            if (element) element.classList.add('widget-hidden');
        }

        toggle.addEventListener('change', (e) => {
            const element = document.getElementById(widget.target) || document.querySelector(`.${widget.class}`);
            if (element) {
                if (e.target.checked) {
                    element.classList.remove('widget-hidden');
                } else {
                    element.classList.add('widget-hidden');
                }
            }
            localStorage.setItem(widget.id, e.target.checked);
        });
    });
}

// Change Month
function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    saveSelectedMonth(currentMonth);
    loadDashboard();
}

// Load Dashboard Data
async function loadDashboard() {
    try {
        pageLoader.classList.remove('hidden');
        console.log('📊 Loading dashboard for:', currentMonth.toISOString().substring(0, 7));

        // Update month display
        updateMonthDisplay();

        // Fetch data for current, previous, and 2 months before
        const currentMonthData = await fetchMonthData(currentMonth);

        const previousMonth = new Date(currentMonth);
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const previousMonthData = await fetchMonthData(previousMonth);

        const twoMonthsBefore = new Date(currentMonth);
        twoMonthsBefore.setMonth(twoMonthsBefore.getMonth() - 2);
        const twoMonthsBeforeData = await fetchMonthData(twoMonthsBefore);

        console.log('Current month data:', currentMonthData.length, 'entries');
        console.log('Previous month data:', previousMonthData.length, 'entries');
        console.log('2 months before data:', twoMonthsBeforeData.length, 'entries');

        // Calculate statistics
        const stats = calculateStats(currentMonthData, previousMonthData, twoMonthsBeforeData);

        // Update month labels with current/past month context
        updateMonthLabels(previousMonth, twoMonthsBefore, stats.isCurrentMonth);
        updateCardLabels(previousMonth, twoMonthsBefore, stats.isCurrentMonth);

        // Fetch monthly trend data
        const monthlyData = await fetchAllMonthlyData();

        // Update UI
        updateSummaryCards(stats);
        updateChart(currentMonthData, previousMonthData);
        updateMonthlyIncomeChart(monthlyData);
        updateMonthlyAvgChart(monthlyData);
        updatePeakDays(currentMonthData);
        updateDailyBreakdown(currentMonthData, previousMonthData);

    } catch (err) {
        console.error('❌ Error loading dashboard:', err);
    } finally {
        pageLoader.classList.add('hidden');
    }
}

// Update Month Display
function updateMonthDisplay() {
    const monthName = currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    currentMonthDisplay.textContent = monthName;

    // Disable next button if current month or future
    const now = new Date();
    const isCurrentOrFuture = currentMonth.getFullYear() >= now.getFullYear() &&
                              currentMonth.getMonth() >= now.getMonth();
    nextMonthBtn.disabled = isCurrentOrFuture;
}

// Update Month Labels
function updateMonthLabels(previousMonth, twoMonthsBefore, isCurrentMonth) {
    // Format as "Feb'25"
    const lastMonthLabel = previousMonth.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + previousMonth.getFullYear().toString().slice(-2);
    const twoMonthsLabel = twoMonthsBefore.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + twoMonthsBefore.getFullYear().toString().slice(-2);

    lastMonthLabelEl.textContent = `(${lastMonthLabel})`;
    twoMonthsBeforeLabelEl.textContent = `(${twoMonthsLabel})`;
}

// Update Card Labels based on current/past month
function updateCardLabels(previousMonth, twoMonthsBefore, isCurrentMonth) {
    const lastMonthLabel = previousMonth.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + previousMonth.getFullYear().toString().slice(-2);
    const twoMonthsLabel = twoMonthsBefore.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + twoMonthsBefore.getFullYear().toString().slice(-2);

    // Get the card label elements
    const tillDateLastMonthLabel = document.querySelector('#tillDateLastMonth').closest('.summary-card').querySelector('.card-label');
    const tillDate2MonthsBeforeLabel = document.querySelector('#tillDate2MonthsBefore').closest('.summary-card').querySelector('.card-label');
    const vsLastMonthLabel = document.querySelector('#vsLastMonth').closest('.summary-card').querySelector('.card-label');

    if (isCurrentMonth) {
        tillDateLastMonthLabel.innerHTML = `Till Date Income Last Month <span id="lastMonthLabel">(${lastMonthLabel})</span>`;
        tillDate2MonthsBeforeLabel.innerHTML = `Till Date Income 2 Months Before <span id="twoMonthsBeforeLabel">(${twoMonthsLabel})</span>`;
        vsLastMonthLabel.textContent = 'Growth vs Last Month';
    } else {
        tillDateLastMonthLabel.innerHTML = `Income Last Month <span id="lastMonthLabel">(${lastMonthLabel})</span>`;
        tillDate2MonthsBeforeLabel.innerHTML = `Income 2 Months Before <span id="twoMonthsBeforeLabel">(${twoMonthsLabel})</span>`;
        vsLastMonthLabel.textContent = 'Growth vs Last Month';
    }
}

// Fetch Month Data
async function fetchMonthData(month) {
    const year = month.getFullYear();
    const monthNum = String(month.getMonth() + 1).padStart(2, '0');
    const startDate = `${year}-${monthNum}-01`;

    // Get last day of month
    const lastDay = new Date(year, month.getMonth() + 1, 0).getDate();
    const endDate = `${year}-${monthNum}-${lastDay}`;

    console.log('Fetching data from', startDate, 'to', endDate);

    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching month data:', error);
        return [];
    }

    return data || [];
}

// Calculate Statistics
function calculateStats(currentData, previousData, twoMonthsBeforeData) {
    // Check if viewing current month
    const today = new Date();
    const isCurrentMonth = currentMonth.getFullYear() === today.getFullYear() &&
                           currentMonth.getMonth() === today.getMonth();

    // Current month stats
    const totalIncome = currentData.reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);
    const daysRecorded = currentData.length;

    let tillDateLastMonth, tillDate2MonthsBefore;

    if (isCurrentMonth) {
        // For current month: use the last entry date
        let compareDay = today.getDate();
        if (currentData.length > 0) {
            const lastEntry = currentData.reduce((latest, entry) => {
                const entryDate = new Date(entry.date);
                const latestDate = new Date(latest.date);
                return entryDate > latestDate ? entry : latest;
            });
            compareDay = new Date(lastEntry.date).getDate();
        }

        tillDateLastMonth = previousData
            .filter(entry => {
                const entryDay = new Date(entry.date).getDate();
                return entryDay <= compareDay;
            })
            .reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);

        tillDate2MonthsBefore = twoMonthsBeforeData
            .filter(entry => {
                const entryDay = new Date(entry.date).getDate();
                return entryDay <= compareDay;
            })
            .reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);
    } else {
        // For past months: use full month data
        tillDateLastMonth = previousData.reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);
        tillDate2MonthsBefore = twoMonthsBeforeData.reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);
    }

    // Calculate percentage growth/decline vs last month
    let comparison = 0;
    let comparisonText = '-';
    if (tillDateLastMonth > 0) {
        comparison = ((totalIncome - tillDateLastMonth) / tillDateLastMonth) * 100;
        const sign = comparison >= 0 ? '+' : '';
        comparisonText = `${sign}${comparison.toFixed(1)}%`;
    } else if (totalIncome > 0) {
        comparisonText = '+100%';
        comparison = 100;
    }

    return {
        totalIncome,
        daysRecorded,
        tillDateLastMonth,
        tillDate2MonthsBefore,
        comparison,
        comparisonText,
        isCurrentMonth
    };
}

// Update Summary Cards
function updateSummaryCards(stats) {
    totalIncomeThisMonthEl.textContent = `₹${formatIndianNumber(stats.totalIncome)}`;
    tillDateLastMonthEl.textContent = `₹${formatIndianNumber(stats.tillDateLastMonth)}`;
    tillDate2MonthsBeforeEl.textContent = `₹${formatIndianNumber(stats.tillDate2MonthsBefore)}`;

    // Update comparison with color coding
    vsLastMonthEl.textContent = stats.comparisonText;
    vsLastMonthEl.className = 'card-value';
    if (stats.comparison > 0) {
        vsLastMonthEl.classList.add('positive');
    } else if (stats.comparison < 0) {
        vsLastMonthEl.classList.add('negative');
    }
}

// Update Comparison Chart
function updateChart(currentData, previousData) {
    const ctx = document.getElementById('comparisonChart');

    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Get days in current and previous month, use whichever is higher
    const daysInCurrentMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0
    ).getDate();
    const daysInPreviousMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        0
    ).getDate();
    const daysInMonth = Math.max(daysInCurrentMonth, daysInPreviousMonth);

    // Create labels (day numbers)
    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Map current month data
    const currentDataMap = {};
    currentData.forEach(entry => {
        const day = new Date(entry.date).getDate();
        currentDataMap[day] = parseFloat(entry.total_income);
    });

    // Map previous month data
    const previousDataMap = {};
    previousData.forEach(entry => {
        const day = new Date(entry.date).getDate();
        previousDataMap[day] = parseFloat(entry.total_income);
    });

    // Create datasets
    const currentMonthValues = labels.map(day => currentDataMap[day] || null);
    const previousMonthValues = labels.map(day => previousDataMap[day] || null);

    // Month names for legend
    const currentMonthName = currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const prevMonth = new Date(currentMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthName = prevMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Create chart
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: currentMonthName,
                    data: currentMonthValues,
                    backgroundColor: '#ff9f43',
                    borderColor: '#ff9f43',
                    borderWidth: 0,
                    borderRadius: 8,
                    barPercentage: 0.85,
                    categoryPercentage: 0.85
                },
                {
                    label: prevMonthName,
                    data: previousMonthValues,
                    backgroundColor: '#74b9ff',
                    borderColor: '#74b9ff',
                    borderWidth: 0,
                    borderRadius: 8,
                    barPercentage: 0.85,
                    categoryPercentage: 0.85
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: 600
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'rectRounded'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 12,
                    boxPadding: 6,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += '₹' + formatIndianNumber(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Day of Month',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    },
                    stacked: false
                },
                y: {
                    title: {
                        display: true,
                        text: 'Income (₹)',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return '₹' + formatIndianNumber(value);
                        }
                    },
                    stacked: false
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    });
}

// Update Peak Days
function updatePeakDays(data) {
    if (data.length === 0) {
        peakDaysEl.innerHTML = `
            <div class="empty-state">
                <p>No data available for peak days analysis.</p>
            </div>
        `;
        return;
    }

    // Sort by total_income and get top 5
    const sortedData = [...data]
        .sort((a, b) => parseFloat(b.total_income) - parseFloat(a.total_income))
        .slice(0, 5);

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    const html = sortedData.map((entry, index) => {
        const date = new Date(entry.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });

        return `
            <div class="peak-day-item">
                <div class="peak-day-rank">${medals[index]}</div>
                <div class="peak-day-info">
                    <div class="peak-day-date">${formattedDate}</div>
                    <div class="peak-day-weekday">${weekday}</div>
                </div>
                <div class="peak-day-amount">₹${formatIndianNumber(entry.total_income)}</div>
            </div>
        `;
    }).join('');

    peakDaysEl.innerHTML = html;
}

// Update Daily Breakdown
function updateDailyBreakdown(data, previousData) {
    if (data.length === 0) {
        dailyBreakdownEl.innerHTML = `
            <div class="empty-state">
                <h3>No Data Available</h3>
                <p>No entries recorded for this month.</p>
                <a href="entry.html" style="color: #667eea; text-decoration: none; font-weight: 600;">Add Entry</a>
            </div>
        `;
        return;
    }

    // Build day-of-month → income map for previous month
    const prevMap = {};
    (previousData || []).forEach(entry => {
        const day = new Date(entry.date).getDate();
        prevMap[day] = parseFloat(entry.total_income);
    });

    // Sort by date descending (newest first)
    const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    const html = sortedData.map(entry => {
        const date = new Date(entry.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        const day = new Date(entry.date).getDate();
        const current = parseFloat(entry.total_income);
        const prev = prevMap[day];

        // Green if no previous data or current >= previous; red if current < previous
        const isUp = prev === undefined || current >= prev;
        const totalClass = isUp ? 'daily-total daily-total--up' : 'daily-total daily-total--down';

        let changeBadge = '';
        if (prev !== undefined && prev > 0) {
            const pct = Math.abs(((current - prev) / prev) * 100).toFixed(1);
            const arrow = isUp ? '▲' : '▼';
            const badgeClass = isUp ? 'daily-change daily-change--up' : 'daily-change daily-change--down';
            changeBadge = `<span class="${badgeClass}">${arrow}${pct}%</span>`;
        } else if (prev === undefined) {
            changeBadge = `<span class="daily-change daily-change--up">▲ new</span>`;
        }

        return `
            <div class="daily-item">
                <div>
                    <div class="daily-header">
                        <span class="daily-date">${date}</span>
                        <span class="${totalClass}">₹${formatIndianNumber(entry.total_income)}${changeBadge}</span>
                    </div>
                    <div class="daily-details">
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Today's Cash</span>
                            <span>₹${formatIndianNumber(entry.cash_total || 0)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">UPI</span>
                            <span>₹${formatIndianNumber(entry.upi_amount)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Card</span>
                            <span>₹${formatIndianNumber(entry.card_amount)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">AP Cash</span>
                            <span>₹${formatIndianNumber(entry.ap_cash || 0)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    dailyBreakdownEl.innerHTML = html;
}

// Fetch all monthly income totals from first entry till current month
async function fetchAllMonthlyData() {
    try {
        // First, find the earliest entry
        const { data: earliest, error: earliestError } = await supabaseClient
            .from('daily_entries')
            .select('date')
            .order('date', { ascending: true })
            .limit(1);

        if (earliestError || !earliest || earliest.length === 0) {
            console.error('Error fetching earliest entry:', earliestError);
            return [];
        }

        // Parse date string directly to avoid timezone issues (Supabase returns "YYYY-MM-DD")
        const firstDateStr = earliest[0].date;
        const [firstYear, firstMonthNum] = firstDateStr.split('-').map(Number);

        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1; // 1-based

        // Build start/end range: from first month to current month
        const startDate = `${firstYear}-${String(firstMonthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(nowYear, nowMonth, 0).getDate();
        const endDate = `${nowYear}-${String(nowMonth).padStart(2, '0')}-${lastDay}`;

        console.log('Fetching monthly trend from', startDate, 'to', endDate);

        const { data, error } = await supabaseClient
            .from('daily_entries')
            .select('date, total_income')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching all monthly data:', error);
            return [];
        }

        // Group by month using string parsing to avoid timezone issues
        const monthlyMap = {};       // key -> total income
        const monthlyDaysMap = {};   // key -> Set of distinct dates (YYYY-MM-DD only)
        (data || []).forEach(entry => {
            // Normalize to YYYY-MM-DD so two rows for the same calendar date with
            // different time components don't get counted as separate days.
            const dateOnly = String(entry.date).substring(0, 10);
            const parts = dateOnly.split('-');
            const key = `${parts[0]}-${parts[1]}`; // "YYYY-MM"
            if (!monthlyMap[key]) {
                monthlyMap[key] = 0;
                monthlyDaysMap[key] = new Set();
            }
            monthlyMap[key] += parseFloat(entry.total_income);
            monthlyDaysMap[key].add(dateOnly);
        });

        // Fill in all months from first to current (including months with no entries)
        const result = [];
        let curYear = firstYear;
        let curMonth = firstMonthNum;

        while (curYear < nowYear || (curYear === nowYear && curMonth <= nowMonth)) {
            const key = `${curYear}-${String(curMonth).padStart(2, '0')}`;
            const label = new Date(curYear, curMonth - 1, 15).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const total = monthlyMap[key] || 0;
            // Cap at the calendar days of that month so an impossible value
            // (e.g., Feb showing 30) can never appear.
            const calendarDays = new Date(curYear, curMonth, 0).getDate();
            const rawDays = monthlyDaysMap[key] ? monthlyDaysMap[key].size : 0;
            const daysWithEntries = Math.min(rawDays, calendarDays);
            const avg = daysWithEntries > 0 ? total / daysWithEntries : 0;
            result.push({
                key,
                label,
                total,
                daysWithEntries,
                avg
            });
            curMonth++;
            if (curMonth > 12) {
                curMonth = 1;
                curYear++;
            }
        }

        return result;
    } catch (err) {
        console.error('Error in fetchAllMonthlyData:', err);
        return [];
    }
}

// Update Monthly Income Line Chart (fiscal year: Feb to Jan, each year = separate line)
function updateMonthlyIncomeChart(monthlyData) {
    const ctx = document.getElementById('monthlyIncomeChart');
    if (!ctx) return;

    if (monthlyIncomeChartInstance) {
        monthlyIncomeChartInstance.destroy();
    }

    if (!monthlyData || monthlyData.length === 0) {
        return;
    }

    // X-axis labels: Feb, Mar, Apr, ..., Dec, Jan
    const monthOrder = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];

    // Group monthly data into fiscal years (Feb of startYear to Jan of startYear+1)
    // A month's fiscal year is determined by: Feb-Dec belong to that calendar year, Jan belongs to previous year
    const fiscalYears = {};
    monthlyData.forEach(m => {
        const [yearStr, monthStr] = m.key.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr); // 1-based

        // Determine which fiscal year this month belongs to
        // Jan (1) belongs to fiscal year starting the previous Feb
        // Feb (2) through Dec (12) belong to fiscal year starting that Feb
        const fiscalStartYear = month === 1 ? year - 1 : year;
        const fiscalLabel = "Feb'" + String(fiscalStartYear).slice(-2) + " - Jan'" + String(fiscalStartYear + 1).slice(-2);

        if (!fiscalYears[fiscalLabel]) {
            fiscalYears[fiscalLabel] = { startYear: fiscalStartYear, data: new Array(12).fill(null) };
        }

        // Map month to index: Feb=0, Mar=1, ..., Dec=10, Jan=11
        const index = month === 1 ? 11 : month - 2;
        fiscalYears[fiscalLabel].data[index] = m.total;
    });

    // Sort fiscal years by startYear
    const sortedKeys = Object.keys(fiscalYears).sort((a, b) => fiscalYears[a].startYear - fiscalYears[b].startYear);

    // Colors for each fiscal year line
    const yearColors = [
        { border: '#667eea', bg: 'rgba(102, 126, 234, 0.1)' },
        { border: '#ff9f43', bg: 'rgba(255, 159, 67, 0.1)' },
        { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
        { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
        { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
    ];

    const datasets = sortedKeys.map((label, i) => {
        const color = yearColors[i % yearColors.length];
        return {
            label: label,
            data: fiscalYears[label].data,
            borderColor: color.border,
            backgroundColor: color.bg,
            borderWidth: 3,
            fill: false,
            tension: 0.3,
            pointBackgroundColor: color.border,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            spanGaps: false
        };
    });

    monthlyIncomeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthOrder,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: 600
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 12,
                    boxPadding: 6,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += '₹' + formatIndianNumber(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Income (₹)',
                        font: {
                            size: 14,
                            weight: 600
                        }
                    },
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return '₹' + formatIndianNumber(value);
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    });
}

// Update Monthly Avg Daily Sale Chart (fiscal year: Feb to Jan)
// Per month: avg = total_income / days_with_entries
function updateMonthlyAvgChart(monthlyData) {
    const ctx = document.getElementById('monthlyAvgChart');
    if (!ctx) return;

    if (monthlyAvgChartInstance) {
        monthlyAvgChartInstance.destroy();
    }

    if (!monthlyData || monthlyData.length === 0) {
        return;
    }

    const monthOrder = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];

    // Group by fiscal year (Feb–Jan)
    const fiscalYears = {};
    monthlyData.forEach(m => {
        const [yearStr, monthStr] = m.key.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr); // 1-based

        const fiscalStartYear = month === 1 ? year - 1 : year;
        const fiscalLabel = "Feb'" + String(fiscalStartYear).slice(-2) + " - Jan'" + String(fiscalStartYear + 1).slice(-2);

        if (!fiscalYears[fiscalLabel]) {
            fiscalYears[fiscalLabel] = {
                startYear: fiscalStartYear,
                data: new Array(12).fill(null),
                days: new Array(12).fill(0)
            };
        }

        const index = month === 1 ? 11 : month - 2;
        // Only plot if there were any days with entries (else leave null = gap)
        fiscalYears[fiscalLabel].data[index] = (m.daysWithEntries || 0) > 0 ? m.avg : null;
        fiscalYears[fiscalLabel].days[index] = m.daysWithEntries || 0;
    });

    const sortedKeys = Object.keys(fiscalYears).sort((a, b) => fiscalYears[a].startYear - fiscalYears[b].startYear);

    const yearColors = [
        { border: '#667eea', bg: 'rgba(102, 126, 234, 0.1)' },
        { border: '#ff9f43', bg: 'rgba(255, 159, 67, 0.1)' },
        { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
        { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
        { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
    ];

    const datasets = sortedKeys.map((label, i) => {
        const color = yearColors[i % yearColors.length];
        return {
            label: label,
            data: fiscalYears[label].data,
            _days: fiscalYears[label].days,
            borderColor: color.border,
            backgroundColor: color.bg,
            borderWidth: 3,
            fill: false,
            tension: 0.3,
            pointBackgroundColor: color.border,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            spanGaps: false
        };
    });

    monthlyAvgChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthOrder,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 14, weight: 600 },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    boxPadding: 6,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                const days = context.dataset._days?.[context.dataIndex] || 0;
                                label += '₹' + formatIndianNumber(context.parsed.y) + (days ? ` (${days} day${days === 1 ? '' : 's'})` : '');
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Month', font: { size: 14, weight: 600 } },
                    grid: { display: false },
                    ticks: { font: { size: 12 } }
                },
                y: {
                    title: { display: true, text: 'Avg Daily Sale (₹)', font: { size: 14, weight: 600 } },
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        font: { size: 12 },
                        callback: function(value) {
                            return '₹' + formatIndianNumber(value);
                        }
                    }
                }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

// Burger Menu
function initBurgerMenu() {
    const burgerIcon = document.getElementById('burgerIcon');
    const burgerMenu = document.getElementById('burgerMenu');
    const burgerOverlay = document.getElementById('burgerOverlay');

    burgerIcon.addEventListener('click', () => {
        burgerMenu.classList.toggle('active');
        burgerOverlay.classList.toggle('active');
    });

    burgerOverlay.addEventListener('click', () => {
        burgerMenu.classList.remove('active');
        burgerOverlay.classList.remove('active');
    });
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    init();
});
