(function() {
  'use strict';

  let deferredPrompt = null;

  /** Vista estrecha (sidebar tipo drawer) o dispositivo táctil típico de móvil/tableta */
  function shouldOfferPwaInstall() {
    if (window.innerWidth <= 860) return true;
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    try {
      if (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches) {
        return true;
      }
    } catch (err) { /* ignore */ }
    return false;
  }

  function refreshPwaInstallButton() {
    const installBtn = document.getElementById('installAppBtn');
    if (!installBtn) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const canShow = Boolean(deferredPrompt) && !standalone && shouldOfferPwaInstall();
    installBtn.classList.toggle('show', canShow);
    installBtn.setAttribute('aria-hidden', canShow ? 'false' : 'true');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshPwaInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshPwaInstallButton();
  });

  const STORAGE_KEYS = {
    TRANSACTIONS: 'fintrack_transactions',
    SETTINGS: 'fintrack_settings',
    SUBSCRIPTIONS: 'fintrack_subscriptions',
    GOALS: 'fintrack_goals'
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
    subscriptions: [],
    goals: [],
    settings: {
      monthlyBudget: 0,
      darkMode: false,
      currency: 'ARS'
    },
    dolarMEP: null,
    editingId: null,
    deletingId: null,
    deletingWalletId: null,
    deletingSubscriptionId: null,
    deletingGoalId: null,
    editingWalletId: null,
    editingSubscriptionId: null,
    editingGoalId: null,
    brokerPreviousBalance: null,
    bankPreviousBalance: null,
    selectedMonth: null,
    activePreset: null,
    evoRange: 30,
    activeTab: 'resumen',
    filters: {
      startDate: null,
      endDate: null,
      type: 'all',
      category: 'all',
      search: '',
      sort: 'date-desc'
    }
  };

  async function init() {
    loadData();
    setupEventListeners();
    applyTheme();
    setupPeriodSelector();
    renderAll();
    await fetchDolarMEP();
    renderWallets();
  }

  function setupPeriodSelector() {
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        clearMonthSelection();
        renderAll();
      });
    }
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
    const storedSubscriptions = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
    const storedGoals = localStorage.getItem(STORAGE_KEYS.GOALS);

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

    if (storedSubscriptions) {
      state.subscriptions = JSON.parse(storedSubscriptions);
    }

    if (storedGoals) {
      state.goals = JSON.parse(storedGoals);
    }

    state.transactions = userTransactions;
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
    localStorage.setItem('fintrack_wallets', JSON.stringify(state.wallets));
    localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(state.subscriptions));
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(state.goals));
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
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return months[monthIndex];
  }

  function getTodayString() {
    return toIsoDate(new Date());
  }

  function getDateRangeForPeriod(periodValue) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const endDate = toIsoDate(today);

    let startDate;
    if (periodValue === 'all') {
      startDate = null;
    } else {
      const months = parseInt(periodValue, 10);
      const start = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
      start.setHours(0, 0, 0, 0);
      startDate = toIsoDate(start);
    }
    return { startDate, endDate };
  }

  function filterTransactionsByPeriod(transactions, startDate, endDate) {
    return transactions.filter(t => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
  }

  function calculateStatsByPeriod(periodValue) {
    const { startDate, endDate } = getDateRangeForPeriod(periodValue);
    const filteredTransactions = filterTransactionsByPeriod(state.transactions, startDate, endDate);

    const stats = { totalBalance: 0, totalIncome: 0, totalExpenses: 0 };

    filteredTransactions.forEach(t => {
      if (t.category === 'Transferencia' || t.transferGroupId) return;
      if (t.type === 'income') {
        stats.totalIncome += t.amount;
      } else {
        stats.totalExpenses += t.amount;
      }
    });

    stats.totalBalance = stats.totalIncome - stats.totalExpenses;
    return stats;
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

    document.getElementById('filterStartDate').addEventListener('change', () => { clearMonthSelection(); applyFilters(); });
    document.getElementById('filterEndDate').addEventListener('change', () => { clearMonthSelection(); applyFilters(); });
    document.getElementById('filterType').addEventListener('change', applyFilters);
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('monthSelect').addEventListener('change', onMonthSelect);
    document.getElementById('clearMonthBtn').addEventListener('click', clearMonthSelection);

    document.getElementById('shortcutsBtn').addEventListener('click', openShortcutsModal);
    document.getElementById('closeShortcutsBtn').addEventListener('click', closeShortcutsModal);
    document.getElementById('shortcutsModal').addEventListener('click', (e) => {
      if (e.target.id === 'shortcutsModal') closeShortcutsModal();
    });

    // Date presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyDatePreset(btn.dataset.preset));
    });

    // Sort
    const sortSelect = document.getElementById('filterSort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.filters.sort = sortSelect.value;
        renderTransactionList();
      });
    }

    // Export CSV
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);

    // Subscription modal
    document.getElementById('openSubscriptionModalBtn').addEventListener('click', () => openSubscriptionModal());
    document.getElementById('closeSubscriptionBtn').addEventListener('click', closeSubscriptionModal);
    document.getElementById('cancelSubscriptionBtn').addEventListener('click', closeSubscriptionModal);
    document.getElementById('subscriptionModal').addEventListener('click', (e) => {
      if (e.target.id === 'subscriptionModal') closeSubscriptionModal();
    });
    document.getElementById('subscriptionForm').addEventListener('submit', handleSubscriptionSubmit);
    document.getElementById('deleteSubscriptionBtn').addEventListener('click', () => {
      if (state.editingSubscriptionId) {
        state.deletingSubscriptionId = state.editingSubscriptionId;
        document.getElementById('deleteSubscriptionModal').classList.add('active');
      }
    });
    document.getElementById('cancelDeleteSubscriptionBtn').addEventListener('click', () => {
      document.getElementById('deleteSubscriptionModal').classList.remove('active');
    });
    document.getElementById('confirmDeleteSubscriptionBtn').addEventListener('click', confirmDeleteSubscription);

    // Goal modal
    document.getElementById('openGoalModalBtn').addEventListener('click', () => openGoalModal());
    document.getElementById('closeGoalBtn').addEventListener('click', closeGoalModal);
    document.getElementById('cancelGoalBtn').addEventListener('click', closeGoalModal);
    document.getElementById('goalModal').addEventListener('click', (e) => {
      if (e.target.id === 'goalModal') closeGoalModal();
    });
    document.getElementById('goalForm').addEventListener('submit', handleGoalSubmit);
    document.getElementById('deleteGoalBtn').addEventListener('click', () => {
      if (state.editingGoalId) {
        state.deletingGoalId = state.editingGoalId;
        document.getElementById('deleteGoalModal').classList.add('active');
      }
    });
    document.querySelectorAll('#goalColorPicker .color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        document.getElementById('goalColor').value = swatch.dataset.color;
      });
    });

    document.getElementById('cancelDeleteGoalBtn').addEventListener('click', () => {
      document.getElementById('deleteGoalModal').classList.remove('active');
    });
    document.getElementById('confirmDeleteGoalBtn').addEventListener('click', confirmDeleteGoal);

    // Contribute modal
    document.getElementById('closeContributeBtn').addEventListener('click', closeContributeModal);
    document.getElementById('cancelContributeBtn').addEventListener('click', closeContributeModal);
    document.getElementById('contributeGoalModal').addEventListener('click', (e) => {
      if (e.target.id === 'contributeGoalModal') closeContributeModal();
    });
    document.getElementById('contributeGoalForm').addEventListener('submit', handleContributeSubmit);
    document.getElementById('contributeAsExpense').addEventListener('change', (e) => {
      document.getElementById('contributeWalletGroup').style.display = e.target.checked ? 'flex' : 'none';
    });

    // Balance evolution range toggle
    document.querySelectorAll('.evo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.evo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.evoRange = parseInt(btn.dataset.range, 10);
        renderBalanceEvolution();
      });
    });

    // Page navigation tabs
    document.querySelectorAll('.page-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTabAndRender(btn.dataset.page));
    });

    document.addEventListener('keydown', handleGlobalKeydown);

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

    // Install PWA (solo móvil / vista estrecha; beforeinstallprompt llega async)
    const installBtn = document.getElementById('installAppBtn');
    installBtn.setAttribute('aria-hidden', 'true');
    refreshPwaInstallButton();
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      refreshPwaInstallButton();
    });

    // On resize: sidebar desktop + visibilidad del botón instalar
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        sidebarCloseBtn.style.display = 'none';
        document.body.style.overflow = '';
      }
      refreshPwaInstallButton();
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
    if (!transaction && state.wallets.length === 0) {
      showToast('Primero creá una billetera para agregar transacciones', 'error');
      openWalletModal();
      return;
    }

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
      showError('amount', 'Ingresa un monto válido');
      hasError = true;
    }

    if (!category) {
      showError('category', 'Selecciona una categoría');
      hasError = true;
    }

    if (!date) {
      showError('date', 'Selecciona una fecha');
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
    switchTabAndRender('gastos');
  }

  function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (transaction) {
      openModal(transaction);
    }
  }

  function duplicateTransaction(id) {
    const original = state.transactions.find(t => t.id === id);
    if (!original) return;

    const copy = {
      ...original,
      id: generateId(),
      createdAt: new Date().toISOString(),
      date: getTodayString(),
      description: original.description ? original.description + ' (copia)' : ''
    };

    if (copy.walletId) {
      const wallet = state.wallets.find(w => w.id === copy.walletId);
      if (wallet) {
        if (copy.type === 'expense') wallet.balance -= copy.amount;
        else wallet.balance += copy.amount;
      }
    }

    state.transactions.unshift(copy);
    saveData();
    switchTabAndRender('gastos');
    showToast('Transacción duplicada', 'success');
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
            switchTabAndRender('gastos');
            showToast('Transacción eliminada', 'success');
          }, 300);
        } else {
          state.transactions = state.transactions.filter(t => 
            !group.some(g => g.id === t.id)
          );
          saveData();
          switchTabAndRender('gastos');
          showToast('Transacción eliminada', 'success');
        }
      }
    }
    document.getElementById('deleteModal').classList.remove('active');
    state.deletingId = null;
  }

  function onMonthSelect() {
    const monthVal = document.getElementById('monthSelect').value;
    if (!monthVal) {
      clearMonthSelection();
      return;
    }
    state.selectedMonth = monthVal;

    const [year, month] = monthVal.split('-');
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${monthVal}-01`;
    const endDate = `${monthVal}-${String(lastDay).padStart(2, '0')}`;

    document.getElementById('filterStartDate').value = startDate;
    document.getElementById('filterEndDate').value = endDate;
    state.filters.startDate = startDate;
    state.filters.endDate = endDate;

    document.getElementById('clearMonthBtn').style.display = 'inline-block';
    document.getElementById('periodSelect').value = 'all';

    renderAll();
  }

  function clearMonthSelection() {
    if (!state.selectedMonth) return;
    state.selectedMonth = null;
    document.getElementById('monthSelect').value = '';
    document.getElementById('clearMonthBtn').style.display = 'none';
    document.getElementById('periodSelect').value = '1';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    state.filters.startDate = null;
    state.filters.endDate = null;
    renderAll();
  }

  function applyDatePreset(preset) {
    if (state.activePreset === preset) {
      clearDatePreset();
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate, endDate;

    const toIso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    switch (preset) {
      case 'today':
        startDate = toIso(today);
        endDate = toIso(today);
        break;
      case 'week': {
        const day = today.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        startDate = toIso(monday);
        endDate = toIso(sunday);
        break;
      }
      case 'month': {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        startDate = toIso(first);
        endDate = toIso(last);
        break;
      }
      case 'last-month': {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const last = new Date(today.getFullYear(), today.getMonth(), 0);
        startDate = toIso(first);
        endDate = toIso(last);
        break;
      }
      case 'year': {
        startDate = toIso(new Date(today.getFullYear(), 0, 1));
        endDate = toIso(new Date(today.getFullYear(), 11, 31));
        break;
      }
      default:
        return;
    }

    document.getElementById('filterStartDate').value = startDate;
    document.getElementById('filterEndDate').value = endDate;
    state.activePreset = preset;
    updatePresetButtons();
    clearMonthSelection();
    applyFilters();
  }

  function clearDatePreset() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    state.activePreset = null;
    updatePresetButtons();
    state.filters.startDate = null;
    state.filters.endDate = null;
    renderTransactionList();
  }

  function updatePresetButtons() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === state.activePreset);
    });
  }

  function applyFilters() {
    state.filters = {
      startDate: document.getElementById('filterStartDate').value || null,
      endDate: document.getElementById('filterEndDate').value || null,
      type: document.getElementById('filterType').value,
      category: document.getElementById('filterCategory').value,
      search: (document.getElementById('filterSearch').value || '').trim().toLowerCase(),
      sort: document.getElementById('filterSort').value
    };

    state.activePreset = null;
    updatePresetButtons();

    populateCategoryFilter();
    renderTransactionList();
  }

  function clearFilters() {
    state.filters = {
      startDate: null,
      endDate: null,
      type: 'all',
      category: 'all',
      search: '',
      sort: 'date-desc'
    };
    state.activePreset = null;

    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterSort').value = 'date-desc';

    updatePresetButtons();
    clearMonthSelection();
    populateCategoryFilter();
    renderTransactionList();
  }

  function getFilteredTransactions() {
    const search = state.filters.search;
    const filtered = state.transactions.filter(t => {
      if (state.filters.type !== 'all' && t.type !== state.filters.type) return false;

      if (state.filters.category !== 'all' && t.category !== state.filters.category) return false;

      if (state.filters.startDate && t.date < state.filters.startDate) return false;

      if (state.filters.endDate && t.date > state.filters.endDate) return false;

      if (search) {
        const haystack = ((t.description || '') + ' ' + (t.category || '')).toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    return sortTransactions(filtered, state.filters.sort);
  }

  function sortTransactions(transactions, sortKey) {
    const sorted = transactions.slice();
    const dateCompare = (a, b) => {
      const dateA = a.date.split('-').map(Number);
      const dateB = b.date.split('-').map(Number);
      if (dateB[0] !== dateA[0]) return dateB[0] - dateA[0];
      if (dateB[1] !== dateA[1]) return dateB[1] - dateA[1];
      if (dateB[2] !== dateA[2]) return dateB[2] - dateA[2];
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    };

    switch (sortKey) {
      case 'date-asc':
        return sorted.sort((a, b) => -dateCompare(a, b));
      case 'amount-desc':
        return sorted.sort((a, b) => b.amount - a.amount);
      case 'amount-asc':
        return sorted.sort((a, b) => a.amount - b.amount);
      case 'category':
        return sorted.sort((a, b) => {
          const catA = (a.category || '').toLowerCase();
          const catB = (b.category || '').toLowerCase();
          if (catA !== catB) return catA.localeCompare(catB);
          return dateCompare(a, b);
        });
      case 'date-desc':
      default:
        return sorted.sort(dateCompare);
    }
  }

  function populateCategoryFilter() {
    const filterCategory = document.getElementById('filterCategory');
    const currentValue = filterCategory.value;

    const categories = new Set();
    state.transactions.forEach(t => categories.add(t.category));

    filterCategory.innerHTML = '<option value="all">Todas las categorías</option>';
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

  function calculateStats(month) {
    const stats = {
      totalBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      currentMonthIncome: 0,
      currentMonthExpenses: 0
    };

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    state.transactions.forEach(t => {
      if (t.category === 'Transferencia' || t.transferGroupId) return;

      const inMonth = t.date.startsWith(targetMonth);

      if (t.type === 'income') {
        if (month) {
          if (inMonth) stats.totalIncome += t.amount;
        } else {
          stats.totalIncome += t.amount;
        }
        if (inMonth) {
          stats.currentMonthIncome += t.amount;
        }
      } else {
        if (month) {
          if (inMonth) stats.totalExpenses += t.amount;
        } else {
          stats.totalExpenses += t.amount;
        }
        if (inMonth) {
          stats.currentMonthExpenses += t.amount;
        }
      }
    });

    if (month) {
      stats.currentMonthIncome = stats.totalIncome;
      stats.currentMonthExpenses = stats.totalExpenses;
    }

    stats.totalBalance = stats.totalIncome - stats.totalExpenses;

    return stats;
  }

  function calculateMonthlyData(months = 6, endMonth) {
    const data = [];
    const endDate = endMonth ? new Date(endMonth + '-01') : new Date();
    const now = endDate;

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

  function calculateCategoryData(month) {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const categories = {};

    state.transactions.forEach(t => {
      if (t.type === 'expense' && t.date.startsWith(targetMonth) && t.category !== 'Transferencia' && !t.transferGroupId) {
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

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.page-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === tabId);
    });
    document.querySelectorAll('.page-content').forEach(page => {
      page.classList.toggle('active', page.id === 'page-' + tabId);
    });
  }

  function switchTabAndRender(tabId) {
    switchTab(tabId);
    renderAll();
  }

  function renderAll() {
    const stats = calculateStats(state.selectedMonth);

    // Always render sidebar-dependent sections
    renderBudget(stats);
    renderWallets();
    renderTopCategories();
    populateCategoryFilter();

    // Always render key content sections (they stay hidden via CSS when not active)
    renderTransactionList();
    renderSubscriptions();
    renderGoals();
    renderHeatmap();

    // Render based on active tab
    switch (state.activeTab) {
      case 'resumen':
        renderDashboard(stats);
        renderCharts();
        renderBalanceEvolution();
        renderSparklines();
        updateChartTitles();
        break;
    }
  }

  function updateChartTitles() {
    if (state.selectedMonth) {
      const [year, month] = state.selectedMonth.split('-');
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      const barTitle = document.getElementById('barChartTitle');
      const pieTitle = document.getElementById('pieChartTitle');
      if (barTitle) barTitle.textContent = `Ingresos vs Gastos (6 meses hasta ${monthName})`;
      if (pieTitle) pieTitle.textContent = `Gastos por Categoría (${monthName})`;
    } else {
      const barTitle = document.getElementById('barChartTitle');
      const pieTitle = document.getElementById('pieChartTitle');
      if (barTitle) barTitle.textContent = 'Ingresos vs Gastos (Últimos 6 Meses)';
      if (pieTitle) pieTitle.textContent = 'Gastos por Categoría (Este Mes)';
    }
  }

  function renderDashboard(stats) {
    document.getElementById('totalBalance').textContent = formatCurrency(stats.totalBalance);
    document.getElementById('totalIncome').textContent = formatCurrency(stats.totalIncome);
    document.getElementById('totalExpenses').textContent = formatCurrency(stats.totalExpenses);
    document.getElementById('sidebarIncome').textContent = formatCurrency(stats.totalIncome);
    document.getElementById('sidebarExpenses').textContent = formatCurrency(stats.totalExpenses);

    const prevRange = getPreviousPeriodRange();
    const prevStats = calculatePeriodStats(prevRange);

    if (!state.selectedMonth && document.getElementById('periodSelect').value === 'all') {
      renderTrend('balanceTrend', 0, 0, false);
      renderTrend('incomeTrend', 0, 0, false);
      renderTrend('expenseTrend', 0, 0, false);
    } else {
      renderTrend('balanceTrend', stats.totalBalance, prevStats.totalBalance, false);
      renderTrend('incomeTrend', stats.totalIncome, prevStats.totalIncome, false);
      renderTrend('expenseTrend', stats.totalExpenses, prevStats.totalExpenses, true);
    }

    renderSavingsRate(stats.totalIncome, stats.totalExpenses);
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
          <div class="wallet-left">
            <div class="wallet-top-row">
              <span class="wallet-name">${wallet.name}</span>
              <span class="wallet-type-badge" ${displayType === 'plazo_fijo' ? `style="background: rgba(236, 72, 153, 0.12); color: #EC4899;"` : ''}>${badgeLabel}</span>
              ${editBtnHtml}
            </div>
            <div class="wallet-bottom-row">
              ${equivalentHtml ? equivalentHtml : ''}
            </div>
          </div>
          <div class="wallet-right">
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
          if (newTransaction.type === 'expense') {
            wallet.balance -= newTransaction.amount;
          } else {
            wallet.balance += newTransaction.amount;
          }
        }
      }
    }
    
    if (oldTransaction && !oldTransaction.walletId && newTransaction.walletId) {
      const wallet = state.wallets.find(w => w.id === newTransaction.walletId);
      if (wallet) {
        if (newTransaction.type === 'expense') {
          wallet.balance -= newTransaction.amount;
        } else {
          wallet.balance += newTransaction.amount;
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
    const data = calculateMonthlyData(6, state.selectedMonth);

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
    const data = calculateCategoryData(state.selectedMonth);

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
    const hasFilters = Object.entries(state.filters).some(([k, v]) =>
      v && v !== 'all' && k !== 'sort' && !(k === 'search' && v === '')
    );

    if (filtered.length === 0) {
      let title, message;
      if (state.filters.search) {
        title = 'Sin resultados';
        message = `No hay transacciones que coincidan con "${state.filters.search}"`;
      } else if (hasFilters) {
        title = 'No hay transacciones coincidentes';
        message = 'Intenta ajustar los filtros';
      } else {
        title = 'No hay transacciones';
        message = 'Agrega tu primera transacción para comenzar';
      }

      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M12 10v4M10 12h4"/>
          </svg>
          <h3>${title}</h3>
          <p>${message}</p>
          ${hasFilters ? '<button class="empty-state-action" onclick="window.app.clearFilters()">Limpiar filtros</button>' : ''}
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

      const descHtml = highlightMatch(t.description || t.category, state.filters.search);
      const catHtml = highlightMatch(t.category, state.filters.search);

      html += `
        <div class="transaction-item" data-id="${t.id}">
          <div class="transaction-icon ${isTransfer ? 'transfer' : t.type}">
            ${icon}
          </div>
          <div class="transaction-info">
            <span class="transaction-desc">${descHtml}</span>
            <div class="transaction-meta">
              <span class="transaction-category">${catHtml}</span>
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
            ${isTransfer ? '' : `<button class="btn-action duplicate" onclick="window.app.duplicateTransaction('${t.id}')" title="Duplicar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>`}
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

  function highlightMatch(text, search) {
    if (!search || !text) return escapeHtml(text || '');
    const safeText = escapeHtml(text);
    const safeSearch = escapeHtml(search);
    const re = new RegExp('(' + safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safeText.replace(re, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    switchTabAndRender('gastos');

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
      subscriptions: state.subscriptions,
      goals: state.goals,
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

        if (data.subscriptions && Array.isArray(data.subscriptions)) {
          state.subscriptions = data.subscriptions;
        }

        if (data.goals && Array.isArray(data.goals)) {
          state.goals = data.goals;
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

  // ---- Round 2: Subscriptions ----

  const FREQUENCY_LABELS = {
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
    yearly: 'Anual'
  };

  const FREQUENCY_SHORT = {
    weekly: '/sem',
    biweekly: '/quinc',
    monthly: '/mes',
    yearly: '/año'
  };

  function generateSubscriptionId() {
    return 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function calculateNextDueDate(sub, fromDate) {
    const today = fromDate ? new Date(fromDate) : new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(sub.startDate + 'T00:00:00');
    let next = new Date(start);

    if (sub.frequency === 'monthly') {
      while (next < today) {
        next.setMonth(next.getMonth() + 1);
      }
    } else if (sub.frequency === 'yearly') {
      while (next < today) {
        next.setFullYear(next.getFullYear() + 1);
      }
    } else if (sub.frequency === 'weekly') {
      while (next < today) {
        next.setDate(next.getDate() + 7);
      }
    } else if (sub.frequency === 'biweekly') {
      while (next < today) {
        next.setDate(next.getDate() + 14);
      }
    }

    return next;
  }

  function advanceSubscriptionStartDate(sub) {
    const next = calculateNextDueDate(sub);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    sub.startDate = `${y}-${m}-${d}`;
  }

  function getSubscriptionStatus(sub) {
    const next = calculateNextDueDate(sub);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((next - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { days: diffDays, label: `Vencida hace ${Math.abs(diffDays)}d`, cls: 'overdue' };
    if (diffDays === 0) return { days: 0, label: 'Vence hoy', cls: 'due-today' };
    if (diffDays === 1) return { days: 1, label: 'Vence mañana', cls: 'due-soon' };
    if (diffDays <= 7) return { days: diffDays, label: `En ${diffDays} días`, cls: 'due-soon' };
    return { days: diffDays, label: `En ${diffDays} días`, cls: '' };
  }

  function populateSubscriptionCategoryOptions() {
    const select = document.getElementById('subscriptionCategory');
    const current = select.value;
    select.innerHTML = '<option value="">Seleccionar categoría</option>';
    CATEGORIES.expense.forEach(cat => {
      if (cat === 'Transferencia') return;
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  function populateSubscriptionWalletOptions() {
    const select = document.getElementById('subscriptionWallet');
    const current = select.value;
    select.innerHTML = '<option value="">Sin billetera</option>';
    state.wallets.forEach(wallet => {
      const option = document.createElement('option');
      option.value = wallet.id;
      option.textContent = wallet.name;
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  function openSubscriptionModal(sub) {
    const modal = document.getElementById('subscriptionModal');
    const form = document.getElementById('subscriptionForm');
    const title = document.getElementById('subscriptionModalTitle');
    const deleteBtn = document.getElementById('deleteSubscriptionBtn');

    form.reset();
    clearErrors();
    populateSubscriptionCategoryOptions();
    populateSubscriptionWalletOptions();

    if (sub) {
      state.editingSubscriptionId = sub.id;
      title.textContent = 'Editar Suscripción';
      deleteBtn.style.display = 'block';

      document.getElementById('subscriptionEditId').value = sub.id;
      document.getElementById('subscriptionName').value = sub.name;
      document.getElementById('subscriptionAmount').value = sub.amount;
      document.getElementById('subscriptionFrequency').value = sub.frequency;
      document.getElementById('subscriptionCategory').value = sub.category;
      document.getElementById('subscriptionWallet').value = sub.walletId || '';
      document.getElementById('subscriptionStartDate').value = sub.startDate;
      document.getElementById('subscriptionNotes').value = sub.notes || '';
    } else {
      state.editingSubscriptionId = null;
      title.textContent = 'Nueva Suscripción';
      deleteBtn.style.display = 'none';
      document.getElementById('subscriptionEditId').value = '';
      document.getElementById('subscriptionStartDate').value = getTodayString();
    }

    modal.classList.add('active');
    document.getElementById('subscriptionName').focus();
  }

  function closeSubscriptionModal() {
    document.getElementById('subscriptionModal').classList.remove('active');
    state.editingSubscriptionId = null;
  }

  function handleSubscriptionSubmit(e) {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('subscriptionName').value.trim();
    const amount = parseFloat(document.getElementById('subscriptionAmount').value);
    const frequency = document.getElementById('subscriptionFrequency').value;
    const category = document.getElementById('subscriptionCategory').value;
    const walletId = document.getElementById('subscriptionWallet').value || null;
    const startDate = document.getElementById('subscriptionStartDate').value;
    const notes = document.getElementById('subscriptionNotes').value.trim();

    if (!name) { showError('subscriptionName', 'Ingresa un nombre'); return; }
    if (!amount || amount <= 0) { showError('subscriptionAmount', 'Ingresa un monto válido'); return; }
    if (!category) { showError('subscriptionCategory', 'Selecciona una categoría'); return; }
    if (!startDate) { showError('subscriptionStartDate', 'Selecciona una fecha'); return; }

    if (state.editingSubscriptionId) {
      const sub = state.subscriptions.find(s => s.id === state.editingSubscriptionId);
      if (sub) {
        sub.name = name;
        sub.amount = amount;
        sub.frequency = frequency;
        sub.category = category;
        sub.walletId = walletId;
        sub.startDate = startDate;
        sub.notes = notes;
        showToast('Suscripción actualizada', 'success');
      }
    } else {
      state.subscriptions.push({
        id: generateSubscriptionId(),
        name,
        amount,
        frequency,
        category,
        walletId,
        startDate,
        notes,
        createdAt: new Date().toISOString()
      });
      showToast('Suscripción agregada', 'success');
    }

    saveData();
    closeSubscriptionModal();
    switchTabAndRender('suscripciones');
  }

  function editSubscription(id) {
    const sub = state.subscriptions.find(s => s.id === id);
    if (sub) openSubscriptionModal(sub);
  }

  function deleteSubscription(id) {
    state.deletingSubscriptionId = id;
    document.getElementById('deleteSubscriptionModal').classList.add('active');
  }

  function confirmDeleteSubscription() {
    if (state.deletingSubscriptionId) {
      state.subscriptions = state.subscriptions.filter(s => s.id !== state.deletingSubscriptionId);
      saveData();
      switchTabAndRender('suscripciones');
      showToast('Suscripción eliminada', 'success');
    }
    document.getElementById('deleteSubscriptionModal').classList.remove('active');
    state.deletingSubscriptionId = null;
  }

  function markSubscriptionPaid(id) {
    const sub = state.subscriptions.find(s => s.id === id);
    if (!sub) return;

    const transaction = {
      id: generateId(),
      amount: sub.amount,
      type: 'expense',
      category: sub.category,
      description: sub.name + (sub.notes ? ` — ${sub.notes}` : ''),
      date: getTodayString(),
      walletId: sub.walletId || null,
      subscriptionId: sub.id,
      createdAt: new Date().toISOString()
    };

    if (transaction.walletId) {
      const wallet = state.wallets.find(w => w.id === transaction.walletId);
      if (wallet) wallet.balance -= transaction.amount;
    }

    state.transactions.unshift(transaction);
    advanceSubscriptionStartDate(sub);
    saveData();
    switchTabAndRender('suscripciones');
    showToast(`${sub.name} marcada como pagada`, 'success');
  }

  function renderSubscriptions() {
    const container = document.getElementById('subscriptionsList');
    const summary = document.getElementById('subscriptionsSummary');
    if (!container) return;

    if (state.subscriptions.length === 0) {
      container.innerHTML = `
        <div class="subscriptions-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
          <p>No tenés suscripciones cargadas.</p>
          <p style="font-size: 12px; opacity: 0.7;">Agregá Netflix, gimnasio, alquiler y nunca más te olvidés de pagar.</p>
        </div>
      `;
      if (summary) summary.textContent = 'Cargá tus suscripciones para no olvidarlas';
      return;
    }

    const sorted = state.subscriptions.slice().sort((a, b) => {
      const aNext = calculateNextDueDate(a);
      const bNext = calculateNextDueDate(b);
      return aNext - bNext;
    });

    const totalMonthly = state.subscriptions.reduce((acc, s) => {
      const multiplier = s.frequency === 'weekly' ? 4.33 : s.frequency === 'biweekly' ? 2.17 : s.frequency === 'yearly' ? 1/12 : 1;
      return acc + s.amount * multiplier;
    }, 0);

    if (summary) {
      summary.innerHTML = `<strong>${state.subscriptions.length}</strong> activas · <strong>${formatCurrency(totalMonthly)}</strong>/mes estimado`;
    }

    let html = '';
    sorted.forEach(sub => {
      const status = getSubscriptionStatus(sub);
      const icon = CATEGORY_ICONS[sub.category] || '🔄';
      const wallet = sub.walletId ? state.wallets.find(w => w.id === sub.walletId) : null;
      const walletName = wallet ? ` · ${wallet.name}` : '';

      html += `
        <div class="subscription-item ${status.cls}">
          <div class="subscription-icon">${icon}</div>
          <div class="subscription-info">
            <span class="subscription-name">${escapeHtml(sub.name)}</span>
            <div class="subscription-meta">
              <span class="subscription-frequency">${FREQUENCY_LABELS[sub.frequency] || sub.frequency}</span>
              <span>·</span>
              <span>${escapeHtml(sub.category)}${walletName}</span>
              <span>·</span>
              <span class="subscription-due ${status.cls === 'overdue' ? 'overdue' : status.cls === 'due-today' || status.cls === 'due-soon' ? 'urgent' : ''}">${status.label}</span>
            </div>
          </div>
          <span class="subscription-amount">${formatCurrency(sub.amount)}${FREQUENCY_SHORT[sub.frequency] || ''}</span>
          <div class="subscription-actions">
            <button class="btn-action pay" onclick="window.app.markSubscriptionPaid('${sub.id}')" title="Marcar como pagada (crea transacción)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </button>
            <button class="btn-action edit" onclick="window.app.editSubscription('${sub.id}')" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete" onclick="window.app.deleteSubscription('${sub.id}')" title="Eliminar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ---- Top Categories ----

  function renderTopCategories() {
    const container = document.getElementById('topCategoriesList');
    const section = document.getElementById('topCategoriesSection');
    if (!container || !section) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const expenses = state.transactions.filter(t =>
      t.type === 'expense' &&
      t.date.startsWith(currentMonth) &&
      t.category !== 'Transferencia' &&
      !t.transferGroupId
    );

    if (expenses.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    const byCategory = {};
    expenses.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    const top = Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const max = top[0] ? top[0].amount : 1;

    let html = '';
    top.forEach(item => {
      const pct = (item.amount / max) * 100;
      const icon = CATEGORY_ICONS[item.category] || '💰';
      html += `
        <div class="top-cat-item">
          <span class="top-cat-icon">${icon}</span>
          <div class="top-cat-info">
            <span class="top-cat-name">${escapeHtml(item.category)}</span>
            <div class="top-cat-bar">
              <div class="top-cat-fill" style="width: ${pct.toFixed(1)}%"></div>
            </div>
          </div>
          <span class="top-cat-amount">${formatCurrency(item.amount)}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ---- Export CSV ----

  function exportCSV() {
    if (state.transactions.length === 0) {
      showToast('No hay transacciones para exportar', 'error');
      return;
    }

    const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Moneda', 'Billetera'];
    const rows = [headers];

    state.transactions.forEach(t => {
      if (t.transferGroupId && t.transferType === 'in') return;

      const wallet = t.walletId ? state.wallets.find(w => w.id === t.walletId) : null;
      const walletName = wallet ? wallet.name : '';
      const currency = wallet ? wallet.currency : state.settings.currency;

      rows.push([
        t.date,
        t.type === 'income' ? 'Ingreso' : 'Gasto',
        t.category,
        t.description || '',
        t.amount.toFixed(2),
        currency,
        walletName
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrack-transacciones-${getTodayString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`${state.transactions.length} transacciones exportadas`, 'success');
  }

  // ---- Round 3: Savings Goals ----

  function generateGoalId() {
    return 'goal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function openGoalModal(goal) {
    const modal = document.getElementById('goalModal');
    const form = document.getElementById('goalForm');
    const title = document.getElementById('goalModalTitle');
    const deleteBtn = document.getElementById('deleteGoalBtn');

    form.reset();
    clearErrors();

    document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === '#10B981');
    });
    document.getElementById('goalColor').value = '#10B981';

    if (goal) {
      state.editingGoalId = goal.id;
      title.textContent = 'Editar Meta de Ahorro';
      deleteBtn.style.display = 'block';

      document.getElementById('goalEditId').value = goal.id;
      document.getElementById('goalName').value = goal.name;
      document.getElementById('goalIcon').value = goal.icon || '🎯';
      document.getElementById('goalTarget').value = goal.targetAmount;
      document.getElementById('goalCurrent').value = goal.currentAmount;
      document.getElementById('goalDeadline').value = goal.deadline || '';
      document.getElementById('goalColor').value = goal.color || '#10B981';
      document.getElementById('goalNotes').value = goal.notes || '';

      document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === goal.color);
      });
    } else {
      state.editingGoalId = null;
      title.textContent = 'Nueva Meta de Ahorro';
      deleteBtn.style.display = 'none';
      document.getElementById('goalEditId').value = '';
      document.getElementById('goalIcon').value = '🎯';
    }

    modal.classList.add('active');
    document.getElementById('goalName').focus();
  }

  function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('active');
    state.editingGoalId = null;
  }

  function handleGoalSubmit(e) {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('goalName').value.trim();
    const icon = document.getElementById('goalIcon').value.trim() || '🎯';
    const targetAmount = parseFloat(document.getElementById('goalTarget').value);
    const currentAmount = parseFloat(document.getElementById('goalCurrent').value) || 0;
    const deadline = document.getElementById('goalDeadline').value || null;
    const color = document.getElementById('goalColor').value;
    const notes = document.getElementById('goalNotes').value.trim();

    if (!name) { showError('goalName', 'Ingresa un nombre'); return; }
    if (!targetAmount || targetAmount <= 0) { showError('goalTarget', 'Ingresa un monto válido'); return; }

    if (state.editingGoalId) {
      const goal = state.goals.find(g => g.id === state.editingGoalId);
      if (goal) {
        goal.name = name;
        goal.icon = icon;
        goal.targetAmount = targetAmount;
        goal.currentAmount = currentAmount;
        goal.deadline = deadline;
        goal.color = color;
        goal.notes = notes;
        showToast('Meta actualizada', 'success');
      }
    } else {
      state.goals.push({
        id: generateGoalId(),
        name,
        icon,
        targetAmount,
        currentAmount,
        deadline,
        color,
        notes,
        createdAt: new Date().toISOString()
      });
      showToast('Meta creada', 'success');
    }

    saveData();
    closeGoalModal();
    switchTabAndRender('metas');
  }

  function editGoal(id) {
    const goal = state.goals.find(g => g.id === id);
    if (goal) openGoalModal(goal);
  }

  function deleteGoal(id) {
    state.deletingGoalId = id;
    document.getElementById('deleteGoalModal').classList.add('active');
  }

  function confirmDeleteGoal() {
    if (state.deletingGoalId) {
      state.goals = state.goals.filter(g => g.id !== state.deletingGoalId);
      saveData();
      switchTabAndRender('metas');
      showToast('Meta eliminada', 'success');
    }
    document.getElementById('deleteGoalModal').classList.remove('active');
    state.deletingGoalId = null;
  }

  function openContributeModal(id) {
    const goal = state.goals.find(g => g.id === id);
    if (!goal) return;

    state.editingGoalId = id;
    document.getElementById('contributeGoalId').value = id;

    const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
    const infoEl = document.getElementById('contributeGoalInfo');
    infoEl.innerHTML = `
      <span class="goal-icon">${goal.icon}</span>
      <div class="contribute-goal-info-text">
        <span class="goal-name">${escapeHtml(goal.name)}</span>
        <span class="goal-current">${formatCurrency(goal.currentAmount)} / ${formatCurrency(goal.targetAmount)}</span>
        <span style="font-size: 11px; color: var(--text-secondary);">Faltan ${formatCurrency(remaining)}</span>
      </div>
    `;

    document.getElementById('contributeAmount').value = '';
    document.getElementById('contributeAsExpense').checked = false;
    document.getElementById('contributeWalletGroup').style.display = 'none';

    const walletSelect = document.getElementById('contributeWallet');
    walletSelect.innerHTML = '<option value="">Seleccionar billetera</option>';
    state.wallets.forEach(w => {
      const option = document.createElement('option');
      option.value = w.id;
      option.textContent = w.name;
      walletSelect.appendChild(option);
    });

    document.getElementById('contributeGoalModal').classList.add('active');
    document.getElementById('contributeAmount').focus();
  }

  function closeContributeModal() {
    document.getElementById('contributeGoalModal').classList.remove('active');
    state.editingGoalId = null;
  }

  function handleContributeSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('contributeGoalId').value;
    const amount = parseFloat(document.getElementById('contributeAmount').value);
    const asExpense = document.getElementById('contributeAsExpense').checked;
    const walletId = document.getElementById('contributeWallet').value || null;

    if (!amount || amount <= 0) {
      showError('contributeAmount', 'Ingresa un monto válido');
      return;
    }

    const goal = state.goals.find(g => g.id === id);
    if (!goal) return;

    if (asExpense && !walletId) {
      showError('contributeWallet', 'Selecciona una billetera');
      return;
    }

    if (asExpense && walletId) {
      const wallet = state.wallets.find(w => w.id === walletId);
      if (wallet) wallet.balance -= amount;

      state.transactions.unshift({
        id: generateId(),
        amount,
        type: 'expense',
        category: 'Ahorro',
        description: `Aporte a meta: ${goal.name}`,
        date: getTodayString(),
        walletId,
        goalId: goal.id,
        createdAt: new Date().toISOString()
      });
    }

    goal.currentAmount = (goal.currentAmount || 0) + amount;

    if (asExpense && walletId) {
      saveData();
      switchTabAndRender('metas');
      showToast(`+${formatCurrency(amount)} a ${goal.name}`, 'success');
    } else {
      saveData();
      switchTabAndRender('metas');
      showToast(`+${formatCurrency(amount)} a ${goal.name}`, 'success');
    }

    closeContributeModal();
  }

  function renderGoals() {
    const container = document.getElementById('goalsList');
    const summary = document.getElementById('goalsSummary');
    if (!container) return;

    if (state.goals.length === 0) {
      container.innerHTML = `
        <div class="goals-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          <p>No tenés metas de ahorro todavía.</p>
          <p style="font-size: 12px; opacity: 0.7;">Definí objetivos como un viaje, un auto o un imprevisto.</p>
        </div>
      `;
      if (summary) summary.textContent = 'Definí tus objetivos y alcanzalos';
      return;
    }

    let totalTarget = 0;
    let totalCurrent = 0;
    let completedCount = 0;

    const html = state.goals.map(goal => {
      const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
      const isCompleted = goal.currentAmount >= goal.targetAmount;
      if (isCompleted) completedCount++;

      totalTarget += goal.targetAmount;
      totalCurrent += goal.currentAmount;

      let suggestionHtml = '';
      if (goal.deadline && !isCompleted) {
        const deadline = new Date(goal.deadline + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const remaining = goal.targetAmount - goal.currentAmount;

        if (daysLeft <= 0) {
          suggestionHtml = `<span class="goal-suggestion overdue">Vencida</span>`;
        } else {
          const monthsLeft = Math.max(daysLeft / 30, 0.5);
          const monthly = remaining / monthsLeft;
          suggestionHtml = `<span class="goal-suggestion">${formatCurrency(monthly)}/mes</span>`;
        }
      } else if (isCompleted) {
        suggestionHtml = `<span class="goal-suggestion on-track">¡Completada!</span>`;
      }

      let deadlineText = '';
      if (goal.deadline) {
        const deadline = new Date(goal.deadline + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) {
          deadlineText = `${daysLeft} días restantes`;
        } else if (daysLeft === 0) {
          deadlineText = 'Vence hoy';
        } else {
          deadlineText = `Vencida hace ${Math.abs(daysLeft)}d`;
        }
      }

      return `
        <div class="goal-item ${isCompleted ? 'completed' : ''}" style="--goal-color: ${goal.color}">
          <div class="goal-header">
            <span class="goal-icon">${goal.icon || '🎯'}</span>
            <div class="goal-info">
              <div class="goal-name">${escapeHtml(goal.name)}</div>
              ${goal.notes ? `<div class="goal-notes">${escapeHtml(goal.notes)}</div>` : ''}
            </div>
            <div class="goal-actions">
              <button class="btn-action edit" onclick="window.app.editGoal('${goal.id}')" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-action delete" onclick="window.app.deleteGoal('${goal.id}')" title="Eliminar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="goal-amounts">
            <span class="goal-current">${formatCurrency(goal.currentAmount)}</span>
            <span class="goal-target">de ${formatCurrency(goal.targetAmount)}</span>
          </div>
          <div class="goal-progress">
            <div class="goal-progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="goal-footer">
            <span class="goal-percentage">${pct.toFixed(0)}%</span>
            <span>${deadlineText}</span>
            ${suggestionHtml}
          </div>
          <button class="goal-contribute-btn" onclick="window.app.openContributeModal('${goal.id}')" ${isCompleted ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Aportar
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    if (summary) {
      const overallPct = (totalCurrent / totalTarget) * 100;
      summary.innerHTML = `<strong>${completedCount}</strong> completada${completedCount !== 1 ? 's' : ''} de <strong>${state.goals.length}</strong> · <strong>${overallPct.toFixed(0)}%</strong> del total`;
    }
  }

  // ---- Heatmap ----

  function renderHeatmap() {
    const container = document.getElementById('heatmapContainer');
    if (!container) return;

    const weeks = 12;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Monday of the current week
    const currentDayOfWeek = today.getDay();
    const toMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - toMonday);

    // Start date: Monday 11 weeks before current Monday (12 weeks total)
    const startDate = new Date(currentMonday);
    startDate.setDate(currentMonday.getDate() - (weeks - 1) * 7);

    const expenses = state.transactions.filter(t =>
      t.type === 'expense' && t.category !== 'Transferencia' && !t.transferGroupId
    );

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="heatmap-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <p>Agregá gastos para ver el mapa</p>
        </div>`;
      return;
    }

    const dailyTotals = {};
    expenses.forEach(t => {
      dailyTotals[t.date] = (dailyTotals[t.date] || 0) + t.amount;
    });

    const values = Object.values(dailyTotals);
    const max = values.length > 0 ? Math.max(...values) : 0;

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    // Month labels: show only when month changes, spanning appropriate columns
    let html = '<div class="heatmap-months">';
    let prevMonth = -1;
    let monthStart = 0;
    for (let w = 0; w <= weeks; w++) {
      let m = -1;
      if (w < weeks) {
        const monday = new Date(startDate);
        monday.setDate(startDate.getDate() + w * 7);
        m = monday.getMonth();
      }
      if (m !== prevMonth && prevMonth !== -1) {
        const span = w - monthStart;
        html += `<span style="grid-column: ${monthStart + 1} / span ${span}">${monthNames[prevMonth]}</span>`;
        monthStart = w;
      }
      prevMonth = m;
    }
    html += '</div>';

    html += '<div class="heatmap-body">';
    html += '<div class="heatmap-day-labels">';
    dayNames.forEach(d => html += `<span>${d}</span>`);
    html += '</div>';

    html += '<div class="heatmap-weeks">';
    for (let w = 0; w < weeks; w++) {
      html += '<div class="heatmap-week">';
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + w * 7 + d);

        if (date > today) {
          html += '<div class="heatmap-day empty"></div>';
          continue;
        }

        const dateStr = toIsoDate(date);
        const amount = dailyTotals[dateStr] || 0;
        let level = 0;
        if (max > 0 && amount > 0) {
          if (amount >= max * 0.75) level = 4;
          else if (amount >= max * 0.5) level = 3;
          else if (amount >= max * 0.25) level = 2;
          else level = 1;
        }

        const tooltip = amount > 0
          ? `${formatDate(dateStr)}: ${formatCurrency(amount)}`
          : `${formatDate(dateStr)}: sin gastos`;

        html += `<div class="heatmap-day ${level > 0 ? 'level-' + level : ''}" data-date="${dateStr}" title="${escapeHtml(tooltip)}"><span class="heatmap-tooltip">${escapeHtml(tooltip)}</span></div>`;
      }
      html += '</div>';
    }
    html += '</div></div>';

    container.innerHTML = html;

    container.querySelectorAll('.heatmap-day[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date;
        state.filters.startDate = date;
        state.filters.endDate = date;
        state.filters.type = 'expense';
        state.filters.search = '';
        document.getElementById('filterStartDate').value = date;
        document.getElementById('filterEndDate').value = date;
        document.getElementById('filterType').value = 'expense';
        document.getElementById('filterSearch').value = '';
        switchTabAndRender('gastos');
      });
    });
  }

  // ---- Balance Evolution Line Chart ----

  function renderBalanceEvolution() {
    const container = document.getElementById('balanceEvolutionChart');
    const statsContainer = document.getElementById('evoStats');
    if (!container) return;

    const days = state.evoRange;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days + 1);

    const dataPoints = [];
    let runningBalance = 0;

    const startDateStr = toIsoDate(startDate);

    state.transactions.forEach(t => {
      if (t.category === 'Transferencia' || t.transferGroupId) return;
      if (t.date < startDateStr) {
        if (t.type === 'income') runningBalance += t.amount;
        else runningBalance -= t.amount;
      }
    });

    const sortedTx = state.transactions
      .filter(t => t.category !== 'Transferencia' && !t.transferGroupId && t.date >= startDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = toIsoDate(date);

      while (sortedTx.length > 0 && sortedTx[0].date === dateStr) {
        const t = sortedTx.shift();
        if (t.type === 'income') runningBalance += t.amount;
        else runningBalance -= t.amount;
      }

      if (date <= today) {
        dataPoints.push({ date, value: runningBalance });
      }
    }

    if (dataPoints.length === 0) {
      container.innerHTML = `
        <div class="chart-no-data">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 17l6-6 4 4 8-8"/>
            <path d="M14 7h7v7"/>
          </svg>
          <p>No hay datos suficientes para mostrar la evolución.</p>
        </div>
      `;
      if (statsContainer) statsContainer.innerHTML = '';
      return;
    }

    const values = dataPoints.map(d => d.value);
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 1);
    const range = maxVal - minVal || 1;

    const w = Math.max(container.clientWidth || 800, 300);
    const h = 200;
    const padX = 40;
    const padY = 20;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;

    const xStep = chartW / Math.max(dataPoints.length - 1, 1);
    const points = dataPoints.map((d, i) => {
      const x = padX + i * xStep;
      const y = padY + chartH - ((d.value - minVal) / range) * chartH;
      return { x, y, value: d.value, date: d.date };
    });

    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const areaD = pathD + ` L${points[points.length - 1].x},${padY + chartH} L${points[0].x},${padY + chartH} Z`;

    const yLabels = [];
    for (let i = 0; i <= 4; i++) {
      const v = minVal + (range * i) / 4;
      const y = padY + chartH - (i / 4) * chartH;
      yLabels.push(`<text class="evo-axis-label" x="${padX - 6}" y="${y + 3}" text-anchor="end">${formatShortCurrency(v)}</text>`);
      yLabels.push(`<line class="evo-grid-line" x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}"/>`);
    }

    const xLabelCount = Math.min(6, dataPoints.length);
    const xLabels = [];
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.floor((i / (xLabelCount - 1)) * (dataPoints.length - 1));
      const x = padX + idx * xStep;
      const labelDate = dataPoints[idx].date;
      const label = new Date(labelDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      xLabels.push(`<text class="evo-axis-label" x="${x}" y="${h - 4}" text-anchor="middle">${label}</text>`);
    }

    const lastPoint = points[points.length - 1];
    const firstValue = dataPoints[0].value;
    const lastValue = dataPoints[dataPoints.length - 1].value;
    const change = lastValue - firstValue;
    const changePct = firstValue !== 0 ? (change / Math.abs(firstValue)) * 100 : 0;
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);

    const dots = points.map((p, i) => {
      if (i === points.length - 1 || i === 0) {
        return `<circle class="evo-dot" cx="${p.x}" cy="${p.y}" r="4"><title>${formatDate(toIsoDate(p.date))}: ${formatCurrency(p.value)}</title></circle>`;
      }
      return '';
    }).join('');

    container.innerHTML = `
      <svg class="evo-svg" viewBox="0 0 ${w} ${h}">
        <defs>
          <linearGradient id="evoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yLabels.join('')}
        <path class="evo-area" d="${areaD}"/>
        <path class="evo-line" d="${pathD}"/>
        ${dots}
        ${xLabels.join('')}
      </svg>
    `;

    if (statsContainer) {
      const isPositive = change >= 0;
      statsContainer.innerHTML = `
        <div class="evo-stat">
          <div class="evo-stat-label">Balance inicial</div>
          <div class="evo-stat-value">${formatCurrency(firstValue)}</div>
        </div>
        <div class="evo-stat">
          <div class="evo-stat-label">Balance actual</div>
          <div class="evo-stat-value ${lastValue >= 0 ? 'positive' : 'negative'}">${formatCurrency(lastValue)}</div>
        </div>
        <div class="evo-stat">
          <div class="evo-stat-label">Cambio</div>
          <div class="evo-stat-value ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${formatCurrency(change)}</div>
        </div>
        <div class="evo-stat">
          <div class="evo-stat-label">% Cambio</div>
          <div class="evo-stat-value ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePct.toFixed(1)}%</div>
        </div>
      `;
    }
  }

  function formatShortCurrency(amount) {
    const abs = Math.abs(amount);
    let formatted;
    if (abs >= 1000000) formatted = (amount / 1000000).toFixed(1) + 'M';
    else if (abs >= 1000) formatted = (amount / 1000).toFixed(0) + 'k';
    else formatted = Math.round(amount).toString();
    return (amount < 0 ? '-' : '') + '$' + formatted;
  }

  // ---- Quick Wins: Trends, Sparklines, Savings Rate ----

  function getCurrentPeriodRange() {
    if (state.selectedMonth) {
      const [year, month] = state.selectedMonth.split('-');
      const start = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const end = new Date(parseInt(year, 10), parseInt(month, 10), 0);
      return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
    }
    const periodValue = document.getElementById('periodSelect').value;
    return getDateRangeForPeriod(periodValue);
  }

  function getPreviousPeriodRange() {
    if (state.selectedMonth) {
      const [year, month] = state.selectedMonth.split('-');
      const prev = new Date(parseInt(year, 10), parseInt(month, 10) - 2, 1);
      const prevEnd = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 0);
      return { startDate: toIsoDate(prev), endDate: toIsoDate(prevEnd) };
    }
    const periodValue = document.getElementById('periodSelect').value;
    if (periodValue === 'all') return { startDate: null, endDate: null };

    const months = parseInt(periodValue, 10);
    const today = new Date();
    const endOfPrev = new Date(today.getFullYear(), today.getMonth() - months + 1, 0);
    const startOfPrev = new Date(endOfPrev.getFullYear(), endOfPrev.getMonth() - months + 1, 1);
    return { startDate: toIsoDate(startOfPrev), endDate: toIsoDate(endOfPrev) };
  }

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function calculatePeriodStats(range) {
    const stats = { totalIncome: 0, totalExpenses: 0, totalBalance: 0 };
    if (!range.startDate && !range.endDate) return stats;
    const txs = filterTransactionsByPeriod(state.transactions, range.startDate, range.endDate);
    txs.forEach(t => {
      if (t.category === 'Transferencia' || t.transferGroupId) return;
      if (t.type === 'income') stats.totalIncome += t.amount;
      else stats.totalExpenses += t.amount;
    });
    stats.totalBalance = stats.totalIncome - stats.totalExpenses;
    return stats;
  }

  function renderTrend(elementId, current, previous, lowerIsBetter) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (previous === 0 && current === 0) {
      el.className = 'trend flat';
      el.innerHTML = '';
      return;
    }

    if (previous === 0) {
      el.className = current > 0 ? 'trend up' : 'trend flat';
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17l10-10M17 7H9M17 7v8"/></svg>Nuevo';
      return;
    }

    const change = ((current - previous) / Math.abs(previous)) * 100;
    const isIncrease = change > 0;
    const arrowSvg = isIncrease
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 14l5-5 5 5"/></svg>'
      : (change < 0
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 10l5 5 5-5"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>');

    let isPositive;
    if (lowerIsBetter) {
      isPositive = change < 0;
    } else {
      isPositive = change > 0;
    }
    const stateClass = Math.abs(change) < 0.5 ? 'flat' : (isPositive ? 'up' : 'down');
    const sign = change > 0 ? '+' : '';

    el.className = `trend ${stateClass}`;
    el.innerHTML = `${arrowSvg}${sign}${change.toFixed(1)}%`;
  }

  function renderSavingsRate(currentIncome, currentExpenses) {
    const el = document.getElementById('savingsRate');
    if (!el) return;

    if (currentIncome <= 0) {
      el.className = 'savings-rate';
      el.textContent = '';
      return;
    }

    const rate = ((currentIncome - currentExpenses) / currentIncome) * 100;
    let cls = 'savings-rate';
    let label = '';
    if (rate >= 20) { cls += ' good'; label = 'Ahorro'; }
    else if (rate >= 0) { cls += ' warn'; label = 'Ahorro'; }
    else { cls += ' bad'; label = 'Déficit'; }

    const sign = rate > 0 ? '+' : '';
    el.className = cls;
    el.innerHTML = `${label} ${sign}${rate.toFixed(0)}%`;
  }

  function renderSparklines() {
    renderSparkline('incomeSparkline', 'income');
    renderSparkline('expenseSparkline', 'expense');
  }

  function renderSparkline(elementId, type) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const days = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toIsoDate(d);
      let total = 0;
      state.transactions.forEach(t => {
        if (t.date !== dateStr) return;
        if (t.category === 'Transferencia' || t.transferGroupId) return;
        if (t.type === type) total += t.amount;
      });
      data.push(total);
    }

    const max = Math.max(...data, 1);
    const w = 90;
    const h = 28;
    const pad = 2;
    const step = (w - pad * 2) / (data.length - 1);

    const points = data.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const areaPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

    const hasData = data.some(v => v > 0);
    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${hasData ? `<polygon class="spark-area" points="${areaPoints}"/>` : ''}
        <polyline class="spark-line" points="${hasData ? points : `${pad},${h/2} ${w - pad},${h/2}`}"/>
      </svg>
    `;
  }

  // ---- Keyboard Shortcuts ----

  function openShortcutsModal() {
    document.getElementById('shortcutsModal').classList.add('active');
  }

  function closeShortcutsModal() {
    document.getElementById('shortcutsModal').classList.remove('active');
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) {
        activeModal.classList.remove('active');
        e.preventDefault();
        return;
      }
      if (e.target && e.target.id === 'filterSearch' && state.filters.search) {
        document.getElementById('filterSearch').value = '';
        state.filters.search = '';
        renderTransactionList();
        e.target.blur();
        e.preventDefault();
        return;
      }
    }

    if (isTypingTarget(e.target)) return;

    if (document.querySelector('.modal-overlay.active')) return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    if (!e.shiftKey) {
      if (key === 'n') {
        e.preventDefault();
        openModal();
      } else if (key === 't') {
        e.preventDefault();
        if (state.wallets.length >= 2) {
          openTransferModal();
        } else {
          showToast('Necesitás al menos 2 billeteras para transferir', 'error');
        }
      } else if (key === 'd') {
        e.preventDefault();
        toggleDarkMode();
      } else if (key === 'g') {
        e.preventDefault();
        openGoalModal();
      } else if (e.key === '/') {
        e.preventDefault();
        switchTabAndRender('gastos');
        const search = document.getElementById('filterSearch');
        if (search) {
          setTimeout(() => { search.focus(); search.select(); }, 50);
        }
      }
    } else if (e.key === '?') {
      e.preventDefault();
      openShortcutsModal();
    }
  }

  window.app = {
    editTransaction,
    deleteTransaction,
    duplicateTransaction,
    openUpdateBroker,
    openEditWallet,
    deleteWallet,
    openUpdateBank,
    clearFilters,
    openShortcutsModal,
    closeShortcutsModal,
    editSubscription,
    deleteSubscription,
    markSubscriptionPaid,
    applyDatePreset,
    editGoal,
    deleteGoal,
    openContributeModal
  };

  document.addEventListener('DOMContentLoaded', init);
})();