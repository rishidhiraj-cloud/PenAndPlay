// Supabase Configuration
const SUPABASE_URL = 'https://sckgsgakyyosgjxoctlb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNja2dzZ2FreXlvc2dqeG9jdGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTIwNDEsImV4cCI6MjA4NDQ2ODA0MX0.DUVClZFzC4oEcBK_3MarnMa0tq2XXhIKsSsDyq8vExM';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Storage.js loaded successfully');

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const addItemForm = document.getElementById('addItemForm');
const storageAreaInput = document.getElementById('storageArea');
const itemNameInput = document.getElementById('itemName');
const addItemBtn = document.getElementById('addItemBtn');
const addStatusMessage = document.getElementById('addStatusMessage');
const viewStorageArea = document.getElementById('viewStorageArea');
const storageItemsList = document.getElementById('storageItemsList');
const searchItemInput = document.getElementById('searchItemInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const pageLoader = document.getElementById('pageLoader');
const darkModeToggle = document.getElementById('darkModeToggle');

// Initialize
function init() {
    console.log('🚀 Initializing storage management...');

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Add item form
    addItemForm.addEventListener('submit', handleAddItem);

    // View by storage
    viewStorageArea.addEventListener('change', loadStorageItems);

    // Search
    searchBtn.addEventListener('click', handleSearch);
    searchItemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Dark mode
    initDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    pageLoader.classList.add('hidden');
    console.log('✅ Storage management initialized');
}

// Tab Switching
function switchTab(tabName) {
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

// Add Item
async function handleAddItem(e) {
    e.preventDefault();

    const storageArea = storageAreaInput.value.trim();
    const itemName = itemNameInput.value.trim();

    if (!storageArea || !itemName) {
        showMessage(addStatusMessage, 'Please fill all fields', 'error');
        return;
    }

    addItemBtn.disabled = true;
    addItemBtn.textContent = 'Adding...';

    try {
        const { data, error } = await supabaseClient
            .from('storage_items')
            .insert([
                {
                    storage_area: storageArea,
                    item_name: itemName
                }
            ]);

        if (error) throw error;

        showMessage(addStatusMessage, `Item "${itemName}" added to ${storageArea}`, 'success');
        itemNameInput.value = '';
    } catch (err) {
        console.error('Error adding item:', err);
        showMessage(addStatusMessage, 'Failed to add item', 'error');
    } finally {
        addItemBtn.disabled = false;
        addItemBtn.textContent = 'Add Item';
    }
}

// Load Items by Storage
async function loadStorageItems() {
    const selectedStorage = viewStorageArea.value;

    if (!selectedStorage) {
        storageItemsList.innerHTML = '<div class="empty-state">Select a storage area to view items</div>';
        return;
    }

    storageItemsList.innerHTML = '<div class="loading-spinner">Loading...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('storage_items')
            .select('*')
            .ilike('storage_area', selectedStorage)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            storageItemsList.innerHTML = `<div class="empty-state">No items found in ${selectedStorage}</div>`;
            return;
        }

        renderStorageItems(data);
    } catch (err) {
        console.error('Error loading items:', err);
        storageItemsList.innerHTML = '<div class="empty-state">Error loading items</div>';
    }
}

// Render Storage Items
function renderStorageItems(items) {
    const html = items.map(item => `
        <div class="item-card" id="item-${item.id}">
            <div class="item-name" id="item-name-${item.id}">${escapeHtml(item.item_name)}</div>
            <div class="item-actions">
                <button class="update-btn" onclick="updateItem(${item.id})">Update</button>
                <button class="delete-btn" onclick="deleteItem(${item.id})">Delete</button>
            </div>
        </div>
    `).join('');

    storageItemsList.innerHTML = html;
}

// Update Item
async function updateItem(itemId) {
    const itemNameEl = document.getElementById(`item-name-${itemId}`);
    const currentName = itemNameEl.textContent;

    const newName = prompt('Enter new item name:', currentName);

    if (!newName || newName.trim() === '') return;
    if (newName.trim() === currentName) return;

    try {
        const { error } = await supabaseClient
            .from('storage_items')
            .update({ item_name: newName.trim() })
            .eq('id', itemId);

        if (error) throw error;

        loadStorageItems();
    } catch (err) {
        console.error('Error updating item:', err);
        alert('Failed to update item');
    }
}

// Delete Item
async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const { error } = await supabaseClient
            .from('storage_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        loadStorageItems();
    } catch (err) {
        console.error('Error deleting item:', err);
        alert('Failed to delete item');
    }
}

// Search Item
async function handleSearch() {
    const searchTerm = searchItemInput.value.trim();

    if (!searchTerm) {
        searchResults.innerHTML = '<div class="empty-state">Enter an item name to search</div>';
        return;
    }

    searchResults.innerHTML = '<div class="loading-spinner">Searching...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('storage_items')
            .select('*')
            .ilike('item_name', `%${searchTerm}%`)
            .order('storage_area', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            searchResults.innerHTML = `<div class="empty-state">No items found matching "${escapeHtml(searchTerm)}"</div>`;
            return;
        }

        renderSearchResults(data, searchTerm);
    } catch (err) {
        console.error('Error searching items:', err);
        searchResults.innerHTML = '<div class="empty-state">Error searching items</div>';
    }
}

// Render Search Results
function renderSearchResults(items, searchTerm) {
    const groupedByStorage = items.reduce((acc, item) => {
        if (!acc[item.storage_area]) {
            acc[item.storage_area] = [];
        }
        acc[item.storage_area].push(item);
        return acc;
    }, {});

    const html = Object.keys(groupedByStorage).map(storage => `
        <div class="search-group">
            <div class="storage-header">${escapeHtml(storage)} (${groupedByStorage[storage].length})</div>
            <div class="storage-items">
                ${groupedByStorage[storage].map(item => `
                    <div class="storage-item">${escapeHtml(item.item_name)}</div>
                `).join('')}
            </div>
        </div>
    `).join('');

    searchResults.innerHTML = html;
}

// Show Message
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';

    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
