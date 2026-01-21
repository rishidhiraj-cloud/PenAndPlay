// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Dashboard.js loaded successfully');

// Global variables
let currentMonth = new Date();
let chartInstance = null;

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
        darkModeToggle.textContent = '☀️';
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    darkModeToggle.textContent = isDark ? '☀️' : '🌙';
}

// Widget Toggles
function initWidgetToggles() {
    const widgets = [
        { id: 'toggleSummaryCards', target: 'summary-cards', class: 'summary-cards' },
        { id: 'toggleChart', target: 'chart-container', class: 'chart-container' },
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

        // Update month labels
        updateMonthLabels(previousMonth, twoMonthsBefore);

        console.log('Current month data:', currentMonthData.length, 'entries');
        console.log('Previous month data:', previousMonthData.length, 'entries');
        console.log('2 months before data:', twoMonthsBeforeData.length, 'entries');

        // Calculate statistics
        const stats = calculateStats(currentMonthData, previousMonthData, twoMonthsBeforeData);

        // Update UI
        updateSummaryCards(stats);
        updateChart(currentMonthData, previousMonthData);
        updatePeakDays(currentMonthData);
        updateDailyBreakdown(currentMonthData);

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
function updateMonthLabels(previousMonth, twoMonthsBefore) {
    // Format as "Feb'25"
    const lastMonthLabel = previousMonth.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + previousMonth.getFullYear().toString().slice(-2);
    const twoMonthsLabel = twoMonthsBefore.toLocaleDateString('en-US', { month: 'short' }) +
                          "'" + twoMonthsBefore.getFullYear().toString().slice(-2);

    lastMonthLabelEl.textContent = `(${lastMonthLabel})`;
    twoMonthsBeforeLabelEl.textContent = `(${twoMonthsLabel})`;
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
    // Current month stats
    const totalIncome = currentData.reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);
    const daysRecorded = currentData.length;

    // Get the current day of month to calculate "till date" for previous months
    const today = new Date();
    const currentDayOfMonth = today.getDate();

    // Calculate till-date income for last month (up to same day number)
    const tillDateLastMonth = previousData
        .filter(entry => {
            const entryDay = new Date(entry.date).getDate();
            return entryDay <= currentDayOfMonth;
        })
        .reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);

    // Calculate till-date income for 2 months before (up to same day number)
    const tillDate2MonthsBefore = twoMonthsBeforeData
        .filter(entry => {
            const entryDay = new Date(entry.date).getDate();
            return entryDay <= currentDayOfMonth;
        })
        .reduce((sum, entry) => sum + parseFloat(entry.total_income), 0);

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
        comparisonText
    };
}

// Update Summary Cards
function updateSummaryCards(stats) {
    totalIncomeThisMonthEl.textContent = `₹${stats.totalIncome.toFixed(2)}`;
    tillDateLastMonthEl.textContent = `₹${stats.tillDateLastMonth.toFixed(2)}`;
    tillDate2MonthsBeforeEl.textContent = `₹${stats.tillDate2MonthsBefore.toFixed(2)}`;

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

    // Get days in current month
    const daysInMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0
    ).getDate();

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
                                label += '₹' + context.parsed.y.toFixed(2);
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
                            return '₹' + value;
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
                <div class="peak-day-amount">₹${parseFloat(entry.total_income).toFixed(2)}</div>
            </div>
        `;
    }).join('');

    peakDaysEl.innerHTML = html;
}

// Update Daily Breakdown
function updateDailyBreakdown(data) {
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

    // Sort by date descending (newest first)
    const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    const html = sortedData.map(entry => {
        const date = new Date(entry.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        return `
            <div class="daily-item">
                <div>
                    <div class="daily-header">
                        <span class="daily-date">${date}</span>
                        <span class="daily-total">₹${parseFloat(entry.total_income).toFixed(2)}</span>
                    </div>
                    <div class="daily-details">
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Cash on Day</span>
                            <span>₹${parseFloat(entry.cash_total || 0).toFixed(2)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">UPI</span>
                            <span>₹${parseFloat(entry.upi_amount).toFixed(2)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Card</span>
                            <span>₹${parseFloat(entry.card_amount).toFixed(2)}</span>
                        </div>
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">AP Cash</span>
                            <span>₹${parseFloat(entry.ap_cash || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    dailyBreakdownEl.innerHTML = html;
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', init);
