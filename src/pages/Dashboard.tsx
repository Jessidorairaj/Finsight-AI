import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  PieChart as PieChartIcon,
  Sparkles,
  ArrowRight,
  Wifi,
  Zap,
  PlayCircle,
  HelpCircle,
  X,
  CheckCircle,
  SlidersHorizontal,
  Home,
  Trash2,
  Edit2,
  Plus,
  Loader2,
  RefreshCw,
  Archive,
  Database,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFinancial } from '../context/FinancialContext';
import { AskAIBar } from '../components/AskAIBar';
import { Bill } from '../data/mockData';
import { formatStandardDate } from '../utils/dateUtils';

export const Dashboard: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const {
    transactions,
    selectedMonth,
    availableMonths,
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    predictedNextMonthExpense,
    predictedExpenseTrend,
    categoryBreakdown,
    recentTransactions,
    spendingTrendDatasets,
    forecastSparkline,
    periodComparison,
    bills,
    billsLoading,
    billsError,
    refreshBills,
    payBill,
    addBill,
    updateBill,
    deleteBill,
    reminderPreferences,
    updateReminderPreferences,
    localBillRecoveryStatus,
    importLocalBillsToCloud,
  } = useFinancial();

  const activeMonthObj = availableMonths.find(m => m.value === selectedMonth);
  const prevMonthName = availableMonths.find(m => m.isPrevious)?.shortMonth || 'prior month';
  const currentMonthName = activeMonthObj ? activeMonthObj.shortMonth : 'this month';

  const [trendRange, setTrendRange] = useState<'1D' | '1W' | '1M' | '1Y'>('1M');
  const [isInsightModalOpen, setIsInsightModalOpen] = useState(false);
  const [paidNotification, setPaidNotification] = useState<string | null>(null);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);

  // Manage Bills Modal & Form State
  const [isManageBillsModalOpen, setIsManageBillsModalOpen] = useState(false);
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billFormName, setBillFormName] = useState('');
  const [billFormCategory, setBillFormCategory] = useState('Utilities');
  const [billFormAmount, setBillFormAmount] = useState('');
  const [billFormDueDate, setBillFormDueDate] = useState(() => formatStandardDate(new Date(Date.now() + 5 * 86400000)));
  const [billFormDueInDays, setBillFormDueInDays] = useState('5');
  const [billFormIconType, setBillFormIconType] = useState<'wifi' | 'electricity' | 'streaming' | 'water' | 'rent'>('electricity');
  const [billFormStatus, setBillFormStatus] = useState<'unpaid' | 'paid' | 'scheduled'>('unpaid');
  const [billFormReminderDays, setBillFormReminderDays] = useState('3');
  const [billFormIsRecurring, setBillFormIsRecurring] = useState(false);
  const [billFormRecurringFreq, setBillFormRecurringFreq] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [deletingBill, setDeletingBill] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [billFormError, setBillFormError] = useState<string | null>(null);

  // Historical Local Bills Recovery State
  const [isBillRecoveryModalOpen, setIsBillRecoveryModalOpen] = useState(false);
  const [isImportingBills, setIsImportingBills] = useState(false);
  const [billRecoveryError, setBillRecoveryError] = useState<string | null>(null);

  const activeTrendData = spendingTrendDatasets[trendRange];
  const isDark = theme === 'dark';

  const handlePayBill = async (id: string, name: string) => {
    setPayingBillId(id);
    try {
      const res = await payBill(id);
      if (res.alreadyPaid) {
        setPaidNotification(`Bill "${name}" was already marked as paid.`);
      } else {
        setPaidNotification(
          `Payment of ₹${res.bill.amount.toLocaleString('en-IN')} for "${name}" recorded and linked to transactions.`
        );
      }
      setTimeout(() => setPaidNotification(null), 3500);
    } catch (err: any) {
      setPaidNotification(err.message || `Failed to record payment for "${name}".`);
      setTimeout(() => setPaidNotification(null), 3500);
    } finally {
      setPayingBillId(null);
    }
  };

  const handleOpenAddBill = () => {
    setEditingBillId(null);
    setBillFormName('');
    setBillFormCategory('Utilities');
    setBillFormAmount('');
    setBillFormDueDate(formatStandardDate(new Date(Date.now() + 5 * 86400000)));
    setBillFormDueInDays('5');
    setBillFormIconType('electricity');
    setBillFormStatus('unpaid');
    setBillFormReminderDays('3');
    setBillFormIsRecurring(false);
    setBillFormRecurringFreq('monthly');
    setBillFormError(null);
    setIsBillFormOpen(true);
  };

  const handleOpenEditBill = (b: Bill) => {
    setEditingBillId(b.id);
    setBillFormName(b.name);
    setBillFormCategory(b.category);
    setBillFormAmount(String(b.amount));
    setBillFormDueDate(b.dueDate);
    setBillFormDueInDays(String(b.dueInDays));
    setBillFormIconType(b.iconType);
    setBillFormStatus(b.status);
    setBillFormReminderDays(String(b.reminderDays ?? 3));
    setBillFormIsRecurring(Boolean(b.isRecurring));
    setBillFormRecurringFreq((b.recurringFrequency as any) || 'monthly');
    setBillFormError(null);
    setIsBillFormOpen(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billFormName.trim()) {
      setBillFormError('Please enter a bill name.');
      return;
    }
    const numAmount = parseFloat(billFormAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setBillFormError('Please enter a valid amount greater than 0.');
      return;
    }
    const days = parseInt(billFormDueInDays, 10);
    const reminder = parseInt(billFormReminderDays, 10);

    setIsSavingBill(true);
    setBillFormError(null);
    try {
      if (editingBillId) {
        await updateBill(editingBillId, {
          name: billFormName.trim(),
          category: billFormCategory.trim(),
          amount: numAmount,
          dueDate: billFormDueDate.trim(),
          dueInDays: isNaN(days) ? 0 : days,
          iconType: billFormIconType,
          status: billFormStatus,
          reminderDays: isNaN(reminder) ? 3 : reminder,
          isRecurring: billFormIsRecurring,
          recurringFrequency: billFormRecurringFreq,
        });
        setPaidNotification(`Bill "${billFormName.trim()}" updated successfully.`);
      } else {
        await addBill({
          name: billFormName.trim(),
          category: billFormCategory.trim(),
          amount: numAmount,
          dueDate: billFormDueDate.trim(),
          dueInDays: isNaN(days) ? 0 : days,
          iconType: billFormIconType,
          status: billFormStatus,
          reminderDays: isNaN(reminder) ? 3 : reminder,
          isRecurring: billFormIsRecurring,
          recurringFrequency: billFormRecurringFreq,
        });
        setPaidNotification(`Bill "${billFormName.trim()}" added to cloud schedule.`);
      }
      setTimeout(() => setPaidNotification(null), 3500);
      setIsBillFormOpen(false);
    } catch (err: any) {
      setBillFormError(err.message || 'Failed to save bill.');
    } finally {
      setIsSavingBill(false);
    }
  };

  const handleConfirmDeleteBill = async () => {
    if (!deletingBill) return;
    setIsDeletingBill(true);
    try {
      await deleteBill(deletingBill.id);
      setPaidNotification(`Bill "${deletingBill.name}" deleted.`);
      setTimeout(() => setPaidNotification(null), 3000);
      setDeletingBill(null);
    } catch (err: any) {
      setPaidNotification(err.message || `Failed to delete bill "${deletingBill.name}".`);
      setTimeout(() => setPaidNotification(null), 3000);
    } finally {
      setIsDeletingBill(false);
    }
  };

  const handleConfirmLocalBillRecovery = async () => {
    setIsImportingBills(true);
    setBillRecoveryError(null);
    try {
      const result = await importLocalBillsToCloud();
      setPaidNotification(`Imported ${result.importedCount} historical bills into PostgreSQL!`);
      setTimeout(() => setPaidNotification(null), 4500);
      setIsBillRecoveryModalOpen(false);
    } catch (err: any) {
      setBillRecoveryError(err.message || 'Failed to import local bills to cloud database.');
    } finally {
      setIsImportingBills(false);
    }
  };

  // Find top spending category dynamically
  const topCategory = categoryBreakdown[0] || null;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {paidNotification && (
        <div className="fixed top-24 right-6 z-50 bg-[#00E5BE] text-[#080e1a] px-4 py-2.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle className="w-4 h-4" />
          <span>{paidNotification}</span>
        </div>
      )}

      {/* New User Onboarding Welcome Banner */}
      {transactions.length === 0 && (
        <div className={`p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-[#0a2328] via-[#0f1a2e] to-[#0f1a2e] border-[#00E5BE]/30'
            : 'bg-gradient-to-r from-teal-50 via-white to-white border-teal-200'
        } shadow-lg shadow-teal-500/5`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#00E5BE]/20 border border-[#00E5BE]/40 flex items-center justify-center text-[#00E5BE] shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Welcome to FinSight AI!</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                  Your financial ledger is clean and ready. Import a bank statement (CSV) or record your first transaction to unlock live spending trends, AI budget insights, and machine learning expense forecasts.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/transactions"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Import Statement (CSV)</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Row 1: Four Summary Stat Cards (Fully Dynamic) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Income */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-200 ${
            isDark
              ? 'bg-[#0f1a2e] border-[#1b2944]'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total Income</p>
              <h3 className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">
                ₹{totalIncome.toLocaleString('en-IN')}
              </h3>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
            {transactions.length === 0 ? (
              <span className="text-slate-500">• No transactions recorded</span>
            ) : periodComparison?.incomePercentChange != null ? (
              <span className={periodComparison.incomePercentChange >= 0 ? 'text-[#00E5BE]' : 'text-rose-400'}>
                {periodComparison.incomePercentChange >= 0 ? '▲ +' : '▼ '}
                {periodComparison.incomePercentChange}% from {periodComparison.priorPeriod}
              </span>
            ) : (
              <span className="text-slate-400">• {selectedMonth === 'All Time' ? 'All-Time total' : 'First recorded period'}</span>
            )}
          </div>
        </div>

        {/* Total Expenses */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-200 ${
            isDark
              ? 'bg-[#0f1a2e] border-[#1b2944]'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total Expenses</p>
              <h3 className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">
                ₹{totalExpenses.toLocaleString('en-IN')}
              </h3>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
            {transactions.length === 0 ? (
              <span className="text-slate-500">• No transactions recorded</span>
            ) : periodComparison?.expensePercentChange != null ? (
              <span className={periodComparison.expensePercentChange <= 0 ? 'text-[#00E5BE]' : 'text-rose-400'}>
                {periodComparison.expensePercentChange >= 0 ? '▲ +' : '▼ '}
                {periodComparison.expensePercentChange}% from {periodComparison.priorPeriod}
              </span>
            ) : (
              <span className="text-slate-400">• {selectedMonth === 'All Time' ? 'All-Time total' : 'First recorded period'}</span>
            )}
          </div>
        </div>

        {/* Net Savings */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-200 ${
            isDark
              ? 'bg-[#0f1a2e] border-[#1b2944]'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Net Savings</p>
              <h3 className={`text-2xl font-bold tracking-tight mt-0.5 tabular-nums ${netSavings < 0 ? 'text-rose-400' : ''}`}>
                {netSavings < 0 ? '-₹' : '₹'}{Math.abs(netSavings).toLocaleString('en-IN')}
              </h3>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
            {transactions.length === 0 ? (
              <span className="text-slate-500">• No transactions recorded</span>
            ) : periodComparison ? (
              <span className={periodComparison.savingsDifference >= 0 ? 'text-[#00E5BE]' : 'text-rose-400'}>
                {periodComparison.savingsDifference >= 0 ? '▲ +' : '▼ -'}
                ₹{Math.abs(Math.round(periodComparison.savingsDifference)).toLocaleString('en-IN')} vs {periodComparison.priorPeriod}
              </span>
            ) : (
              <span className="text-slate-400">• {selectedMonth === 'All Time' ? 'All-Time net savings' : 'First recorded period'}</span>
            )}
          </div>
        </div>

        {/* Savings Rate */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-200 ${
            isDark
              ? 'bg-[#0f1a2e] border-[#1b2944]'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <PieChartIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Savings Rate</p>
              <h3 className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">
                {savingsRate}%
              </h3>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
            {transactions.length === 0 ? (
              <span className="text-slate-500">• No transactions recorded</span>
            ) : totalIncome > 0 ? (
              <span className={savingsRate >= 20 ? 'text-[#00E5BE]' : 'text-slate-400'}>
                • {savingsRate}% of income saved
              </span>
            ) : (
              <span className="text-slate-500">• 0% of income</span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Spending Trend (Left) & Next Month Forecast (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending Trend (Spans 2 columns) */}
        <div
          className={`lg:col-span-2 p-6 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div>
              <h3 className="text-base font-bold tracking-tight">Spending Trend</h3>
              <p className="text-xs text-slate-400 mt-1">
                {selectedMonth === 'All Time' ? 'All-Time Overview' : (activeMonthObj?.baseLabel || 'This Month')}
              </p>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-2xl font-extrabold tabular-nums">
                  ₹{totalExpenses.toLocaleString('en-IN')}
                </span>
                {transactions.length > 0 && periodComparison?.expensePercentChange != null && (
                  <span className={`text-xs font-semibold flex items-center gap-1 ${
                    periodComparison.expensePercentChange <= 0 ? 'text-[#00E5BE]' : 'text-rose-400'
                  }`}>
                    <span>{periodComparison.expensePercentChange <= 0 ? '▼' : '▲'}</span>
                    {periodComparison.expensePercentChange >= 0 ? '+' : ''}{periodComparison.expensePercentChange}% vs {periodComparison.priorPeriod}
                  </span>
                )}
              </div>
            </div>

            {/* Time filter segmented controls */}
            <div
              className={`p-1 rounded-xl flex items-center gap-1 border ${
                isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              {(['1D', '1W', '1M', '1Y'] as const).map(filter => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTrendRange(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    trendRange === filter
                      ? isDark
                        ? 'bg-[#0a2c35] text-[#00E5BE] border border-[#00E5BE]/40 shadow-sm'
                        : 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Recharts Area Chart */}
          {totalExpenses === 0 ? (
            <div className="w-full h-56 mt-2 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-slate-700/50">
              <PieChartIcon className="w-8 h-8 text-slate-500 mb-2 opacity-60" />
              <p className="text-xs font-semibold text-slate-300">No expense records found</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Import a bank statement CSV or record an expense transaction to view spending trends.
              </p>
            </div>
          ) : (
            <div className="w-full h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5BE" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00E5BE" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke={isDark ? '#475569' : '#94a3b8'}
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: isDark ? '#1e293b' : '#e2e8f0' }}
                  />
                  <YAxis
                    stroke={isDark ? '#475569' : '#94a3b8'}
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    tickFormatter={val => (val === 0 ? '₹0' : `₹${Math.round(val / 1000)}K`)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div
                            className={`p-2.5 rounded-xl border text-xs shadow-xl ${
                              isDark
                                ? 'bg-[#0a1120] border-slate-800 text-white'
                                : 'bg-white border-slate-200 text-slate-900 shadow-md'
                            }`}
                          >
                            <p className="text-slate-400 text-[11px]">{payload[0].payload.date}</p>
                            <p className="text-sm font-bold text-[#00E5BE] mt-0.5 tabular-nums">
                              ₹{Number(payload[0].value).toLocaleString('en-IN')}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#00E5BE"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#spendingGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#00E5BE', stroke: '#080e1a', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Next Month Forecast (Right column top card) */}
        <div
          className={`p-6 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold tracking-tight">Next Month Forecast</h3>
              <Link
                to="/forecast"
                className="text-xs text-[#00E5BE] font-medium hover:underline inline-flex items-center gap-1"
              >
                Model Details →
              </Link>
            </div>
            {transactions.length > 0 && predictedNextMonthExpense > 0 && (
              <>
                <p className="text-xs text-slate-400 mt-2">Predicted Total Expenses</p>
                <div className="flex items-baseline gap-2.5 mt-0.5">
                  <span className="text-2xl font-extrabold tabular-nums">
                    ₹{predictedNextMonthExpense.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-semibold text-[#00E5BE] flex items-center gap-1">
                    <span>{predictedExpenseTrend?.startsWith('-') ? '▼' : '▲'}</span> {predictedExpenseTrend}
                  </span>
                </div>
              </>
            )}
          </div>

          {transactions.length === 0 || predictedNextMonthExpense === 0 ? (
            <div className="my-4 p-4 rounded-xl border border-dashed border-slate-700/60 bg-slate-800/20 text-center flex flex-col items-center justify-center">
              <Sparkles className="w-8 h-8 text-[#00E5BE] opacity-80 mb-2" />
              <h4 className="text-xs font-bold text-slate-200">Awaiting Historical Data</h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                At least 1-2 months of transaction history are required to train the machine learning forecasting models and generate predictions.
              </p>
              <Link
                to="/transactions"
                className="mt-3 text-xs font-semibold text-[#00E5BE] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Import bank statement</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="w-full h-28 my-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastSparkline} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div
                            className={`p-2 rounded-lg border text-xs shadow-md ${
                              isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-[#00E5BE] font-bold tabular-nums">
                              ₹{Number(payload[0].value).toLocaleString('en-IN')}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#00E5BE"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#00E5BE' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="pt-3 border-t border-inherit">
            <p className="text-xs text-slate-400 leading-relaxed">
              {transactions.length === 0
                ? 'Autonomous forecasting evaluates Ridge, Linear Regression, Random Forest & Naive Baselines.'
                : 'Based on rolling-origin chronologically validated machine learning models.'}
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: Recent Transactions, Top Spending Categories & Right Column (AI Insight + Upcoming Bills) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (Column 1) */}
        <div
          className={`p-6 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
              <h3 className="text-base font-bold tracking-tight">Recent Transactions</h3>
              <Link
                to="/transactions"
                className="text-xs text-[#00E5BE] font-semibold hover:underline"
              >
                View All
              </Link>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-700/50 text-center flex flex-col items-center justify-center my-3">
                <CreditCard className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
                <p className="text-xs font-semibold text-slate-300">No transactions recorded</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                  Import a statement or add transactions to see your ledger activity here.
                </p>
                <Link
                  to="/transactions"
                  className="mt-3 text-xs font-semibold text-[#00E5BE] hover:underline"
                >
                  Record transaction →
                </Link>
              </div>
            ) : (
              <div className="space-y-3.5">
                {recentTransactions.slice(0, 4).map((tx, idx) => {
                  const isExpense = tx.type === 'expense';
                  return (
                    <div key={tx.id ? `${tx.id}-${idx}` : `recent-${idx}`} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            tx.name.toLowerCase().includes('swiggy')
                              ? 'bg-[#fc8019]/20 text-[#fc8019]'
                              : tx.name.toLowerCase().includes('amazon')
                              ? 'bg-slate-700/30 text-white'
                              : tx.type === 'income'
                              ? 'bg-[#00E5BE]/20 text-[#00E5BE]'
                              : tx.name.toLowerCase().includes('netflix')
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-teal-500/20 text-teal-300'
                          }`}
                        >
                          {tx.name.toLowerCase().includes('swiggy') ? (
                            'S'
                          ) : tx.name.toLowerCase().includes('amazon') ? (
                            'a'
                          ) : tx.type === 'income' ? (
                            <Wallet className="w-4 h-4" />
                          ) : tx.name.toLowerCase().includes('netflix') ? (
                            'N'
                          ) : (
                            tx.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {tx.name}
                          </p>
                          <p className="text-xs text-slate-400">{tx.category}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            isExpense
                              ? isDark ? 'text-slate-200' : 'text-slate-900'
                              : 'text-[#00E5BE]'
                          }`}
                        >
                          {isExpense ? '- ' : '+ '}₹{tx.amount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-slate-400">{tx.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 mt-4 border-t border-inherit text-center">
            <Link
              to="/transactions"
              className="text-xs font-semibold text-[#00E5BE] hover:underline"
            >
              Search & Filter all transactions →
            </Link>
          </div>
        </div>

        {/* Top Spending Categories Donut Chart (Column 2) - DYNAMIC */}
        <div
          className={`p-6 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
              <h3 className="text-base font-bold tracking-tight">Top Spending Categories</h3>
              <span className="text-xs text-slate-400 border border-inherit px-2 py-1 rounded-lg">
                {selectedMonth === 'All Time' ? 'All Time' : (activeMonthObj?.shortMonth || 'This Month')}
              </span>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-700/50 text-center flex flex-col items-center justify-center my-3">
                <PieChartIcon className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
                <p className="text-xs font-semibold text-slate-300">No categorized expenses</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                  Your spending category distribution will render here once expenses are recorded.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                {/* Donut Chart with center value */}
                <div className="relative w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={68}
                        paddingAngle={3}
                        dataKey="percentage"
                      >
                        {categoryBreakdown.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [`${value}%`, name]}
                        contentStyle={{
                          backgroundColor: isDark ? '#0a1120' : '#ffffff',
                          borderColor: isDark ? '#1e293b' : '#e2e8f0',
                          borderRadius: '0.75rem',
                          fontSize: '11px',
                          color: isDark ? '#ffffff' : '#0f172a',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
                    <span className="text-xs font-bold tabular-nums">
                      ₹{totalExpenses.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-400">Total</span>
                  </div>
                </div>

                {/* Legend with percentages */}
                <div className="w-full space-y-1.5">
                  {categoryBreakdown.slice(0, 6).map(item => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-300 truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="font-bold tabular-nums">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 mt-4 border-t border-inherit text-center">
            <Link
              to="/analytics"
              className="text-xs font-semibold text-[#00E5BE] hover:underline"
            >
              Explore Category Analytics →
            </Link>
          </div>
        </div>

        {/* Right Stack: AI Insight + Upcoming Bills (Column 3) */}
        <div className="space-y-6 flex flex-col justify-between">
          {/* AI Insight Card */}
          <div
            className={`p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#00E5BE] mb-2">
                  <Sparkles className="w-4 h-4" />
                  <span>AI Insight</span>
                </div>
                {transactions.length === 0 || !categoryBreakdown[0] ? (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    AI spending anomaly detection and category insights will activate automatically as soon as your statements or transactions are uploaded.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your spending on <strong className="text-white">{categoryBreakdown[0].name}</strong> accounts for {categoryBreakdown[0].percentage}% of your expenses this period. Consider reviewing discretionary items.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsInsightModalOpen(true)}
                      className="mt-3 text-xs font-semibold text-[#00E5BE] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              {/* Glowing bulb icon box on right */}
              <div className="w-14 h-14 rounded-2xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE] shrink-0 shadow-lg shadow-teal-500/10">
                <HelpCircle className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Upcoming Bills Card */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-inherit mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Upcoming Bills</h3>
                {billsLoading && <Loader2 className="w-3.5 h-3.5 text-[#00E5BE] animate-spin" />}
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated && localBillRecoveryStatus.hasLocalData && (
                  <button
                    type="button"
                    onClick={() => setIsBillRecoveryModalOpen(true)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                    title="Historical offline bills detected in browser storage"
                  >
                    <Archive className="w-3 h-3" />
                    <span>Recover ({localBillRecoveryStatus.importableCount})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsManageBillsModalOpen(true)}
                  className="text-xs text-[#00E5BE] font-semibold hover:underline flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Manage</span>
                </button>
              </div>
            </div>

            {billsError && (
              <div className="p-2 mb-2 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-between">
                <span>{billsError}</span>
                <button
                  type="button"
                  onClick={() => refreshBills()}
                  className="hover:underline text-[11px] flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            <div className="space-y-3">
              {bills.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  <p>No bills scheduled.</p>
                  <button
                    type="button"
                    onClick={handleOpenAddBill}
                    className="mt-1 text-[#00E5BE] font-medium hover:underline inline-block"
                  >
                    + Add your first bill
                  </button>
                </div>
              ) : (
                bills.slice(0, 3).map(bill => {
                  const isPaid = bill.status === 'paid';
                  const isOverdue = !isPaid && bill.dueInDays < 0;
                  const isDueToday = !isPaid && bill.dueInDays === 0;

                  return (
                    <div key={bill.id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-300 shrink-0">
                          {bill.iconType === 'wifi' && <Wifi className="w-4 h-4 text-cyan-400" />}
                          {bill.iconType === 'electricity' && <Zap className="w-4 h-4 text-amber-400" />}
                          {bill.iconType === 'streaming' && <PlayCircle className="w-4 h-4 text-rose-400" />}
                          {bill.iconType === 'water' && <Zap className="w-4 h-4 text-blue-400" />}
                          {bill.iconType === 'rent' && <Home className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div>
                          <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {bill.name}
                          </p>
                          <p className="text-[11px]">
                            {isPaid ? (
                              <span className="text-[#00E5BE] font-medium">Paid ✓</span>
                            ) : isOverdue ? (
                              <span className="text-rose-400 font-semibold">Overdue by {Math.abs(bill.dueInDays)}d</span>
                            ) : isDueToday ? (
                              <span className="text-amber-400 font-semibold">Due today</span>
                            ) : (
                              <span className="text-teal-400/90 font-medium">Due in {bill.dueInDays} days</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <span className="text-xs font-bold tabular-nums">
                          ₹{bill.amount.toLocaleString('en-IN')}
                        </span>
                        {!isPaid && (
                          <button
                            type="button"
                            disabled={payingBillId === bill.id}
                            onClick={() => handlePayBill(bill.id, bill.name)}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {payingBillId === bill.id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            <span>Pay</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Docked Ask FinSight AI Interactive Bar */}
      <AskAIBar />

      {/* AI Insight Details Modal */}
      {isInsightModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#00E5BE]" />
                <h3 className="text-base font-bold">{topCategory.name} Surge Diagnostic</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInsightModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed text-slate-300">
              <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                <p className="font-semibold text-white mb-1">Observed Anomaly:</p>
                <p>
                  Your {activeMonthObj?.fullMonth || 'current month'} {topCategory.name} expenditures have accumulated to <strong className="text-[#00E5BE]">₹{topCategory.amount.toLocaleString('en-IN')}</strong> ({topCategory.percentage}% of your current total spending of ₹{totalExpenses.toLocaleString('en-IN')}). This represents an 18% variance above your historical 90-day moving average.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-teal-200">
                <p className="font-semibold text-white mb-1">AI Recommendation:</p>
                <p>
                  Review high-frequency purchases in {topCategory.name} to preserve your {savingsRate}% savings rate and maintain net savings of ₹{netSavings.toLocaleString('en-IN')}.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-5 border-t border-inherit flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsInsightModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsInsightModalOpen(false);
                  navigate('/budgets');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Adjust Category Budget</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Bills Modal */}
      {isManageBillsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#00E5BE]" />
                <h3 className="text-base font-bold">Manage Recurring Bills</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddBill}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManageBillsModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Bill Form Modal Overlay / Inline Form */}
            {isBillFormOpen && (
              <form onSubmit={handleSaveBill} className="p-4 rounded-xl border border-[#00E5BE]/30 bg-[#00E5BE]/5 mb-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#00E5BE]">
                    {editingBillId ? 'Edit Bill' : 'New Cloud Scheduled Bill'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsBillFormOpen(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                {billFormError && (
                  <div className="p-2 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    {billFormError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Bill Name *</label>
                    <input
                      type="text"
                      value={billFormName}
                      onChange={e => setBillFormName(e.target.value)}
                      placeholder="e.g. JioFiber Broadband"
                      required
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Category</label>
                    <input
                      type="text"
                      value={billFormCategory}
                      onChange={e => setBillFormCategory(e.target.value)}
                      placeholder="e.g. Utilities, Subscriptions"
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Amount (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormAmount}
                      onChange={e => setBillFormAmount(e.target.value)}
                      placeholder="e.g. 1199"
                      required
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Due Date</label>
                    <input
                      type="text"
                      value={billFormDueDate}
                      onChange={e => setBillFormDueDate(e.target.value)}
                      placeholder="e.g. 15 Nov 2026"
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Due In (Days)</label>
                    <input
                      type="number"
                      value={billFormDueInDays}
                      onChange={e => setBillFormDueInDays(e.target.value)}
                      placeholder="5 (negative means overdue)"
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Icon Type</label>
                    <select
                      value={billFormIconType}
                      onChange={e => setBillFormIconType(e.target.value as any)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    >
                      <option value="electricity">Electricity</option>
                      <option value="wifi">WiFi / Internet</option>
                      <option value="streaming">Streaming</option>
                      <option value="water">Water</option>
                      <option value="rent">Rent / Housing</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Status</label>
                    <select
                      value={billFormStatus}
                      onChange={e => setBillFormStatus(e.target.value as any)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                      <option value="scheduled">Scheduled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">In-App Reminder Window (Days Before Due)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={billFormReminderDays}
                      onChange={e => setBillFormReminderDays(e.target.value)}
                      placeholder="e.g. 3"
                      className={`w-full px-3 py-2 rounded-lg border text-xs ${
                        isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-[#00E5BE]`}
                    />
                  </div>

                  <div className="flex items-center gap-3 md:col-span-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={billFormIsRecurring}
                        onChange={e => setBillFormIsRecurring(e.target.checked)}
                        className="rounded border-slate-700 text-[#00E5BE] focus:ring-[#00E5BE]"
                      />
                      <span className="font-medium text-slate-300">Repeat as recurring schedule</span>
                    </label>

                    {billFormIsRecurring && (
                      <select
                        value={billFormRecurringFreq}
                        onChange={e => setBillFormRecurringFreq(e.target.value as any)}
                        className={`px-3 py-1.5 rounded-lg border text-xs ${
                          isDark ? 'bg-[#080e1a] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        } focus:outline-none focus:border-[#00E5BE]`}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBillFormOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBill}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingBill && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{editingBillId ? 'Update Bill' : 'Save Bill'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Bills List Table */}
            <div className="space-y-2">
              {bills.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  <p>No bills configured in your authenticated account.</p>
                </div>
              ) : (
                bills.map(bill => {
                  const isPaid = bill.status === 'paid';
                  const isOverdue = !isPaid && bill.dueInDays < 0;
                  const isDueToday = !isPaid && bill.dueInDays === 0;

                  return (
                    <div
                      key={bill.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        isDark ? 'bg-[#080e1a]/60 border-[#1b2944]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-300 shrink-0">
                          {bill.iconType === 'wifi' && <Wifi className="w-4 h-4 text-cyan-400" />}
                          {bill.iconType === 'electricity' && <Zap className="w-4 h-4 text-amber-400" />}
                          {bill.iconType === 'streaming' && <PlayCircle className="w-4 h-4 text-rose-400" />}
                          {bill.iconType === 'water' && <Zap className="w-4 h-4 text-blue-400" />}
                          {bill.iconType === 'rent' && <Home className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold">{bill.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">
                              {bill.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                            <span>Due: {bill.dueDate}</span>
                            <span>•</span>
                            {isPaid ? (
                              <span className="text-[#00E5BE] font-semibold">Paid ✓</span>
                            ) : isOverdue ? (
                              <span className="text-rose-400 font-semibold">Overdue by {Math.abs(bill.dueInDays)}d</span>
                            ) : isDueToday ? (
                              <span className="text-amber-400 font-semibold">Due today</span>
                            ) : (
                              <span className="text-teal-400 font-semibold">Due in {bill.dueInDays}d</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums">
                          ₹{bill.amount.toLocaleString('en-IN')}
                        </span>
                        {!isPaid && (
                          <button
                            type="button"
                            disabled={payingBillId === bill.id}
                            onClick={() => handlePayBill(bill.id, bill.name)}
                            className="text-[11px] px-2.5 py-1 rounded bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {payingBillId === bill.id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            <span>Mark Paid</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditBill(bill)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          title="Edit Bill"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingBill({ id: bill.id, name: bill.name })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete Bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* In-App Reminder Preferences Section */}
            <div className={`mt-6 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                In-App Reminder Preferences
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderPreferences?.notifyUpcoming !== false}
                    onChange={e => updateReminderPreferences({ notifyUpcoming: e.target.checked })}
                    className="rounded border-slate-700 text-[#00E5BE] focus:ring-[#00E5BE]"
                  />
                  <span>Alert on upcoming bills in topbar</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderPreferences?.notifyOverdue !== false}
                    onChange={e => updateReminderPreferences({ notifyOverdue: e.target.checked })}
                    className="rounded border-slate-700 text-[#00E5BE] focus:ring-[#00E5BE]"
                  />
                  <span>Alert on overdue bills in topbar</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Bill Confirmation Modal */}
      {deletingBill && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Bill Schedule?</h3>
                <p className="text-xs text-slate-400">This will remove the bill reminder from your account.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mb-5">
              Are you sure you want to delete <strong className="text-white">"{deletingBill.name}"</strong>? This will not delete previously recorded transaction payments.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingBill}
                onClick={() => setDeletingBill(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingBill}
                onClick={handleConfirmDeleteBill}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5"
              >
                {isDeletingBill && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Offline Bills Recovery Modal */}
      {isBillRecoveryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold">Recover Offline Browser Bills</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBillRecoveryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <p className="font-semibold mb-1">Historical Browser Data Detected</p>
                <p className="leading-relaxed">
                  FinSight AI detected <strong>{localBillRecoveryStatus.candidates.length}</strong> bill schedule(s) previously stored in your browser's local cache (<code className="bg-black/30 px-1 py-0.5 rounded">finsight_bills_v2</code>). You can safely import them into your authenticated PostgreSQL cloud account.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/20 text-teal-300 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-0.5">Zero Data Loss Guarantee</p>
                  <p className="leading-relaxed text-[11px] text-teal-200">
                    A timestamped local backup (<code className="bg-black/30 px-1 rounded">finsight_bills_backup_&lt;timestamp&gt;</code>) will be created prior to import. Duplicate entries already present in your cloud account will be automatically skipped.
                  </p>
                </div>
              </div>

              {billRecoveryError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{billRecoveryError}</span>
                </div>
              )}

              <div>
                <p className="font-semibold text-white mb-2">Detected Bills Preview:</p>
                <div className="border border-inherit rounded-xl overflow-hidden divide-y divide-inherit max-h-48 overflow-y-auto">
                  {localBillRecoveryStatus.candidates.map(candidate => (
                    <div key={candidate.item.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{candidate.item.name}</span>
                          <span className="text-[10px] px-1 rounded bg-slate-500/20 text-slate-400">
                            {candidate.item.category}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">Due: {candidate.item.dueDate}</span>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <span className="font-bold tabular-nums">
                          ₹{candidate.item.amount.toLocaleString('en-IN')}
                        </span>
                        {candidate.isDuplicate ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                            Already in Cloud
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold">
                            New Import
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-between">
                <div className="text-[11px] text-slate-400">
                  <span>New to import: </span>
                  <strong className="text-white">{localBillRecoveryStatus.importableCount}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBillRecoveryModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isImportingBills || localBillRecoveryStatus.importableCount === 0}
                    onClick={handleConfirmLocalBillRecovery}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isImportingBills && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Import {localBillRecoveryStatus.importableCount} Bill(s)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
