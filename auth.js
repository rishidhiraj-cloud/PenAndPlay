/* ─────────────────────────────────────────────
   WASHI — Auth Gate
   Runs on every page. Checks localStorage for a
   saved session. If none, shows a login overlay.
   ───────────────────────────────────────────── */

(function () {
    'use strict';

    var PASSKEY       = '7486';
    var USERS         = ['Neha', 'Priyanka', 'Abhishek', 'Dhiraj', 'Rohit'];
    var KEY           = 'washi_auth';
    var ROHIT_ALLOWED = ['passport_photo_generator.html', 'collage.html'];

    function getStored() {
        try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
    }

    function saveAuth(username) {
        localStorage.setItem(KEY, JSON.stringify({ username: username, authenticated: true }));
    }

    function getUsername() {
        return (getStored() || {}).username || null;
    }

    /* Expose for other scripts (expense.js, outofstock.js etc.) */
    window.washiAuth = { getUsername: getUsername };

    /* ── Header greeting ────────────────────────── */
    function injectGreeting(username) {
        function render() {
            var headerText = document.querySelector('.header-text');
            if (!headerText) return;

            var hour = new Date().getHours();
            var salutation = hour >= 5 && hour < 12  ? 'Good morning'
                           : hour >= 12 && hour < 17 ? 'Good afternoon'
                           : hour >= 17 && hour < 21 ? 'Good evening'
                           : 'Good night';

            var el = document.getElementById('headerGreeting');
            if (!el) {
                el = document.createElement('p');
                el.id        = 'headerGreeting';
                el.className = 'header-greeting';
                headerText.appendChild(el);
            }
            el.textContent = salutation + ', ' + username;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', render);
        } else {
            render();
        }
    }

    /* ── Role-based access control for Rohit ───── */
    function enforceRoleAccess(username) {
        if (username !== 'Rohit') return;

        /* Redirect away from any page Rohit shouldn't see */
        var page = window.location.pathname.split('/').pop() || 'index.html';
        if (page === '') page = 'index.html';
        if (ROHIT_ALLOWED.indexOf(page) === -1) {
            window.location.replace('passport_photo_generator.html');
            return;
        }

        /* Hide restricted nav links and back-to-dashboard */
        function applyRestrictions() {
            /* Back to dashboard */
            document.querySelectorAll('.back-to-dashboard').forEach(function (el) {
                el.style.display = 'none';
            });

            /* Burger menu — hide all nav links except allowed pages */
            document.querySelectorAll('.burger-menu nav a').forEach(function (link) {
                var href  = (link.getAttribute('href') || '').split('/').pop();
                if (ROHIT_ALLOWED.indexOf(href) === -1) {
                    link.style.display = 'none';
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyRestrictions);
        } else {
            applyRestrictions();
        }
    }

    /* Already authenticated on this device — enforce role and exit */
    var stored = getStored();
    if (stored && stored.authenticated) {
        injectGreeting(stored.username);
        enforceRoleAccess(stored.username);
        return;
    }

    /* ── Inject styles ──────────────────────────── */
    var style = document.createElement('style');
    style.id  = 'washi-auth-style';
    style.textContent =
        '#washiAuthOverlay{position:fixed;inset:0;background:#F5F0E8;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}' +
        '.auth-card{width:100%;max-width:340px;background:#F5F0E8;border:1px solid rgba(28,28,30,0.28);}' +
        '.auth-header{padding:28px 24px 20px;border-bottom:1.5px solid #1C1C1E;}' +
        '.auth-brand{font-family:"JetBrains Mono",monospace;font-size:7px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(28,28,30,0.55);margin:0 0 8px;}' +
        '.auth-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;font-weight:600;font-style:italic;color:#1C1C1E;margin:0;}' +
        '.auth-body{padding:24px;display:flex;flex-direction:column;gap:16px;}' +
        '.auth-group{display:flex;flex-direction:column;gap:6px;}' +
        '.auth-label{font-family:"JetBrains Mono",monospace;font-size:7px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(28,28,30,0.72);}' +
        '.auth-select,.auth-input{font-family:"JetBrains Mono",monospace;font-size:16px;background:#EDE6D6;border:1px solid rgba(28,28,30,0.18);border-radius:2px;color:#1C1C1E;padding:10px 12px;outline:none;width:100%;box-sizing:border-box;-webkit-appearance:none;appearance:none;transition:border-color 0.15s ease;}' +
        '.auth-select:focus,.auth-input:focus{border-color:#1C1C1E;}' +
        '.auth-error{font-family:"JetBrains Mono",monospace;font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:#C0392B;margin:0;display:none;}' +
        '.auth-error.visible{display:block;}' +
        '.auth-btn{background:transparent;border:1.5px solid #1C1C1E;color:#1C1C1E;font-family:"JetBrains Mono",monospace;font-size:9px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;padding:14px;cursor:pointer;border-radius:1px;transition:all 0.15s ease;width:100%;min-height:48px;}' +
        '.auth-btn:hover{background:#1C1C1E;color:#F5F0E8;}' +
        '.auth-btn:active{opacity:0.75;}';
    document.head.appendChild(style);

    /* ── Build overlay ──────────────────────────── */
    var userOptions = USERS.map(function (u) {
        return '<option value="' + u + '">' + u + '</option>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.id  = 'washiAuthOverlay';
    overlay.innerHTML =
        '<div class="auth-card">' +
            '<div class="auth-header">' +
                '<p class="auth-brand">Pen &amp; Play Club</p>' +
                '<h2 class="auth-title">Sign In</h2>' +
            '</div>' +
            '<div class="auth-body">' +
                '<div class="auth-group">' +
                    '<label class="auth-label">Who are you?</label>' +
                    '<select id="authUsername" class="auth-select">' +
                        '<option value="">Select your name</option>' +
                        userOptions +
                    '</select>' +
                '</div>' +
                '<div class="auth-group">' +
                    '<label class="auth-label">Passkey</label>' +
                    '<input type="password" id="authPasskey" class="auth-input"' +
                           ' placeholder="Enter passkey" inputmode="numeric" autocomplete="off">' +
                '</div>' +
                '<p id="authError" class="auth-error"></p>' +
                '<button id="authSubmit" class="auth-btn">Enter</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    /* ── Helpers ────────────────────────────────── */
    function showError(msg) {
        var el = document.getElementById('authError');
        el.textContent = msg;
        el.classList.add('visible');
    }

    function clearError() {
        var el = document.getElementById('authError');
        if (el) el.classList.remove('visible');
    }

    /* ── Submit handler ─────────────────────────── */
    document.getElementById('authSubmit').addEventListener('click', function () {
        var username = document.getElementById('authUsername').value;
        var passkey  = document.getElementById('authPasskey').value;

        clearError();

        if (!username) {
            showError('Please select your name');
            return;
        }
        if (passkey !== PASSKEY) {
            showError('Incorrect passkey');
            document.getElementById('authPasskey').value = '';
            document.getElementById('authPasskey').focus();
            return;
        }

        saveAuth(username);
        window.washiAuth = { getUsername: function () { return username; } };
        injectGreeting(username);
        enforceRoleAccess(username);

        var s = document.getElementById('washi-auth-style');
        if (s) s.remove();
        overlay.remove();

        /* Signal other scripts that auth just completed */
        document.dispatchEvent(new CustomEvent('washiAuthReady', { detail: { username: username } }));
    });

    /* Allow Enter key on passkey field */
    document.getElementById('authPasskey').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('authSubmit').click();
    });

    /* Clear error on any input change */
    document.getElementById('authUsername').addEventListener('change', clearError);
    document.getElementById('authPasskey').addEventListener('input', clearError);
})();
