/**
 * FinSight AI — API Client & Service Layer
 * Designed for seamless transition to Python FastAPI backend (e.g., http://localhost:8000/api/v1)
 * Currently backed by verified in-memory/localStorage state with simulated latency.
 */

import {
  initialTransactions,
  initialBills,
  initialBudgets,
  initialGoals,
  initialInsights,
  initialDocuments,
  analyticsMonthlyTrends,
  mockAdminStats,
  sampleAIQnA,
  Transaction,
  Bill,
  BudgetCategory,
  FinancialGoal,
  RecurringTransaction,
  DocumentItem,
  AdminStats
} from '../data/mockData';

const SIMULATED_LATENCY_MS = 150;
const delay = (ms: number = SIMULATED_LATENCY_MS) => new Promise(res => setTimeout(res, ms));

const SESSION_TOKEN_KEY = 'finsight_session_token';
let inMemoryToken: string | null = null;

export function setSessionToken(token: string | null): void {
  inMemoryToken = token;
  if (token) {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch {}
  } else {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {}
  }
}

export function getSessionToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const saved = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (saved) {
      inMemoryToken = saved;
      return saved;
    }
  } catch {}
  return null;
}

function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers = { ...customHeaders };
  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}


const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return RAW_API_BASE_URL ? `${RAW_API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export const api = {
  // 0. Server Health Check
  async checkHealth(): Promise<{ status: string; service: string; timestamp?: string } | null> {
    try {
      const res = await fetch(getApiUrl('/api/health'), { credentials: 'include' });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch {
      return null;
    }
  },

  // 0b. Database Health Check
  async checkDbHealth(): Promise<{ status: string; connected: boolean; service: string; database?: string; timestamp?: string; message?: string } | null> {
    try {
      const res = await fetch(getApiUrl('/api/db/health'), { credentials: 'include' });
      return await res.json();
    } catch {
      return null;
    }
  },

  // 0c. Server Authentication API (cookie-based session, credentials: 'include')
  async login(email: string, password: string): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Invalid email or password.' };
      }
      if (data.token) {
        setSessionToken(data.token);
      }
      return { success: true, user: data.user, token: data.token };
    } catch {
      return { success: false, error: 'Unable to reach the authentication service.' };
    }
  },

  async register(email: string, password: string, displayName: string, monthlyIncome?: number): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, displayName, monthlyIncome }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Registration failed.' };
      }
      if (data.token) {
        setSessionToken(data.token);
      }
      return { success: true, user: data.user, token: data.token };
    } catch {
      return { success: false, error: 'Unable to reach the authentication service.' };
    }
  },

  async getCurrentUser(): Promise<{ authenticated: boolean; user?: any }> {
    try {
      const res = await fetch(getApiUrl('/api/auth/me'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'authenticated' && data.user) {
          if (data.token) {
            setSessionToken(data.token);
          }
          return { authenticated: true, user: data.user };
        }
      }
      setSessionToken(null);
      return { authenticated: false };
    } catch {
      return { authenticated: false };
    }
  },

  async logout(): Promise<boolean> {
    try {
      const res = await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      setSessionToken(null);
      return res.ok;
    } catch {
      setSessionToken(null);
      return false;
    }
  },

  // 1. Transactions API (Server-backed with credentials: 'include')
  async getTransactions(limit: number = 5000, offset: number = 0): Promise<{ success: boolean; data?: Transaction[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/transactions?limit=${limit}&offset=${offset}`), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      if (!res.ok) {
        return { success: false, status: res.status, error: 'Failed to fetch transactions from server.' };
      }
      const data: Transaction[] = await res.json();
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network connection failed.' };
    }
  },

  async getTransactionById(id: string): Promise<{ success: boolean; data?: Transaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/transactions/${id}`), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      if (!res.ok) {
        return { success: false, status: res.status, error: 'Transaction not found.' };
      }
      const data: Transaction = await res.json();
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network connection failed.' };
    }
  },

  async createTransaction(tx: Omit<Transaction, 'id'> & { id?: string }): Promise<{ success: boolean; data?: Transaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/transactions'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(tx),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create transaction.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network connection failed.' };
    }
  },

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<{ success: boolean; data?: Transaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/transactions/${id}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update transaction.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network connection failed.' };
    }
  },

  async deleteTransaction(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/transactions/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete transaction.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network connection failed.' };
    }
  },

  async bulkCreateTransactions(
    transactions: Array<Omit<Transaction, 'id'> & { id?: string }>
  ): Promise<{ success: boolean; data?: Transaction[]; insertedCount?: number; skippedCount?: number; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/transactions/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ transactions, onConflict: 'skip' }),
      });

      const status = res.status;
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text || res.statusText };
      }

      if (!res.ok) {
        let msg = data?.message || res.statusText;
        if (status === 413) {
          msg = 'Payload Too Large (HTTP 413). The batch size exceeded server limits.';
        } else if (status === 401) {
          msg = 'Session expired or unauthenticated (HTTP 401). Please log in again.';
        }
        return { success: false, status, error: msg || `Bulk import failed with HTTP ${status}.` };
      }

      return {
        success: true,
        status,
        data: data.transactions,
        insertedCount: data.insertedCount ?? data.transactions?.length ?? 0,
        skippedCount: data.skippedCount ?? 0,
      };
    } catch (err: any) {
      return { success: false, error: err?.message ? `Network request failed: ${err.message}` : 'Network connection failed during bulk import.' };
    }
  },



  // 3. Budgets API (Authenticated PostgreSQL)
  async getBudgets(): Promise<{ success: boolean; data?: BudgetCategory[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/budgets'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to fetch budgets.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to budgets service.' };
    }
  },

  async createBudget(
    budget: Omit<BudgetCategory, 'id'> & { id?: string }
  ): Promise<{ success: boolean; data?: BudgetCategory; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/budgets'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(budget),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create budget.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to budgets service.' };
    }
  },

  async updateBudget(
    id: string,
    updates: Partial<BudgetCategory>
  ): Promise<{ success: boolean; data?: BudgetCategory; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/budgets/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update budget.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to budgets service.' };
    }
  },

  async deleteBudget(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/budgets/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete budget.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to connect to budgets service.' };
    }
  },

  async bulkCreateBudgets(
    budgets: Array<Omit<BudgetCategory, 'id'> & { id?: string }>
  ): Promise<{ success: boolean; data?: BudgetCategory[]; insertedCount?: number; skippedCount?: number; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/budgets/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ budgets, onConflict: 'skip' }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Bulk budget creation failed.' };
      }
      return {
        success: true,
        data: data.budgets,
        insertedCount: data.insertedCount ?? data.budgets?.length ?? 0,
        skippedCount: data.skippedCount ?? 0,
      };
    } catch {
      return { success: false, error: 'Failed to connect to budgets service during bulk import.' };
    }
  },

  // 4. Goals API (Authenticated PostgreSQL)
  async getGoals(): Promise<{ success: boolean; data?: FinancialGoal[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/goals'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to fetch goals.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to goals service.' };
    }
  },

  async createGoal(
    goal: Omit<FinancialGoal, 'id'> & { id?: string }
  ): Promise<{ success: boolean; data?: FinancialGoal; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/goals'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(goal),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create goal.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to goals service.' };
    }
  },

  async updateGoal(
    id: string,
    updates: Partial<FinancialGoal>
  ): Promise<{ success: boolean; data?: FinancialGoal; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/goals/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update goal.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to goals service.' };
    }
  },

  async deleteGoal(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/goals/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete goal.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to connect to goals service.' };
    }
  },

  async contributeToGoal(
    id: string,
    amount: number
  ): Promise<{ success: boolean; data?: FinancialGoal; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/goals/${encodeURIComponent(id)}/contribute`), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to contribute to goal.' };
      }
      return { success: true, data: data.goal };
    } catch {
      return { success: false, error: 'Failed to connect to goals service.' };
    }
  },

  async bulkCreateGoals(
    goals: Array<Omit<FinancialGoal, 'id'> & { id?: string }>
  ): Promise<{ success: boolean; data?: FinancialGoal[]; insertedCount?: number; skippedCount?: number; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/goals/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ goals, onConflict: 'skip' }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Bulk goal creation failed.' };
      }
      return {
        success: true,
        data: data.goals,
        insertedCount: data.insertedCount ?? data.goals?.length ?? 0,
        skippedCount: data.skippedCount ?? 0,
      };
    } catch {
      return { success: false, error: 'Failed to connect to goals service during bulk import.' };
    }
  },

  // 5. Bills API (Authenticated PostgreSQL)
  async getBills(): Promise<{ success: boolean; data?: Bill[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/bills'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to fetch bills.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to bills service.' };
    }
  },

  async createBill(
    bill: Omit<Bill, 'id'> & { id?: string }
  ): Promise<{ success: boolean; data?: Bill; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/bills'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(bill),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create bill.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to bills service.' };
    }
  },

  async updateBill(
    id: string,
    updates: Partial<Bill>
  ): Promise<{ success: boolean; data?: Bill; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/bills/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update bill.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to bills service.' };
    }
  },

  async deleteBill(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/bills/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete bill.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to connect to bills service.' };
    }
  },

  async bulkCreateBills(
    bills: Array<Omit<Bill, 'id'> & { id?: string }>
  ): Promise<{ success: boolean; data?: Bill[]; insertedCount?: number; skippedCount?: number; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/bills/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ bills, onConflict: 'skip' }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Bulk bill creation failed.' };
      }
      return {
        success: true,
        data: data.bills,
        insertedCount: data.insertedCount ?? data.bills?.length ?? 0,
        skippedCount: data.skippedCount ?? 0,
      };
    } catch {
      return { success: false, error: 'Failed to connect to bills service during bulk import.' };
    }
  },

  async payBill(
    id: string,
    overrides?: { paymentMethod?: string; date?: string }
  ): Promise<{
    success: boolean;
    data?: { bill: Bill; transaction: Transaction; alreadyPaid: boolean };
    error?: string;
    status?: number;
  }> {
    try {
      const res = await fetch(getApiUrl(`/api/bills/${encodeURIComponent(id)}/pay`), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(overrides || {}),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to record bill payment.' };
      }
      return {
        success: true,
        data: {
          bill: data.bill,
          transaction: data.transaction,
          alreadyPaid: Boolean(data.alreadyPaid),
        },
      };
    } catch {
      return { success: false, error: 'Failed to connect to bills service.' };
    }
  },

  // 6. Recurring Transactions API (Authenticated PostgreSQL)
  async getRecurringTransactions(): Promise<{ success: boolean; data?: RecurringTransaction[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/recurring-transactions'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Authentication required.' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to fetch recurring transactions.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  async createRecurringTransaction(
    item: Omit<RecurringTransaction, 'id'> & { id?: string }
  ): Promise<{ success: boolean; data?: RecurringTransaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/recurring-transactions'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(item),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create recurring transaction.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  async updateRecurringTransaction(
    id: string,
    updates: Partial<RecurringTransaction>
  ): Promise<{ success: boolean; data?: RecurringTransaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/recurring-transactions/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update recurring transaction.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  async toggleRecurringTransactionStatus(
    id: string,
    status: 'active' | 'paused'
  ): Promise<{ success: boolean; data?: RecurringTransaction; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/recurring-transactions/${encodeURIComponent(id)}/status`), {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update status.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  async processRecurringTransaction(
    id: string,
    confirmCreate?: boolean
  ): Promise<{
    success: boolean;
    data?: {
      recurring: RecurringTransaction;
      createdTransaction: Transaction | null;
      alreadyGenerated: boolean;
      requiresConfirmation: boolean;
      message: string;
    };
    error?: string;
    status?: number;
  }> {
    try {
      const res = await fetch(getApiUrl(`/api/recurring-transactions/${encodeURIComponent(id)}/process`), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ confirmCreate: Boolean(confirmCreate) }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to process recurring transaction.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  async deleteRecurringTransaction(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/recurring-transactions/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete recurring transaction.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to connect to recurring transactions service.' };
    }
  },

  // 7. Document Metadata API (Authenticated PostgreSQL)
  async getDocuments(): Promise<{ success: boolean; data?: DocumentItem[]; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/documents'), {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.status === 401) {
        return { success: false, status: 401, error: 'Unauthorized' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to fetch documents.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to documents service.' };
    }
  },

  async uploadDocumentFile(
    file: File
  ): Promise<{ success: boolean; data?: DocumentItem; ocrDetails?: any; error?: string; status?: number }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Note: Do not set Content-Type header when sending FormData so browser sets correct boundary
      const headers = getAuthHeaders();
      const res = await fetch(getApiUrl('/api/documents/upload'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: json.message || 'Document upload failed.' };
      }
      return { success: true, data: json.document, ocrDetails: json.ocrDetails };
    } catch {
      return { success: false, error: 'Network connection failed during document upload.' };
    }
  },

  async createTransactionFromDocument(
    docId: string,
    overrides?: {
      name?: string;
      amount?: number;
      category?: string;
      date?: string;
      taxAmount?: number;
      invoiceNumber?: string;
      paymentMethod?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; transaction?: Transaction; document?: DocumentItem; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/documents/${encodeURIComponent(docId)}/create-transaction`), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(overrides || {}),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create transaction from document.' };
      }
      return { success: true, transaction: data.transaction, document: data.document };
    } catch {
      return { success: false, error: 'Network connection failed while creating transaction from document.' };
    }
  },

  getDocumentFileUrl(docId: string): string {
    return getApiUrl(`/api/documents/${encodeURIComponent(docId)}/file`);
  },

  async createDocument(
    doc: Omit<DocumentItem, 'id'> & { id?: string }
  ): Promise<{ success: boolean; data?: DocumentItem; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/documents'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(doc),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to create document metadata.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to documents service.' };
    }
  },

  async updateDocument(
    id: string,
    updates: Partial<DocumentItem>
  ): Promise<{ success: boolean; data?: DocumentItem; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/documents/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Failed to update document metadata.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to documents service.' };
    }
  },

  async deleteDocument(id: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl(`/api/documents/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, status: res.status, error: data.message || 'Failed to delete document.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to connect to documents service.' };
    }
  },

  async bulkCreateDocuments(
    documents: Array<Omit<DocumentItem, 'id'> & { id?: string }>
  ): Promise<{ success: boolean; data?: DocumentItem[]; insertedCount?: number; skippedCount?: number; error?: string; status?: number }> {
    try {
      const res = await fetch(getApiUrl('/api/documents/bulk'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ documents, onConflict: 'skip' }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, status: res.status, error: data.message || 'Bulk document metadata creation failed.' };
      }
      return {
        success: true,
        data: data.documents,
        insertedCount: data.insertedCount ?? data.documents?.length ?? 0,
        skippedCount: data.skippedCount ?? 0,
      };
    } catch {
      return { success: false, error: 'Failed to connect to documents service during bulk import.' };
    }
  },

  // 7. Insights & Anomaly Detection
  async getInsights(): Promise<typeof initialInsights> {
    await delay();
    return [...initialInsights];
  },

  // 8. Analytics Trends
  async getAnalyticsTrends(): Promise<typeof analyticsMonthlyTrends> {
    await delay();
    return [...analyticsMonthlyTrends];
  },

  // 8. AI Assistant Conversational Engine
  async askAIAssistant(prompt: string) {
    await delay(350);
    const clean = prompt.toLowerCase();
    
    const matched = sampleAIQnA.find(q =>
      clean.includes(q.question.toLowerCase().slice(0, 15)) ||
      (clean.includes('dining') && q.question.toLowerCase().includes('dining')) ||
      (clean.includes('gadget') && q.question.toLowerCase().includes('gadget')) ||
      (clean.includes('save') && q.question.toLowerCase().includes('save')) ||
      (clean.includes('september') && q.question.toLowerCase().includes('september'))
    );

    if (matched) {
      return { answer: matched.answer, grounded: true };
    }

    return {
      answer: `FinSight AI ledger analysis: Review your primary discretionary outflows to maintain high savings rate liquidity.`,
      grounded: true,
    };
  },

  // 9. Admin Metrics
  async getAdminStats(): Promise<AdminStats> {
    await delay();
    return { ...mockAdminStats };
  },

  // 10. Machine Learning Expense Forecast (Phase 5)
  async getForecast(horizon: number = 4, endMonth?: string): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
    try {
      const queryParams = new URLSearchParams({ horizon: String(horizon) });
      if (endMonth) queryParams.set('endMonth', endMonth);
      const res = await fetch(getApiUrl(`/api/forecast?${queryParams.toString()}`), {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          error: data.message || 'Failed to fetch ML expense forecast.',
        };
      }
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: 'Failed to connect to ML forecasting service.',
      };
    }
  },

  async getForecastModels(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(getApiUrl('/api/forecast/models'), {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Failed to fetch forecast models.' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Failed to connect to forecast service.' };
    }
  },

  // 9. Conversational Financial Intelligence API (Grounded Chatbot)
  async sendChatMessage(
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    clientDate?: string,
    mode?: 'auto' | 'gemini' | 'engine'
  ): Promise<{
    success: boolean;
    reply?: string;
    grounded?: boolean;
    engineUsed?: 'gemini' | 'grounded-engine';
    mode?: 'auto' | 'gemini' | 'engine';
    summary?: any;
    error?: string;
    status?: number;
  }> {
    try {
      const res = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          message,
          history,
          clientDate: clientDate || new Date().toISOString(),
          mode: mode || 'auto',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          error: data.message || 'Failed to process financial query.',
        };
      }
      return {
        success: true,
        reply: data.reply,
        grounded: data.grounded,
        engineUsed: data.engineUsed,
        mode: data.mode,
        summary: data.summary,
      };
    } catch {
      return {
        success: false,
        error: 'Network connection failed while reaching FinSight AI assistant.',
      };
    }
  },

  async getChatContext(): Promise<{
    success: boolean;
    summary?: any;
    error?: string;
  }> {
    try {
      const res = await fetch(getApiUrl('/api/chat/context'), {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || 'Failed to fetch chat context.' };
      }
      return { success: true, summary: data.summary };
    } catch {
      return { success: false, error: 'Failed to connect to assistant service.' };
    }
  },
};
