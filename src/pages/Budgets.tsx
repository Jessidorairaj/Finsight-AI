import React, { useState } from 'react';
import {
  Wallet,
  Plus,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Edit2,
  Trash2,
  Sparkles,
  X,
  AlertCircle,
  Loader2,
  RefreshCw,
  Archive,
  ArrowDownToLine,
  Check,
  Database,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFinancial, BudgetWithSpent } from '../context/FinancialContext';
import { CATEGORY_COLORS } from '../data/mockData';

export const Budgets: React.FC = () => {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    budgets,
    budgetsWithSpent,
    budgetsLoading,
    budgetsError,
    refreshBudgets,
    updateBudgetLimit,
    updateBudget,
    addBudgetCategory,
    deleteBudget,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    localBudgetRecoveryStatus,
    importLocalBudgetsToCloud,
  } = useFinancial();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpent | null>(null);

  const [categoryName, setCategoryName] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [selectedColor, setSelectedColor] = useState('#00E5BE');
  const [budgetMonth, setBudgetMonth] = useState('All');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // In-app Delete Confirmation Modal State
  const [deletingBudget, setDeletingBudget] = useState<BudgetWithSpent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Historical Local Data Recovery State
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [hasDismissedRecovery, setHasDismissedRecovery] = useState(false);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const totalAllocated = budgetsWithSpent.reduce((sum, b) => sum + b.allocated, 0);
  const totalSpent = budgetsWithSpent.reduce((sum, b) => sum + b.spent, 0);
  const remainingBudget = Math.max(Number((totalAllocated - totalSpent).toFixed(2)), 0);
  const overallUsedPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  const standardCategories = [
    'Food & Dining',
    'Shopping',
    'Bills & Utilities',
    'Transport',
    'Entertainment',
    'Healthcare',
    'Others',
  ];

  const handleOpenModal = (b?: BudgetWithSpent) => {
    if (b) {
      setEditingBudget(b);
      setCategoryName(b.category);
      setAllocatedAmount(String(b.allocated));
      setSelectedColor(b.color || '#00E5BE');
      setBudgetMonth(b.month || 'All');
    } else {
      setEditingBudget(null);
      setCategoryName('Food & Dining');
      setAllocatedAmount('');
      setSelectedColor('#00E5BE');
      setBudgetMonth(selectedMonth && selectedMonth !== 'All Time' ? selectedMonth : 'All');
    }
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(allocatedAmount);
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('Please enter a valid positive monthly limit.');
      return;
    }
    const cat = categoryName.trim();
    if (!cat) {
      setErrorMessage('Please enter a category name.');
      return;
    }

    const targetMonth = budgetMonth && budgetMonth.trim() !== '' ? budgetMonth.trim() : 'All';

    // Duplicate check: prevent duplicate budgets for the same user, month, and category
    const duplicate = budgets.find(
      b =>
        b.id !== editingBudget?.id &&
        b.category.toLowerCase() === cat.toLowerCase() &&
        (b.month || 'All').toLowerCase() === targetMonth.toLowerCase()
    );
    if (duplicate) {
      setErrorMessage(
        `A budget for category "${cat}" already exists for ${targetMonth}. Please edit that budget envelope instead.`
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      if (editingBudget) {
        await updateBudget(editingBudget.id, {
          category: cat,
          allocated: amount,
          color: selectedColor,
          month: targetMonth,
        });
        setActionSuccessToast(`Budget envelope for "${cat}" updated.`);
      } else {
        await addBudgetCategory(cat, amount, selectedColor, undefined, targetMonth);
        setActionSuccessToast(`Budget envelope for "${cat}" created.`);
      }
      setTimeout(() => setActionSuccessToast(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save budget category.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteBudget = async () => {
    if (!deletingBudget) return;
    setIsDeleting(true);
    try {
      await deleteBudget(deletingBudget.id);
      setActionSuccessToast(`Budget envelope "${deletingBudget.category}" removed.`);
      setTimeout(() => setActionSuccessToast(null), 4000);
      setDeletingBudget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete budget envelope.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApplyAISuggestion = async (budget: BudgetWithSpent) => {
    if (!budget.suggestedByAI) return;
    try {
      await updateBudgetLimit(budget.id, budget.suggestedByAI);
      setActionSuccessToast(`Updated ${budget.category} to AI target ₹${budget.suggestedByAI.toLocaleString('en-IN')}`);
      setTimeout(() => setActionSuccessToast(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to apply AI suggestion.');
    }
  };

  const handleConfirmLocalRecovery = async () => {
    setIsImportingLocal(true);
    setRecoveryError(null);
    try {
      const res = await importLocalBudgetsToCloud();
      setActionSuccessToast(
        `Successfully recovered & imported ${res.importedCount} budget envelopes to PostgreSQL! (Backup saved: "${res.backupKey}")`
      );
      setTimeout(() => setActionSuccessToast(null), 8000);
      setIsRecoveryModalOpen(false);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to import local budgets to cloud database.');
    } finally {
      setIsImportingLocal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionSuccessToast && (
        <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-[#00E5BE] text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccessToast}</span>
          </div>
          <button onClick={() => setActionSuccessToast(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Historical Offline Data Detected Banner */}
      {isAuthenticated && localBudgetRecoveryStatus.hasLocalData && !hasDismissedRecovery && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 md:mt-0">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-200 flex items-center gap-2">
                <span>Historical Offline Budgets Detected ({localBudgetRecoveryStatus.localCount} envelopes)</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  Ready to Recover
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Your browser contains {localBudgetRecoveryStatus.localCount} saved budget envelopes from before connecting to PostgreSQL.
                You can safely review, deduplicate, and import them into your cloud account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              type="button"
              onClick={() => setHasDismissedRecovery(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                setRecoveryError(null);
                setIsRecoveryModalOpen(true);
              }}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Review & Recover ({localBudgetRecoveryStatus.importableCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Cloud Error Banner */}
      {budgetsError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{budgetsError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshBudgets()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Total Envelope Budget</p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            ₹{totalAllocated.toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Across {budgetsWithSpent.length} spending envelopes</p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Spent To Date ({selectedMonth})</p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            ₹{totalSpent.toLocaleString('en-IN')}
          </h3>
          <p className={`text-xs mt-1 font-semibold ${overallUsedPct > 100 ? 'text-rose-400' : 'text-[#00E5BE]'}`}>
            {overallUsedPct}% of budget utilized
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Remaining Buffer</p>
          <h3 className="text-2xl font-bold mt-1 text-[#00E5BE] tabular-nums">
            ₹{remainingBudget.toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Calculated buffer for {selectedMonth}</p>
        </div>
      </div>

      {/* Main Budget Grid Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">Active Category Envelopes ({selectedMonth})</h3>
          <p className="text-xs text-slate-400">
            Real-time tracking dynamically computed from your authenticated transactions (&ge; 85% Warning, &gt; 100% Exceeded)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && localBudgetRecoveryStatus.hasLocalData && (
            <button
              type="button"
              onClick={() => {
                setRecoveryError(null);
                setIsRecoveryModalOpen(true);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                isDark
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
              }`}
              title="Review and import historical offline budgets into PostgreSQL"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Recover Offline ({localBudgetRecoveryStatus.importableCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Budget Category</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {budgetsWithSpent.map(b => {
          return (
            <div
              key={b.id}
              className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      <span>{b.category}</span>
                    </h4>
                    <span className="text-xs text-slate-400 mt-0.5 block">
                      Limit: ₹{b.allocated.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {b.isOverBudget && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Exceeded</span>
                      </span>
                    )}
                    {b.isNearLimit && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400">
                        85% Alert
                      </span>
                    )}
                    {!b.isOverBudget && !b.isNearLimit && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-[#00E5BE]/20 text-[#00E5BE]">
                        Healthy
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenModal(b)}
                      className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Adjust Budget Limit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingBudget(b)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete Budget Envelope"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 my-3">
                  <div className="w-full h-2 rounded-full bg-slate-500/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        b.isOverBudget
                          ? 'bg-rose-500'
                          : b.isNearLimit
                          ? 'bg-amber-400'
                          : 'bg-[#00E5BE]'
                      }`}
                      style={{ width: `${Math.min(b.percentageUsed, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="tabular-nums font-semibold text-slate-300">
                      ₹{b.spent.toLocaleString('en-IN')} spent
                    </span>
                    <span className={`font-bold tabular-nums ${b.isOverBudget ? 'text-rose-400' : 'text-slate-300'}`}>
                      {b.percentageUsed}%
                    </span>
                  </div>
                </div>
              </div>

              {/* AI suggestion pill if available */}
              {b.suggestedByAI && b.suggestedByAI !== b.allocated && (
                <div className="mt-2 pt-3 border-t border-inherit flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1 text-[#00E5BE]">
                    <Sparkles className="w-3 h-3" />
                    <span>AI Target: ₹{b.suggestedByAI.toLocaleString('en-IN')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyAISuggestion(b)}
                    className="text-[#00E5BE] hover:underline font-semibold cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit / Create Budget Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <h3 className="text-base font-bold">
                {editingBudget ? `Adjust ${editingBudget.category} Limit` : 'New Budget Category'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Category Name
                </label>
                <div className="space-y-2">
                  <select
                    value={standardCategories.includes(categoryName) ? categoryName : 'custom'}
                    onChange={e => {
                      if (e.target.value !== 'custom') {
                        setCategoryName(e.target.value);
                      }
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {standardCategories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="custom">Custom Category...</option>
                  </select>
                  {(!standardCategories.includes(categoryName) || categoryName === 'custom') && (
                    <input
                      type="text"
                      required
                      placeholder="Enter custom category..."
                      value={categoryName === 'custom' ? '' : categoryName}
                      onChange={e => setCategoryName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                        isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                      }`}
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Month Scope
                </label>
                <select
                  value={budgetMonth}
                  onChange={e => setBudgetMonth(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <option value="All">All Months (Recurring Baseline)</option>
                  {availableMonths
                    .filter(m => !m.isAllTime)
                    .map(m => (
                      <option key={m.label} value={m.baseLabel}>
                        {m.baseLabel}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Monthly Allocated Limit (₹ INR)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 6000"
                  value={allocatedAmount}
                  onChange={e => setAllocatedAmount(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {['#00E5BE', '#0EA5E9', '#6366F1', '#14B8A6', '#EC4899', '#8B5CF6', '#F59E0B', '#10B981'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        selectedColor === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Envelope</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBudget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Budget Envelope</h3>
                <p className="text-xs text-slate-400">Permanently removes this budget limit.</p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: deletingBudget.color }} />
                  <span>{deletingBudget.category}</span>
                </span>
                <span className="font-bold text-sm text-slate-200">
                  ₹{deletingBudget.allocated.toLocaleString('en-IN')} / mo
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Spent: ₹{deletingBudget.spent.toLocaleString('en-IN')}</span>
                <span>{deletingBudget.percentageUsed}% used</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5">
              Are you sure you want to delete the "{deletingBudget.category}" budget envelope? Past recorded transactions will not be altered.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-inherit">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingBudget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteBudget}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Budget Envelope'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Local Data Recovery Modal */}
      {isRecoveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-xl rounded-2xl p-6 border shadow-2xl max-h-[90vh] flex flex-col ${
              isDark ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-inherit">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-200">
                    Recover Historical Offline Budgets
                  </h3>
                  <p className="text-xs text-slate-400">
                    Import historical budget envelopes stored in this browser into your PostgreSQL cloud ledger
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {recoveryError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {/* Status summary badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Local Envelopes</div>
                  <div className="text-lg font-bold text-slate-100 tabular-nums">
                    {localBudgetRecoveryStatus.localCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Duplicates in DB</div>
                  <div className="text-lg font-bold text-amber-400 tabular-nums">
                    {localBudgetRecoveryStatus.duplicateCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Ready to Import</div>
                  <div className="text-lg font-bold text-[#00E5BE] tabular-nums">
                    {localBudgetRecoveryStatus.importableCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Total Limit</div>
                  <div className="text-sm font-bold text-slate-200 tabular-nums mt-1">
                    ₹{localBudgetRecoveryStatus.totalAllocated.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Safe Recovery Notice */}
              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E5BE] mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#00E5BE]">Safe & Reversible Cloud Import</p>
                  <p className="text-teal-200/80 leading-relaxed text-[11px]">
                    Before importing to PostgreSQL, an exact timestamped snapshot is permanently archived under <code className="font-mono text-teal-300">finsight_budgets_backup_...</code>.
                    Budgets will be owned by your authenticated account with preserved category limits, colors, and AI suggestions. Duplicate categories will be safely skipped.
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Candidate Envelopes Preview</span>
                  <span>{localBudgetRecoveryStatus.candidates.length} item(s)</span>
                </div>
                <div className="border border-inherit rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                      <tr>
                        <th className="py-2 px-3 font-semibold">Category</th>
                        <th className="py-2 px-3 text-right font-semibold">Allocated Limit</th>
                        <th className="py-2 px-3 text-center font-semibold">AI Target</th>
                        <th className="py-2 px-3 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {localBudgetRecoveryStatus.candidates.map((c, idx) => (
                        <tr key={c.item.id || idx} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                          <td className="py-2 px-3 font-medium text-slate-200 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.item.color || '#00E5BE' }} />
                            <span>{c.item.category}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums text-slate-100 whitespace-nowrap">
                            ₹{c.item.allocated.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400 tabular-nums">
                            {c.item.suggestedByAI ? `₹${c.item.suggestedByAI.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {c.isDuplicate ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                Already in Cloud
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00E5BE]/20 text-[#00E5BE] font-semibold">
                                Ready to Import
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-inherit flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Keep in Local Storage
              </button>
              <button
                type="button"
                disabled={isImportingLocal || localBudgetRecoveryStatus.importableCount === 0}
                onClick={handleConfirmLocalRecovery}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isImportingLocal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing into Cloud Ledger...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>
                      Import {localBudgetRecoveryStatus.importableCount} Envelopes to Cloud
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
