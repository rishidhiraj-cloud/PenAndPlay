const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';
let supabaseClient;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error('Supabase init failed:', e);
}

let activeCategory = 'all';
let loadedItems = [];

const pageLoader = document.getElementById('pageLoader');
const statusMessage = document.getElementById('statusMessage');
const darkModeToggle = document.getElementById('darkModeToggle');

async function loadItems(category) {
    pageLoader.classList.remove('hidden');
    document.getElementById('itemsList').innerHTML = '<div class="loading-spinner">Loading items...</div>';

    try {
        let query = supabaseClient
            .from('out_of_stock')
            .select('*')
            .order('created_at', { ascending: false });

        if (category && category !== 'all') {
            query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;

        loadedItems = data || [];
        renderItems(loadedItems);
    } catch (err) {
        document.getElementById('itemsList').innerHTML = `<div class="empty-state"><p style="color:#721c24;">Error loading items: ${err.message}</p></div>`;
    } finally {
        pageLoader.classList.add('hidden');
    }
}

function renderItems(items) {
    const countBadge = document.getElementById('countBadge');
    const pendingCount = items.filter(i => i.status !== 'replenished').length;
    countBadge.textContent = pendingCount;

    if (activeCategory === 'all') {
        document.getElementById('itemsList').innerHTML = '<div class="empty-state"><p>Select a category above to view items.</p></div>';
        document.getElementById('itemsSection').classList.add('hidden');
        return;
    }
    document.getElementById('itemsSection').classList.remove('hidden');

    if (items.length === 0) {
        document.getElementById('itemsList').innerHTML = '<div class="empty-state"><p>No items to replenish.</p></div>';
        return;
    }

    const categoryColors = {
        Stationery: 'badge-blue',
        Toys: 'badge-green',
        Sports: 'badge-orange'
    };

    const html = items.map(item => {
        const isReplenished = item.status === 'replenished';
        const categoryClass = categoryColors[item.category] || 'badge-blue';

        return `
        <div class="oos-item-row">
            <div class="oos-item-left">
                <span class="oos-item-name${isReplenished ? ' replenished-text' : ''}">${escapeHtml(item.item_name)}</span>
                ${item.quantity ? `<span class="oos-badge badge-qty">${escapeHtml(item.quantity)}</span>` : ''}
                <span class="oos-item-by">by ${escapeHtml(item.suggested_by)}</span>
            </div>
            <div class="oos-item-actions">
                ${isReplenished
                    ? '<span class="replenished-label">✓</span>'
                    : `<button class="oos-icon-btn oos-btn-replenish" title="Mark as replenished" onclick="replenishItem('${item.id}')">✓</button>`
                }
                <button class="oos-icon-btn oos-btn-delete" title="Delete" onclick="deleteItem('${item.id}')">🗑</button>
            </div>
        </div>`;
    }).join('');

    document.getElementById('itemsList').innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function addItem() {
    const categoryRadio = document.querySelector('input[name="itemCategory"]:checked');
    const category = categoryRadio ? categoryRadio.value : '';
    const suggestedBy = document.querySelector('input[name="suggestedBy"]:checked')?.value;
    const itemName = document.getElementById('itemName').value.trim();
    const quantity = document.getElementById('itemQuantity').value.trim();

    if (!category) {
        showStatus('Please select a category.', 'error');
        return;
    }
    if (!itemName) {
        showStatus('Please enter an item name.', 'error');
        return;
    }
    if (!suggestedBy) {
        showStatus('Please select who is suggesting this item.', 'error');
        return;
    }

    const btn = document.getElementById('addItemBtn');
    btn.disabled = true;
    btn.textContent = 'Adding...';
    hideStatus();

    try {
        const { error } = await supabaseClient.from('out_of_stock').insert([{
            category,
            item_name: itemName,
            quantity: quantity || null,
            suggested_by: suggestedBy,
            status: 'pending'
        }]);

        if (error) throw error;

        showStatus('Item added successfully!', 'success');
        document.getElementById('itemName').value = '';
        document.getElementById('itemQuantity').value = '';
        await loadItems(activeCategory);
    } catch (err) {
        showStatus('Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Item';
    }
}

window.replenishItem = async function(id) {
    try {
        const { error } = await supabaseClient
            .from('out_of_stock')
            .update({ status: 'replenished' })
            .eq('id', id);

        if (error) throw error;
        await loadItems(activeCategory);
    } catch (err) {
        alert('Failed to update item: ' + err.message);
    }
};

window.deleteItem = async function(id) {
    if (!confirm('Delete this item?')) return;

    try {
        const { error } = await supabaseClient
            .from('out_of_stock')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await loadItems(activeCategory);
    } catch (err) {
        alert('Failed to delete item: ' + err.message);
    }
};

window.sendReplenishWhatsApp = function() {
    const pending = loadedItems.filter(i => i.status !== 'replenished');

    if (pending.length === 0) {
        alert('No pending items to share.');
        return;
    }

    const categoryLabel = activeCategory !== 'all' ? ` — ${activeCategory}` : '';
    let message = `*Pen & Play Club — Items to Replenish${categoryLabel}*\n\n`;

    pending.forEach((item, index) => {
        const qty = item.quantity ? ` — ${item.quantity}` : '';
        message += `${index + 1}. ${item.item_name}${qty}\n`;
    });


    const encodedMessage = encodeURIComponent(message);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `whatsapp://send?text=${encodedMessage}`;
    } else {
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    }
};

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    if (type === 'success') {
        setTimeout(() => hideStatus(), 3000);
    }
}

function hideStatus() {
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
}

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

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.category;
            const categoryRadio = document.querySelector(`input[name="itemCategory"][value="${activeCategory}"]`);
            if (categoryRadio) categoryRadio.checked = true;
            loadItems(activeCategory);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    initBurgerMenu();
    initTabs();
    document.getElementById('itemsSection').classList.add('hidden');
    pageLoader.classList.add('hidden');

    /* Auto-select Suggested By from saved login */
    try {
        const savedUser = JSON.parse(localStorage.getItem('washi_auth'))?.username;
        if (savedUser) {
            const radio = document.querySelector(`input[name="suggestedBy"][value="${savedUser}"]`);
            if (radio) radio.checked = true;
        }
    } catch (e) {}
});
