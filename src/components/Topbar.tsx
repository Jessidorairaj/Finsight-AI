import React, { useState } from 'react';
import { Calendar, Bell, Menu, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import { ThemeToggle } from './ThemeToggle';

interface TopbarProps {
  onMenuClick: () => void;
  title?: string;
  subtitle?: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  onMenuClick,
  title,
  subtitle,
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const {
    bills,
    recurringTransactions,
    reminderPreferences,
    budgetsWithSpent,
    transactions,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
  } = useFinancial();
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Dynamically derive notification items from real state & reminder preferences
  const overBudgetItems = budgetsWithSpent.filter(b => b.isOverBudget);
  const nearLimitItems = budgetsWithSpent.filter(b => b.isNearLimit);

  const overdueBills = bills.filter(
    b => b.status === 'unpaid' && b.dueInDays < 0 && (reminderPreferences?.notifyOverdue !== false)
  );

  const upcomingBills = bills.filter(
    b =>
      b.status === 'unpaid' &&
      b.dueInDays >= 0 &&
      b.dueInDays <= (b.reminderDays ?? reminderPreferences?.reminderDays ?? 3) &&
      (reminderPreferences?.notifyUpcoming !== false)
  );

  const activeRecurringDue = recurringTransactions.filter(r => r.status === 'active');
  const recentIncomes = transactions.filter(t => t.type === 'income').slice(0, 2);

  const dynamicNotifications = [
    ...overdueBills.map(b => ({
      id: `bill_overdue_${b.id}`,
      title: `${b.name} OVERDUE by ${Math.abs(b.dueInDays)} Days`,
      desc: `₹${Number(b.amount).toLocaleString('en-IN')} overdue since ${b.dueDate}`,
      type: 'alert' as const,
      time: 'Action Required',
    })),
    ...upcomingBills.map(b => ({
      id: `bill_${b.id}`,
      title: `${b.name} Due ${b.dueInDays === 0 ? 'Today' : `in ${b.dueInDays} Days`}`,
      desc: `₹${Number(b.amount).toLocaleString('en-IN')} due on ${b.dueDate}`,
      type: 'warning' as const,
      time: b.dueInDays === 0 ? 'Due Today' : 'Upcoming Bill',
    })),
    ...activeRecurringDue.slice(0, 2).map(r => ({
      id: `rec_${r.id}`,
      title: `Recurring ${r.name} (${r.frequency})`,
      desc: `Next schedule: ₹${Number(r.amount).toLocaleString('en-IN')} on ${r.nextDueDate}`,
      type: 'info' as const,
      time: 'Recurring',
    })),
    ...overBudgetItems.map(b => ({
      id: `b_over_${b.id}`,
      title: `${b.category} Budget Exceeded`,
      desc: `₹${Number(b.spent).toLocaleString('en-IN')} spent against ₹${Number(b.allocated).toLocaleString('en-IN')} limit (${b.percentageUsed}%)`,
      type: 'alert' as const,
      time: 'Just now',
    })),
    ...nearLimitItems.map(b => ({
      id: `b_near_${b.id}`,
      title: `${b.category} Near Limit Alert`,
      desc: `85% limit reached (₹${Number(b.spent).toLocaleString('en-IN')} of ₹${Number(b.allocated).toLocaleString('en-IN')})`,
      type: 'warning' as const,
      time: 'Active',
    })),
    ...recentIncomes.map(inc => ({
      id: `income_${inc.id}`,
      title: inc.name || 'Income Credited',
      desc: `₹${Number(inc.amount).toLocaleString('en-IN')} credited${inc.paymentMethod ? ` via ${inc.paymentMethod}` : ''}`,
      type: 'success' as const,
      time: inc.date || 'Recent Credit',
    })),
  ];

  return (
    <header
      className={`h-20 px-6 flex items-center justify-between border-b transition-colors sticky top-0 z-30 ${
        theme === 'dark'
          ? 'bg-[#080e1a]/90 backdrop-blur-md border-[#152238] text-white'
          : 'bg-white/90 backdrop-blur-md border-slate-200 text-slate-900'
      }`}
    >
      {/* Left Greeting & Context */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight flex items-center gap-2">
            {title || `Welcome, ${user?.name ? user.name.split(' ')[0] : 'there'}!`}
            {!title && <span className="inline-block animate-wave">👋</span>}
          </h1>
          <p className="text-xs lg:text-sm text-slate-400">
            {subtitle || "Here's your financial overview for today."}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Month Selector Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMonthPickerOpen(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              theme === 'dark'
                ? 'bg-[#111d35] hover:bg-[#162544] border-slate-800 text-slate-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800 shadow-sm'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-[#00E5BE]" />
            <span>{selectedMonth}</span>
            <span className="text-[10px] text-slate-400">▼</span>
          </button>

          {isMonthPickerOpen && (
            <div
              className={`absolute right-0 mt-2 w-48 max-h-80 overflow-y-auto rounded-xl border p-1 shadow-2xl z-50 ${
                theme === 'dark'
                  ? 'bg-[#0f1a2e] border-slate-800 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-800 shadow-md'
              }`}
            >
              {availableMonths.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(m.value);
                    setIsMonthPickerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                    m.value === selectedMonth
                      ? 'bg-[#00E5BE]/20 text-[#00E5BE] font-semibold'
                      : 'hover:bg-slate-500/10'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {m.isAllTime && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#00E5BE]/20 text-[#00E5BE]">
                        ALL
                      </span>
                    )}
                    {m.isHistorical && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                        Past
                      </span>
                    )}
                    <span>{m.label}</span>
                  </span>
                  {m.value === selectedMonth && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(prev => !prev)}
            aria-label="View notifications"
            className={`relative p-2 rounded-xl border transition-all ${
              theme === 'dark'
                ? 'bg-[#111d35] hover:bg-[#162544] border-slate-800 text-slate-300'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
            }`}
          >
            <Bell className="w-4 h-4" />
            {dynamicNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#00E5BE] ring-2 ring-[#080e1a]" />
            )}
          </button>

          {isNotificationsOpen && (
            <div
              className={`absolute right-0 mt-2 w-80 rounded-2xl border p-4 shadow-2xl z-50 ${
                theme === 'dark'
                  ? 'bg-[#0f1a2e] border-slate-800 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-800 shadow-lg'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Notifications ({dynamicNotifications.length})
                </span>
                <span
                  onClick={() => setIsNotificationsOpen(false)}
                  className="text-[11px] text-[#00E5BE] font-semibold cursor-pointer hover:underline"
                >
                  Dismiss
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {dynamicNotifications.length === 0 ? (
                  <div className="py-6 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-[#00E5BE] mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-semibold text-slate-300">All caught up!</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">No pending bill alerts or budget warnings.</p>
                  </div>
                ) : (
                  dynamicNotifications.map((n, idx) => (
                    <div
                      key={n.id ? `${n.id}-${idx}` : `notif-${idx}`}
                      className="p-2.5 rounded-xl bg-slate-500/5 hover:bg-slate-500/10 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        {n.type === 'alert' && (
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        {n.type === 'warning' && (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )}
                        {n.type === 'success' && (
                          <CheckCircle2 className="w-4 h-4 text-[#00E5BE] shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{n.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{n.desc}</p>
                          <span className="text-[10px] text-slate-500 mt-1 block">{n.time}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-inherit text-center">
                <Link
                  to="/insights"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="text-xs text-[#00E5BE] font-medium hover:underline inline-flex items-center gap-1"
                >
                  <span>Review full AI Insights log</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <ThemeToggle />
      </div>
    </header>
  );
};
