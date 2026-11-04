import React, { useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Sliders,
  DollarSign
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import { initialInsights, AnomalyInsight } from '../data/mockData';

export const Insights: React.FC = () => {
  const { theme } = useTheme();
  const { totalExpenses, categoryBreakdown, updateBudgetLimit, budgetsWithSpent } = useFinancial();

  const [insights, setInsights] = useState<AnomalyInsight[]>(initialInsights);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const isDark = theme === 'dark';

  const recurringSubscriptions = [
    { name: 'Netflix 4K Plan', amount: 649, frequency: 'Monthly', status: 'Active (Daily usage)', action: 'Keep' },
    { name: 'Broadband Fiber (ACT)', amount: 1199, frequency: 'Monthly', status: 'Active (Essential)', action: 'Keep' },
    { name: 'Secondary Fitness Streaming', amount: 499, frequency: 'Monthly', status: 'Inactive (0 sessions in 45d)', action: 'Flagged for cancellation' },
    { name: 'Cloud Storage (Google One)', amount: 130, frequency: 'Monthly', status: 'Active (82% full)', action: 'Keep' },
  ];

  const handleResolve = (id: string) => {
    setResolvedIds(prev => [...prev, id]);
  };

  const handleApplyBudgetRecommendation = (item: AnomalyInsight) => {
    // If shopping surge, adjust shopping budget
    const targetBudget = budgetsWithSpent.find(b => b.category.toLowerCase().includes(item.category.toLowerCase()));
    if (targetBudget) {
      updateBudgetLimit(targetBudget.id, targetBudget.allocated + 1000);
    }
    handleResolve(item.id);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          isDark
            ? 'bg-[#0f1a2e] border-[#1b2944]'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00E5BE]/20 border border-[#00E5BE]/40 flex items-center justify-center text-[#00E5BE] shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold">Unsupervised Anomaly Detection</h3>
            <p className="text-xs text-slate-400">
              Isolation Forest & Z-Score statistical algorithms identifying spending shifts & leakage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#00E5BE]/10 text-[#00E5BE]">
            Potential Monthly Savings: ~₹4,549
          </span>
        </div>
      </div>

      {/* Main Detected Anomalies */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Detected Outliers & Optimization Flags ({insights.length - resolvedIds.length})
        </h3>

        {insights.length - resolvedIds.length === 0 ? (
          <div
            className={`p-8 text-center rounded-2xl border ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <CheckCircle2 className="w-10 h-10 text-[#00E5BE] mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white">All financial anomaly flags resolved</h4>
            <p className="text-xs text-slate-400 mt-1">
              Your ledger has no unaddressed spending outliers at this time.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {insights.map(item => {
              const isResolved = resolvedIds.includes(item.id);
              if (isResolved) return null;

              return (
                <div
                  key={item.id}
                  className={`p-6 rounded-2xl border transition-all ${
                    isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-inherit">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          item.type === 'warning'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : item.type === 'recurring'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30'
                        }`}
                      >
                        {item.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                        {item.type === 'recurring' && <RefreshCw className="w-5 h-5" />}
                        {item.type === 'opportunity' && <Sparkles className="w-5 h-5" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{item.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-500/20 text-slate-300">
                            {item.category}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">Detected on {item.dateDetected}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Identified Impact</span>
                      <span className="text-base font-bold text-[#00E5BE] tabular-nums">
                        ₹{item.impactAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="py-4 space-y-2 text-xs leading-relaxed">
                    <p className="text-slate-300">{item.description}</p>
                    <div className="p-3 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/20 text-teal-200">
                      <strong className="text-white block mb-0.5">Recommended Adjustment:</strong>
                      {item.recommendation}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => handleResolve(item.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Dismiss Flag
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyBudgetRecommendation(item)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Apply Recommendation</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recurring Subscriptions Audit Section */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight">Recurring Subscriptions Audit</h3>
            <p className="text-xs text-slate-400">Automated recurring billing detection across bank ledgers</p>
          </div>
          <span className="text-xs font-bold text-slate-300 tabular-nums">
            Total: ₹2,477 / month
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-inherit">
                <th className="py-2.5 px-3">Service</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Cadence</th>
                <th className="py-2.5 px-3">Usage & Health</th>
                <th className="py-2.5 px-3 text-right">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inherit">
              {recurringSubscriptions.map(sub => (
                <tr key={sub.name} className="hover:bg-slate-500/5">
                  <td className="py-3 px-3 font-bold text-white">{sub.name}</td>
                  <td className="py-3 px-3 tabular-nums font-semibold">₹{sub.amount}</td>
                  <td className="py-3 px-3 text-slate-400">{sub.frequency}</td>
                  <td className="py-3 px-3 text-slate-300">{sub.status}</td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        sub.action.includes('Flagged')
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {sub.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
