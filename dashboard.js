// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Dashboard.js loaded successfully');

// Global variables
let currentMonth = new Date();
let chartInstance = null;

// DOM Elements
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const currentMonthDisplay = document.getElementById('currentMonthDisplay');
const totalIncomeThisMonthEl = document.getElementById('totalIncomeThisMonth');
const tillDateLastMonthEl = document.getElementById('tillDateLastMonth');
const tillDate2MonthsBeforeEl = document.getElementById('tillDate2MonthsBefore');
const vsLastMonthEl = document.getElementById('vsLastMonth');
const dailyBreakdownEl = document.getElementById('dailyBreakdown');

// Initialize Dashboard
async function init() {
    console.log('🚀 Initializing dashboard...');

    // Setup event listeners
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));

    // Load current month data
    await loadDashboard();

    console.log('✅ Dashboard initialized');
}

// Change Month
function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    loadDashboard();
}

// Load Dashboard Data
async function loadDashboard() {
    try {
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

        // Update UI
        updateSummaryCards(stats);
        updateChart(currentMonthData, previousMonthData);
        updateDailyBreakdown(currentMonthData);

    } catch (err) {
        console.error('❌ Error loading dashboard:', err);
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
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.8
                },
                {
                    label: prevMonthName,
                    data: previousMonthValues,
                    backgroundColor: '#74b9ff',
                    borderColor: '#74b9ff',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
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
                        text: 'Day of Month'
                    },
                    grid: {
                        display: false
                    },
                    stacked: false
                },
                y: {
                    title: {
                        display: true,
                        text: 'Income (₹)'
                    },
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
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

// Update Daily Breakdown
function updateDailyBreakdown(data) {
    if (data.length === 0) {
        dailyBreakdownEl.innerHTML = `
            <div class="empty-state">
                <h3>No Data Available</h3>
                <p>No entries recorded for this month.</p>
                <a href="index.html" style="color: #667eea; text-decoration: none; font-weight: 600;">Add Entry</a>
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
                    <div class="daily-date">${date}</div>
                    <div class="daily-details">
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Cash on Hand</span>
                            <span>₹${parseFloat(entry.cash_amount).toFixed(2)}</span>
                        </div>
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
                        <div class="daily-detail-item">
                            <span class="daily-detail-label">Petty Cash</span>
                            <span>₹${parseFloat(entry.petty_cash).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                <div class="daily-amount">₹${parseFloat(entry.total_income).toFixed(2)}</div>
            </div>
        `;
    }).join('');

    dailyBreakdownEl.innerHTML = html;
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', init);
