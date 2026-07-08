/* ─────────────────────────────────────────────
   Pen & Play Club — Daily Report Float
   Only runs on index.html.
   Shows RED WhatsApp button when today's entry
   exists but report hasn't been sent yet.
   Switches to "View Sale" after report is sent.
   ───────────────────────────────────────────── */

(function () {
    'use strict';

    var SUPABASE_URL  = 'https://sckgsgakyyosgjxoctlb.supabase.co';
    var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

    /* ── Utilities ────────────────────────────── */

    function todayISO() {
        var d = new Date();
        return d.getFullYear() + '-'
             + String(d.getMonth() + 1).padStart(2, '0') + '-'
             + String(d.getDate()).padStart(2, '0');
    }

    function waKey() { return 'pnp_wa_' + todayISO(); }
    function isSent() { return localStorage.getItem(waKey()) === 'sent'; }
    function markSent() { localStorage.setItem(waKey(), 'sent'); }

    function getUsername() {
        try {
            var a = JSON.parse(localStorage.getItem('washi_auth'));
            return a && a.authenticated ? a.username : null;
        } catch (e) { return null; }
    }

    function fmt(num) {
        var n = parseFloat(num || 0).toFixed(2);
        var p = n.split('.');
        var i = p[0];
        var last3 = i.slice(-3);
        var rest  = i.slice(0, -3);
        if (rest) last3 = ',' + last3;
        return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3 + '.' + p[1];
    }

    /* ── Supabase fetching ────────────────────── */

    function getDB() {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }

    async function fetchTodayEntry() {
        try {
            var r = await getDB()
                .from('daily_entries')
                .select('*')
                .eq('date', todayISO())
                .limit(1);
            return r.data && r.data.length ? r.data[0] : null;
        } catch (_) { return null; }
    }

    async function fetchTodayExpenses() {
        try {
            var today = todayISO();
            var r = await getDB()
                .from('expenses')
                .select('*')
                .gte('created_at', today + 'T00:00:00')
                .lte('created_at', today + 'T23:59:59')
                .order('created_at', { ascending: false });
            return r.data || [];
        } catch (_) { return []; }
    }

    async function fetchMTD() {
        try {
            var today    = todayISO();
            var mtdStart = today.slice(0, 7) + '-01';
            var r = await getDB()
                .from('daily_entries')
                .select('total_income')
                .gte('date', mtdStart)
                .lte('date', today);
            return r.data
                ? r.data.reduce(function (s, e) { return s + parseFloat(e.total_income || 0); }, 0)
                : 0;
        } catch (_) { return 0; }
    }

    /* ── Build WhatsApp message ───────────────── */

    async function buildMessage(entry) {
        var date        = new Date(entry.date);
        var dd          = String(date.getDate()).padStart(2, '0');
        var mm          = String(date.getMonth() + 1).padStart(2, '0');
        var yyyy        = date.getFullYear();
        var formattedDate = dd + '/' + mm + '/' + yyyy;

        var expenses = await fetchTodayExpenses();
        var mtdTotal = await fetchMTD();

        var msg = '*Pen & Play Cash Register - ' + formattedDate + '*\n\n'
            + 'Drawer Cash: ₹' + fmt(entry.cash_amount) + '\n'
            + "Today's Cash: ₹" + fmt(entry.cash_total || 0) + '\n'
            + 'UPI: ₹' + fmt(entry.upi_amount) + '\n'
            + 'Card: ₹' + fmt(entry.card_amount) + '\n'
            + 'AP Cash: ₹' + fmt(entry.ap_cash || 0) + '\n'
            + 'Petty Cash: ₹' + fmt(entry.petty_cash) + '\n'
            + 'MTD : ₹' + fmt(mtdTotal) + '\n\n'
            + '*TOTAL INCOME : ₹' + fmt(entry.total_income) + '*';

        if (expenses.length > 0) {
            msg += '\n\n*Expenses*\n';
            expenses.forEach(function (expense, index) {
                var ed  = new Date(expense.expense_date);
                var eDate = String(ed.getDate()).padStart(2, '0') + '/'
                          + String(ed.getMonth() + 1).padStart(2, '0') + '/'
                          + ed.getFullYear();
                msg += '\nExpense Date: ' + eDate
                     + '\nExpense By: ' + expense.expense_by
                     + '\nAmount: ₹' + fmt(expense.amount)
                     + '\nPaid From: ' + expense.paid_from
                     + '\nDescription: ' + (expense.description || 'N/A');
                if (index < expenses.length - 1) msg += '\n';
            });
        }

        msg += '\n\nFor Detailed data, Visit https://pen-and-play.vercel.app/index.html';
        return msg;
    }

    /* ── Inject styles ────────────────────────── */

    function injectStyles() {
        if (document.getElementById('dr-styles')) return;
        var s = document.createElement('style');
        s.id = 'dr-styles';
        s.textContent =
            /* Wrapper */
            '#drWrap{position:fixed;bottom:20px;right:14px;z-index:8888;display:flex;flex-direction:column;align-items:flex-end;gap:7px;}' +

            /* Tag label */
            '#drTag{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#fff;padding:4px 11px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.18);pointer-events:none;}' +
            '#drTag.wa{background:#C0392B;}' +
            '#drTag.vs{background:#1C1C1E;}' +

            /* Circle button */
            '#drCircle{width:54px;height:54px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;transition:transform .15s,box-shadow .15s;}' +
            '#drCircle:active{transform:scale(0.95);}' +
            '#drCircle.wa{background:#C0392B;box-shadow:0 4px 18px rgba(192,57,43,0.5);}' +
            '#drCircle.wa:hover{transform:scale(1.07);box-shadow:0 6px 22px rgba(192,57,43,0.6);}' +
            '#drCircle.vs{background:#1C1C1E;box-shadow:0 4px 18px rgba(0,0,0,0.28);}' +
            '#drCircle.vs:hover{transform:scale(1.07);}' +
            '#drCircle svg{width:26px;height:26px;fill:#fff;display:block;}' +

            /* Dismiss × */
            '#drX{position:absolute;top:-5px;right:-5px;width:19px;height:19px;border-radius:50%;background:#555;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #F5F0E8;font-family:sans-serif;z-index:1;}' +

            /* Spinner */
            '#drSpinner{width:24px;height:24px;border:2.5px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:drSpin 0.7s linear infinite;display:none;}' +
            '@keyframes drSpin{to{transform:rotate(360deg)}}' +

            /* Modal overlay */
            '#drModal{position:fixed;inset:0;background:rgba(28,28,30,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}' +
            '#drModal.hidden{display:none;}' +
            '#drModalCard{width:100%;max-width:380px;background:#F5F0E8;border:1px solid rgba(28,28,30,0.22);border-radius:4px;overflow:hidden;max-height:85vh;display:flex;flex-direction:column;}' +
            '#drModalHead{padding:16px 18px;border-bottom:1.5px solid #1C1C1E;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}' +
            '#drModalTitle{font-family:"Cormorant Garamond",Georgia,serif;font-size:20px;font-weight:600;font-style:italic;color:#1C1C1E;}' +
            '#drModalDate{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(28,28,30,0.5);margin-top:2px;}' +
            '#drModalClose{font-family:"JetBrains Mono",monospace;font-size:16px;color:rgba(28,28,30,0.5);background:none;border:none;cursor:pointer;padding:4px 8px;line-height:1;}' +
            '#drModalClose:hover{color:#1C1C1E;}' +
            '#drModalBody{padding:18px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;}' +

            /* Modal sections */
            '.dr-section-label{font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(28,28,30,0.45);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(28,28,30,0.1);}' +
            '.dr-row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px dotted rgba(28,28,30,0.1);}' +
            '.dr-row:last-child{border-bottom:none;}' +
            '.dr-row-label{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(28,28,30,0.55);}' +
            '.dr-row-val{font-family:"JetBrains Mono",monospace;font-size:14px;font-weight:600;color:#1C1C1E;}' +
            '.dr-total-row{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 0;border-top:2px solid #1C1C1E;margin-top:4px;}' +
            '.dr-total-label{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(28,28,30,0.55);}' +
            '.dr-total-val{font-family:"JetBrains Mono",monospace;font-size:18px;font-weight:700;color:#C0392B;}' +
            '.dr-mtd-box{background:rgba(28,28,30,0.05);border:1px solid rgba(28,28,30,0.12);padding:10px 14px;display:flex;justify-content:space-between;align-items:baseline;}' +
            '.dr-mtd-label{font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(28,28,30,0.5);}' +
            '.dr-mtd-val{font-family:"JetBrains Mono",monospace;font-size:16px;font-weight:700;color:#1C1C1E;}' +
            '.dr-exp-item{padding:6px 0;border-bottom:1px dotted rgba(28,28,30,0.1);}' +
            '.dr-exp-item:last-child{border-bottom:none;}' +
            '.dr-exp-name{font-family:"Cormorant Garamond",Georgia,serif;font-size:14px;font-style:italic;color:#1C1C1E;}' +
            '.dr-exp-meta{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(28,28,30,0.45);margin-top:1px;}' +
            '.dr-exp-amt{font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:600;color:#1C1C1E;float:right;margin-top:-18px;}' +
            '.dr-no-exp{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(28,28,30,0.35);text-align:center;padding:8px 0;}' +
            '.dr-loading{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(28,28,30,0.4);text-align:center;padding:24px;}';

        document.head.appendChild(s);
    }

    /* ── SVG icons ────────────────────────────── */

    var WA_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15'
        + '-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475'
        + '-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52'
        + '.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207'
        + '-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372'
        + '-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487'
        + '.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413'
        + '.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347'
        + 'm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374'
        + 'a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898'
        + 'a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884'
        + 'm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892'
        + 'c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005'
        + 'c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

    /* Eye / View Sale icon */
    var EYE_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">'
        + '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="12" cy="12" r="3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';

    /* ── Build & inject float wrapper ─────────── */

    function buildWrap() {
        if (document.getElementById('drWrap')) return;
        var wrap = document.createElement('div');
        wrap.id = 'drWrap';
        document.body.appendChild(wrap);
    }

    function renderWAButton() {
        buildWrap();
        var wrap = document.getElementById('drWrap');
        wrap.innerHTML =
            '<div id="drTag" class="wa">Unsent Report</div>' +
            '<div id="drCircle" class="wa">' +
                '<div id="drX" title="Dismiss">×</div>' +
                WA_SVG +
                '<div id="drSpinner"></div>' +
            '</div>';

        document.getElementById('drX').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('drWrap').remove();
        });
        document.getElementById('drCircle').addEventListener('click', handleWASend);
    }

    function renderViewSaleButton() {
        buildWrap();
        var wrap = document.getElementById('drWrap');
        wrap.innerHTML =
            '<div id="drTag" class="vs">View Sale</div>' +
            '<div id="drCircle" class="vs">' +
                '<div id="drX" title="Dismiss">×</div>' +
                EYE_SVG +
            '</div>';

        document.getElementById('drX').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('drWrap').remove();
        });
        document.getElementById('drCircle').addEventListener('click', handleViewSale);
    }

    /* ── WA send handler ──────────────────────── */

    async function handleWASend() {
        var circle  = document.getElementById('drCircle');
        var tag     = document.getElementById('drTag');
        var spinner = document.getElementById('drSpinner');
        if (!circle) return;

        /* Loading state */
        circle.style.pointerEvents = 'none';
        circle.querySelector('svg').style.display = 'none';
        spinner.style.display = 'block';
        tag.textContent = 'Preparing…';

        try {
            var entry = await fetchTodayEntry();
            if (!entry) {
                tag.textContent = 'No Entry Found';
                spinner.style.display = 'none';
                return;
            }
            var msg     = await buildMessage(entry);
            var encoded = encodeURIComponent(msg);

            markSent();

            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                window.location.href = 'whatsapp://send?text=' + encoded;
            } else {
                window.open('https://wa.me/?text=' + encoded, '_blank');
            }

            /* Swap to View Sale */
            renderViewSaleButton();

        } catch (err) {
            spinner.style.display = 'none';
            circle.querySelector('svg').style.display = 'block';
            circle.style.pointerEvents = '';
            tag.textContent = 'Retry';
        }
    }

    /* ── View Sale modal ──────────────────────── */

    async function handleViewSale() {
        showModal();
        await populateModal();
    }

    function showModal() {
        if (document.getElementById('drModal')) {
            document.getElementById('drModal').classList.remove('hidden');
            return;
        }

        var today     = new Date();
        var dateLabel = today.toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        var modal = document.createElement('div');
        modal.id = 'drModal';
        modal.innerHTML =
            '<div id="drModalCard">' +
                '<div id="drModalHead">' +
                    '<div>' +
                        '<div id="drModalTitle">Today\'s Sale</div>' +
                        '<div id="drModalDate">' + dateLabel + '</div>' +
                    '</div>' +
                    '<button id="drModalClose">×</button>' +
                '</div>' +
                '<div id="drModalBody"><div class="dr-loading">Loading…</div></div>' +
            '</div>';

        document.body.appendChild(modal);

        document.getElementById('drModalClose').addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
        });
    }

    function closeModal() {
        var m = document.getElementById('drModal');
        if (m) m.classList.add('hidden');
    }

    async function populateModal() {
        var body = document.getElementById('drModalBody');
        if (!body) return;

        try {
            var entry    = await fetchTodayEntry();
            var expenses = await fetchTodayExpenses();
            var mtd      = await fetchMTD();

            if (!entry) {
                body.innerHTML = '<div class="dr-loading">No entry found for today.</div>';
                return;
            }

            var expTotal = expenses.reduce(function (s, e) {
                return s + parseFloat(e.amount || 0);
            }, 0);

            /* Build modal HTML */
            var html = '';

            /* Sales section */
            html += '<div>';
            html += '<div class="dr-section-label">Sales Breakdown</div>';
            html += row('Drawer Cash',   fmt(entry.cash_amount));
            html += row("Today's Cash",  fmt(entry.cash_total || 0));
            html += row('UPI',           fmt(entry.upi_amount));
            html += row('Card',          fmt(entry.card_amount));
            html += row('AP Cash',       fmt(entry.ap_cash || 0));
            html += row('Petty Cash',    fmt(entry.petty_cash));
            html += '<div class="dr-total-row">'
                 + '<span class="dr-total-label">Total Income</span>'
                 + '<span class="dr-total-val">₹' + fmt(entry.total_income) + '</span>'
                 + '</div>';
            html += '</div>';

            /* MTD */
            html += '<div class="dr-mtd-box">'
                 + '<span class="dr-mtd-label">Month-to-Date Total</span>'
                 + '<span class="dr-mtd-val">₹' + fmt(mtd) + '</span>'
                 + '</div>';

            /* Expenses section */
            html += '<div>';
            html += '<div class="dr-section-label">Expenses Today'
                 + (expenses.length ? ' — ₹' + fmt(expTotal) : '') + '</div>';

            if (expenses.length === 0) {
                html += '<div class="dr-no-exp">No expenses recorded today</div>';
            } else {
                expenses.forEach(function (e) {
                    var ed  = new Date(e.expense_date);
                    html += '<div class="dr-exp-item">'
                          + '<span class="dr-exp-amt">₹' + fmt(e.amount) + '</span>'
                          + '<div class="dr-exp-name">' + (e.description || 'Expense') + '</div>'
                          + '<div class="dr-exp-meta">' + e.expense_by + ' · ' + e.paid_from + '</div>'
                          + '</div>';
                });
            }
            html += '</div>';

            body.innerHTML = html;

        } catch (err) {
            body.innerHTML = '<div class="dr-loading">Error loading data.</div>';
        }
    }

    function row(label, val) {
        return '<div class="dr-row">'
             + '<span class="dr-row-label">' + label + '</span>'
             + '<span class="dr-row-val">₹' + val + '</span>'
             + '</div>';
    }

    /* ── Main init ────────────────────────────── */

    async function init() {
        /* Only run on index.html */
        var page = window.location.pathname.split('/').pop() || 'index.html';
        if (page !== 'index.html' && page !== '') return;

        var user = getUsername();
        if (!user || user === 'Rohit') return;
        if (!window.supabase) return;

        var entry = await fetchTodayEntry();
        if (!entry) return; /* No entry today → show nothing */

        injectStyles();

        if (isSent()) {
            renderViewSaleButton();
        } else {
            renderWAButton();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('washiAuthReady', function () {
        init();
    });

})();
