/**
 * Expense Tracker Frontend Application
 *
 * This JavaScript application provides a complete CRUD interface for managing expenses.
 * It communicates with the ExpenseTracker API backend.
 */

// API Configuration
// Auto-detect environment: local dev talks to the local API over HTTPS,
// anywhere else (the published site) talks to the published API, which
// serves the frontend itself so requests there are same-origin.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_ROOT = IS_LOCAL ? 'https://localhost:7109' : 'http://joelegend.runasp.net/';
const API_BASE_URL = `${API_ROOT}/api/expenses`;
const AUTH_BASE_URL = `${API_ROOT}/api/auth`;

// State Management
let expenses = [];
let editingExpenseId = null;
let deleteExpenseId = null;
let pendingChallengeToken = null;

// DOM Elements
const elements = {
    // Screens
    authView: document.getElementById('authView'),
    appView: document.getElementById('appView'),

    // Login form
    loginSection: document.getElementById('loginSection'),
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    showRegisterLink: document.getElementById('showRegisterLink'),

    // Register form
    registerSection: document.getElementById('registerSection'),
    registerForm: document.getElementById('registerForm'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerError: document.getElementById('registerError'),
    showLoginLink: document.getElementById('showLoginLink'),

    // Two-factor verification form (login step 2)
    twoFactorSection: document.getElementById('twoFactorSection'),
    twoFactorForm: document.getElementById('twoFactorForm'),
    twoFactorCode: document.getElementById('twoFactorCode'),
    twoFactorError: document.getElementById('twoFactorError'),
    cancelTwoFactorLink: document.getElementById('cancelTwoFactorLink'),

    // Logout
    logoutBtn: document.getElementById('logoutBtn'),

    // Form elements
    expenseForm: document.getElementById('expenseForm'),
    expenseId: document.getElementById('expenseId'),
    amount: document.getElementById('amount'),
    category: document.getElementById('category'),
    date: document.getElementById('date'),
    description: document.getElementById('description'),
    submitBtn: document.getElementById('submitBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    formTitle: document.getElementById('formTitle'),

    // Error elements
    amountError: document.getElementById('amountError'),
    categoryError: document.getElementById('categoryError'),

    // List elements
    loadingIndicator: document.getElementById('loadingIndicator'),
    errorContainer: document.getElementById('errorContainer'),
    errorMessage: document.getElementById('errorMessage'),
    emptyState: document.getElementById('emptyState'),
    tableContainer: document.getElementById('tableContainer'),
    expensesTableBody: document.getElementById('expensesTableBody'),
    retryBtn: document.getElementById('retryBtn'),

    // Total display
    totalAmount: document.getElementById('totalAmount'),

    // Modal elements
    deleteModal: document.getElementById('deleteModal'),
    deleteDetail: document.getElementById('deleteDetail'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),

    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

/**
 * Auth Service - Handles registration, login, logout, and token storage
 */
const AuthService = {
    TOKEN_KEY: 'expenseTracker_token',

    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },

    setToken(token) {
        localStorage.setItem(this.TOKEN_KEY, token);
    },

    clearToken() {
        localStorage.removeItem(this.TOKEN_KEY);
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    async register(email, password) {
        const response = await fetch(`${AUTH_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            throw new Error('Registration failed. Please check your email and password.');
        }
    },

    async login(email, password) {
        const response = await fetch(`${AUTH_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            throw new Error('Invalid email or password.');
        }

        const result = await response.json();

        // Only a non-2FA login carries a usable token at this point — a 2FA
        // account instead returns a short-lived challengeToken, and the real
        // token only arrives once verifyTwoFactor() succeeds.
        if (!result.requiresTwoFactor) {
            this.setToken(result.token.token);
        }

        return result;
    },

    async verifyTwoFactor(challengeToken, code) {
        const response = await fetch(`${AUTH_BASE_URL}/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken, code })
        });

        if (!response.ok) {
            throw new Error('Invalid or expired code. Please try again.');
        }

        const token = await response.json();
        this.setToken(token.token);
    },

    logout() {
        this.clearToken();
    }
};

/**
 * API Service - Handles all communication with the backend
 */
const ApiService = {
    /**
     * Make an HTTP request to the API
     * @param {string} endpoint - API endpoint
     * @param {string} method - HTTP method
     * @param {Object} body - Request body
     * @returns {Promise} Response data
     */
    async request(endpoint, method = 'GET', body = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AuthService.getToken()}`
            }
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);

            if (response.status === 401) {
                AuthService.logout();
                App.showAuthView();
                throw new Error('Your session has expired. Please log in again.');
            }

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.errors) {
                        errorMessage = Object.values(errorJson.errors).flat().join(', ');

                    } else if (errorJson.message) {
                        errorMessage = errorJson.message;
                    }
                } catch (e) {
                    // Keep the default error message
                }

                throw new Error(errorMessage);
            }

            // For DELETE and UPDATE (204 No Content), return null
            if (response.status === 204) {
                return null;
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error('Unable to connect to the server. Please ensure the API is running.');
            }
            throw error;
        }
    },

    /**
     * Get all expenses
     * @returns {Promise<Array>} List of expenses
     */
    async getAllExpenses() {
        return await this.request('');
    },

    /**
     * Get summary (total spent)
     * @returns {Promise<Object>} Summary data
     */
    async getSummary() {
        return await this.request('/summary');
    },

    /**
     * Create a new expense
     * @param {Object} expenseData - Expense data
     * @returns {Promise<Object>} Created expense
     */
    async createExpense(expenseData) {
        return await this.request('', 'POST', expenseData);
    },

    /**
     * Update an expense
     * @param {string} id - Expense ID
     * @param {Object} expenseData - Updated expense data
     * @returns {Promise<null>}
     */
    async updateExpense(id, expenseData) {
        return await this.request(`/${id}`, 'PUT', expenseData);
    },

    /**
     * Delete an expense
     * @param {string} id - Expense ID
     * @returns {Promise<null>}
     */
    async deleteExpense(id) {
        return await this.request(`/${id}`, 'DELETE');
    }
};

/**
 * UI Service - Handles all UI updates and interactions
 */
const UIService = {
    /**
     * Show the auth screen (login/register), hide the app
     */
    showAuthScreen() {
        elements.authView.style.display = 'block';
        elements.appView.style.display = 'none';
    },

    /**
     * Show the app screen, hide the auth screen
     */
    showAppScreen() {
        elements.authView.style.display = 'none';
        elements.appView.style.display = 'block';
    },

    /**
     * Show the login form (and only the login form) within the auth view
     */
    showLoginForm() {
        elements.loginSection.style.display = 'block';
        elements.registerSection.style.display = 'none';
        elements.twoFactorSection.style.display = 'none';
    },

    /**
     * Show the register form (and only the register form) within the auth view
     */
    showRegisterForm() {
        elements.loginSection.style.display = 'none';
        elements.registerSection.style.display = 'block';
        elements.twoFactorSection.style.display = 'none';
    },

    /**
     * Show the two-factor verification form (and only that form) within the auth view
     */
    showTwoFactorForm() {
        elements.loginSection.style.display = 'none';
        elements.registerSection.style.display = 'none';
        elements.twoFactorSection.style.display = 'block';
    },

    /**
     * Show loading state
     */
    showLoading() {
        elements.loadingIndicator.style.display = 'flex';
        elements.errorContainer.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.tableContainer.style.display = 'none';
    },

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        elements.loadingIndicator.style.display = 'none';
        elements.errorContainer.style.display = 'flex';
        elements.errorMessage.textContent = message;
        elements.emptyState.style.display = 'none';
        elements.tableContainer.style.display = 'none';
    },

    /**
     * Show empty state
     */
    showEmptyState() {
        elements.loadingIndicator.style.display = 'none';
        elements.errorContainer.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        elements.tableContainer.style.display = 'none';
    },

    /**
     * Show table with expenses
     */
    showTable() {
        elements.loadingIndicator.style.display = 'none';
        elements.errorContainer.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.tableContainer.style.display = 'block';
    },

    /**
     * Format currency amount
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount) {
        return `₦${parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
    },

    /**
     * Format date for display
     * @param {string} dateStr - Date string
     * @returns {string} Formatted date
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    },

    /**
     * Render expenses list
     */
    renderExpenses() {
        if (expenses.length === 0) {
            this.showEmptyState();
            return;
        }

        this.showTable();

        // Sort expenses by date (newest first)
        const sortedExpenses = [...expenses].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        elements.expensesTableBody.innerHTML = sortedExpenses.map(expense => `
            <tr data-id="${expense.id}">
                <td data-label="Date">${this.formatDate(expense.date)}</td>
                <td data-label="Category">
                    <span class="category-badge">${this.escapeHtml(expense.category)}</span>
                </td>
                <td data-label="Description">
                    <span class="description-cell" title="${this.escapeHtml(expense.description || '')}">
                        ${this.escapeHtml(expense.description || '-')}
                    </span>
                </td>
                <td data-label="Amount">
                    <span class="amount-cell">${this.formatCurrency(expense.amount)}</span>
                </td>
                <td data-label="Actions">
                    <div class="actions-cell">
                        <button class="btn btn-primary btn-sm edit-btn" data-id="${expense.id}" title="Edit">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${expense.id}" title="Delete">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Add event listeners to edit and delete buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editExpense(btn.dataset.id));
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showDeleteConfirmation(btn.dataset.id));
        });
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Update total amount display
     * @param {number} total - Total amount
     */
    updateTotal(total) {
        elements.totalAmount.textContent = this.formatCurrency(total);
    },

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (success, error, info)
     */
    showToast(message, type = 'info') {
        elements.toast.className = `toast ${type}`;
        elements.toastMessage.textContent = message;
        elements.toast.classList.add('show');

        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    },

    /**
     * Clear form fields
     */
    clearForm() {
        elements.expenseForm.reset();
        elements.expenseId.value = '';
        elements.date.value = '';
        editingExpenseId = null;
        elements.formTitle.textContent = 'Add New Expense';
        elements.submitBtn.textContent = 'Add Expense';
        elements.cancelBtn.style.display = 'none';
        this.clearErrors();
    },

    /**
     * Populate form for editing
     * @param {Object} expense - Expense to edit
     */
    populateForm(expense) {
        elements.expenseId.value = expense.id;
        elements.amount.value = expense.amount;
        elements.category.value = expense.category;
        elements.date.value = expense.date ? expense.date.split('T')[0] : '';
        elements.description.value = expense.description || '';
        editingExpenseId = expense.id;
        elements.formTitle.textContent = 'Edit Expense';
        elements.submitBtn.textContent = 'Update Expense';
        elements.cancelBtn.style.display = 'inline-block';
        this.clearErrors();
    },

    /**
     * Clear form error messages
     */
    clearErrors() {
        elements.amountError.textContent = '';
        elements.categoryError.textContent = '';
        elements.amount.classList.remove('error');
        elements.category.classList.remove('error');
    },

    /**
     * Validate form
     * @returns {boolean} Whether form is valid
     */
    validateForm() {
        let isValid = true;
        this.clearErrors();

        const amount = parseFloat(elements.amount.value);
        if (isNaN(amount) || amount <= 0) {
            elements.amountError.textContent = 'Please enter a valid amount greater than zero.';
            elements.amount.classList.add('error');
            isValid = false;
        }

        if (!elements.category.value.trim()) {
            elements.categoryError.textContent = 'Please select a category.';
            elements.category.classList.add('error');
            isValid = false;
        }

        return isValid;
    },

    /**
     * Show delete confirmation modal
     * @param {string} id - Expense ID to delete
     */
    showDeleteConfirmation(id) {
        const expense = expenses.find(e => e.id === id);
        if (!expense) return;

        deleteExpenseId = id;
        elements.deleteDetail.textContent = `${this.formatCurrency(expense.amount)} - ${expense.category}`;
        elements.deleteModal.style.display = 'flex';
    },

    /**
     * Hide delete confirmation modal
     */
    hideDeleteModal() {
        elements.deleteModal.style.display = 'none';
        deleteExpenseId = null;
    },

    /**
     * Edit expense - populate form with expense data
     * @param {string} id - Expense ID
     */
    editExpense(id) {
        const expense = expenses.find(e => e.id === id);
        if (!expense) return;

        this.populateForm(expense);

        // Scroll to form
        elements.formSection = document.querySelector('.form-section');
        elements.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

/**
 * Application Controller - Handles application logic
 */
const App = {
    /**
     * Initialize the application
     */
    async init() {
        this.bindEvents();

        if (AuthService.isAuthenticated()) {
            this.showAppView();
            await this.loadExpenses();
            await this.loadTotal();
        } else {
            this.showAuthView();
        }
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Auth forms
        elements.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        elements.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        elements.showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            UIService.showRegisterForm();
        });
        elements.showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            UIService.showLoginForm();
        });
        elements.twoFactorForm.addEventListener('submit', (e) => this.handleVerifyTwoFactor(e));
        elements.cancelTwoFactorLink.addEventListener('click', (e) => this.handleCancelTwoFactor(e));
        elements.logoutBtn.addEventListener('click', () => this.handleLogout());

        // Form submission
        elements.expenseForm.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Cancel edit button
        elements.cancelBtn.addEventListener('click', () => UIService.clearForm());

        // Retry button
        elements.retryBtn.addEventListener('click', () => this.loadExpenses());

        // Delete confirmation buttons
        elements.confirmDeleteBtn.addEventListener('click', () => this.handleDelete());
        elements.cancelDeleteBtn.addEventListener('click', () => UIService.hideDeleteModal());

        // Close modal on overlay click
        elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === elements.deleteModal) {
                UIService.hideDeleteModal();
            }
        });

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        elements.date.value = today;
    },

    /**
     * Show the auth screen
     */
    showAuthView() {
        UIService.showAuthScreen();
    },

    /**
     * Show the app screen
     */
    showAppView() {
        UIService.showAppScreen();
    },

    /**
     * Handle login form submission
     * @param {Event} e - Submit event
     */
    async handleLogin(e) {
        e.preventDefault();
        elements.loginError.textContent = '';

        try {
            const result = await AuthService.login(elements.loginEmail.value.trim(), elements.loginPassword.value);
            elements.loginForm.reset();

            if (result.requiresTwoFactor) {
                pendingChallengeToken = result.challengeToken;
                UIService.showTwoFactorForm();
                UIService.showToast('A verification code has been sent to your email.', 'info');
                return;
            }

            this.showAppView();
            await this.loadExpenses();
            await this.loadTotal();
        } catch (error) {
            elements.loginError.textContent = error.message;
        }
    },

    /**
     * Handle two-factor code submission (login step 2)
     * @param {Event} e - Submit event
     */
    async handleVerifyTwoFactor(e) {
        e.preventDefault();
        elements.twoFactorError.textContent = '';

        if (!pendingChallengeToken) {
            elements.twoFactorError.textContent = 'Your session expired. Please log in again.';
            return;
        }

        try {
            await AuthService.verifyTwoFactor(pendingChallengeToken, elements.twoFactorCode.value.trim());
            pendingChallengeToken = null;
            elements.twoFactorForm.reset();
            this.showAppView();
            await this.loadExpenses();
            await this.loadTotal();
        } catch (error) {
            elements.twoFactorError.textContent = error.message;
        }
    },

    /**
     * Cancel an in-progress two-factor login and return to the login form
     * @param {Event} e - Click event
     */
    handleCancelTwoFactor(e) {
        e.preventDefault();
        pendingChallengeToken = null;
        elements.twoFactorForm.reset();
        UIService.showLoginForm();
    },

    /**
     * Handle register form submission
     * @param {Event} e - Submit event
     */
    async handleRegister(e) {
        e.preventDefault();
        elements.registerError.textContent = '';

        try {
            await AuthService.register(elements.registerEmail.value.trim(), elements.registerPassword.value);
            elements.registerForm.reset();
            UIService.showToast('Account created — please log in.', 'success');
            UIService.showLoginForm();
        } catch (error) {
            elements.registerError.textContent = error.message;
        }
    },

    /**
     * Handle logout
     */
    handleLogout() {
        AuthService.logout();
        expenses = [];
        pendingChallengeToken = null;
        this.showAuthView();
    },

    /**
     * Load expenses from API
     */
    async loadExpenses() {
        UIService.showLoading();

        try {
            const result = await ApiService.getAllExpenses();
            expenses = result.items;
            UIService.renderExpenses();
        } catch (error) {
            console.error('Error loading expenses:', error);
            UIService.showError(`Failed to load expenses: ${error.message}`);
        }
    },

    /**
     * Load total from API
     */
    async loadTotal() {
        try {
            const summary = await ApiService.getSummary();
            UIService.updateTotal(summary.totalSpent);
        } catch (error) {
            console.error('Error loading total:', error);
            // Don't show error for total, just set to 0
            UIService.updateTotal(0);
        }
    },

    /**
     * Handle form submission (create or update)
     * @param {Event} e - Submit event
     */
    async handleFormSubmit(e) {
        e.preventDefault();

        if (!UIService.validateForm()) {
            return;
        }

        const expenseData = {
            amount: parseFloat(elements.amount.value),
            category: elements.category.value.trim(),
            date: elements.date.value ? new Date(elements.date.value).toISOString() : new Date().toISOString(),
            description: elements.description.value.trim() || null
        };

        // Disable submit button during request
        elements.submitBtn.disabled = true;
        const originalText = elements.submitBtn.textContent;
        elements.submitBtn.textContent = 'Saving...';

        try {
            if (editingExpenseId) {
                // Update existing expense
                await ApiService.updateExpense(editingExpenseId, expenseData);
                UIService.showToast('Expense updated successfully!', 'success');
            } else {
                // Create new expense
                await ApiService.createExpense(expenseData);
                UIService.showToast('Expense added successfully!', 'success');
            }

            // Reload data
            await this.loadExpenses();
            await this.loadTotal();

            // Clear form
            UIService.clearForm();

            // Set default date back to today
            const today = new Date().toISOString().split('T')[0];
            elements.date.value = today;

        } catch (error) {
            console.error('Error saving expense:', error);
            UIService.showToast(`Failed to save expense: ${error.message}`, 'error');
        } finally {
            elements.submitBtn.disabled = false;
            elements.submitBtn.textContent = originalText;
        }
    },

    /**
     * Handle expense deletion
     */
    async handleDelete() {
        if (!deleteExpenseId) return;

        // Disable button during request
        elements.confirmDeleteBtn.disabled = true;
        const originalText = elements.confirmDeleteBtn.textContent;
        elements.confirmDeleteBtn.textContent = 'Deleting...';

        try {
            await ApiService.deleteExpense(deleteExpenseId);
            UIService.showToast('Expense deleted successfully!', 'success');
            UIService.hideDeleteModal();

            // Reload data
            await this.loadExpenses();
            await this.loadTotal();

        } catch (error) {
            console.error('Error deleting expense:', error);
            UIService.showToast(`Failed to delete expense: ${error.message}`, 'error');
        } finally {
            elements.confirmDeleteBtn.disabled = false;
            elements.confirmDeleteBtn.textContent = originalText;
        }
    }
};

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Handle keyboard events for accessibility
document.addEventListener('keydown', (e) => {
    // Close modal on Escape key
    if (e.key === 'Escape' && elements.deleteModal.style.display === 'flex') {
        UIService.hideDeleteModal();
    }
});
