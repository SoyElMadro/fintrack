(function() {
  'use strict';

  const STORAGE_KEYS = {
    TRANSACTIONS: 'fintrack_transactions',
    SETTINGS: 'fintrack_settings'
  };

  const CATEGORIES = {
    income: ['Salario', 'Freelance', 'Inversión', 'Regalo', 'Transferencia', 'Otro'],
    expense: ['Comida', 'Transporte', 'Vivienda', 'Servicios', 'Entretenimiento', 'Compras', 'Salud', 'Educación', 'Transferencia', 'Otro']
  };

  const CATEGORY_ICONS = {
    'Salario': '💰',
    'Freelance': '💻',
    'Inversión': '📈',
    'Regalo': '🎁',
    'Otro': '💵',
    'Comida': '🍔',
    'Transporte': '🚗',
    'Vivienda': '🏠',
    'Servicios': '💡',
    'Entretenimiento': '🎬',
    'Compras': '🛒',
    'Salud': '💊',
    'Educación': '📚',
    'Otro': '📦',
    'Transferencia': '🔄'
  };

  const COLORS = {
    income: ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE'],
    expense: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#991B1B', '#7F1D1D', '#B91C1C', '#DC2626']
  };

  const DEFAULT_WALLETS = [];

  let state = {
    transactions: [],
    wallets: [],
    settings: {
      monthlyBudget: 0,
      darkMode: false,
      currency: 'ARS'
    },
    dolarMEP: null,
    editingId: null,
    deletingId: null,
    deletingWalletId: null,
    editingWalletId: null,
    brokerPreviousBalance: null,
    bankPreviousBalance: null,
    filters: {
      startDate: null,
      endDate: null,
      type: 'all',
      category: 'all'
    }
  };

  async function init() {
    loadData();
    setupEventListeners();
    applyTheme();
    renderAll();
    // Fetch dolar MEP in background, then re-render wallets
    await fetchDolarMEP();
    renderWallets();
  }

  async function fetchDolarMEP() {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares');
      const data = await res.json();
      const mep = data.find(d => d.casa === 'bolsa');
      if (mep) {
        state.dolarMEP = {
          compra: mep.compra,
          venta: mep.venta,
          fecha: mep.fechaActualizacion
        };
      }
    } catch (err) {
      console.warn('No se pudo obtener cotización del dólar MEP:', err);
      // Fallback hardcodeado por si falla la API
      state.dolarMEP = { compra: 1437.5, venta: 1448.5, fecha: null };
    }
  }

  function loadData() {
    const storedTransactions = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const storedWallets = localStorage.getItem('fintrack_wallets');

    // Load user-added transactions from localStorage (filter out old seeds)
    let userTransactions = [];
    if (storedTransactions) {
      userTransactions = JSON.parse(storedTransactions).filter(t => !t._seed);
    }

    if (storedSettings) {
      state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
    }

    if (storedWallets) {
      state.wallets = JSON.parse(storedWallets);
    } else {
      state.wallets = [...DEFAULT_WALLETS];
    }

    state.transactions = userTransactions;
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
    localStorage.setItem('fintrack_wallets', JSON.stringify(state.wallets));
  }

  function generateId() {
    return 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function formatCurrency(amount) {
    if (state.settings.currency === 'COP') {
      const formatted = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return '$' + formatted;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: state.settings.currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  function formatDate(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('es-AR', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getMonthName(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex];
  }

  function getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  function applyTheme() {
    if (state.settings.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function setupEventListeners() {
    document.getElementById('openModalBtn').addEventListener('click', () => openModal());
    document.getElementById('closeModalBtn').addEventListener('click', () => closeModal());
    document.getElementById('cancelBtn').addEventListener('click', () => closeModal());
    document.getElementById('transactionModal').addEventListener('click', (e) => {
      if (e.target.id === 'transactionModal') closeModal();
    });

    document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('input[name="type"]').forEach(radio => {
      radio.addEventListener('change', updateCategoryOptions);
    });

    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);

    document.getElementById('setBudgetBtn').addEventListener('click', setBudget);
    document.getElementById('budgetInput').value = state.settings.monthlyBudget || '';

    document.getElementById('filterStartDate').addEventListener('change', applyFilters);
    document.getElementById('filterEndDate').addEventListener('change', applyFilters);
    document.getElementById('filterType').addEventListener('change', applyFilters);
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
      document.getElementById('deleteModal').classList.remove('active');
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);

    // Transfer modal listeners
    document.getElementById('openTransferBtn').addEventListener('click', openTransferModal);
    document.getElementById('closeTransferBtn').addEventListener('click', closeTransferModal);
    document.getElementById('cancelTransferBtn').addEventListener('click', closeTransferModal);
    document.getElementById('transferModal').addEventListener('click', (e) => {
      if (e.target.id === 'transferModal') closeTransferModal();
    });
    document.getElementById('transferForm').addEventListener('submit', handleTransferSubmit);
    document.getElementById('swapWalletsBtn').addEventListener('click', swapTransferWallets);
    document.getElementById('transferFrom').addEventListener('change', updateTransferAvailable);
    document.getElementById('transferAmount').addEventListener('input', updateTransferAvailable);

    // Update Broker listeners
    document.getElementById('closeUpdateBrokerBtn').addEventListener('click', closeUpdateBroker);
    document.getElementById('cancelUpdateBrokerBtn').addEventListener('click', closeUpdateBroker);
    document.getElementById('updateBrokerModal').addEventListener('click', (e) => {
      if (e.target.id === 'updateBrokerModal') closeUpdateBroker();
    });
    document.getElementById('updateBrokerForm').addEventListener('submit', handleUpdateBrokerSubmit);
    document.getElementById('updateBrokerAmount').addEventListener('input', updateBrokerChange);

    document.getElementById('openWalletModalBtn').addEventListener('click', () => openWalletModal());
    document.getElementById('closeWalletModalBtn').addEventListener('click', closeWalletModal);
    document.getElementById('cancelWalletBtn').addEventListener('click', closeWalletModal);
    document.getElementById('walletModal').addEventListener('click', (e) => {
      if (e.target.id === 'walletModal') closeWalletModal();
    });
    document.getElementById('walletForm').addEventListener('submit', handleWalletSubmit);
    document.getElementById('walletType').addEventListener('change', toggleBankSubtype);
    document.getElementById('deleteWalletBtn').addEventListener('click', () => {
      if (state.editingWalletId) {
        state.deletingWalletId = state.editingWalletId;
        document.getElementById('deleteWalletModal').classList.add('active');
      }
    });
    document.getElementById('cancelDeleteWalletBtn').addEventListener('click', () => {
      document.getElementById('deleteWalletModal').classList.remove('active');
    });
    document.getElementById('confirmDeleteWalletBtn').addEventListener('click', confirmDeleteWallet);

    document.getElementById('closeUpdateBankBtn').addEventListener('click', closeUpdateBank);
    document.getElementById('cancelUpdateBankBtn').addEventListener('click', closeUpdateBank);
    document.getElementById('updateBankModal').addEventListener('click', (e) => {
      if (e.target.id === 'updateBankModal') closeUpdateBank();
    });
    document.getElementById('updateBankForm').addEventListener('submit', handleUpdateBankSubmit);
    document.getElementById('updateBankAmount').addEventListener('input', updateBankChange);

    // Mobile sidebar (hamburger drawer)
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('menuBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const fabAddBtn = document.getElementById('fabAddBtn');

    function openSidebar() {
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('active');
      sidebarCloseBtn.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      sidebarCloseBtn.style.display = 'none';
      document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', openSidebar);
    sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    // FAB opens add transaction modal
    fabAddBtn.addEventListener('click', () => {
      closeSidebar();
      openModal();
    });

    // On resize: if going back to desktop, reset sidebar state
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        sidebarCloseBtn.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  function updateCategoryOptions() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const categorySelect = document.getElementById('category');
    const currentValue = categorySelect.value;

    categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';

    CATEGORIES[type].forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });

    if (currentValue && CATEGORIES[type].includes(currentValue)) {
      categorySelect.value = currentValue;
    }
  }

  function updateWalletOptions() {
    const walletSelect = document.getElementById('wallet');
    const currentValue = walletSelect.value;

    walletSelect.innerHTML = '<option value="">Seleccionar billetera</option>';

    state.wallets.forEach(wallet => {
      const option = document.createElement('option');
      option.value = wallet.id;
      
      const displayBalance = wallet.currency && wallet.currency !== 'COP' 
        ? formatCurrencyWithCurrency(wallet.balance, wallet.currency)
        : formatCurrency(wallet.balance);
      
      option.textContent = `${wallet.name} (${displayBalance})`;
      walletSelect.appendChild(option);
    });

    if (currentValue) {
      walletSelect.value = currentValue;
    }
  }

  function openModal(transaction = null) {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    const modalTitle = document.getElementById('modalTitle');

    form.reset();
    clearErrors();
    updateWalletOptions();

    if (transaction) {
      state.editingId = transaction.id;
      modalTitle.textContent = 'Editar Transacción';

      document.getElementById('amount').value = transaction.amount;
      document.querySelector(`input[name="type"][value="${transaction.type}"]`).checked = true;
      updateCategoryOptions();
      document.getElementById('category').value = transaction.category;
      document.getElementById('description').value = transaction.description || '';
      document.getElementById('date').value = transaction.date;
      document.getElementById('wallet').value = transaction.walletId || '';
    } else {
      state.editingId = null;
      modalTitle.textContent = 'Agregar Transacción';

      document.getElementById('date').value = getTodayString();
      updateCategoryOptions();
    }

    modal.classList.add('active');
    document.getElementById('amount').focus();
  }

  function closeModal() {
    document.getElementById('transactionModal').classList.remove('active');
    state.editingId = null;
  }

  function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('input, select').forEach(el => el.classList.remove('error'));
  }

  function showError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + 'Error');
    if (input) input.classList.add('error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    clearErrors();

    const amount = parseFloat(document.getElementById('amount').value);
    const type = document.querySelector('input[name="type"]:checked').value;
    const category = document.getElementById('category').value;
    const description = document.getElementById('description').value.trim();
    const date = document.getElementById('date').value;

    let hasError = false;

    if (!amount || amount <= 0) {
      showError('amount', 'Please enter a valid amount');
      hasError = true;
    }

    if (!category) {
      showError('category', 'Please select a category');
      hasError = true;
    }

    if (!date) {
      showError('date', 'Please select a date');
      hasError = true;
    }

    if (hasError) return;

    const walletId = document.getElementById('wallet').value;
    const oldTransaction = state.editingId ? state.transactions.find(t => t.id === state.editingId) : null;

    const transaction = {
      id: state.editingId || generateId(),
      amount,
      type,
      category,
      description,
      date,
      walletId: walletId || null,
      createdAt: state.editingId ?
        state.transactions.find(t => t.id === state.editingId)?.createdAt :
        new Date().toISOString()
    };

    updateWalletBalance(oldTransaction, transaction);

    if (state.editingId) {
      const index = state.transactions.findIndex(t => t.id === state.editingId);
      if (index !== -1) {
        state.transactions[index] = transaction;
      }
      showToast('Transacción actualizada correctamente', 'success');
    } else {
      state.transactions.unshift(transaction);
      showToast('Transacción agregada correctamente', 'success');
    }

    saveData();
    closeModal();
    renderAll();
  }

  function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (transaction) {
      openModal(transaction);
    }
  }

  function deleteTransaction(id) {
    state.deletingId = id;
    document.getElementById('deleteModal').classList.add('active');
  }

  function confirmDelete() {
    if (state.deletingId) {
      const transactionToDelete = state.transactions.find(t => t.id === state.deletingId);
      
      if (transactionToDelete) {
        const group = transactionToDelete.transferGroupId 
          ? state.transactions.filter(t => t.transferGroupId === transactionToDelete.transferGroupId)
          : [transactionToDelete];

        group.forEach(txn => {
          if (txn.walletId) {
            const wallet = state.wallets.find(w => w.id === txn.walletId);
            if (wallet) {
              if (txn.type === 'expense') {
                wallet.balance += txn.amount;
              } else {
                wallet.balance -= txn.amount;
              }
            }
          }
        });

        const item = document.querySelector(`[data-id="${state.deletingId}"]`);
        if (item) {
          item.classList.add('removing');
          setTimeout(() => {
            state.transactions = state.transactions.filter(t => 
              !group.some(g => g.id === t.id)
            );
            saveData();
            renderAll();
            showToast('Transacción eliminada', 'success');
          }, 300);
        } else {
          state.transactions = state.transactions.filter(t => 
            !group.some(g => g.id === t.id)
          );
          saveData();
          renderAll();
          showToast('Transacción eliminada', 'success');
        }
      }
    }
    document.getElementById('deleteModal').classList.remove('active');
    state.deletingId = null;
  }

  function applyFilters() {
    state.filters = {
      startDate: document.getElementById('filterStartDate').value || null,
      endDate: document.getElementById('filterEndDate').value || null,
      type: document.getElementById('filterType').value,
      category: document.getElementById('filterCategory').value
    };

    populateCategoryFilter();
    renderTransactionList();
  }

  function clearFilters() {
    state.filters = {
      startDate: null,
      endDate: null,
      type: 'all',
      category: 'all'
    };

    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterCategory').value = 'all';

    populateCategoryFilter();
    renderTransactionList();
  }

  function getFilteredTransactions() {
    return state.transactions.filter(t => {
      if (state.filters.type !== 'all' && t.type !== state.filters.type) return false;

      if (state.filters.category !== 'all' && t.category !== state.filters.category) return false;

      if (state.filters.startDate && t.date < state.filters.startDate) return false;

      if (state.filters.endDate && t.date > state.filters.endDate) return false;

      return true;
    }).sort((a, b) => {
      const dateA = a.date.split('-').map(Number);
      const dateB = b.date.split('-').map(Number);
      if (dateB[0] !== dateA[0]) return dateB[0] - dateA[0];
      if (dateB[1] !== dateA[1]) return dateB[1] - dateA[1];
      if (dateB[2] !== dateA[2]) return dateB[2] - dateA[2];
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function populateCategoryFilter() {
    const filterCategory = document.getElementById('filterCategory');
    const currentValue = filterCategory.value;

    const categories = new Set();
    state.transactions.forEach(t => categories.add(t.category));

    filterCategory.innerHTML = '<option value="all">All Categories</option>';
    Array.from(categories).sort().forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      filterCategory.appendChild(option);
    });

    if (currentValue && categories.has(currentValue)) {
      filterCategory.value = currentValue;
    }
  }

  function calculateStats() {
    const stats = {
      totalBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      currentMonthIncome: 0,
      currentMonthExpenses: 0
    };

    const currentMonth = new Date().toISOString().slice(0, 7);

    state.transactions.forEach(t => {
      if (t.category === 'Transferencia' || t.transferGroupId) return;

      if (t.type === 'income') {
        stats.totalIncome += t.amount;
        if (t.date.startsWith(currentMonth)) {
          stats.currentMonthIncome += t.amount;
        }
      } else {
        stats.totalExpenses += t.amount;
        if (t.date.startsWith(currentMonth)) {
          stats.currentMonthExpenses += t.amount;
        }
      }
    });

    stats.totalBalance = stats.totalIncome - stats.totalExpenses;

    return stats;
  }

  function calculateMonthlyData(months = 6) {
    const data = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      const monthName = getMonthName(date.getMonth());

      let income = 0;
      let expense = 0;

      state.transactions.forEach(t => {
        if (t.date.startsWith(monthStr)) {
          if (t.category === 'Transferencia' || t.transferGroupId) return;
          if (t.type === 'income') income += t.amount;
          else expense += t.amount;
        }
      });

      data.push({ month: monthName, income, expense });
    }

    return data;
  }

  function calculateCategoryData() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const categories = {};

    state.transactions.forEach(t => {
      if (t.type === 'expense' && t.date.startsWith(currentMonth) && t.category !== 'Transferencia' && !t.transferGroupId) {
        if (!categories[t.category]) {
          categories[t.category] = 0;
        }
        categories[t.category] += t.amount;
      }
    });

    return Object.entries(categories)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  function renderAll() {
    const stats = calculateStats();
    renderDashboard(stats);
    renderBudget(stats);
    renderCharts();
    renderTransactionList();
    renderWallets();
    populateCategoryFilter();
  }

  function renderDashboard(stats) {
    document.getElementById('totalBalance').textContent = formatCurrency(stats.totalBalance);
    document.getElementById('totalIncome').textContent = formatCurrency(stats.totalIncome);
    document.getElementById('totalExpenses').textContent = formatCurrency(stats.totalExpenses);
    document.getElementById('sidebarIncome').textContent = formatCurrency(stats.totalIncome);
    document.getElementById('sidebarExpenses').textContent = formatCurrency(stats.totalExpenses);
  }

  function renderBudget(stats) {
    const budget = state.settings.monthlyBudget || 0;
    const percentage = budget > 0 ? (stats.currentMonthExpenses / budget) * 100 : 0;
    const fillEl = document.getElementById('budgetFill');
    const textEl = document.getElementById('budgetText');

    fillEl.style.width = Math.min(percentage, 100) + '%';
    fillEl.classList.remove('warning', 'danger');

    if (percentage >= 100) {
      fillEl.classList.add('danger');
    } else if (percentage >= 80) {
      fillEl.classList.add('warning');
    }

    textEl.textContent = `${formatCurrency(stats.currentMonthExpenses)} / ${formatCurrency(budget)}`;
  }

  function renderWallets() {
    const container = document.getElementById('walletsList');
    if (!container) return;

    let totalARS = 0;
    const mepVenta = state.dolarMEP ? state.dolarMEP.venta : null;

    if (state.wallets.length === 0) {
      container.innerHTML = `
        <div class="wallets-list-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M12 10v4M10 12h4"/>
          </svg>
          <p>No hay billeteras.<br>Haz clic en <strong>+</strong> para agregar una.</p>
        </div>
      `;
      document.getElementById('walletsTotal').textContent = '$0 ARS';
      return;
    }

    let html = '';

    state.wallets.forEach(wallet => {
      const isUSD = wallet.currency === 'USD';
      const isARS = wallet.currency === 'ARS';
      const noCurrency = !wallet.currency;
      const isBroker = wallet.type === 'broker';
      const isBank = wallet.type === 'bank';
      const isPlazoFijo = isBank && wallet.bankType === 'plazo_fijo';

      const displayBalance = wallet.currency && wallet.currency !== 'COP'
        ? formatCurrencyWithCurrency(wallet.balance, wallet.currency)
        : formatCurrency(wallet.balance);

      let equivalentHtml = '';
      if (isUSD && mepVenta) {
        const arsEquiv = wallet.balance * mepVenta;
        equivalentHtml = `<span class="wallet-equivalent">≈ ${formatARS(arsEquiv)}</span>`;
      }

      let editBtnHtml = '';
      if (isBroker) {
        editBtnHtml = `<button class="btn-edit-broker" onclick="window.app.openUpdateBroker('${wallet.id}')" title="Actualizar Valor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
      } else if (isPlazoFijo) {
        editBtnHtml = `<button class="btn-edit-broker" onclick="window.app.openUpdateBank('${wallet.id}')" title="Actualizar Valor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
      }

      const displayType = isBank && wallet.bankType ? wallet.bankType : (wallet.type || 'physical');
      const typeLabels = {
        'virtual': 'Virtual',
        'physical': 'Física',
        'bank': 'Banco',
        'broker': 'Broker',
        'caja_ahorro': 'Caja de Ahorro',
        'plazo_fijo': 'Plazo Fijo'
      };
      const badgeLabel = typeLabels[displayType] || displayType;
      const typeColor = displayType === 'plazo_fijo' ? '#EC4899' : '#3B82F6';

      html += `
        <div class="wallet-item" data-type="${wallet.type || 'physical'}">
          <div class="wallet-info">
            <div class="wallet-name-row">
              <span class="wallet-name">${wallet.name}</span>
              <span class="wallet-type-badge" ${displayType === 'plazo_fijo' ? `style="background: rgba(236, 72, 153, 0.12); color: #EC4899;"` : ''}>${badgeLabel}</span>
              ${editBtnHtml}
            </div>
            ${equivalentHtml}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="wallet-balance">${displayBalance}</span>
            <div class="wallet-item-actions">
              <button class="btn-wallet-action" onclick="window.app.openEditWallet('${wallet.id}')" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-wallet-action delete" onclick="window.app.deleteWallet('${wallet.id}')" title="Eliminar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;

      if (isARS || noCurrency) {
        totalARS += wallet.balance;
      }
    });

    if (state.dolarMEP) {
      const fechaStr = state.dolarMEP.fecha
        ? new Date(state.dolarMEP.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '';
      html += `
        <div class="wallet-dolar-mep">
          <span>💱 Dólar MEP</span>
          <span>${formatARS(state.dolarMEP.venta)}${fechaStr ? ' <small>(' + fechaStr + ')</small>' : ''}</span>
        </div>
      `;
    }

    container.innerHTML = html;
    document.getElementById('walletsTotal').textContent = formatARS(totalARS) + ' ARS';
  }

  function formatARS(amount) {
    const formatted = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return '$' + formatted;
  }

  function formatCurrencyWithCurrency(amount, currency) {
    if (currency === 'USD') {
      return '$' + amount.toFixed(2) + ' USD';
    }
    if (currency === 'ARS') {
      const formatted = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return '$' + formatted + ' ARS';
    }
    return formatCurrency(amount);
  }

  function updateWalletBalance(oldTransaction, newTransaction) {
    if (!oldTransaction && newTransaction.walletId) {
      const wallet = state.wallets.find(w => w.id === newTransaction.walletId);
      if (wallet) {
        if (newTransaction.type === 'expense') {
          wallet.balance -= newTransaction.amount;
        } else {
          wallet.balance += newTransaction.amount;
        }
      }
    }
    
    if (oldTransaction && oldTransaction.walletId) {
      const oldWallet = state.wallets.find(w => w.id === oldTransaction.walletId);
      if (oldWallet) {
        if (oldTransaction.type === 'expense') {
          oldWallet.balance += oldTransaction.amount;
        } else {
          oldWallet.balance -= oldTransaction.amount;
        }
      }
      
      if (newTransaction.walletId && newTransaction.walletId !== oldTransaction.walletId) {
        const newWallet = state.wallets.find(w => w.id === newTransaction.walletId);
        if (newWallet) {
          if (newTransaction.type === 'expense') {
            newWallet.balance -= newTransaction.amount;
          } else {
            newWallet.balance += newTransaction.amount;
          }
        }
      } else if (newTransaction.walletId === oldTransaction.walletId) {
        const wallet = state.wallets.find(w => w.id === newTransaction.walletId);
        if (wallet) {
          const diff = newTransaction.amount - oldTransaction.amount;
          if (newTransaction.type === 'expense') {
            wallet.balance -= diff;
          } else {
            wallet.balance += diff;
          }
        }
      }
    }
    
    saveData();
  }

  function renderCharts() {
    renderBarChart();
    renderPieChart();
  }

  function renderBarChart() {
    const container = document.getElementById('barChart');
    const data = calculateMonthlyData();

    const hasData = data.some(d => d.income > 0 || d.expense > 0);

    if (!hasData) {
      container.innerHTML = `
        <div class="chart-no-data">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <p>No hay datos para mostrar.<br>Agrega transacciones para ver tus ingresos vs gastos.</p>
        </div>
      `;
      return;
    }

    const maxValue = Math.max(...data.map(d => Math.max(d.income, d.expense)));

    let html = '<div class="bar-chart">';

    data.forEach(d => {
      const incomeHeight = maxValue > 0 ? (d.income / maxValue) * 150 : 0;
      const expenseHeight = maxValue > 0 ? (d.expense / maxValue) * 150 : 0;

      html += `
        <div class="bar-group">
          <div class="bar-wrapper">
            <div class="bar income" style="height: ${incomeHeight}px;">
              <span class="bar-tooltip">${formatCurrency(d.income)}</span>
            </div>
            <div class="bar expense" style="height: ${expenseHeight}px;">
              <span class="bar-tooltip">${formatCurrency(d.expense)}</span>
            </div>
          </div>
          <span class="bar-label">${d.month}</span>
        </div>
      `;
    });

    html += '</div>';
    html += `
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot income"></span>
          <span>Ingresos</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot expense"></span>
          <span>Gastos</span>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderPieChart() {
    const container = document.getElementById('pieChart');
    const data = calculateCategoryData();

    if (data.length === 0) {
      container.innerHTML = `
        <div class="chart-no-data">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2v20M2 12h20"/>
          </svg>
          <p>No hay gastos este mes.<br>Agrega gastos para ver el desglose.</p>
        </div>
      `;
      return;
    }

    const total = data.reduce((sum, d) => sum + d.amount, 0);
    let cumulativeDeg = 0;

    const gradientStops = data.map((d, i) => {
      const color = COLORS.expense[i % COLORS.expense.length];
      const startDeg = cumulativeDeg;
      const sliceDeg = (d.amount / total) * 360;
      cumulativeDeg += sliceDeg;
      return `${color} ${startDeg}deg ${cumulativeDeg}deg`;
    }).join(', ');

    let legendHtml = '<div class="pie-legend">';
    data.forEach((d, i) => {
      const percentage = ((d.amount / total) * 100).toFixed(1);
      legendHtml += `
        <div class="pie-legend-item">
          <span class="pie-legend-color" style="background: ${COLORS.expense[i % COLORS.expense.length]}"></span>
          <span>${d.category} (${percentage}%)</span>
        </div>
      `;
    });
    legendHtml += '</div>';

    container.innerHTML = `
      <div class="pie-chart-container">
        <div class="pie-chart" style="background: conic-gradient(${gradientStops})">
          <div class="pie-center">
            <span class="pie-center-label">Total</span>
            <span class="pie-center-value">${formatCurrency(total)}</span>
          </div>
        </div>
        ${legendHtml}
      </div>
    `;
  }

  function renderTransactionList() {
    const container = document.getElementById('transactionList');
    const filtered = getFilteredTransactions();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M12 10v4M10 12h4"/>
          </svg>
          <h3>${Object.values(state.filters).some(f => f && f !== 'all') ? 'No hay transacciones coincidentes' : 'No hay transacciones'}</h3>
          <p>${Object.values(state.filters).some(f => f && f !== 'all') ? 'Intenta ajustar los filtros' : 'Agrega tu primera transacción para comenzar'}</p>
        </div>
      `;
      return;
    }

    let html = '';

    filtered.forEach(t => {
      if (t.transferGroupId && t.transferType === 'in') return;

      const icon = CATEGORY_ICONS[t.category] || '💰';
      let amountClass = t.type === 'income' ? 'income' : 'expense';
      let prefix = t.type === 'income' ? '+' : '-';
      const wallet = t.walletId ? state.wallets.find(w => w.id === t.walletId) : null;
      let walletName = wallet ? `<span class="transaction-wallet">${wallet.name}</span>` : '';
      const isTransfer = !!t.transferGroupId;
      let transferBadge = '';

      if (isTransfer) {
        amountClass = 'neutral';
        prefix = '';
        transferBadge = `<span class="transaction-transfer-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18"/></svg>Transferencia</span>`;
        walletName = ''; 
      }

      html += `
        <div class="transaction-item" data-id="${t.id}">
          <div class="transaction-icon ${isTransfer ? 'transfer' : t.type}">
            ${icon}
          </div>
          <div class="transaction-info">
            <span class="transaction-desc">${t.description || t.category}</span>
            <div class="transaction-meta">
              <span class="transaction-category">${t.category}</span>
              ${transferBadge}
              ${walletName}
            </div>
          </div>
          <span class="transaction-date">${formatDate(t.date)}</span>
          <span class="transaction-amount ${amountClass}">${prefix}${formatCurrency(t.amount)}</span>
          <div class="transaction-actions">
            <button class="btn-action edit" onclick="window.app.editTransaction('${t.id}')" title="Editar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete" onclick="window.app.deleteTransaction('${t.id}')" title="Eliminar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ---- Transfer Functions ----

  function openTransferModal() {
    const modal = document.getElementById('transferModal');
    const form = document.getElementById('transferForm');
    form.reset();
    clearErrors();
    document.getElementById('transferDate').value = getTodayString();
    populateTransferWalletOptions();
    document.getElementById('transferAvailable').textContent = '';
    modal.classList.add('active');
    document.getElementById('transferFrom').focus();
  }

  function closeTransferModal() {
    document.getElementById('transferModal').classList.remove('active');
  }

  function populateTransferWalletOptions() {
    const fromSelect = document.getElementById('transferFrom');
    const toSelect = document.getElementById('transferTo');

    fromSelect.innerHTML = '<option value="">Seleccionar origen</option>';
    toSelect.innerHTML = '<option value="">Seleccionar destino</option>';

    state.wallets.forEach(wallet => {
      const displayBalance = wallet.currency && wallet.currency !== 'COP'
        ? formatCurrencyWithCurrency(wallet.balance, wallet.currency)
        : formatCurrency(wallet.balance);

      const optFrom = document.createElement('option');
      optFrom.value = wallet.id;
      optFrom.textContent = `${wallet.name} (${displayBalance})`;
      fromSelect.appendChild(optFrom);

      const optTo = document.createElement('option');
      optTo.value = wallet.id;
      optTo.textContent = `${wallet.name} (${displayBalance})`;
      toSelect.appendChild(optTo);
    });
  }

  function swapTransferWallets() {
    const fromSelect = document.getElementById('transferFrom');
    const toSelect = document.getElementById('transferTo');
    const fromVal = fromSelect.value;
    const toVal = toSelect.value;
    fromSelect.value = toVal;
    toSelect.value = fromVal;
    updateTransferAvailable();
  }

  function updateTransferAvailable() {
    const fromId = document.getElementById('transferFrom').value;
    const availableEl = document.getElementById('transferAvailable');
    const amount = parseFloat(document.getElementById('transferAmount').value) || 0;

    if (!fromId) {
      availableEl.textContent = '';
      availableEl.className = 'transfer-available';
      return;
    }

    const wallet = state.wallets.find(w => w.id === fromId);
    if (!wallet) return;

    const displayBalance = wallet.currency && wallet.currency !== 'COP'
      ? formatCurrencyWithCurrency(wallet.balance, wallet.currency)
      : formatCurrency(wallet.balance);

    availableEl.textContent = `Disponible: ${displayBalance}`;

    if (amount > 0 && amount > wallet.balance) {
      availableEl.className = 'transfer-available insufficient';
      availableEl.textContent += ' — Fondos insuficientes';
    } else {
      availableEl.className = 'transfer-available has-balance';
    }
  }

  function handleTransferSubmit(e) {
    e.preventDefault();
    clearErrors();

    const fromId = document.getElementById('transferFrom').value;
    const toId = document.getElementById('transferTo').value;
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const description = document.getElementById('transferDescription').value.trim();
    const date = document.getElementById('transferDate').value;

    let hasError = false;

    if (!fromId) {
      showError('transferFrom', 'Selecciona una billetera origen');
      hasError = true;
    }

    if (!toId) {
      showError('transferTo', 'Selecciona una billetera destino');
      hasError = true;
    }

    if (fromId && toId && fromId === toId) {
      showError('transferTo', 'La billetera destino debe ser diferente');
      hasError = true;
    }

    if (!amount || amount <= 0) {
      showError('transferAmount', 'Ingresa un monto válido');
      hasError = true;
    }

    if (!date) {
      hasError = true;
    }

    if (hasError) return;

    const fromWallet = state.wallets.find(w => w.id === fromId);
    const toWallet = state.wallets.find(w => w.id === toId);

    if (!fromWallet || !toWallet) {
      showToast('Error: billetera no encontrada', 'error');
      return;
    }

    if (amount > fromWallet.balance) {
      showError('transferAmount', `Fondos insuficientes en ${fromWallet.name}`);
      return;
    }

    // Create a linked transfer ID
    const transferGroupId = 'transfer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const descText = description || `${fromWallet.name} → ${toWallet.name}`;

    // Create expense transaction (from source)
    const expenseTxn = {
      id: generateId(),
      amount,
      type: 'expense',
      category: 'Transferencia',
      description: descText,
      date,
      walletId: fromId,
      transferGroupId,
      transferType: 'out',
      createdAt: new Date().toISOString()
    };

    // Create income transaction (to destination)
    const incomeTxn = {
      id: generateId(),
      amount,
      type: 'income',
      category: 'Transferencia',
      description: descText,
      date,
      walletId: toId,
      transferGroupId,
      transferType: 'in',
      createdAt: new Date().toISOString()
    };

    // Update wallet balances
    fromWallet.balance -= amount;
    toWallet.balance += amount;

    // Add transactions
    state.transactions.unshift(incomeTxn);
    state.transactions.unshift(expenseTxn);

    saveData();
    closeTransferModal();
    renderAll();

    const displayAmount = fromWallet.currency && fromWallet.currency !== 'COP'
      ? formatCurrencyWithCurrency(amount, fromWallet.currency)
      : formatCurrency(amount);
    showToast(`Transferencia de ${displayAmount} realizada`, 'success');
  }

  function toggleDarkMode() {
    state.settings.darkMode = !state.settings.darkMode;
    saveData();
    applyTheme();
  }

  function exportData() {
    const data = {
      transactions: state.transactions,
      settings: state.settings,
      wallets: state.wallets,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrack-export-${getTodayString()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Datos exportados correctamente', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const data = JSON.parse(event.target.result);

        if (data.transactions && Array.isArray(data.transactions)) {
          state.transactions = data.transactions;
        }

        if (data.settings) {
          state.settings = { ...state.settings, ...data.settings };
        }

        if (data.wallets && Array.isArray(data.wallets)) {
          state.wallets = data.wallets;
        }

        saveData();
        applyTheme();
        renderAll();
        showToast('Datos importados correctamente', 'success');
      } catch (err) {
        showToast('Formato de archivo inválido', 'error');
      }
    };
    reader.readAsText(file);

    e.target.value = '';
  }

  function setBudget() {
    const input = document.getElementById('budgetInput');
    const value = parseFloat(input.value);

    if (value >= 0) {
      state.settings.monthlyBudget = value;
      saveData();
      renderBudget(calculateStats());
      showToast('Presupuesto actualizado', 'success');
    }
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ?
      '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>' :
      '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';

    toast.innerHTML = `${icon}<span class="toast-message">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function openUpdateBroker(id) {
    const wallet = state.wallets.find(w => w.id === id);
    if (!wallet) return;
    state.brokerPreviousBalance = wallet.balance;
    document.getElementById('updateBrokerId').value = id;
    document.getElementById('updateBrokerAmount').value = wallet.balance;
    document.getElementById('updateBrokerPrevAmount').textContent = wallet.currency === 'USD'
      ? formatCurrencyWithCurrency(wallet.balance, 'USD')
      : formatARS(wallet.balance);
    document.getElementById('updateBrokerChange').textContent = '';
    document.getElementById('updateBrokerChange').className = 'broker-change';
    document.getElementById('updateBrokerModal').classList.add('active');
  }

  function closeUpdateBroker() {
    document.getElementById('updateBrokerModal').classList.remove('active');
    state.brokerPreviousBalance = null;
  }

  function updateBrokerChange() {
    const amount = parseFloat(document.getElementById('updateBrokerAmount').value) || 0;
    const prevAmount = state.brokerPreviousBalance || 0;
    const changeEl = document.getElementById('updateBrokerChange');

    if (prevAmount === 0 || amount === 0) {
      changeEl.textContent = '';
      changeEl.className = 'broker-change';
      return;
    }

    const change = ((amount - prevAmount) / prevAmount) * 100;
    const isPositive = change >= 0;
    const sign = isPositive ? '+' : '';

    changeEl.textContent = `${sign}${change.toFixed(2)}%`;
    changeEl.className = `broker-change ${isPositive ? 'positive' : 'negative'}`;
  }

  function handleUpdateBrokerSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('updateBrokerId').value;
    const amount = parseFloat(document.getElementById('updateBrokerAmount').value);
    
    if (amount >= 0) {
      const wallet = state.wallets.find(w => w.id === id);
      if (wallet) {
        wallet.balance = amount;
        saveData();
        renderAll();
        showToast('Valor de inversión actualizado', 'success');
      }
    }
    closeUpdateBroker();
  }

  function toggleBankSubtype() {
    const type = document.getElementById('walletType').value;
    const subtypeGroup = document.getElementById('bankSubtypeGroup');
    subtypeGroup.style.display = type === 'bank' ? 'flex' : 'none';
  }

  function generateWalletId() {
    return 'wallet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function openWalletModal(wallet = null) {
    const modal = document.getElementById('walletModal');
    const form = document.getElementById('walletForm');
    const modalTitle = document.getElementById('walletModalTitle');
    const deleteBtn = document.getElementById('deleteWalletBtn');

    form.reset();
    clearErrors();

    if (wallet) {
      state.editingWalletId = wallet.id;
      modalTitle.textContent = 'Editar Billetera';
      deleteBtn.style.display = 'block';

      document.getElementById('walletEditId').value = wallet.id;
      document.getElementById('walletName').value = wallet.name;
      document.getElementById('walletType').value = wallet.type || 'physical';
      document.getElementById('walletCurrency').value = wallet.currency || 'ARS';
      document.getElementById('walletBalance').value = wallet.balance;
      if (wallet.bankType) {
        document.getElementById('walletBankType').value = wallet.bankType;
      }
      toggleBankSubtype();
    } else {
      state.editingWalletId = null;
      modalTitle.textContent = 'Agregar Billetera';
      deleteBtn.style.display = 'none';

      document.getElementById('walletEditId').value = '';
      document.getElementById('walletType').value = '';
      document.getElementById('walletCurrency').value = 'ARS';
      document.getElementById('walletBalance').value = '';
      document.getElementById('walletBankType').value = 'caja_ahorro';
      toggleBankSubtype();
    }

    modal.classList.add('active');
    document.getElementById('walletName').focus();
  }

  function closeWalletModal() {
    document.getElementById('walletModal').classList.remove('active');
    state.editingWalletId = null;
  }

  function handleWalletSubmit(e) {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('walletName').value.trim();
    const type = document.getElementById('walletType').value;
    const currency = document.getElementById('walletCurrency').value;
    const balance = parseFloat(document.getElementById('walletBalance').value) || 0;
    const bankType = type === 'bank' ? document.getElementById('walletBankType').value : null;

    let hasError = false;

    if (!name) {
      showError('walletName', 'Ingresa un nombre');
      hasError = true;
    }

    if (!type) {
      showError('walletType', 'Selecciona un tipo');
      hasError = true;
    }

    if (hasError) return;

    if (state.editingWalletId) {
      const wallet = state.wallets.find(w => w.id === state.editingWalletId);
      if (wallet) {
        wallet.name = name;
        wallet.type = type;
        wallet.currency = currency;
        wallet.bankType = bankType;
        if (balance !== wallet.balance) {
          wallet.balance = balance;
        }
        showToast('Billetera actualizada', 'success');
      }
    } else {
      state.wallets.push({
        id: generateWalletId(),
        name,
        type,
        currency,
        balance,
        bankType
      });
      showToast('Billetera agregada', 'success');
    }

    saveData();
    closeWalletModal();
    renderAll();
  }

  function openEditWallet(id) {
    const wallet = state.wallets.find(w => w.id === id);
    if (wallet) {
      openWalletModal(wallet);
    }
  }

  function deleteWallet(id) {
    state.deletingWalletId = id;
    document.getElementById('deleteWalletModal').classList.add('active');
  }

  function confirmDeleteWallet() {
    if (state.deletingWalletId) {
      state.wallets = state.wallets.filter(w => w.id !== state.deletingWalletId);
      state.transactions.forEach(t => {
        if (t.walletId === state.deletingWalletId) {
          t.walletId = null;
        }
      });
      saveData();
      renderAll();
      showToast('Billetera eliminada', 'success');
    }
    document.getElementById('deleteWalletModal').classList.remove('active');
    state.deletingWalletId = null;
  }

  function openUpdateBank(id) {
    const wallet = state.wallets.find(w => w.id === id);
    if (!wallet || wallet.type !== 'bank') return;
    state.bankPreviousBalance = wallet.balance;
    const isPlazoFijo = wallet.bankType === 'plazo_fijo';
    document.getElementById('updateBankId').value = id;
    document.getElementById('updateBankAmount').value = wallet.balance;
    document.getElementById('updateBankPrevAmount').textContent = wallet.currency === 'USD'
      ? formatCurrencyWithCurrency(wallet.balance, 'USD')
      : formatARS(wallet.balance);
    document.getElementById('updateBankSubtypeLabel').textContent = isPlazoFijo ? 'Plazo Fijo' : 'Caja de Ahorro';
    document.getElementById('updateBankChange').textContent = '';
    document.getElementById('updateBankChange').className = 'broker-change';
    document.getElementById('updateBankModal').classList.add('active');
  }

  function closeUpdateBank() {
    document.getElementById('updateBankModal').classList.remove('active');
    state.bankPreviousBalance = null;
  }

  function updateBankChange() {
    const amount = parseFloat(document.getElementById('updateBankAmount').value) || 0;
    const prevAmount = state.bankPreviousBalance || 0;
    const changeEl = document.getElementById('updateBankChange');

    if (prevAmount === 0 || amount === 0) {
      changeEl.textContent = '';
      changeEl.className = 'broker-change';
      return;
    }

    const change = ((amount - prevAmount) / prevAmount) * 100;
    const isPositive = change >= 0;
    const sign = isPositive ? '+' : '';

    changeEl.textContent = `${sign}${change.toFixed(2)}%`;
    changeEl.className = `broker-change ${isPositive ? 'positive' : 'negative'}`;
  }

  function handleUpdateBankSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('updateBankId').value;
    const amount = parseFloat(document.getElementById('updateBankAmount').value);

    if (amount >= 0) {
      const wallet = state.wallets.find(w => w.id === id);
      if (wallet) {
        wallet.balance = amount;
        saveData();
        renderAll();
        showToast('Saldo actualizado', 'success');
      }
    }
    closeUpdateBank();
  }

  window.app = {
    editTransaction,
    deleteTransaction,
    openUpdateBroker,
    openEditWallet,
    deleteWallet,
    openUpdateBank
  };

  document.addEventListener('DOMContentLoaded', init);
})();