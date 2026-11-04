import React, { useState } from 'react';
import {
  Target,
  Plus,
  Calendar,
  CheckCircle,
  CheckCircle2,
  TrendingUp,
  Coins,
  Edit2,
  Trash2,
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
import { useFinancial } from '../context/FinancialContext';
import { FinancialGoal } from '../data/mockData';
import { formatStandardDate } from '../utils/dateUtils';

export const Goals: React.FC = () => {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    goals,
    goalsLoading,
    goalsError,
    refreshGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    contributeToGoal,
    localGoalRecoveryStatus,
    importLocalGoalsToCloud,
  } = useFinancial();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [activeGoalForDeposit, setActiveGoalForDeposit] = useState<FinancialGoal | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formTargetAmount, setFormTargetAmount] = useState('');
  const [formCurrentAmount, setFormCurrentAmount] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formCategory, setFormCategory] = useState('Savings');
  const [formMonthlyContrib, setFormMonthlyContrib] = useState('');
  const [depositAmount, setDepositAmount] = useState('2000');
  const [errorMessage, setErrorMessage] = useState('');
  const [depositError, setDepositError] = useState<string | null>(null);

  // In-app Delete Confirmation Modal State
  const [deletingGoal, setDeletingGoal] = useState<FinancialGoal | null>(null);
  const [isDeletingGoal, setIsDeletingGoal] = useState(false);

  // Async Mutation & Action States
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  // Historical Local Data Recovery State
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [hasDismissedRecovery, setHasDismissedRecovery] = useState(false);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const aggregatePct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  const handleOpenGoalModal = (g?: FinancialGoal) => {
    if (g) {
      setEditingGoal(g);
      setFormTitle(g.title);
      setFormTargetAmount(String(g.targetAmount));
      setFormCurrentAmount(String(g.currentAmount));
      setFormTargetDate(g.targetDate || '');
      setFormCategory(g.category || 'Savings');
      setFormMonthlyContrib(String(g.monthlyContribution || 0));
    } else {
      setEditingGoal(null);
      setFormTitle('');
      setFormTargetAmount('');
      setFormCurrentAmount('0');
      setFormTargetDate('');
      setFormCategory('Savings');
      setFormMonthlyContrib('5000');
    }
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setErrorMessage('Please enter a goal title.');
      return;
    }
    const target = parseFloat(formTargetAmount);
    if (isNaN(target) || target <= 0) {
      setErrorMessage('Please enter a valid target amount greater than 0.');
      return;
    }
    const current = parseFloat(formCurrentAmount) || 0;
    const monthly = parseFloat(formMonthlyContrib) || 0;
    const targetDateTrimmed = formTargetDate.trim() ? formTargetDate.trim() : undefined;

    setIsSavingGoal(true);
    setErrorMessage('');
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, {
          title: formTitle.trim(),
          targetAmount: target,
          currentAmount: current,
          targetDate: targetDateTrimmed,
          category: formCategory,
          monthlyContribution: monthly,
        });
        setActionSuccessToast(`Goal "${formTitle.trim()}" updated successfully.`);
      } else {
        await createGoal({
          title: formTitle.trim(),
          targetAmount: target,
          currentAmount: current,
          targetDate: targetDateTrimmed,
          category: formCategory,
          monthlyContribution: monthly,
        });
        setActionSuccessToast(`Goal "${formTitle.trim()}" created successfully.`);
      }
      setTimeout(() => setActionSuccessToast(null), 4000);
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save financial goal.');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleConfirmDeleteGoal = async () => {
    if (!deletingGoal) return;
    setIsDeletingGoal(true);
    try {
      await deleteGoal(deletingGoal.id);
      setActionSuccessToast(`Goal "${deletingGoal.title}" deleted.`);
      setTimeout(() => setActionSuccessToast(null), 4000);
      setDeletingGoal(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete goal.');
    } finally {
      setIsDeletingGoal(false);
    }
  };

  const handleOpenDeposit = (g: FinancialGoal) => {
    setActiveGoalForDeposit(g);
    setDepositAmount('2000');
    setDepositError(null);
    setErrorMessage('');
    setIsDepositModalOpen(true);
  };

  const handleConfirmDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGoalForDeposit || isSubmittingDeposit) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError('Please enter a valid deposit amount.');
      return;
    }

    setIsSubmittingDeposit(true);
    setDepositError(null);
    try {
      await contributeToGoal(activeGoalForDeposit.id, amount);
      setActionSuccessToast(`Deposited ₹${amount.toLocaleString('en-IN')} to "${activeGoalForDeposit.title}"!`);
      setTimeout(() => setActionSuccessToast(null), 5000);
      setIsDepositModalOpen(false);
    } catch (err: any) {
      setDepositError(err.message || 'Failed to deposit contribution to goal.');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete the goal "${title}"?`)) {
      return;
    }
    setDeletingGoalId(id);
    try {
      await deleteGoal(id);
      setActionSuccessToast(`Goal "${title}" deleted.`);
      setTimeout(() => setActionSuccessToast(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete goal.');
    } finally {
      setDeletingGoalId(null);
    }
  };

  const handleConfirmLocalRecovery = async () => {
    setIsImportingLocal(true);
    setRecoveryError(null);
    try {
      const res = await importLocalGoalsToCloud();
      setActionSuccessToast(
        `Successfully recovered & imported ${res.importedCount} financial goals to PostgreSQL! (Backup saved: "${res.backupKey}")`
      );
      setTimeout(() => setActionSuccessToast(null), 8000);
      setIsRecoveryModalOpen(false);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to import local goals to cloud database.');
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
      {isAuthenticated && localGoalRecoveryStatus.hasLocalData && !hasDismissedRecovery && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 md:mt-0">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-200 flex items-center gap-2">
                <span>Historical Offline Goals Detected ({localGoalRecoveryStatus.localCount} goals)</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  Ready to Recover
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Your browser contains {localGoalRecoveryStatus.localCount} saved goals from before connecting to PostgreSQL.
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
              <span>Review & Recover ({localGoalRecoveryStatus.importableCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Cloud Error Banner */}
      {goalsError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{goalsError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshGoals()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Cumulative Savings Target</p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            ₹{totalTarget.toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Across {goals.length} active milestones</p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Accumulated Funded Pool</p>
          <h3 className="text-2xl font-bold mt-1 text-[#00E5BE] tabular-nums">
            ₹{totalSaved.toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-[#00E5BE] mt-1 font-semibold">{aggregatePct}% funded overall</p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Monthly Savings Commitment</p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            ₹{goals.reduce((s, g) => s + g.monthlyContribution, 0).toLocaleString('en-IN')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Sinking funds SIP allocation</p>
        </div>
      </div>

      {/* Main Goal Grid Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">Active Financial Milestones</h3>
          <p className="text-xs text-slate-400">
            Track progress, update target amounts, and deposit funds to your targets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && localGoalRecoveryStatus.hasLocalData && (
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
              title="Review and import historical offline goals into PostgreSQL"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Recover Offline ({localGoalRecoveryStatus.importableCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenGoalModal()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {goals.length === 0 ? (
        <div
          className={`p-12 text-center rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <Target className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-300">No savings goals created yet</h4>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Create an emergency fund or milestone savings goal to track your wealth accumulation.
          </p>
          <button
            type="button"
            onClick={() => handleOpenGoalModal()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] text-[#080e1a]"
          >
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {goals.map((g, idx) => {
            const progressPct = g.targetAmount > 0 ? Math.min(Math.round((g.currentAmount / g.targetAmount) * 100), 100) : 0;
            const remainingAmount = Math.max(g.targetAmount - g.currentAmount, 0);

            return (
              <div
                key={g.id ? `${g.id}-${idx}` : `goal-${idx}`}
                className={`p-6 rounded-2xl border flex flex-col justify-between ${
                  isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#00E5BE] px-2 py-0.5 rounded bg-[#00E5BE]/10">
                        {g.category}
                      </span>
                      <h4 className="text-base font-bold text-white mt-1.5">{g.title}</h4>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{g.targetDate ? `Target: ${g.targetDate}` : 'Open-ended savings'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-[#00E5BE] tabular-nums">
                        {progressPct}%
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenGoalModal(g)}
                        className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                        title="Edit Goal"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingGoal(g)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Delete Goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 my-4">
                    <div className="w-full h-2.5 rounded-full bg-slate-500/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-400 to-[#00E5BE] transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-bold text-white tabular-nums">
                        ₹{g.currentAmount.toLocaleString('en-IN')} saved
                      </span>
                      <span className="tabular-nums">
                        of ₹{g.targetAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-500/10 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Remaining needed:</span>
                      <span className="font-bold tabular-nums text-slate-200">
                        ₹{remainingAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Monthly pace:</span>
                      <span className="font-bold tabular-nums text-[#00E5BE]">
                        ₹{g.monthlyContribution.toLocaleString('en-IN')}/mo
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-inherit flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {progressPct >= 100 ? 'Milestone Achieved! 🎉' : 'On Track for target date'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenDeposit(g)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] transition-colors flex items-center gap-1.5"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Deposit Funds</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deposit Funds Modal */}
      {isDepositModalOpen && activeGoalForDeposit && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <h3 className="text-base font-bold">
                Add Funds to {activeGoalForDeposit.title}
              </h3>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(depositError || errorMessage) && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{depositError || errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDeposit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Contribution Amount (₹ INR)
                </label>
                <input
                  type="number"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeposit}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingDeposit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Depositing...</span>
                    </>
                  ) : (
                    <span>Confirm Contribution</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New / Edit Goal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <h3 className="text-base font-bold">
                {editingGoal ? 'Edit Savings Goal' : 'Create Savings Goal'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
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

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Goal Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electric Scooter Down Payment"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Target Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 50000"
                    value={formTargetAmount}
                    onChange={e => setFormTargetAmount(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Current Balance (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={formCurrentAmount}
                    onChange={e => setFormCurrentAmount(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Target Date (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 21 Aug 2026 (or leave blank)"
                    value={formTargetDate}
                    onChange={e => setFormTargetDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Monthly Contribution (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={formMonthlyContrib}
                    onChange={e => setFormMonthlyContrib(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGoal}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingGoal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Goal...</span>
                    </>
                  ) : (
                    <span>{editingGoal ? 'Save Changes' : 'Create Goal'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Goal Confirmation Modal */}
      {deletingGoal && (
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
                <h3 className="text-base font-bold">Delete Savings Goal</h3>
                <p className="text-xs text-slate-400">Permanently removes this financial milestone.</p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{deletingGoal.title}</span>
                <span className="font-bold text-sm text-[#00E5BE]">
                  ₹{deletingGoal.targetAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Current: ₹{deletingGoal.currentAmount.toLocaleString('en-IN')}</span>
                <span>{deletingGoal.targetDate ? `Target: ${deletingGoal.targetDate}` : 'Open-ended'}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5">
              Are you sure you want to delete the "{deletingGoal.title}" milestone? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-inherit">
              <button
                type="button"
                disabled={isDeletingGoal}
                onClick={() => setDeletingGoal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingGoal}
                onClick={handleConfirmDeleteGoal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingGoal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeletingGoal ? 'Deleting...' : 'Delete Goal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Local Goals Recovery Modal */}
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
                    Recover Historical Offline Goals
                  </h3>
                  <p className="text-xs text-slate-400">
                    Import historical financial goals stored in this browser into your PostgreSQL cloud ledger
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
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
                  <div className="text-[11px] font-semibold text-slate-400">Local Goals</div>
                  <div className="text-lg font-bold text-slate-100 tabular-nums">
                    {localGoalRecoveryStatus.localCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Duplicates in DB</div>
                  <div className="text-lg font-bold text-amber-400 tabular-nums">
                    {localGoalRecoveryStatus.duplicateCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Ready to Import</div>
                  <div className="text-lg font-bold text-[#00E5BE] tabular-nums">
                    {localGoalRecoveryStatus.importableCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Total Target</div>
                  <div className="text-sm font-bold text-slate-200 tabular-nums mt-1">
                    ₹{localGoalRecoveryStatus.totalTargetAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Safe Recovery Notice */}
              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E5BE] mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#00E5BE]">Safe & Reversible Cloud Import</p>
                  <p className="text-teal-200/80 leading-relaxed text-[11px]">
                    Before importing to PostgreSQL, an exact timestamped snapshot is permanently archived under <code className="font-mono text-teal-300">finsight_goals_backup_...</code>.
                    Goals will be owned by your authenticated account with preserved balances, deadlines, and monthly targets. Duplicate titles in matching categories will be safely skipped.
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Candidate Goals Preview</span>
                  <span>{localGoalRecoveryStatus.candidates.length} item(s)</span>
                </div>
                <div className="border border-inherit rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                      <tr>
                        <th className="py-2 px-3 font-semibold">Goal</th>
                        <th className="py-2 px-3 font-semibold">Category</th>
                        <th className="py-2 px-3 text-right font-semibold">Target / Saved</th>
                        <th className="py-2 px-3 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {localGoalRecoveryStatus.candidates.map((c, idx) => (
                        <tr key={c.item.id || idx} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                          <td className="py-2 px-3 font-medium text-slate-200">
                            <div>{c.item.title}</div>
                            <div className="text-[10px] text-slate-400">Target: {c.item.targetDate}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {c.item.category}
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums text-slate-100 whitespace-nowrap">
                            ₹{c.item.currentAmount.toLocaleString('en-IN')} / ₹{c.item.targetAmount.toLocaleString('en-IN')}
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Keep in Local Storage
              </button>
              <button
                type="button"
                disabled={isImportingLocal || localGoalRecoveryStatus.importableCount === 0}
                onClick={handleConfirmLocalRecovery}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
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
                      Import {localGoalRecoveryStatus.importableCount} Goals to Cloud
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
