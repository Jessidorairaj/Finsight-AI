import React, { useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  PieChart as PieChartIcon,
  Store,
  ArrowRight,
  TrendingDown,
  Scale,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import {
  calculateMonthlyAnalyticsTrends,
  calculateWeekdayDistribution,
  calculateTopMerchants,
  calculateSpendingVolatility,
  calculateHistoricalPeriodComparison,
} from '../services/financialAggregator';

export const Analytics: React.FC = () => {
  const { theme } = useTheme();
  const {
    transactions,
    selectedMonth,
    availableMonths,
    selectedMonthTransactions,
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    categoryBreakdown,
    topMerchants,
    spendingVolatility,
    periodComparison,
  } = useFinancial();

  const isDark = theme === 'dark';
  const activeMonthObj = availableMonths.find(m => m.value === selectedMonth);
  const activeMonthName = activeMonthObj ? activeMonthObj.shortMonth : 'Current Month';

  // Dynamic multi-month trend derived from actual ledger entries ending at selectedMonth
  const monthlyTrends = useMemo(() => {
    return calculateMonthlyAnalyticsTrends(transactions, totalIncome, totalExpenses, netSavings, selectedMonth);
  }, [transactions, totalIncome, totalExpenses, netSavings, selectedMonth]);

  // Dynamic day-of-week spending velocity derived from actual transaction dates for current selection
  const {
    data: weekdayDistribution,
    peakDay,
    peakAmount,
  } = useMemo(() => {
    return calculateWeekdayDistribution(selectedMonthTransactions);
  }, [selectedMonthTransactions]);

  const hasExpenses = totalExpenses > 0;
  const isNetSavingsPositive = netSavings >= 0;

  return (
    <div className="space-y-6">
      {/* KPI Baseline Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">
            {selectedMonth === 'All Time' ? 'All-Time Outlay' : `${activeMonthName} Outlay`}
          </p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            ₹{totalExpenses.toLocaleString('en-IN')}
          </h3>
          <p
            className={`text-xs mt-1.5 flex items-center gap-1 font-medium ${
              isNetSavingsPositive ? 'text-[#00E5BE]' : 'text-rose-400'
            }`}
          >
            {isNetSavingsPositive ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            <span>Net Savings: {netSavings < 0 ? `-₹${Math.abs(netSavings).toLocaleString('en-IN')}` : `₹${netSavings.toLocaleString('en-IN')}`}</span>
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Effective Savings Margin</p>
          <h3
            className={`text-2xl font-bold mt-1 tabular-nums ${
              savingsRate < 0 ? 'text-rose-400' : ''
            }`}
          >
            {savingsRate}%
          </h3>
          <p className="text-xs text-slate-400 mt-1.5">
            {totalIncome > 0
              ? `Derived from ₹${totalIncome.toLocaleString('en-IN')} income`
              : 'Zero recorded income'}
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Top Category Share</p>
          <h3 className="text-2xl font-bold mt-1 tabular-nums">
            {categoryBreakdown[0] ? `${categoryBreakdown[0].percentage}%` : '0%'}
          </h3>
          <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{categoryBreakdown[0]?.name || 'N/A'}</span>
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className="text-xs text-slate-400 font-medium">Spending Volatility Index</p>
          <h3
            className={`text-2xl font-bold mt-1 tabular-nums ${
              spendingVolatility.rating === 'High'
                ? 'text-rose-400'
                : spendingVolatility.rating === 'Moderate'
                ? 'text-amber-400'
                : 'text-[#00E5BE]'
            }`}
          >
            {spendingVolatility.rating} ({spendingVolatility.indexPercentage}%)
          </h3>
          <p className="text-xs text-slate-400 mt-1.5">
            {spendingVolatility.description}
          </p>
        </div>
      </div>

      {/* 6-Month Income vs Expenses Comparison Chart */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold tracking-tight">
              {selectedMonth === 'All Time'
                ? 'All-Time Multi-Period Cash Flow & Savings Trend'
                : 'Historical Cash Flow & Savings Trend'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Historical income vs expenses with net accumulated surplus ({activeMonthName} updates dynamically)
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#00E5BE]" />
              <span className="text-slate-300">Income</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-sky-500" />
              <span className="text-slate-300">Expenses</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-indigo-500" />
              <span className="text-slate-300">Net Savings</span>
            </span>
          </div>
        </div>

        {monthlyTrends.length === 0 ? (
          <div className="w-full h-72 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-slate-700/50">
            <BarChart3 className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
            <p className="text-xs font-semibold text-slate-300">No trend records found</p>
            <p className="text-[11px] text-slate-500 mt-1">Transaction entries will automatically populate monthly cash flow.</p>
          </div>
        ) : (
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  stroke={isDark ? '#475569' : '#94a3b8'}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: isDark ? '#1e293b' : '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  stroke={isDark ? '#475569' : '#94a3b8'}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickFormatter={val => `₹${Math.round(val / 1000)}K`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                  contentStyle={{
                    backgroundColor: isDark ? '#0a1120' : '#ffffff',
                    borderColor: isDark ? '#1e293b' : '#e2e8f0',
                    borderRadius: '0.75rem',
                    fontSize: '11px',
                    color: isDark ? '#ffffff' : '#0f172a',
                  }}
                />
                <Bar dataKey="income" fill="#00E5BE" radius={[6, 6, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#0EA5E9" radius={[6, 6, 0, 0]} name="Expenses" />
                <Bar dataKey="savings" fill="#6366F1" radius={[6, 6, 0, 0]} name="Net Savings" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid: Category Breakdown vs Day-of-Week Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Table & Share */}
        <div
          className={`p-6 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <h3 className="text-base font-bold tracking-tight mb-1">Category Allocation Details</h3>
          <p className="text-xs text-slate-400 mb-4">
            Share of current total expenses (₹{totalExpenses.toLocaleString('en-IN')})
          </p>

          <div className="space-y-3">
            {categoryBreakdown.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <p className="font-semibold text-slate-400">No expense categories to display</p>
                <p className="text-[11px] text-slate-500 mt-1">Add or import transactions to populate category share.</p>
              </div>
            ) : (
              categoryBreakdown.map(cat => (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-slate-200">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span>₹{cat.amount.toLocaleString('en-IN')}</span>
                      <span className="text-slate-400">({cat.percentage}%)</span>
                    </div>
                  </div>
                  {/* Visual Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-500/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(cat.percentage, 100)}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Day-of-Week Spending Velocity */}
        <div
          className={`p-6 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold tracking-tight">Day-of-Week Velocity</h3>
            {hasExpenses ? (
              <span className="text-xs px-2 py-0.5 rounded bg-[#00E5BE]/10 text-[#00E5BE] font-semibold">
                Peak Day: {peakDay} (₹{peakAmount.toLocaleString('en-IN')})
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-500/20 text-slate-400 font-semibold">
                No Outflows
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Aggregated expenditure patterns derived directly from your transaction dates
          </p>

          {!hasExpenses ? (
            <div className="w-full h-56 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-slate-700/50">
              <PieChartIcon className="w-7 h-7 text-slate-500 mb-2 opacity-50" />
              <p className="text-xs font-semibold text-slate-300">No weekday expense records</p>
              <p className="text-[11px] text-slate-500 mt-1">Expenses will aggregate across days of the week automatically.</p>
            </div>
          ) : (
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayDistribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    stroke={isDark ? '#475569' : '#94a3b8'}
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: isDark ? '#1e293b' : '#e2e8f0' }}
                  />
                  <YAxis
                    stroke={isDark ? '#475569' : '#94a3b8'}
                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                    tickFormatter={val => `₹${Math.round(val / 1000)}K`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Expenditure']}
                    contentStyle={{
                      backgroundColor: isDark ? '#0a1120' : '#ffffff',
                      borderColor: isDark ? '#1e293b' : '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                      color: isDark ? '#ffffff' : '#0f172a',
                    }}
                  />
                  <Bar dataKey="amount" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Top Spending Merchants & Historical Period Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Spending Merchants Card */}
        <div
          className={`p-6 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold tracking-tight">Top Spending Merchants</h3>
            <span className="text-xs text-slate-400 font-medium">
              {topMerchants.length} {topMerchants.length === 1 ? 'payee' : 'payees'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Highest expenditure destinations in {selectedMonth === 'All Time' ? 'all recorded history' : activeMonthName}
          </p>

          <div className="space-y-3">
            {topMerchants.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <Store className="w-7 h-7 mx-auto mb-2 text-slate-500 opacity-40" />
                <p className="font-semibold text-slate-400">No merchant expenditures recorded</p>
                <p className="text-[11px] text-slate-500 mt-1">Expenses will rank top payees automatically.</p>
              </div>
            ) : (
              topMerchants.map((m, idx) => (
                <div
                  key={m.merchant}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{m.merchant}</p>
                      <p className="text-[11px] text-slate-400">
                        {m.category} • {m.count} {m.count === 1 ? 'order' : 'orders'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums">
                      ₹{m.amount.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {m.percentage}% of total
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Historical Period Comparison Card */}
        <div
          className={`p-6 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold tracking-tight">Period-over-Period Variance</h3>
              {periodComparison && (
                <span className="text-xs px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-semibold flex items-center gap-1">
                  <span>{periodComparison.priorPeriod}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>{periodComparison.currentPeriod}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Deterministic comparison against the preceding historical actuals
            </p>

            {!periodComparison ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <Scale className="w-7 h-7 mx-auto mb-2 text-slate-500 opacity-40" />
                <p className="font-semibold text-slate-400">No preceding historical period found</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                  Historical comparisons require records across at least two distinct monthly periods.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Outflow Comparison */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Monthly Outflows</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums">
                      ₹{periodComparison.currentExpense.toLocaleString('en-IN')}
                      <span className="text-xs text-slate-500 font-normal ml-1">
                        vs ₹{periodComparison.priorExpense.toLocaleString('en-IN')}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                        periodComparison.expenseDifference <= 0
                          ? 'bg-[#00E5BE]/10 text-[#00E5BE]'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {periodComparison.expenseDifference <= 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      {periodComparison.expenseDifference <= 0 ? '' : '+'}
                      ₹{Math.abs(periodComparison.expenseDifference).toLocaleString('en-IN')}
                      {periodComparison.expensePercentChange !== null
                        ? ` (${periodComparison.expensePercentChange > 0 ? '+' : ''}${periodComparison.expensePercentChange}%)`
                        : ''}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {periodComparison.expenseDifference <= 0 ? 'Spending reduction' : 'Spending increase'}
                    </p>
                  </div>
                </div>

                {/* Inflow Comparison */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Monthly Inflows</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums">
                      ₹{periodComparison.currentIncome.toLocaleString('en-IN')}
                      <span className="text-xs text-slate-500 font-normal ml-1">
                        vs ₹{periodComparison.priorIncome.toLocaleString('en-IN')}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                        periodComparison.incomeDifference >= 0
                          ? 'bg-[#00E5BE]/10 text-[#00E5BE]'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {periodComparison.incomeDifference >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {periodComparison.incomeDifference >= 0 ? '+' : ''}
                      ₹{periodComparison.incomeDifference.toLocaleString('en-IN')}
                      {periodComparison.incomePercentChange !== null
                        ? ` (${periodComparison.incomePercentChange > 0 ? '+' : ''}${periodComparison.incomePercentChange}%)`
                        : ''}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {periodComparison.incomeDifference >= 0 ? 'Income expansion' : 'Income contraction'}
                    </p>
                  </div>
                </div>

                {/* Net Savings Comparison */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Net Surplus Variance</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums">
                      {periodComparison.currentSavings < 0
                        ? `-₹${Math.abs(periodComparison.currentSavings).toLocaleString('en-IN')}`
                        : `₹${periodComparison.currentSavings.toLocaleString('en-IN')}`}
                      <span className="text-xs text-slate-500 font-normal ml-1">
                        vs ₹{periodComparison.priorSavings.toLocaleString('en-IN')}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                        periodComparison.savingsDifference >= 0
                          ? 'bg-[#00E5BE]/10 text-[#00E5BE]'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {periodComparison.savingsDifference >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {periodComparison.savingsDifference >= 0 ? '+' : ''}
                      ₹{periodComparison.savingsDifference.toLocaleString('en-IN')}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {periodComparison.savingsDifference >= 0 ? 'Surplus increase' : 'Surplus contraction'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
