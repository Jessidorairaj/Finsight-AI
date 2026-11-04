import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Transaction,
  Bill,
  BudgetCategory,
  FinancialGoal,
  RecurringTransaction,
  DocumentItem,
  initialTransactions,
  initialBills,
  initialBudgets,
  initialGoals,
  initialDocuments,
  CATEGORY_COLORS
} from '../data/mockData';
import {
  calculateSpendingTrendDatasets,
  SpendingTrendPoint,
  calculateTopMerchants,
  MerchantSpendingPoint,
  calculateSpendingVolatility,
  SpendingVolatilityResult,
  calculateHistoricalPeriodComparison,
  HistoricalPeriodComparison,
} from '../services/financialAggregator';
import {
  generateDynamicMonthOptions,
  getCurrentMonthLabel,
  isTransactionInSelectedMonth,
  MonthOption,
  formatStandardDate,
  parseTransactionDate,
} from '../utils/dateUtils';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

export interface CategorySummary {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface BudgetWithSpent extends BudgetCategory {
  spent: number;
  percentageUsed: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  remaining: number;
}

export interface LocalRecoveryCandidate {
  tx: Transaction;
  isDuplicate: boolean;
}

export interface LocalRecoveryStatus {
  hasLocalData: boolean;
  totalLocalCount: number;
  localCount: number;
  importableCandidates: Transaction[];
  importableCount: number;
  duplicateCount: number;
  totalImportableExpense: number;
  totalImportableIncome: number;
  totalExpense: number;
  totalIncome: number;
  candidates: LocalRecoveryCandidate[];
}

export interface LocalBudgetCandidate {
  item: BudgetCategory;
  isDuplicate: boolean;
}

export interface LocalBudgetRecoveryStatus {
  hasLocalData: boolean;
  totalLocalCount: number;
  localCount: number;
  duplicateCount: number;
  importableCount: number;
  importableCandidates: BudgetCategory[];
  totalAllocated: number;
  candidates: LocalBudgetCandidate[];
}

export interface LocalGoalCandidate {
  item: FinancialGoal;
  isDuplicate: boolean;
}

export interface LocalGoalRecoveryStatus {
  hasLocalData: boolean;
  totalLocalCount: number;
  localCount: number;
  duplicateCount: number;
  importableCount: number;
  importableCandidates: FinancialGoal[];
  totalTargetAmount: number;
  totalCurrentAmount: number;
  candidates: LocalGoalCandidate[];
}

export interface LocalBillCandidate {
  item: Bill;
  isDuplicate: boolean;
}

export interface LocalBillRecoveryStatus {
  hasLocalData: boolean;
  totalLocalCount: number;
  localCount: number;
  duplicateCount: number;
  importableCount: number;
  importableCandidates: Bill[];
  totalAmount: number;
  candidates: LocalBillCandidate[];
}

export interface LocalDocumentCandidate {
  item: DocumentItem;
  isDuplicate: boolean;
}

export interface LocalDocumentRecoveryStatus {
  hasLocalData: boolean;
  totalLocalCount: number;
  localCount: number;
  duplicateCount: number;
  importableCount: number;
  importableCandidates: DocumentItem[];
  totalDetectedAmount: number;
  candidates: LocalDocumentCandidate[];
}

interface FinancialContextType {
  // Global Month Selection
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  availableMonths: MonthOption[];
  selectedMonthTransactions: Transaction[];

  // Raw records
  transactions: Transaction[];
  budgets: BudgetCategory[];
  goals: FinancialGoal[];
  bills: Bill[];
  recurringTransactions: RecurringTransaction[];
  documents: DocumentItem[];

  // Transaction server state & actions
  transactionsLoading: boolean;
  transactionsError: string | null;
  refreshTransactions: () => Promise<void>;

  // Budget server state & actions
  budgetsLoading: boolean;
  budgetsError: string | null;
  refreshBudgets: () => Promise<void>;

  // Goal server state & actions
  goalsLoading: boolean;
  goalsError: string | null;
  refreshGoals: () => Promise<void>;

  // Bill server state & actions
  billsLoading: boolean;
  billsError: string | null;
  refreshBills: () => Promise<void>;

  // Recurring transactions server state & actions
  recurringLoading: boolean;
  recurringError: string | null;
  refreshRecurringTransactions: () => Promise<void>;

  // In-app bill reminder & notification preferences
  reminderPreferences: {
    reminderDays: number;
    notifyOverdue: boolean;
    notifyUpcoming: boolean;
  };
  updateReminderPreferences: (prefs: Partial<{ reminderDays: number; notifyOverdue: boolean; notifyUpcoming: boolean }>) => void;

  // Document server state & actions
  documentsLoading: boolean;
  documentsError: string | null;
  refreshDocuments: () => Promise<void>;

  // Local storage recovery & cloud migration
  localRecoveryStatus: LocalRecoveryStatus;
  importLocalTransactionsToCloud: () => Promise<{ success: boolean; importedCount: number; backupKey: string; error?: string }>;

  localBudgetRecoveryStatus: LocalBudgetRecoveryStatus;
  importLocalBudgetsToCloud: () => Promise<{ success: boolean; importedCount: number; backupKey: string; error?: string }>;

  localGoalRecoveryStatus: LocalGoalRecoveryStatus;
  importLocalGoalsToCloud: () => Promise<{ success: boolean; importedCount: number; backupKey: string; error?: string }>;

  localBillRecoveryStatus: LocalBillRecoveryStatus;
  importLocalBillsToCloud: () => Promise<{ success: boolean; importedCount: number; backupKey: string; error?: string }>;

  localDocumentRecoveryStatus: LocalDocumentRecoveryStatus;
  importLocalDocumentsToCloud: () => Promise<{ success: boolean; importedCount: number; backupKey: string; error?: string }>;

  // Dynamically derived totals
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  predictedNextMonthExpense: number;
  predictedExpenseTrend: string;
  categoryBreakdown: CategorySummary[];
  budgetsWithSpent: BudgetWithSpent[];
  recentTransactions: Transaction[];
  spendingTrendDatasets: Record<'1D' | '1W' | '1M' | '1Y', Array<{ date: string; amount: number; baseline?: number }>>;
  forecastSparkline: Array<{ day: string; value: number }>;
  topMerchants: MerchantSpendingPoint[];
  spendingVolatility: SpendingVolatilityResult;
  periodComparison: HistoricalPeriodComparison | null;

  // Transaction mutations
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<Transaction>;
  addTransactions: (
    txs: Array<Omit<Transaction, 'id'> & { id?: string }>,
    options?: {
      batchSize?: number;
      onProgress?: (progress: {
        currentBatch: number;
        totalBatches: number;
        importedCount: number;
        processedCount: number;
        totalCount: number;
        batchSize: number;
      }) => void;
    }
  ) => Promise<Transaction[]>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Budget mutations
  updateBudgetLimit: (id: string, newLimit: number) => Promise<void>;
  updateBudget: (id: string, updates: Partial<BudgetCategory>) => Promise<void>;
  addBudgetCategory: (
    category: string,
    allocated: number,
    color?: string,
    suggestedByAI?: number,
    month?: string
  ) => Promise<BudgetCategory>;
  deleteBudget: (id: string) => Promise<void>;

  // Goal mutations
  createGoal: (goal: Omit<FinancialGoal, 'id'>) => Promise<FinancialGoal>;
  updateGoal: (id: string, updates: Partial<FinancialGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  contributeToGoal: (id: string, amount: number) => Promise<void>;

  // Bill mutations
  payBill: (id: string, overrides?: { paymentMethod?: string; date?: string }) => Promise<{ bill: Bill; transaction: Transaction; alreadyPaid: boolean }>;
  addBill: (bill: Omit<Bill, 'id'> & { id?: string }) => Promise<Bill>;
  updateBill: (id: string, updates: Partial<Bill>) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;

  // Recurring transaction mutations
  addRecurringTransaction: (item: Omit<RecurringTransaction, 'id'> & { id?: string }) => Promise<RecurringTransaction>;
  updateRecurringTransaction: (id: string, updates: Partial<RecurringTransaction>) => Promise<void>;
  toggleRecurringTransactionStatus: (id: string, status: 'active' | 'paused') => Promise<void>;
  processRecurringTransaction: (
    id: string,
    confirmCreate?: boolean
  ) => Promise<{
    recurring: RecurringTransaction;
    createdTransaction: Transaction | null;
    alreadyGenerated: boolean;
    requiresConfirmation: boolean;
    message: string;
  }>;
  deleteRecurringTransaction: (id: string) => Promise<void>;

  // Document mutations
  uploadDocument: (file: File) => Promise<DocumentItem>;
  updateDocument: (id: string, updates: Partial<DocumentItem>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  convertDocumentToTransaction: (
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
  ) => Promise<Transaction | null>;

  // State management
  resetToSampleData: () => void;
}

const STORAGE_KEYS = {
  TRANSACTIONS: 'finsight_transactions_v2',
  BUDGETS: 'finsight_budgets_v2',
  GOALS: 'finsight_goals_v2',
  BILLS: 'finsight_bills_v2',
  DOCUMENTS: 'finsight_documents_v2',
  SELECTED_MONTH: 'finsight_selected_month_v2',
  SERVER_TX_CACHE: 'finsight_server_transactions_cache_v2',
};

// Collision-proof unique ID generator with timestamp, random salt, and counter
let idCounter = 0;
const generateUniqueId = (prefix: string = 'id'): string => {
  idCounter += 1;
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${Date.now()}_${idCounter}_${rand}`;
};

const FinancialContext = createContext<FinancialContextType | undefined>(undefined);

export const FinancialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Dynamic Month Selector state with persistent user preference
  const [selectedMonth, setSelectedMonthState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_MONTH);
      if (saved && saved.trim()) {
        return saved.trim();
      }
    } catch { }
    return getCurrentMonthLabel();
  });

  const setSelectedMonth = (month: string) => {
    setSelectedMonthState(month);
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_MONTH, month);
    } catch { }
  };

  const getUserTxStorageKey = (userId?: string) => {
    return userId ? `finsight_local_txs_${userId}` : 'finsight_local_txs_guest';
  };

  // Local transactions stored in localStorage (strictly user-scoped; never pre-seeded with mock transactions)
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => {
    return [];
  });

  // Load user-scoped local offline transactions on session change
  useEffect(() => {
    try {
      const key = getUserTxStorageKey(user?.id);
      const saved = localStorage.getItem(key);
      if (saved) {
        const list: Transaction[] = JSON.parse(saved);
        if (Array.isArray(list)) {
          // Filter out any mock transactions so they never leak as offline user data
          const mockIds = new Set(initialTransactions.map(t => t.id));
          const genuine = list.filter(t => !mockIds.has(t.id));
          setLocalTransactions(genuine);
          return;
        }
      }
    } catch { }
    setLocalTransactions([]);
  }, [user?.id]);

  // Persist user-scoped local offline transactions
  useEffect(() => {
    try {
      const key = getUserTxStorageKey(user?.id);
      if (localTransactions.length > 0) {
        const mockIds = new Set(initialTransactions.map(t => t.id));
        const genuine = localTransactions.filter(t => !mockIds.has(t.id));
        if (genuine.length > 0) {
          localStorage.setItem(key, JSON.stringify(genuine));
        } else {
          localStorage.removeItem(key);
        }
      } else {
        localStorage.removeItem(key);
      }
    } catch { }
  }, [localTransactions, user?.id]);

  // Server transactions (authoritative when authenticated, initialized from session cache to avoid flickers)
  const [serverTransactions, setServerTransactions] = useState<Transaction[]>(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEYS.SERVER_TX_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return [...parsed].sort((a, b) => {
            const da = parseTransactionDate(a.date)?.getTime() || 0;
            const db = parseTransactionDate(b.date)?.getTime() || 0;
            if (db !== da) return db - da;
            return (b.id || '').localeCompare(a.id || '');
          });
        }
      }
    } catch { }
    return [];
  });
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  // Active transactions: strictly server-backed if authenticated, safe empty while auth verifying, local backup when unauthenticated
  const transactions = useMemo(() => {
    if (authLoading) {
      return serverTransactions.length > 0 ? serverTransactions : [];
    }
    return isAuthenticated ? serverTransactions : localTransactions;
  }, [authLoading, isAuthenticated, serverTransactions, localTransactions]);

  // Dynamically calculated month options: All Time, dynamic 4-month window, historical months, and preserved selection
  const availableMonths = useMemo<MonthOption[]>(() => {
    return generateDynamicMonthOptions(new Date(), transactions, selectedMonth);
  }, [transactions, selectedMonth]);

  // Refresh server transactions on login / session restoration
  const refreshTransactions = async () => {
    if (!isAuthenticated) return;
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const res = await api.getTransactions(5000, 0);
      if (res.success && res.data) {
        const sortedData = [...res.data].sort((a, b) => {
          const da = parseTransactionDate(a.date)?.getTime() || 0;
          const db = parseTransactionDate(b.date)?.getTime() || 0;
          if (db !== da) return db - da;
          return (b.id || '').localeCompare(a.id || '');
        });
        setServerTransactions(sortedData);
        try {
          sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(sortedData));
        } catch { }

        // Temporary diagnostic logging (Requirement 7)
        const computedOptions = generateDynamicMonthOptions(new Date(), res.data, selectedMonth);
        console.log('[FinSight Diagnostic - Transactions Loaded]:', {
          authenticatedUserId: user?.id || null,
          apiRecordCount: res.data.length,
          loadedRecordCount: res.data.length,
          availableMonths: computedOptions.map(m => m.label),
          selectedMonth,
        });
      } else {
        setTransactionsError(res.error || 'Failed to load cloud transactions.');
      }
    } catch {
      setTransactionsError('Network error connecting to transaction cloud database.');
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Server budgets (authoritative when authenticated)
  const [serverBudgets, setServerBudgets] = useState<BudgetCategory[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState<boolean>(false);
  const [budgetsError, setBudgetsError] = useState<string | null>(null);

  // Server goals (authoritative when authenticated)
  const [serverGoals, setServerGoals] = useState<FinancialGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState<boolean>(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const refreshBudgets = async () => {
    if (!isAuthenticated) return;
    setBudgetsLoading(true);
    setBudgetsError(null);
    try {
      const res = await api.getBudgets();
      if (res.success && res.data) {
        setServerBudgets(res.data);
      } else {
        setBudgetsError(res.error || 'Failed to load cloud budgets.');
      }
    } catch {
      setBudgetsError('Network error connecting to budget cloud database.');
    } finally {
      setBudgetsLoading(false);
    }
  };

  const refreshGoals = async () => {
    if (!isAuthenticated) return;
    setGoalsLoading(true);
    setGoalsError(null);
    try {
      const res = await api.getGoals();
      if (res.success && res.data) {
        setServerGoals(res.data);
      } else {
        setGoalsError(res.error || 'Failed to load cloud goals.');
      }
    } catch {
      setGoalsError('Network error connecting to goals cloud database.');
    } finally {
      setGoalsLoading(false);
    }
  };

  // Server bills (authoritative when authenticated)
  const [serverBills, setServerBills] = useState<Bill[]>([]);
  const [billsLoading, setBillsLoading] = useState<boolean>(false);
  const [billsError, setBillsError] = useState<string | null>(null);

  // Server recurring transactions (authoritative when authenticated)
  const [serverRecurring, setServerRecurring] = useState<RecurringTransaction[]>([]);
  const [recurringLoading, setRecurringLoading] = useState<boolean>(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  // In-app bill reminder & notification preferences
  const [reminderPreferences, setReminderPreferences] = useState<{
    reminderDays: number;
    notifyOverdue: boolean;
    notifyUpcoming: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem('finsight_reminder_prefs');
      return saved ? JSON.parse(saved) : { reminderDays: 3, notifyOverdue: true, notifyUpcoming: true };
    } catch {
      return { reminderDays: 3, notifyOverdue: true, notifyUpcoming: true };
    }
  });

  const updateReminderPreferences = (prefs: Partial<{ reminderDays: number; notifyOverdue: boolean; notifyUpcoming: boolean }>) => {
    setReminderPreferences(prev => {
      const updated = { ...prev, ...prefs };
      try {
        localStorage.setItem('finsight_reminder_prefs', JSON.stringify(updated));
      } catch { }
      return updated;
    });
  };

  const refreshRecurringTransactions = async () => {
    if (!isAuthenticated) return;
    setRecurringLoading(true);
    setRecurringError(null);
    try {
      const res = await api.getRecurringTransactions();
      if (res.success && res.data) {
        setServerRecurring(res.data);
      } else {
        setRecurringError(res.error || 'Failed to load recurring transactions.');
      }
    } catch {
      setRecurringError('Network error connecting to recurring transactions service.');
    } finally {
      setRecurringLoading(false);
    }
  };

  // Server documents (authoritative when authenticated)
  const [serverDocuments, setServerDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const refreshBills = async () => {
    if (!isAuthenticated) return;
    setBillsLoading(true);
    setBillsError(null);
    try {
      const res = await api.getBills();
      if (res.success && res.data) {
        setServerBills(res.data);
      } else {
        setBillsError(res.error || 'Failed to load cloud bills.');
      }
    } catch {
      setBillsError('Network error connecting to bills cloud database.');
    } finally {
      setBillsLoading(false);
    }
  };

  const refreshDocuments = async () => {
    if (!isAuthenticated) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const res = await api.getDocuments();
      if (res.success && res.data) {
        setServerDocuments(res.data);
      } else {
        setDocumentsError(res.error || 'Failed to load cloud documents.');
      }
    } catch {
      setDocumentsError('Network error connecting to documents cloud database.');
    } finally {
      setDocumentsLoading(false);
    }
  };

  // ML Forecast (authoritative when authenticated)
  const [mlForecast, setMlForecast] = useState<any>(null);

  const refreshForecast = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.getForecast(4);
      if (res.success && res.data && res.data.status === 'ok') {
        setMlForecast(res.data);
      }
    } catch {
      // Graceful fallback to heuristic monthly projection
    }
  };

  useEffect(() => {
    // Step 2: Ensure GET /api/auth/me completes before authenticated transaction loading begins
    if (authLoading) {
      return;
    }

    if (isAuthenticated) {
      refreshTransactions();
      refreshBudgets();
      refreshGoals();
      refreshBills();
      refreshRecurringTransactions();
      refreshDocuments();
      refreshForecast();
    } else {
      setServerTransactions([]);
      try {
        sessionStorage.removeItem(STORAGE_KEYS.SERVER_TX_CACHE);
      } catch { }
      setTransactionsLoading(false);
      setTransactionsError(null);
      setMlForecast(null);

      setServerBudgets([]);
      setBudgetsLoading(false);
      setBudgetsError(null);

      setServerGoals([]);
      setGoalsLoading(false);
      setGoalsError(null);

      setServerBills([]);
      setBillsLoading(false);
      setBillsError(null);

      setServerRecurring([]);
      setRecurringLoading(false);
      setRecurringError(null);

      setServerDocuments([]);
      setDocumentsLoading(false);
      setDocumentsError(null);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  // Temporary diagnostic logging for state verification (Requirement 7)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      console.log('[FinSight Diagnostic - Active Financial State]:', {
        authenticatedUserId: user?.id || null,
        isAuthenticated,
        loadedRecordCount: transactions.length,
        availableMonths: availableMonths.map(m => m.label),
        selectedMonth,
      });
    }
  }, [authLoading, isAuthenticated, user?.id, transactions.length, availableMonths, selectedMonth]);

  // Safe local historical recovery computation (strictly scoped to authenticated user)
  const localRecoveryStatus = useMemo<LocalRecoveryStatus>(() => {
    if (!isAuthenticated || !user?.id || localTransactions.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        importableCandidates: [],
        importableCount: 0,
        duplicateCount: 0,
        totalImportableExpense: 0,
        totalImportableIncome: 0,
        totalExpense: 0,
        totalIncome: 0,
        candidates: [],
      };
    }

    // Exclude mock transactions so demo data is never offered for recovery
    const mockIds = new Set(initialTransactions.map(t => t.id));
    const genuineLocal = localTransactions.filter(loc => !mockIds.has(loc.id) && !(loc as any).isMock);

    if (genuineLocal.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        importableCandidates: [],
        importableCount: 0,
        duplicateCount: 0,
        totalImportableExpense: 0,
        totalImportableIncome: 0,
        totalExpense: 0,
        totalIncome: 0,
        candidates: [],
      };
    }

    const duplicates: Transaction[] = [];
    const importable: Transaction[] = [];
    const candidates: LocalRecoveryCandidate[] = [];

    genuineLocal.forEach(loc => {
      const isDup = serverTransactions.some(
        srv =>
          srv.id === loc.id ||
          (srv.name.trim().toLowerCase() === loc.name.trim().toLowerCase() &&
            Math.abs(Number(srv.amount) - Number(loc.amount)) < 0.01 &&
            srv.date === loc.date &&
            srv.type === loc.type)
      );
      candidates.push({ tx: loc, isDuplicate: isDup });
      if (isDup) {
        duplicates.push(loc);
      } else {
        importable.push(loc);
      }
    });

    const totalExpense = importable
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalIncome = importable
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return {
      hasLocalData: importable.length > 0,
      totalLocalCount: genuineLocal.length,
      localCount: genuineLocal.length,
      importableCandidates: importable,
      importableCount: importable.length,
      duplicateCount: duplicates.length,
      totalImportableExpense: totalExpense,
      totalImportableIncome: totalIncome,
      totalExpense,
      totalIncome,
      candidates,
    };
  }, [isAuthenticated, user?.id, localTransactions, serverTransactions]);

  const importLocalTransactionsToCloud = async (): Promise<{
    success: boolean;
    importedCount: number;
    backupKey: string;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      throw new Error('You must be logged in to import transactions to cloud storage.');
    }
    if (localRecoveryStatus.importableCandidates.length === 0) {
      return { success: true, importedCount: 0, backupKey: '' };
    }

    // Step 1: Explicit safe local backup preserving original data with timestamp
    const backupKey = `finsight_transactions_backup_${Date.now()}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(localTransactions));
    } catch (e) {
      console.warn('[Local Data Backup Warning]:', e);
    }

    // Step 2: Prepare payload preserving all fields
    const batch = localRecoveryStatus.importableCandidates.map(tx => ({
      name: tx.name,
      amount: Number(tx.amount),
      category: tx.category,
      type: tx.type,
      date: tx.date,
      paymentMethod: tx.paymentMethod || 'Direct',
      status: tx.status || 'Completed',
      notes: tx.notes || undefined,
      merchantIcon: tx.merchantIcon || undefined,
    }));

    // Step 3: Atomic bulk insert to PostgreSQL with conflict skipping
    const res = await api.bulkCreateTransactions(batch);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to import local transactions to cloud database.');
    }

    // Step 4: Refresh server transactions from PostgreSQL
    await refreshTransactions();

    return {
      success: true,
      importedCount: res.data.length,
      backupKey,
    };
  };

  const [localBudgets, setLocalBudgets] = useState<BudgetCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      const list: BudgetCategory[] = saved ? JSON.parse(saved) : initialBudgets;
      const seen = new Set<string>();
      return list.map((b, idx) => {
        let id = b.id;
        if (!id || seen.has(id)) {
          id = generateUniqueId(`b_fixed_${idx}`);
        }
        seen.add(id);
        return { ...b, id };
      });
    } catch {
      return initialBudgets;
    }
  });

  // Active budgets: server-backed when authenticated, local backup when unauthenticated
  const budgets = useMemo(() => {
    return isAuthenticated ? serverBudgets : localBudgets;
  }, [isAuthenticated, serverBudgets, localBudgets]);

  // Safe local budget recovery computation
  const localBudgetRecoveryStatus = useMemo<LocalBudgetRecoveryStatus>(() => {
    if (!isAuthenticated || localBudgets.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalAllocated: 0,
        candidates: [],
      };
    }

    const mockBudgetIds = new Set(initialBudgets.map(b => b.id));
    const genuineLocal = localBudgets.filter(loc => !mockBudgetIds.has(loc.id) && !(loc as any).isMock);

    if (genuineLocal.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalAllocated: 0,
        candidates: [],
      };
    }

    const duplicates: BudgetCategory[] = [];
    const importable: BudgetCategory[] = [];
    const candidates: LocalBudgetCandidate[] = [];

    genuineLocal.forEach(loc => {
      const isDup = serverBudgets.some(
        srv =>
          srv.id === loc.id ||
          srv.category.trim().toLowerCase() === loc.category.trim().toLowerCase()
      );
      candidates.push({ item: loc, isDuplicate: isDup });
      if (isDup) {
        duplicates.push(loc);
      } else {
        importable.push(loc);
      }
    });

    const totalAllocated = importable.reduce((sum, b) => sum + Number(b.allocated || 0), 0);

    return {
      hasLocalData: importable.length > 0,
      totalLocalCount: genuineLocal.length,
      localCount: genuineLocal.length,
      duplicateCount: duplicates.length,
      importableCount: importable.length,
      importableCandidates: importable,
      totalAllocated,
      candidates,
    };
  }, [isAuthenticated, localBudgets, serverBudgets]);

  const importLocalBudgetsToCloud = async (): Promise<{
    success: boolean;
    importedCount: number;
    backupKey: string;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      throw new Error('You must be logged in to import budgets to cloud storage.');
    }
    if (localBudgetRecoveryStatus.importableCandidates.length === 0) {
      return { success: true, importedCount: 0, backupKey: '' };
    }

    const backupKey = `finsight_budgets_backup_${Date.now()}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(localBudgets));
    } catch (e) {
      console.warn('[Local Budget Backup Warning]:', e);
    }

    const batch = localBudgetRecoveryStatus.importableCandidates.map(b => ({
      category: b.category,
      allocated: Number(b.allocated),
      color: b.color || '#00E5BE',
      suggestedByAI: b.suggestedByAI !== undefined ? Number(b.suggestedByAI) : undefined,
    }));

    const res = await api.bulkCreateBudgets(batch);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to import local budgets to cloud database.');
    }

    await refreshBudgets();

    return {
      success: true,
      importedCount: res.data.length,
      backupKey,
    };
  };

  const [localGoals, setLocalGoals] = useState<FinancialGoal[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GOALS);
      const list: FinancialGoal[] = saved ? JSON.parse(saved) : initialGoals;
      const seen = new Set<string>();
      return list.map((g, idx) => {
        let id = g.id;
        if (!id || seen.has(id)) {
          id = generateUniqueId(`g_fixed_${idx}`);
        }
        seen.add(id);
        return { ...g, id };
      });
    } catch {
      return initialGoals;
    }
  });

  // Active goals: server-backed when authenticated, local backup when unauthenticated
  const goals = useMemo(() => {
    return isAuthenticated ? serverGoals : localGoals;
  }, [isAuthenticated, serverGoals, localGoals]);

  // Safe local goal recovery computation
  const localGoalRecoveryStatus = useMemo<LocalGoalRecoveryStatus>(() => {
    if (!isAuthenticated || localGoals.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalTargetAmount: 0,
        totalCurrentAmount: 0,
        candidates: [],
      };
    }

    const mockGoalIds = new Set(initialGoals.map(g => g.id));
    const genuineLocal = localGoals.filter(loc => !mockGoalIds.has(loc.id) && !(loc as any).isMock);

    if (genuineLocal.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalTargetAmount: 0,
        totalCurrentAmount: 0,
        candidates: [],
      };
    }

    const duplicates: FinancialGoal[] = [];
    const importable: FinancialGoal[] = [];
    const candidates: LocalGoalCandidate[] = [];

    genuineLocal.forEach(loc => {
      const isDup = serverGoals.some(
        srv =>
          srv.id === loc.id ||
          (srv.title.trim().toLowerCase() === loc.title.trim().toLowerCase() &&
            srv.category.trim().toLowerCase() === loc.category.trim().toLowerCase())
      );
      candidates.push({ item: loc, isDuplicate: isDup });
      if (isDup) {
        duplicates.push(loc);
      } else {
        importable.push(loc);
      }
    });

    const totalTarget = importable.reduce((sum, g) => sum + Number(g.targetAmount || 0), 0);
    const totalCurrent = importable.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);

    return {
      hasLocalData: importable.length > 0,
      totalLocalCount: genuineLocal.length,
      localCount: genuineLocal.length,
      duplicateCount: duplicates.length,
      importableCount: importable.length,
      importableCandidates: importable,
      totalTargetAmount: totalTarget,
      totalCurrentAmount: totalCurrent,
      candidates,
    };
  }, [isAuthenticated, localGoals, serverGoals]);

  const importLocalGoalsToCloud = async (): Promise<{
    success: boolean;
    importedCount: number;
    backupKey: string;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      throw new Error('You must be logged in to import goals to cloud storage.');
    }
    if (localGoalRecoveryStatus.importableCandidates.length === 0) {
      return { success: true, importedCount: 0, backupKey: '' };
    }

    const backupKey = `finsight_goals_backup_${Date.now()}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(localGoals));
    } catch (e) {
      console.warn('[Local Goal Backup Warning]:', e);
    }

    const batch = localGoalRecoveryStatus.importableCandidates.map(g => ({
      title: g.title,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount || 0),
      targetDate: g.targetDate,
      category: g.category || 'General',
      monthlyContribution: Number(g.monthlyContribution || 0),
    }));

    const res = await api.bulkCreateGoals(batch);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to import local goals to cloud database.');
    }

    await refreshGoals();

    return {
      success: true,
      importedCount: res.data.length,
      backupKey,
    };
  };

  const [localBills, setLocalBills] = useState<Bill[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BILLS);
      const list: Bill[] = saved ? JSON.parse(saved) : initialBills;
      const seen = new Set<string>();
      return list.map((bill, idx) => {
        let id = bill.id;
        if (!id || seen.has(id)) {
          id = generateUniqueId(`bill_fixed_${idx}`);
        }
        seen.add(id);
        return { ...bill, id };
      });
    } catch {
      return initialBills;
    }
  });

  // Active bills: server-backed when authenticated, local backup when unauthenticated
  const bills = useMemo(() => {
    return isAuthenticated ? serverBills : localBills;
  }, [isAuthenticated, serverBills, localBills]);

  // Active recurring transactions: server-backed when authenticated
  const recurringTransactions = useMemo(() => {
    return serverRecurring;
  }, [serverRecurring]);

  // Safe local bill recovery computation
  const localBillRecoveryStatus = useMemo<LocalBillRecoveryStatus>(() => {
    if (!isAuthenticated || localBills.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalAmount: 0,
        candidates: [],
      };
    }

    const mockBillIds = new Set(initialBills.map(b => b.id));
    const genuineLocal = localBills.filter(loc => !mockBillIds.has(loc.id) && !(loc as any).isMock);

    if (genuineLocal.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalAmount: 0,
        candidates: [],
      };
    }

    const duplicates: Bill[] = [];
    const importable: Bill[] = [];
    const candidates: LocalBillCandidate[] = [];

    genuineLocal.forEach(loc => {
      const isDup = serverBills.some(
        srv =>
          srv.id === loc.id ||
          (srv.name.trim().toLowerCase() === loc.name.trim().toLowerCase() &&
            srv.dueDate.trim().toLowerCase() === loc.dueDate.trim().toLowerCase())
      );
      candidates.push({ item: loc, isDuplicate: isDup });
      if (isDup) {
        duplicates.push(loc);
      } else {
        importable.push(loc);
      }
    });

    const totalAmount = importable.reduce((sum, b) => sum + Number(b.amount || 0), 0);

    return {
      hasLocalData: importable.length > 0,
      totalLocalCount: genuineLocal.length,
      localCount: genuineLocal.length,
      duplicateCount: duplicates.length,
      importableCount: importable.length,
      importableCandidates: importable,
      totalAmount,
      candidates,
    };
  }, [isAuthenticated, localBills, serverBills]);

  const importLocalBillsToCloud = async (): Promise<{
    success: boolean;
    importedCount: number;
    backupKey: string;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      throw new Error('You must be logged in to import bills to cloud storage.');
    }

    if (localBillRecoveryStatus.importableCandidates.length === 0) {
      return { success: true, importedCount: 0, backupKey: '' };
    }

    const backupKey = `finsight_bills_backup_${Date.now()}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(localBills));
    } catch (e) {
      console.warn('[Local Bill Backup Warning]:', e);
    }

    const batch = localBillRecoveryStatus.importableCandidates.map(b => ({
      name: b.name,
      category: b.category,
      amount: Number(b.amount),
      dueDate: b.dueDate,
      dueInDays: Number(b.dueInDays || 0),
      status: b.status,
      iconType: b.iconType,
    }));

    const res = await api.bulkCreateBills(batch);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to import local bills to cloud database.');
    }

    await refreshBills();

    return {
      success: true,
      importedCount: res.data.length,
      backupKey,
    };
  };

  const [localDocuments, setLocalDocuments] = useState<DocumentItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
      const list: DocumentItem[] = saved ? JSON.parse(saved) : initialDocuments;
      const seen = new Set<string>();
      return list.map((d, idx) => {
        let id = d.id;
        if (!id || seen.has(id)) {
          id = generateUniqueId(`doc_fixed_${idx}`);
        }
        seen.add(id);
        return { ...d, id };
      });
    } catch {
      return initialDocuments;
    }
  });

  // Active documents: server-backed when authenticated, local backup when unauthenticated
  const documents = useMemo(() => {
    return isAuthenticated ? serverDocuments : localDocuments;
  }, [isAuthenticated, serverDocuments, localDocuments]);

  // Safe local document recovery computation
  const localDocumentRecoveryStatus = useMemo<LocalDocumentRecoveryStatus>(() => {
    if (!isAuthenticated || localDocuments.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalDetectedAmount: 0,
        candidates: [],
      };
    }

    const mockDocIds = new Set(initialDocuments.map(d => d.id));
    const genuineLocal = localDocuments.filter(loc => !mockDocIds.has(loc.id) && !(loc as any).isMock);

    if (genuineLocal.length === 0) {
      return {
        hasLocalData: false,
        totalLocalCount: 0,
        localCount: 0,
        duplicateCount: 0,
        importableCount: 0,
        importableCandidates: [],
        totalDetectedAmount: 0,
        candidates: [],
      };
    }

    const duplicates: DocumentItem[] = [];
    const importable: DocumentItem[] = [];
    const candidates: LocalDocumentCandidate[] = [];

    genuineLocal.forEach(loc => {
      const isDup = serverDocuments.some(
        srv =>
          srv.id === loc.id ||
          (srv.filename.trim().toLowerCase() === loc.filename.trim().toLowerCase() &&
            srv.uploadDate.trim().toLowerCase() === loc.uploadDate.trim().toLowerCase())
      );
      candidates.push({ item: loc, isDuplicate: isDup });
      if (isDup) {
        duplicates.push(loc);
      } else {
        importable.push(loc);
      }
    });

    const totalDetectedAmount = importable.reduce((sum, d) => sum + Number(d.detectedAmount || 0), 0);

    return {
      hasLocalData: importable.length > 0,
      totalLocalCount: genuineLocal.length,
      localCount: genuineLocal.length,
      duplicateCount: duplicates.length,
      importableCount: importable.length,
      importableCandidates: importable,
      totalDetectedAmount,
      candidates,
    };
  }, [isAuthenticated, localDocuments, serverDocuments]);

  const importLocalDocumentsToCloud = async (): Promise<{
    success: boolean;
    importedCount: number;
    backupKey: string;
    error?: string;
  }> => {
    if (!isAuthenticated) {
      throw new Error('You must be logged in to import documents to cloud storage.');
    }

    if (localDocumentRecoveryStatus.importableCandidates.length === 0) {
      return { success: true, importedCount: 0, backupKey: '' };
    }

    const backupKey = `finsight_documents_backup_${Date.now()}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(localDocuments));
    } catch (e) {
      console.warn('[Local Document Backup Warning]:', e);
    }

    const batch = localDocumentRecoveryStatus.importableCandidates.map(d => ({
      filename: d.filename,
      uploadDate: d.uploadDate,
      fileSize: d.fileSize,
      ocrStatus: d.ocrStatus,
      detectedMerchant: d.detectedMerchant,
      detectedAmount: Number(d.detectedAmount || 0),
      detectedDate: d.detectedDate,
      confidenceScore: Number(d.confidenceScore || 0),
    }));

    const res = await api.bulkCreateDocuments(batch);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to import local document metadata to cloud database.');
    }

    await refreshDocuments();

    return {
      success: true,
      importedCount: res.data.length,
      backupKey,
    };
  };

  // Only sync local state to localStorage when unauthenticated!
  // This guarantees existing local records are NEVER overwritten, deleted, or mixed with server data.
  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(localTransactions));
    }
  }, [localTransactions, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(localBudgets));
    }
  }, [localBudgets, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(localGoals));
    }
  }, [localGoals, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(localBills));
    }
  }, [localBills, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(localDocuments));
    }
  }, [localDocuments, isAuthenticated]);

  // Transactions filtered by the dynamically selected month
  const selectedMonthTransactions = useMemo(() => {
    return transactions.filter(t => isTransactionInSelectedMonth(t.date, selectedMonth));
  }, [transactions, selectedMonth]);

  // Derived calculations: Total Income, Total Expenses, Net Savings, Savings Rate scoped to selected month
  const { totalIncome, totalExpenses, netSavings, savingsRate } = useMemo(() => {
    const inc = Number(selectedMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
      .toFixed(2));

    const exp = Number(selectedMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
      .toFixed(2));

    const net = Number((inc - exp).toFixed(2));
    const rate = inc > 0 ? Number(((net / inc) * 100).toFixed(1)) : 0;

    return {
      totalIncome: inc,
      totalExpenses: exp,
      netSavings: net,
      savingsRate: rate,
    };
  }, [selectedMonthTransactions]);

  // Derived Category Breakdown based on selected month's expense transactions
  const categoryBreakdown = useMemo<CategorySummary[]>(() => {
    const categoryTotals: Record<string, number> = {};

    selectedMonthTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Others';
        categoryTotals[cat] = Number(((categoryTotals[cat] || 0) + Number(t.amount || 0)).toFixed(2));
      });

    const categories = Object.keys(categoryTotals);
    if (categories.length === 0 || totalExpenses <= 0) {
      return [];
    }

    // Largest Remainder Method (Hare-Niemeyer method) to guarantee sum of integer percentages is exactly 100%
    const rawItems = categories.map(cat => {
      const amount = categoryTotals[cat];
      const rawPct = (amount / totalExpenses) * 100;
      const floorPct = Math.floor(rawPct);
      const remainder = rawPct - floorPct;
      return {
        cat,
        amount,
        rawPct,
        floorPct,
        remainder,
      };
    });

    const totalFloor = rawItems.reduce((sum, item) => sum + item.floorPct, 0);
    const difference = 100 - totalFloor;

    // Distribute remaining difference to items with largest decimal remainders
    const sortedByRemainder = [...rawItems].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < difference && i < sortedByRemainder.length; i++) {
      sortedByRemainder[i].floorPct += 1;
    }

    const summaries: CategorySummary[] = rawItems.map(item => ({
      name: item.cat,
      amount: item.amount,
      percentage: item.floorPct,
      color: CATEGORY_COLORS[item.cat] || '#8B5CF6',
    }));

    // Sort descending by amount
    return summaries.sort((a, b) => b.amount - a.amount);
  }, [selectedMonthTransactions, totalExpenses]);

  // Derived Budgets with live calculated spent amount per category for the selected month
  const budgetsWithSpent = useMemo<BudgetWithSpent[]>(() => {
    // Map completed expenses by category for selected month
    const categorySpentMap: Record<string, number> = {};
    selectedMonthTransactions
      .filter(t => t.type === 'expense' && (t.status === 'Completed' || !t.status))
      .forEach(t => {
        categorySpentMap[t.category] = Number(((categorySpentMap[t.category] || 0) + Number(t.amount || 0)).toFixed(2));
      });

    // Resolve active budgets for selected month:
    // If a budget specifically matches selectedMonth, prefer it over 'All'
    const categoryBudgetMap = new Map<string, BudgetCategory>();

    // 1. General 'All' or unspecific budgets
    budgets.forEach(b => {
      const bMonth = (b.month || 'All').toLowerCase();
      if (bMonth === 'all' || bMonth === 'all time') {
        categoryBudgetMap.set(b.category.toLowerCase(), b);
      }
    });

    // 2. Specific month budgets override 'All'
    if (selectedMonth && selectedMonth.toLowerCase() !== 'all time') {
      budgets.forEach(b => {
        const bMonth = (b.month || '').toLowerCase();
        if (bMonth === selectedMonth.toLowerCase()) {
          categoryBudgetMap.set(b.category.toLowerCase(), b);
        }
      });
    }

    const resolvedBudgets = Array.from(categoryBudgetMap.values());

    return resolvedBudgets.map(b => {
      const spent = categorySpentMap[b.category] || 0;
      const pct = b.allocated > 0 ? Math.round((spent / b.allocated) * 100) : 0;
      return {
        ...b,
        spent,
        percentageUsed: pct,
        isOverBudget: spent > b.allocated,
        isNearLimit: spent >= b.allocated * 0.85 && spent <= b.allocated,
        remaining: Math.max(Number((b.allocated - spent).toFixed(2)), 0),
      };
    });
  }, [budgets, selectedMonthTransactions, selectedMonth]);

  // Baseline single-month expense (from latest month with expenses when 'All Time' is selected, or current month's expenses)
  const baseMonthlyExpense = useMemo(() => {
    if (transactions.length === 0) {
      return 0;
    }
    if (selectedMonth && selectedMonth.toLowerCase() !== 'all time' && totalExpenses > 0) {
      return totalExpenses;
    }
    const monthlyExpensesMap = new Map<string, number>();
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const d = parseTransactionDate(t.date);
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyExpensesMap.set(key, (monthlyExpensesMap.get(key) || 0) + Number(t.amount || 0));
      }
    });

    const sortedMonths = Array.from(monthlyExpensesMap.keys()).sort();
    if (sortedMonths.length > 0) {
      const latestMonthKey = sortedMonths[sortedMonths.length - 1];
      const val = monthlyExpensesMap.get(latestMonthKey) || 0;
      if (val > 0) return val;
    }

    if (sortedMonths.length > 0) {
      const total = Array.from(monthlyExpensesMap.values()).reduce((a, b) => a + b, 0);
      return Math.round(total / sortedMonths.length);
    }
    return totalExpenses > 0 ? totalExpenses : 0;
  }, [selectedMonth, totalExpenses, transactions]);

  // Derived Forecast for Next Month (strictly represents ONE future month, never multi-month sum)
  const predictedNextMonthExpense = useMemo(() => {
    if (transactions.length === 0 || baseMonthlyExpense === 0) {
      return 0;
    }
    if (mlForecast?.predictions?.[0]?.predicted && typeof mlForecast.predictions[0].predicted === 'number') {
      return Math.round(mlForecast.predictions[0].predicted);
    }
    return Math.round(baseMonthlyExpense * 1.057);
  }, [transactions.length, mlForecast, baseMonthlyExpense]);

  const predictedExpenseTrend = useMemo(() => {
    if (transactions.length === 0 || baseMonthlyExpense <= 0) return 'Awaiting data';
    const pct = ((predictedNextMonthExpense - baseMonthlyExpense) / baseMonthlyExpense) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}% vs this month`;
  }, [transactions.length, predictedNextMonthExpense, baseMonthlyExpense]);

  // Dynamic sparkline points scaling to the predicted next month expense
  const forecastSparkline = useMemo(() => {
    if (transactions.length === 0 || baseMonthlyExpense <= 0) {
      return [];
    }
    const start = baseMonthlyExpense;
    const target = predictedNextMonthExpense;
    const step = (target - start) / 3;
    return [
      { day: 'W1', value: Math.round(start) },
      { day: 'W2', value: Math.round(start + step * 0.3) },
      { day: 'W3', value: Math.round(start + step * 1.5) },
      { day: 'W4', value: Math.round(target) },
    ];
  }, [transactions.length, baseMonthlyExpense, predictedNextMonthExpense]);

  // Dynamic spending trend datasets derived from actual transaction dates for selected month
  const spendingTrendDatasets = useMemo(() => {
    return calculateSpendingTrendDatasets(selectedMonthTransactions, totalExpenses, selectedMonth, transactions);
  }, [selectedMonthTransactions, totalExpenses, selectedMonth, transactions]);

  // Top spending merchants strictly from actual transactions in selected month
  const topMerchants = useMemo(() => {
    return calculateTopMerchants(selectedMonthTransactions, 5);
  }, [selectedMonthTransactions]);

  // Dynamic spending volatility index derived from transaction dispersion
  const spendingVolatility = useMemo(() => {
    return calculateSpendingVolatility(selectedMonthTransactions);
  }, [selectedMonthTransactions]);

  // Dynamic historical period comparison between selected period and prior historical actuals
  const periodComparison = useMemo(() => {
    return calculateHistoricalPeriodComparison(
      transactions,
      selectedMonth,
      totalIncome,
      totalExpenses,
      netSavings
    );
  }, [transactions, selectedMonth, totalIncome, totalExpenses, netSavings]);

  // Top Recent Transactions in selected month (sorted chronologically descending)
  const recentTransactions = useMemo(() => {
    const list = selectedMonthTransactions.length > 0 ? selectedMonthTransactions : transactions;
    return [...list]
      .sort((a, b) => {
        const da = parseTransactionDate(a.date)?.getTime() || 0;
        const db = parseTransactionDate(b.date)?.getTime() || 0;
        if (db !== da) return db - da;
        return (b.id || '').localeCompare(a.id || '');
      })
      .slice(0, 5);
  }, [selectedMonthTransactions, transactions]);

  // --- CRUD ACTIONS ---

  // 1. Transactions
  const addTransaction = async (newTx: Omit<Transaction, 'id'>): Promise<Transaction> => {
    const tempId = generateUniqueId('tx');
    const optimistic: Transaction = {
      ...newTx,
      id: tempId,
      amount: Number(newTx.amount),
    };

    if (isAuthenticated) {
      // Optimistic update
      setServerTransactions(prev => [optimistic, ...prev]);

      const res = await api.createTransaction(newTx);
      if (res.success && res.data) {
        // Replace with server-confirmed record
        setServerTransactions(prev => {
          const updated = prev.map(t => (t.id === tempId ? res.data! : t));
          try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        return res.data;
      } else {
        // Rollback optimistic update on failure
        setServerTransactions(prev => {
          const rolled = prev.filter(t => t.id !== tempId);
          try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(rolled)); } catch {}
          return rolled;
        });
        throw new Error(res.error || 'Failed to persist transaction to cloud database.');
      }
    } else {
      setLocalTransactions(prev => [optimistic, ...prev]);
      return optimistic;
    }
  };

  const addTransactions = async (
    newTxs: Array<Omit<Transaction, 'id'> & { id?: string }>,
    options?: {
      batchSize?: number;
      onProgress?: (progress: {
        currentBatch: number;
        totalBatches: number;
        importedCount: number;
        processedCount: number;
        totalCount: number;
        batchSize: number;
      }) => void;
    }
  ): Promise<Transaction[]> => {
    if (newTxs.length === 0) return [];

    const batchSize = Math.max(1, Math.min(options?.batchSize || 50, 200));
    const totalCount = newTxs.length;
    const totalBatches = Math.ceil(totalCount / batchSize);

    // Give each transaction a deterministic ID if not already provided so retries are idempotent
    const userScope = user?.id ? `${user.id.replace(/[^a-zA-Z0-9]/g, '_')}_` : '';
    const preparedTxs: Transaction[] = newTxs.map((tx: any, idx) => {
      let id = tx.id;
      if (!id || typeof id !== 'string' || id.trim() === '') {
        const dateKey = String(tx.date || '').replace(/[^0-9]/g, '').slice(0, 8);
        const paise = Math.round(Number(tx.amount || 0) * 100);
        const normName = String(tx.name || 'tx').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
        id = `tx_imp_${userScope}${dateKey}_${paise}_${normName}_${idx}`;
      } else if (userScope && !id.includes(userScope)) {
        id = `tx_imp_${userScope}${id.replace(/^tx_imp_/, '')}`;
      }
      return {
        ...tx,
        id,
        amount: Number(tx.amount),
      };
    });

    if (isAuthenticated) {
      const allInserted: Transaction[] = [];
      let processedCount = 0;

      for (let b = 0; b < totalBatches; b++) {
        const chunk = preparedTxs.slice(b * batchSize, (b + 1) * batchSize);
        try {
          const res = await api.bulkCreateTransactions(chunk);
          if (!res.success) {
            throw new Error(`Batch ${b + 1} of ${totalBatches} failed: ${res.error || 'Server error'}`);
          }
          if (res.data) {
            allInserted.push(...res.data);
          }
          processedCount += chunk.length;
          options?.onProgress?.({
            currentBatch: b + 1,
            totalBatches,
            importedCount: allInserted.length,
            processedCount,
            totalCount,
            batchSize,
          });
        } catch (err: any) {
          if (allInserted.length > 0) {
            await refreshTransactions();
          }
          throw new Error(err?.message || `Import failed at batch ${b + 1} of ${totalBatches}`);
        }
      }

      await refreshTransactions();
      return allInserted;
    } else {
      setLocalTransactions(prev => [...preparedTxs, ...prev]);
      return preparedTxs;
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>): Promise<void> => {
    if (isAuthenticated) {
      // Save original for rollback
      const original = serverTransactions.find(t => t.id === id);
      setServerTransactions(prev =>
        prev.map(t =>
          t.id === id
            ? {
              ...t,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : t.amount,
            }
            : t
        )
      );

      const res = await api.updateTransaction(id, updates);
      if (!res.success) {
        // Rollback on failure
        if (original) {
          setServerTransactions(prev => {
            const rolled = prev.map(t => (t.id === id ? original : t));
            try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(rolled)); } catch {}
            return rolled;
          });
        }
        throw new Error(res.error || 'Failed to update transaction in cloud database.');
      } else if (res.data) {
        setServerTransactions(prev => {
          const updated = prev.map(t => (t.id === id ? res.data! : t));
          try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
    } else {
      setLocalTransactions(prev =>
        prev.map(t =>
          t.id === id
            ? {
              ...t,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : t.amount,
            }
            : t
        )
      );
    }
  };

  const deleteTransaction = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverTransactions.find(t => t.id === id);
      setServerTransactions(prev => {
        const next = prev.filter(t => t.id !== id);
        try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(next)); } catch {}
        return next;
      });

      const res = await api.deleteTransaction(id);
      if (!res.success) {
        // Rollback on failure
        if (original) {
          setServerTransactions(prev => {
            const rolled = [original, ...prev];
            try { sessionStorage.setItem(STORAGE_KEYS.SERVER_TX_CACHE, JSON.stringify(rolled)); } catch {}
            return rolled;
          });
        }
        throw new Error(res.error || 'Failed to delete transaction from cloud database.');
      }
    } else {
      setLocalTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  // 2. Budgets
  const updateBudgetLimit = async (id: string, newLimit: number): Promise<void> => {
    const numLimit = Number(newLimit);
    if (isAuthenticated) {
      const original = serverBudgets.find(b => b.id === id);
      setServerBudgets(prev => prev.map(b => (b.id === id ? { ...b, allocated: numLimit } : b)));

      const res = await api.updateBudget(id, { allocated: numLimit });
      if (!res.success) {
        if (original) {
          setServerBudgets(prev => prev.map(b => (b.id === id ? original : b)));
        }
        throw new Error(res.error || 'Failed to update budget limit.');
      } else if (res.data) {
        setServerBudgets(prev => prev.map(b => (b.id === id ? res.data! : b)));
      }
    } else {
      setLocalBudgets(prev => prev.map(b => (b.id === id ? { ...b, allocated: numLimit } : b)));
    }
  };

  const updateBudget = async (id: string, updates: Partial<BudgetCategory>): Promise<void> => {
    if (isAuthenticated) {
      const original = serverBudgets.find(b => b.id === id);
      setServerBudgets(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));

      const res = await api.updateBudget(id, updates);
      if (!res.success) {
        if (original) {
          setServerBudgets(prev => prev.map(b => (b.id === id ? original : b)));
        }
        throw new Error(res.error || 'Failed to update budget.');
      } else if (res.data) {
        setServerBudgets(prev => prev.map(b => (b.id === id ? res.data! : b)));
      }
    } else {
      setLocalBudgets(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
    }
  };

  const addBudgetCategory = async (
    category: string,
    allocated: number,
    color?: string,
    suggestedByAI?: number,
    month?: string
  ): Promise<BudgetCategory> => {
    const tempId = generateUniqueId('b');
    const optimistic: BudgetCategory = {
      id: tempId,
      category,
      allocated: Number(allocated),
      color: color || CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] || '#00E5BE',
      month: month || 'All',
      suggestedByAI,
    };

    if (isAuthenticated) {
      setServerBudgets(prev => [...prev, optimistic]);

      const res = await api.createBudget({
        category,
        allocated: Number(allocated),
        color: optimistic.color,
        month: optimistic.month,
        suggestedByAI,
      });

      if (res.success && res.data) {
        setServerBudgets(prev => prev.map(b => (b.id === tempId ? res.data! : b)));
        return res.data;
      } else {
        setServerBudgets(prev => prev.filter(b => b.id !== tempId));
        throw new Error(res.error || 'Failed to create budget category in cloud database.');
      }
    } else {
      setLocalBudgets(prev => [...prev, optimistic]);
      return optimistic;
    }
  };

  const deleteBudget = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverBudgets.find(b => b.id === id);
      setServerBudgets(prev => prev.filter(b => b.id !== id));

      const res = await api.deleteBudget(id);
      if (!res.success) {
        if (original) {
          setServerBudgets(prev => [...prev, original]);
        }
        throw new Error(res.error || 'Failed to delete budget envelope from cloud database.');
      }
    } else {
      setLocalBudgets(prev => prev.filter(b => b.id !== id));
    }
  };

  // 3. Goals
  const createGoal = async (goal: Omit<FinancialGoal, 'id'>): Promise<FinancialGoal> => {
    const tempId = generateUniqueId('g');
    const optimistic: FinancialGoal = {
      ...goal,
      id: tempId,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount || 0),
      monthlyContribution: Number(goal.monthlyContribution || 0),
    };

    if (isAuthenticated) {
      setServerGoals(prev => [...prev, optimistic]);

      const res = await api.createGoal(goal);
      if (res.success && res.data) {
        setServerGoals(prev => prev.map(g => (g.id === tempId ? res.data! : g)));
        return res.data;
      } else {
        setServerGoals(prev => prev.filter(g => g.id !== tempId));
        throw new Error(res.error || 'Failed to create financial goal in cloud database.');
      }
    } else {
      setLocalGoals(prev => [...prev, optimistic]);
      return optimistic;
    }
  };

  const updateGoal = async (id: string, updates: Partial<FinancialGoal>): Promise<void> => {
    if (isAuthenticated) {
      const original = serverGoals.find(g => g.id === id);
      setServerGoals(prev =>
        prev.map(g =>
          g.id === id
            ? {
              ...g,
              ...updates,
              targetAmount: updates.targetAmount !== undefined ? Number(updates.targetAmount) : g.targetAmount,
              currentAmount: updates.currentAmount !== undefined ? Number(updates.currentAmount) : g.currentAmount,
              monthlyContribution: updates.monthlyContribution !== undefined ? Number(updates.monthlyContribution) : g.monthlyContribution,
            }
            : g
        )
      );

      const res = await api.updateGoal(id, updates);
      if (!res.success) {
        if (original) {
          setServerGoals(prev => prev.map(g => (g.id === id ? original : g)));
        }
        throw new Error(res.error || 'Failed to update goal in cloud database.');
      } else if (res.data) {
        setServerGoals(prev => prev.map(g => (g.id === id ? res.data! : g)));
      }
    } else {
      setLocalGoals(prev =>
        prev.map(g =>
          g.id === id
            ? {
              ...g,
              ...updates,
              targetAmount: updates.targetAmount !== undefined ? Number(updates.targetAmount) : g.targetAmount,
              currentAmount: updates.currentAmount !== undefined ? Number(updates.currentAmount) : g.currentAmount,
              monthlyContribution: updates.monthlyContribution !== undefined ? Number(updates.monthlyContribution) : g.monthlyContribution,
            }
            : g
        )
      );
    }
  };

  const deleteGoal = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverGoals.find(g => g.id === id);
      setServerGoals(prev => prev.filter(g => g.id !== id));

      const res = await api.deleteGoal(id);
      if (!res.success) {
        if (original) {
          setServerGoals(prev => [...prev, original]);
        }
        throw new Error(res.error || 'Failed to delete goal from cloud database.');
      }
    } else {
      setLocalGoals(prev => prev.filter(g => g.id !== id));
    }
  };

  const contributeToGoal = async (id: string, amount: number): Promise<void> => {
    const numAmount = Number(amount);
    if (isAuthenticated) {
      const original = serverGoals.find(g => g.id === id);
      setServerGoals(prev =>
        prev.map(g => (g.id === id ? { ...g, currentAmount: g.currentAmount + numAmount } : g))
      );

      const res = await api.contributeToGoal(id, numAmount);
      if (!res.success || !res.data) {
        if (original) {
          setServerGoals(prev => prev.map(g => (g.id === id ? original : g)));
        }
        throw new Error(res.error || 'Failed to record contribution in cloud database.');
      } else {
        // Refresh goal from authoritative server state
        setServerGoals(prev => prev.map(g => (g.id === id ? res.data! : g)));
      }
    } else {
      setLocalGoals(prev =>
        prev.map(g => (g.id === id ? { ...g, currentAmount: g.currentAmount + numAmount } : g))
      );
    }
  };

  // 4. Bills
  const payBill = async (
    id: string,
    overrides?: { paymentMethod?: string; date?: string }
  ): Promise<{ bill: Bill; transaction: Transaction; alreadyPaid: boolean }> => {
    if (isAuthenticated) {
      const original = serverBills.find(b => b.id === id);
      setServerBills(prev => prev.map(b => (b.id === id ? { ...b, status: 'paid' as const } : b)));

      const res = await api.payBill(id, overrides);
      if (!res.success || !res.data) {
        if (original) {
          setServerBills(prev => prev.map(b => (b.id === id ? original : b)));
        }
        throw new Error(res.error || 'Failed to update bill payment status.');
      }

      const { bill: updatedBill, transaction: linkedTx, alreadyPaid } = res.data;
      setServerBills(prev => prev.map(b => (b.id === id ? updatedBill : b)));
      if (linkedTx) {
        setServerTransactions(prev => {
          if (prev.some(t => t.id === linkedTx.id)) return prev;
          return [linkedTx, ...prev];
        });
      }
      return { bill: updatedBill, transaction: linkedTx, alreadyPaid };
    } else {
      const bill = localBills.find(b => b.id === id);
      if (!bill) throw new Error(`Bill "${id}" not found.`);
      const updated: Bill = { ...bill, status: 'paid' as const };
      setLocalBills(prev => prev.map(b => (b.id === id ? updated : b)));
      const mockTx: Transaction = {
        id: generateUniqueId('tx'),
        name: bill.name,
        category: (bill.category as Transaction['category']) || 'Bills & Utilities',
        amount: bill.amount,
        date: overrides?.date || formatStandardDate(new Date()),
        type: 'expense',
        paymentMethod: overrides?.paymentMethod || 'UPI',
        status: 'Completed',
        notes: `Bill payment: ${bill.name}`,
      };
      setLocalTransactions(prev => [mockTx, ...prev]);
      return { bill: updated, transaction: mockTx, alreadyPaid: false };
    }
  };

  const addBill = async (bill: Omit<Bill, 'id'> & { id?: string }): Promise<Bill> => {
    const tempId = bill.id || generateUniqueId('bill');
    const optimistic: Bill = {
      ...bill,
      id: tempId,
      amount: Number(bill.amount),
      dueInDays: bill.dueInDays !== undefined ? Number(bill.dueInDays) : 0,
      status: bill.status || 'unpaid',
      iconType: bill.iconType || 'electricity',
    };

    if (isAuthenticated) {
      setServerBills(prev => [optimistic, ...prev]);

      const res = await api.createBill(optimistic);
      if (res.success && res.data) {
        setServerBills(prev => prev.map(b => (b.id === tempId ? res.data! : b)));
        return res.data;
      } else {
        setServerBills(prev => prev.filter(b => b.id !== tempId));
        throw new Error(res.error || 'Failed to save bill to cloud database.');
      }
    } else {
      setLocalBills(prev => [optimistic, ...prev]);
      return optimistic;
    }
  };

  const updateBill = async (id: string, updates: Partial<Bill>): Promise<void> => {
    if (isAuthenticated) {
      const original = serverBills.find(b => b.id === id);
      setServerBills(prev =>
        prev.map(b =>
          b.id === id
            ? {
              ...b,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : b.amount,
              dueInDays: updates.dueInDays !== undefined ? Number(updates.dueInDays) : b.dueInDays,
            }
            : b
        )
      );

      const res = await api.updateBill(id, updates);
      if (!res.success) {
        if (original) {
          setServerBills(prev => prev.map(b => (b.id === id ? original : b)));
        }
        throw new Error(res.error || 'Failed to update bill in cloud database.');
      } else if (res.data) {
        setServerBills(prev => prev.map(b => (b.id === id ? res.data! : b)));
      }
    } else {
      setLocalBills(prev =>
        prev.map(b =>
          b.id === id
            ? {
              ...b,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : b.amount,
              dueInDays: updates.dueInDays !== undefined ? Number(updates.dueInDays) : b.dueInDays,
            }
            : b
        )
      );
    }
  };

  const deleteBill = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverBills.find(b => b.id === id);
      setServerBills(prev => prev.filter(b => b.id !== id));

      const res = await api.deleteBill(id);
      if (!res.success) {
        if (original) {
          setServerBills(prev => [...prev, original]);
        }
        throw new Error(res.error || 'Failed to delete bill from cloud database.');
      }
    } else {
      setLocalBills(prev => prev.filter(b => b.id !== id));
    }
  };

  // 5. Recurring Transactions
  const addRecurringTransaction = async (
    item: Omit<RecurringTransaction, 'id'> & { id?: string }
  ): Promise<RecurringTransaction> => {
    const tempId = item.id || generateUniqueId('rec');
    const optimistic: RecurringTransaction = {
      ...item,
      id: tempId,
      amount: Number(item.amount),
      autoCreate: Boolean(item.autoCreate),
      status: item.status || 'active',
      nextDueDate: item.nextDueDate || item.startDate,
    };

    if (isAuthenticated) {
      setServerRecurring(prev => [optimistic, ...prev]);
      const res = await api.createRecurringTransaction(optimistic);
      if (res.success && res.data) {
        setServerRecurring(prev => prev.map(r => (r.id === tempId ? res.data! : r)));
        return res.data;
      } else {
        setServerRecurring(prev => prev.filter(r => r.id !== tempId));
        throw new Error(res.error || 'Failed to save recurring transaction to cloud database.');
      }
    } else {
      setServerRecurring(prev => [optimistic, ...prev]);
      return optimistic;
    }
  };

  const updateRecurringTransaction = async (id: string, updates: Partial<RecurringTransaction>): Promise<void> => {
    if (isAuthenticated) {
      const original = serverRecurring.find(r => r.id === id);
      setServerRecurring(prev =>
        prev.map(r =>
          r.id === id
            ? {
              ...r,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : r.amount,
            }
            : r
        )
      );

      const res = await api.updateRecurringTransaction(id, updates);
      if (!res.success) {
        if (original) {
          setServerRecurring(prev => prev.map(r => (r.id === id ? original : r)));
        }
        throw new Error(res.error || 'Failed to update recurring transaction.');
      } else if (res.data) {
        setServerRecurring(prev => prev.map(r => (r.id === id ? res.data! : r)));
      }
    } else {
      setServerRecurring(prev =>
        prev.map(r =>
          r.id === id
            ? {
              ...r,
              ...updates,
              amount: updates.amount !== undefined ? Number(updates.amount) : r.amount,
            }
            : r
        )
      );
    }
  };

  const toggleRecurringTransactionStatus = async (id: string, status: 'active' | 'paused'): Promise<void> => {
    if (isAuthenticated) {
      const original = serverRecurring.find(r => r.id === id);
      setServerRecurring(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));

      const res = await api.toggleRecurringTransactionStatus(id, status);
      if (!res.success) {
        if (original) {
          setServerRecurring(prev => prev.map(r => (r.id === id ? original : r)));
        }
        throw new Error(res.error || 'Failed to update status.');
      } else if (res.data) {
        setServerRecurring(prev => prev.map(r => (r.id === id ? res.data! : r)));
      }
    } else {
      setServerRecurring(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    }
  };

  const processRecurringTransaction = async (
    id: string,
    confirmCreate?: boolean
  ): Promise<{
    recurring: RecurringTransaction;
    createdTransaction: Transaction | null;
    alreadyGenerated: boolean;
    requiresConfirmation: boolean;
    message: string;
  }> => {
    if (isAuthenticated) {
      const res = await api.processRecurringTransaction(id, confirmCreate);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to process recurring transaction.');
      }

      const { recurring, createdTransaction, alreadyGenerated, requiresConfirmation, message } = res.data;
      setServerRecurring(prev => prev.map(r => (r.id === id ? recurring : r)));

      if (createdTransaction) {
        setServerTransactions(prev => {
          if (prev.some(t => t.id === createdTransaction.id)) return prev;
          return [createdTransaction, ...prev];
        });
      }

      return { recurring, createdTransaction, alreadyGenerated, requiresConfirmation, message };
    } else {
      const item = serverRecurring.find(r => r.id === id);
      if (!item) throw new Error(`Recurring entry "${id}" not found.`);
      return {
        recurring: item,
        createdTransaction: null,
        alreadyGenerated: false,
        requiresConfirmation: false,
        message: 'Cloud sync required for processing recurring entries.',
      };
    }
  };

  const deleteRecurringTransaction = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverRecurring.find(r => r.id === id);
      setServerRecurring(prev => prev.filter(r => r.id !== id));

      const res = await api.deleteRecurringTransaction(id);
      if (!res.success) {
        if (original) {
          setServerRecurring(prev => [...prev, original]);
        }
        throw new Error(res.error || 'Failed to delete recurring transaction.');
      }
    } else {
      setServerRecurring(prev => prev.filter(r => r.id !== id));
    }
  };

  // 5. Documents / OCR Metadata
  const uploadDocument = async (file: File): Promise<DocumentItem> => {
    if (isAuthenticated) {
      const res = await api.uploadDocumentFile(file);
      if (res.success && res.data) {
        setServerDocuments(prev => [res.data!, ...prev.filter(d => d.id !== res.data!.id)]);
        return res.data;
      } else {
        throw new Error(res.error || 'Failed to upload and process document.');
      }
    } else {
      const tempId = generateUniqueId('doc');
      const docData: DocumentItem = {
        id: tempId,
        filename: file.name,
        uploadDate: 'Just now',
        fileSize: `${Math.round(file.size / 1024)} KB`,
        ocrStatus: 'Pending Review',
        detectedMerchant: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
        detectedAmount: 0,
        detectedDate: formatStandardDate(new Date()),
        confidenceScore: 50.0,
      };
      setLocalDocuments(prev => [docData, ...prev]);
      return docData;
    }
  };

  const updateDocument = async (id: string, updates: Partial<DocumentItem>): Promise<void> => {
    if (isAuthenticated) {
      const original = serverDocuments.find(d => d.id === id);
      setServerDocuments(prev =>
        prev.map(d =>
          d.id === id
            ? {
              ...d,
              ...updates,
              detectedAmount: updates.detectedAmount !== undefined ? Number(updates.detectedAmount) : d.detectedAmount,
              confidenceScore: updates.confidenceScore !== undefined ? Number(updates.confidenceScore) : d.confidenceScore,
            }
            : d
        )
      );

      const res = await api.updateDocument(id, updates);
      if (!res.success) {
        if (original) {
          setServerDocuments(prev => prev.map(d => (d.id === id ? original : d)));
        }
        throw new Error(res.error || 'Failed to update document metadata in cloud database.');
      } else if (res.data) {
        setServerDocuments(prev => prev.map(d => (d.id === id ? res.data! : d)));
      }
    } else {
      setLocalDocuments(prev =>
        prev.map(d =>
          d.id === id
            ? {
              ...d,
              ...updates,
              detectedAmount: updates.detectedAmount !== undefined ? Number(updates.detectedAmount) : d.detectedAmount,
              confidenceScore: updates.confidenceScore !== undefined ? Number(updates.confidenceScore) : d.confidenceScore,
            }
            : d
        )
      );
    }
  };

  const deleteDocument = async (id: string): Promise<void> => {
    if (isAuthenticated) {
      const original = serverDocuments.find(d => d.id === id);
      setServerDocuments(prev => prev.filter(d => d.id !== id));

      const res = await api.deleteDocument(id);
      if (!res.success) {
        if (original) {
          setServerDocuments(prev => [...prev, original]);
        }
        throw new Error(res.error || 'Failed to delete document metadata from cloud database.');
      }
    } else {
      setLocalDocuments(prev => prev.filter(d => d.id !== id));
    }
  };

  const convertDocumentToTransaction = async (
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
  ): Promise<Transaction | null> => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return null;

    if (doc.transactionId) {
      throw new Error(`This document has already been added to your ledger (Transaction ID: ${doc.transactionId}).`);
    }

    if (isAuthenticated) {
      const res = await api.createTransactionFromDocument(docId, overrides);
      if (res.success && res.transaction) {
        setServerTransactions(prev => [res.transaction!, ...prev]);
        if (res.document) {
          setServerDocuments(prev => prev.map(d => (d.id === docId ? res.document! : d)));
        } else {
          setServerDocuments(prev =>
            prev.map(d =>
              d.id === docId
                ? {
                    ...d,
                    detectedMerchant: overrides?.name || d.detectedMerchant,
                    detectedAmount: overrides?.amount !== undefined ? overrides.amount : d.detectedAmount,
                    detectedDate: overrides?.date || d.detectedDate,
                    category: overrides?.category || d.category,
                    taxAmount: overrides?.taxAmount !== undefined ? overrides.taxAmount : d.taxAmount,
                    invoiceNumber: overrides?.invoiceNumber || d.invoiceNumber,
                    transactionId: res.transaction!.id,
                    ocrStatus: 'Extracted',
                  }
                : d
            )
          );
        }
        return res.transaction;
      } else {
        throw new Error(res.error || 'Failed to convert document to transaction.');
      }
    } else {
      const txId = generateUniqueId('tx_ocr');
      const finalName = overrides?.name || doc.detectedMerchant || doc.filename;
      const finalAmount = overrides?.amount !== undefined ? overrides.amount : doc.detectedAmount;
      const finalDate = overrides?.date || doc.detectedDate || formatStandardDate(new Date());
      const finalCategory = (overrides?.category as any) || doc.category || 'Others';

      const newTx: Transaction = {
        id: txId,
        name: finalName,
        category: finalCategory,
        amount: finalAmount,
        date: finalDate,
        type: 'expense',
        paymentMethod: overrides?.paymentMethod || 'OCR Document Ingestion',
        status: 'Completed',
        notes: overrides?.notes || `Receipt "${doc.filename}" (${doc.confidenceScore}% OCR confidence)`,
      };
      setLocalTransactions(prev => [newTx, ...prev]);
      setLocalDocuments(prev =>
        prev.map(d =>
          d.id === docId
            ? {
                ...d,
                detectedMerchant: finalName,
                detectedAmount: finalAmount,
                detectedDate: finalDate,
                category: finalCategory,
                taxAmount: overrides?.taxAmount !== undefined ? overrides.taxAmount : d.taxAmount,
                invoiceNumber: overrides?.invoiceNumber || d.invoiceNumber,
                transactionId: txId,
                ocrStatus: 'Extracted',
              }
            : d
        )
      );
      return newTx;
    }
  };

  // 6. Reset all state to factory sample data
  const resetToSampleData = () => {
    setLocalTransactions(initialTransactions);
    setLocalBudgets(initialBudgets);
    setLocalGoals(initialGoals);
    setLocalBills(initialBills);
    setLocalDocuments(initialDocuments);
    if (!isAuthenticated) {
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.BUDGETS);
      localStorage.removeItem(STORAGE_KEYS.GOALS);
      localStorage.removeItem(STORAGE_KEYS.BILLS);
      localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    }
  };

  return (
    <FinancialContext.Provider
      value={{
        transactions,
        transactionsLoading,
        transactionsError,
        refreshTransactions,

        localRecoveryStatus,
        importLocalTransactionsToCloud,

        budgets,
        budgetsLoading,
        budgetsError,
        refreshBudgets,

        localBudgetRecoveryStatus,
        importLocalBudgetsToCloud,

        goals,
        goalsLoading,
        goalsError,
        refreshGoals,

        localGoalRecoveryStatus,
        importLocalGoalsToCloud,

        bills,
        billsLoading,
        billsError,
        refreshBills,

        recurringTransactions,
        recurringLoading,
        recurringError,
        refreshRecurringTransactions,

        reminderPreferences,
        updateReminderPreferences,

        localBillRecoveryStatus,
        importLocalBillsToCloud,

        documents,
        documentsLoading,
        documentsError,
        refreshDocuments,

        localDocumentRecoveryStatus,
        importLocalDocumentsToCloud,

        selectedMonth,
        setSelectedMonth,
        availableMonths,
        selectedMonthTransactions,

        totalIncome,
        totalExpenses,
        netSavings,
        savingsRate,
        predictedNextMonthExpense,
        predictedExpenseTrend,
        categoryBreakdown,
        budgetsWithSpent,
        recentTransactions,
        spendingTrendDatasets,
        forecastSparkline,
        topMerchants,
        spendingVolatility,
        periodComparison,

        addTransaction,
        addTransactions,
        updateTransaction,
        deleteTransaction,

        updateBudgetLimit,
        updateBudget,
        addBudgetCategory,
        deleteBudget,

        createGoal,
        updateGoal,
        deleteGoal,
        contributeToGoal,

        payBill,
        addBill,
        updateBill,
        deleteBill,

        addRecurringTransaction,
        updateRecurringTransaction,
        toggleRecurringTransactionStatus,
        processRecurringTransaction,
        deleteRecurringTransaction,

        uploadDocument,
        updateDocument,
        deleteDocument,
        convertDocumentToTransaction,

        resetToSampleData,
      }}
    >
      {children}
    </FinancialContext.Provider>
  );
};

export const useFinancial = (): FinancialContextType => {
  const context = useContext(FinancialContext);
  if (!context) {
    throw new Error('useFinancial must be used within a FinancialProvider');
  }
  return context;
};
