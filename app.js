/**
 * Passwort-Tresor App
 */

(() => {
  // State
  let encryptionKey = null;
  let entries = [];
  let activeCategory = 'all';
  let editingId = null;

  // Category icons
  const CATEGORY_ICONS = {
    'Social Media': '📱',
    'Hosting': '🌐',
    'Tools': '🛠️',
    'E-Mail': '📧',
    'Banking': '🏦',
    'Kunden': '👥',
    'Server': '🖥️',
    'Sonstiges': '📁'
  };

  // DOM
  const $ = id => document.getElementById(id);

  const lockScreen = $('lockScreen');
  const mainApp = $('mainApp');
  const loginForm = $('loginForm');
  const masterPassword = $('masterPassword');
  const loginError = $('loginError');
  const loginBtn = $('loginBtn');
  const setupHint = $('setupHint');
  const searchInput = $('searchInput');
  const categoryFilter = $('categoryFilter');
  const entryList = $('entryList');
  const emptyState = $('emptyState');

  const detailModal = $('detailModal');
  const detailTitle = $('detailTitle');
  const detailBody = $('detailBody');
  const detailClose = $('detailClose');
  const detailDelete = $('detailDelete');
  const detailEdit = $('detailEdit');

  const editModal = $('editModal');
  const editTitle = $('editTitle');
  const editForm = $('editForm');
  const editClose = $('editClose');
  const editName = $('editName');
  const editCategory = $('editCategory');
  const editCategoryCustom = $('editCategoryCustom');
  const editUrl = $('editUrl');
  const editUsername = $('editUsername');
  const editPassword = $('editPassword');
  const editTogglePw = $('editTogglePw');
  const editNotes = $('editNotes');
  const editId = $('editId');
  const customFieldsContainer = $('customFieldsContainer');
  const addFieldBtn = $('addFieldBtn');

  let currentDetailId = null;

  // ===== INIT =====
  function init() {
    if (Crypto.isFirstTime()) {
      setupHint.classList.remove('hidden');
      loginBtn.textContent = 'Tresor erstellen';
    }

    // Events
    loginForm.addEventListener('submit', handleLogin);
    $('addBtn').addEventListener('click', () => openEditModal());
    $('emptyAddBtn').addEventListener('click', () => openEditModal());
    $('lockBtn').addEventListener('click', lock);
    searchInput.addEventListener('input', renderEntries);
    detailClose.addEventListener('click', closeDetailModal);
    detailDelete.addEventListener('click', handleDelete);
    detailEdit.addEventListener('click', handleEditFromDetail);
    editClose.addEventListener('click', closeEditModal);
    editForm.addEventListener('submit', handleSave);
    editTogglePw.addEventListener('click', togglePasswordVisibility);
    addFieldBtn.addEventListener('click', addCustomField);

    // Close modals on backdrop click
    detailModal.querySelector('.modal-backdrop').addEventListener('click', closeDetailModal);
    editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

    // Auto-lock after 5 min inactivity
    let lockTimer;
    const resetTimer = () => {
      clearTimeout(lockTimer);
      if (encryptionKey) {
        lockTimer = setTimeout(lock, 5 * 60 * 1000);
      }
    };
    document.addEventListener('click', resetTimer);
    document.addEventListener('keydown', resetTimer);
    document.addEventListener('touchstart', resetTimer);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ===== AUTH =====
  async function handleLogin(e) {
    e.preventDefault();
    const pw = masterPassword.value;
    if (!pw) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Wird geladen...';
    loginError.classList.add('hidden');

    try {
      if (Crypto.isFirstTime()) {
        encryptionKey = await Crypto.setup(pw);
        entries = [];
      } else {
        encryptionKey = await Crypto.unlock(pw);
        entries = await Crypto.loadVault(encryptionKey);
      }
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
      loginBtn.disabled = false;
      loginBtn.textContent = Crypto.isFirstTime() ? 'Tresor erstellen' : 'Entsperren';
    }

    masterPassword.value = '';
  }

  function showApp() {
    lockScreen.classList.remove('active');
    mainApp.classList.add('active');
    renderCategories();
    renderEntries();
  }

  function lock() {
    encryptionKey = null;
    entries = [];
    mainApp.classList.remove('active');
    lockScreen.classList.add('active');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entsperren';
    setupHint.classList.add('hidden');
    closeDetailModal();
    closeEditModal();
  }

  // ===== RENDER =====
  function getCategories() {
    const cats = new Set(entries.map(e => e.category));
    return [...cats].sort();
  }

  function renderCategories() {
    const cats = getCategories();
    categoryFilter.innerHTML = '<button class="cat-btn active" data-cat="all">Alle</button>';
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.dataset.cat = cat;
      btn.textContent = cat;
      if (cat === activeCategory) {
        btn.classList.add('active');
        categoryFilter.querySelector('[data-cat="all"]').classList.remove('active');
      }
      categoryFilter.appendChild(btn);
    });

    categoryFilter.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        categoryFilter.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEntries();
      });
    });
  }

  function renderEntries() {
    const query = searchInput.value.toLowerCase().trim();
    let filtered = entries;

    if (activeCategory !== 'all') {
      filtered = filtered.filter(e => e.category === activeCategory);
    }

    if (query) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(query) ||
        (e.username && e.username.toLowerCase().includes(query)) ||
        (e.url && e.url.toLowerCase().includes(query)) ||
        e.category.toLowerCase().includes(query) ||
        (e.notes && e.notes.toLowerCase().includes(query))
      );
    }

    // Sort alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    if (filtered.length === 0 && entries.length === 0) {
      entryList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    if (filtered.length === 0) {
      entryList.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:2rem;">Keine Ergebnisse</p>';
      return;
    }

    entryList.innerHTML = filtered.map(entry => `
      <div class="entry-card" data-id="${entry.id}">
        <div class="entry-icon">${CATEGORY_ICONS[entry.category] || '🔑'}</div>
        <div class="entry-info">
          <div class="entry-name">${escapeHtml(entry.name)}</div>
          <div class="entry-meta">${escapeHtml(entry.username || entry.url || entry.category)}</div>
        </div>
        <div class="entry-arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    `).join('');

    entryList.querySelectorAll('.entry-card').forEach(card => {
      card.addEventListener('click', () => openDetailModal(card.dataset.id));
    });
  }

  // ===== DETAIL MODAL =====
  function openDetailModal(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    currentDetailId = id;
    detailTitle.textContent = entry.name;

    let html = '';

    if (entry.category) {
      html += `<div class="detail-field">
        <div class="detail-label">Kategorie</div>
        <div class="detail-value"><span class="detail-category-badge">${escapeHtml(entry.category)}</span></div>
      </div>`;
    }

    if (entry.url) {
      const url = entry.url.startsWith('http') ? entry.url : 'https://' + entry.url;
      html += `<div class="detail-field">
        <div class="detail-label">URL</div>
        <div class="detail-value">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(entry.url)}</a>
          <button class="btn-copy" data-copy="${escapeHtml(entry.url)}">Kopieren</button>
        </div>
      </div>`;
    }

    if (entry.username) {
      html += `<div class="detail-field">
        <div class="detail-label">Benutzername / E-Mail</div>
        <div class="detail-value">
          <span>${escapeHtml(entry.username)}</span>
          <button class="btn-copy" data-copy="${escapeHtml(entry.username)}">Kopieren</button>
        </div>
      </div>`;
    }

    if (entry.password) {
      html += `<div class="detail-field">
        <div class="detail-label">Passwort</div>
        <div class="detail-value">
          <span class="detail-password" id="detailPwValue">••••••••</span>
          <button class="btn-copy" id="detailPwToggle" data-revealed="false">Anzeigen</button>
          <button class="btn-copy" data-copy="${escapeHtml(entry.password)}">Kopieren</button>
        </div>
      </div>`;
    }

    if (entry.notes) {
      html += `<div class="detail-field">
        <div class="detail-label">Notizen</div>
        <div class="detail-value detail-notes">${escapeHtml(entry.notes)}</div>
      </div>`;
    }

    // Custom fields
    if (entry.customFields && entry.customFields.length > 0) {
      entry.customFields.forEach(field => {
        html += `<div class="detail-field">
          <div class="detail-label">${escapeHtml(field.label)}</div>
          <div class="detail-value">
            <span>${escapeHtml(field.value)}</span>
            <button class="btn-copy" data-copy="${escapeHtml(field.value)}">Kopieren</button>
          </div>
        </div>`;
      });
    }

    detailBody.innerHTML = html;

    // Copy buttons
    detailBody.querySelectorAll('.btn-copy[data-copy]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(btn.dataset.copy, btn);
      });
    });

    // Password toggle
    const pwToggle = $('detailPwToggle');
    if (pwToggle) {
      pwToggle.addEventListener('click', () => {
        const pwValue = $('detailPwValue');
        const revealed = pwToggle.dataset.revealed === 'true';
        if (revealed) {
          pwValue.textContent = '••••••••';
          pwToggle.textContent = 'Anzeigen';
          pwToggle.dataset.revealed = 'false';
        } else {
          pwValue.textContent = entry.password;
          pwToggle.textContent = 'Verbergen';
          pwToggle.dataset.revealed = 'true';
        }
      });
    }

    detailModal.classList.remove('hidden');
  }

  function closeDetailModal() {
    detailModal.classList.add('hidden');
    currentDetailId = null;
  }

  // ===== EDIT MODAL =====
  function openEditModal(entry = null) {
    editingId = entry ? entry.id : null;
    editTitle.textContent = entry ? 'Bearbeiten' : 'Neuer Eintrag';

    editName.value = entry ? entry.name : '';
    editUrl.value = entry ? (entry.url || '') : '';
    editUsername.value = entry ? (entry.username || '') : '';
    editPassword.value = entry ? (entry.password || '') : '';
    editPassword.type = 'password';
    editNotes.value = entry ? (entry.notes || '') : '';

    // Category
    if (entry && entry.category) {
      const options = [...editCategory.options].map(o => o.value);
      if (options.includes(entry.category)) {
        editCategory.value = entry.category;
        editCategoryCustom.value = '';
      } else {
        editCategory.value = 'Sonstiges';
        editCategoryCustom.value = entry.category;
      }
    } else {
      editCategory.value = 'Social Media';
      editCategoryCustom.value = '';
    }

    // Custom fields
    customFieldsContainer.innerHTML = '';
    if (entry && entry.customFields) {
      entry.customFields.forEach(f => addCustomField(f.label, f.value));
    }

    editModal.classList.remove('hidden');
    editName.focus();
  }

  function closeEditModal() {
    editModal.classList.add('hidden');
    editForm.reset();
    customFieldsContainer.innerHTML = '';
    editingId = null;
  }

  function addCustomField(label = '', value = '') {
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.innerHTML = `
      <input type="text" placeholder="Feldname" class="cf-label" value="${escapeHtml(label)}">
      <input type="text" placeholder="Wert" class="cf-value" value="${escapeHtml(value)}">
      <button type="button" class="btn-remove-field">×</button>
    `;
    row.querySelector('.btn-remove-field').addEventListener('click', () => row.remove());
    customFieldsContainer.appendChild(row);
  }

  function togglePasswordVisibility() {
    editPassword.type = editPassword.type === 'password' ? 'text' : 'password';
  }

  // ===== SAVE / DELETE =====
  async function handleSave(e) {
    e.preventDefault();
    if (!encryptionKey) return;

    const category = editCategoryCustom.value.trim() || editCategory.value;

    // Collect custom fields
    const customFields = [];
    customFieldsContainer.querySelectorAll('.custom-field-row').forEach(row => {
      const label = row.querySelector('.cf-label').value.trim();
      const value = row.querySelector('.cf-value').value.trim();
      if (label && value) {
        customFields.push({ label, value });
      }
    });

    const data = {
      id: editingId || generateId(),
      name: editName.value.trim(),
      category: category,
      url: editUrl.value.trim(),
      username: editUsername.value.trim(),
      password: editPassword.value,
      notes: editNotes.value.trim(),
      customFields: customFields,
      updatedAt: new Date().toISOString()
    };

    if (editingId) {
      const idx = entries.findIndex(e => e.id === editingId);
      if (idx !== -1) {
        data.createdAt = entries[idx].createdAt;
        entries[idx] = data;
      }
    } else {
      data.createdAt = data.updatedAt;
      entries.push(data);
    }

    await Crypto.saveVault(entries, encryptionKey);
    closeEditModal();
    closeDetailModal();
    renderCategories();
    renderEntries();
    showToast(editingId ? 'Gespeichert' : 'Eintrag erstellt');
  }

  async function handleDelete() {
    if (!currentDetailId) return;
    const entry = entries.find(e => e.id === currentDetailId);
    if (!entry) return;

    if (!confirm(`"${entry.name}" wirklich löschen?`)) return;

    entries = entries.filter(e => e.id !== currentDetailId);
    await Crypto.saveVault(entries, encryptionKey);
    closeDetailModal();
    renderCategories();
    renderEntries();
    showToast('Gelöscht');
  }

  function handleEditFromDetail() {
    const entry = entries.find(e => e.id === currentDetailId);
    if (!entry) return;
    closeDetailModal();
    setTimeout(() => openEditModal(entry), 200);
  }

  // ===== HELPERS =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = 'Kopiert!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 1500);
    } catch {
      showToast('Kopieren fehlgeschlagen');
    }
  }

  function showToast(msg) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
  }

  // Start
  init();
})();
