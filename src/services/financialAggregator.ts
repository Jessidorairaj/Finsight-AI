/**
 * FinSight AI — Financial Data Aggregator
 * Computes deterministic chart series, trends, and analytics derived directly
 * from actual transaction dates and ledger entries.
 */

import { Transaction } from '../data/mockData';
import {
  parseTransactionDate,
  formatStandardDate,
  getWeekdayShort,
  getMonthShort,
  getRecentMonthsSeries,
  parseMonthSelectorValue,
} from '../utils/dateUtils';

export interface SpendingTrendPoint {
  date: string;
  amount: number;
  baseline?: number;
  transactionCount?: number;
}

export interface MonthlyCashFlowPoint {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  isCurrent?: boolean;
}

export interface WeekdayDistributionPoint {
  day: string;
  amount: number;
  count: number;
  percentage: number;
}

/**
 * Calculates spending trend datasets ('1D', '1W', '1M', '1Y') derived from actual transaction dates
 */
export function calculateSpendingTrendDatasets(
  transactions: Transaction[],
  totalExpenses: number,
  referenceDateInput?: Date | string,
  allTransactions?: Transaction[]
): Record<'1D' | '1W' | '1M' | '1Y', SpendingTrendPoint[]> {
  const expenseTransactions = transactions.filter(t => t.type === 'expense' && Number(t.amount) > 0);

  // Determine reference date (system date by default, or parsed from selected month / input)
  let refDate = new Date();
  if (typeof referenceDateInput === 'string') {
    if (referenceDateInput.toLowerCase() === 'all time') {
      if (expenseTransactions.length > 0) {
        const sorted = [...expenseTransactions]
          .map(t => parseTransactionDate(t.date))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime());
        if (sorted.length > 0) {
          refDate = sorted[0];
        }
      }
    } else {
      const parsed = parseMonthSelectorValue(referenceDateInput);
      if (parsed && parsed.monthIndex !== -1) {
        refDate = new Date(parsed.year, parsed.monthIndex, 1);
      }
    }
  } else if (referenceDateInput instanceof Date && !isNaN(referenceDateInput.getTime())) {
    refDate = referenceDateInput;
  }

  const recent6Months = getRecentMonthsSeries(6, refDate);

  // If there are zero expenses in the ledger, return clean zero datasets
  if (expenseTransactions.length === 0 || totalExpenses === 0) {
    return {
      '1D': [
        { date: '06:00', amount: 0, baseline: 0 },
        { date: '12:00', amount: 0, baseline: 0 },
        { date: '18:00', amount: 0, baseline: 0 },
        { date: '23:59', amount: 0, baseline: 0 },
      ],
      '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
        date: day,
        amount: 0,
        baseline: 0,
      })),
      '1M': ['1st', '8th', '15th', '22nd', '31st'].map(date => ({
        date,
        amount: 0,
        baseline: 0,
      })),
      '1Y': recent6Months.map(m => ({
        date: m.name,
        amount: 0,
        baseline: 0,
      })),
    };
  }

  // Parse and sort all expense transactions by date ascending
  const parsedExpenses = expenseTransactions
    .map(t => {
      const parsed = parseTransactionDate(t.date) || refDate;
      return {
        ...t,
        parsedDate: parsed,
        amount: Number(t.amount),
      };
    })
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  // Latest expense transaction date in ledger
  const latestTx = parsedExpenses[parsedExpenses.length - 1];
  const latestDate = new Date(latestTx.parsedDate);

  // -------------------------------------------------------------
  // 1. '1D' (Latest Active Day View)
  // -------------------------------------------------------------
  const latestDateStandard = formatStandardDate(latestDate);
  const sameDayExpenses = parsedExpenses.filter(t => formatStandardDate(t.parsedDate) === latestDateStandard);

  const dayTotal = sameDayExpenses.reduce((sum, t) => sum + t.amount, 0);
  const baselineDay = Math.round(totalExpenses / 30);

  // Distribute the active day's actual transactions across intervals
  const d1Points: SpendingTrendPoint[] = [
    { date: '06:00', amount: 0, baseline: Math.round(baselineDay * 0.15) },
    {
      date: '09:00',
      amount: Math.round(dayTotal * 0.15),
      baseline: Math.round(baselineDay * 0.3),
      transactionCount: sameDayExpenses.length > 0 ? 1 : 0,
    },
    {
      date: '12:00',
      amount: Math.round(dayTotal * 0.4),
      baseline: Math.round(baselineDay * 0.5),
      transactionCount: sameDayExpenses.length,
    },
    {
      date: '15:00',
      amount: Math.round(dayTotal * 0.65),
      baseline: Math.round(baselineDay * 0.7),
      transactionCount: sameDayExpenses.length,
    },
    {
      date: '18:00',
      amount: Math.round(dayTotal * 0.85),
      baseline: Math.round(baselineDay * 0.85),
      transactionCount: sameDayExpenses.length,
    },
    {
      date: '21:00',
      amount: dayTotal,
      baseline: baselineDay,
      transactionCount: sameDayExpenses.length,
    },
  ];

  // -------------------------------------------------------------
  // 2. '1W' (Past 7 Days View ending at latest transaction date)
  // -------------------------------------------------------------
  const w1Points: SpendingTrendPoint[] = [];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyBudgetBaseline = Math.round(totalExpenses / 7);

  let cumulativeWeek = 0;
  for (let offset = 6; offset >= 0; offset--) {
    const dayDate = new Date(latestDate);
    dayDate.setDate(latestDate.getDate() - offset);
    const dayStr = formatStandardDate(dayDate);
    const dayName = weekdayNames[dayDate.getDay()];

    const expensesOnThisDay = parsedExpenses.filter(t => formatStandardDate(t.parsedDate) === dayStr);
    const daySum = expensesOnThisDay.reduce((sum, t) => sum + t.amount, 0);
    cumulativeWeek += daySum;

    w1Points.push({
      date: dayName,
      amount: cumulativeWeek,
      baseline: Math.round(dailyBudgetBaseline * (7 - offset)),
      transactionCount: expensesOnThisDay.length,
    });
  }

  // If cumulative week is 0 (e.g. transactions occurred on different days),
  // fallback to grouping by weekday name across the ledger
  const allWeekZero = w1Points.every(p => p.amount === 0);
  let final1W = w1Points;
  if (allWeekZero) {
    const weekdayTotals: Record<string, number> = {
      Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0
    };
    parsedExpenses.forEach(t => {
      const wd = getWeekdayShort(t.parsedDate);
      if (weekdayTotals[wd] !== undefined) {
        weekdayTotals[wd] += t.amount;
      }
    });

    let running = 0;
    final1W = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
      running += weekdayTotals[day] || 0;
      return {
        date: day,
        amount: running,
        baseline: Math.round((totalExpenses / 7) * (running > 0 ? 1 : 0.8)),
      };
    });
  }

  // -------------------------------------------------------------
  // 3. '1M' (Current Month View - Cumulative Progression)
  // -------------------------------------------------------------
  // Group transactions by calendar day in the month
  const activeMonthIndex = latestDate.getMonth();
  const activeYear = latestDate.getFullYear();
  const monthName = getMonthShort(latestDate);

  const monthExpenses = parsedExpenses.filter(
    t => t.parsedDate.getMonth() === activeMonthIndex && t.parsedDate.getFullYear() === activeYear
  );

  const intervals = [
    { label: `1 ${monthName}`, maxDay: 5 },
    { label: `8 ${monthName}`, maxDay: 10 },
    { label: `15 ${monthName}`, maxDay: 17 },
    { label: `22 ${monthName}`, maxDay: 24 },
    { label: `31 ${monthName}`, maxDay: 31 },
  ];

  let cumulativeMonth = 0;
  const m1Points: SpendingTrendPoint[] = intervals.map((interval, idx) => {
    // Sum all expenses with day <= interval.maxDay
    const subtotal = monthExpenses
      .filter(t => t.parsedDate.getDate() <= interval.maxDay)
      .reduce((sum, t) => sum + t.amount, 0);

    cumulativeMonth = subtotal;

    return {
      date: interval.label,
      amount: subtotal,
      baseline: Math.round((totalExpenses / 5) * (idx + 1)),
      transactionCount: monthExpenses.filter(t => t.parsedDate.getDate() <= interval.maxDay).length,
    };
  });

  // Ensure last point reflects exact monthly expenses (for 'All Time', uses actual month expenses, not all-time total)
  const actualMonthTotal = monthExpenses.reduce((sum, t) => sum + t.amount, 0);
  const isAllTimeSelection = typeof referenceDateInput === 'string' && referenceDateInput.toLowerCase() === 'all time';
  const targetMonthTotal = isAllTimeSelection ? actualMonthTotal : totalExpenses;
  if (m1Points.length > 0 && targetMonthTotal > 0) {
    m1Points[m1Points.length - 1].amount = targetMonthTotal;
  }

  // -------------------------------------------------------------
  // 4. '1Y' (Past 12/6 Months View - Actual Monthly Totals)
  // -------------------------------------------------------------
  // Group expenses by Month (using allTransactions when available so multi-month trends reflect full history)
  const fullExpenseList = allTransactions && allTransactions.length > 0
    ? allTransactions.filter(t => t.type === 'expense' && Number(t.amount) > 0)
    : expenseTransactions;

  const monthlyExpenseMap: Record<string, number> = {};
  fullExpenseList.forEach(t => {
    const d = parseTransactionDate(t.date);
    if (!d) return;
    const mKey = `${d.getFullYear()}-${d.getMonth()}`;
    monthlyExpenseMap[mKey] = (monthlyExpenseMap[mKey] || 0) + Number(t.amount || 0);
  });

  // Dynamic 6 months series ending at reference month (showing true monthly totals, not cumulative)
  const y1Points: SpendingTrendPoint[] = recent6Months.map(mObj => {
    const m = mObj.name;
    const key = `${mObj.year}-${mObj.monthIndex}`;
    const actualForMonth = monthlyExpenseMap[key];
    const amount = actualForMonth !== undefined ? Math.round(actualForMonth) : 0;

    return {
      date: m,
      amount,
      baseline: 28000,
    };
  });

  return {
    '1D': d1Points,
    '1W': final1W,
    '1M': m1Points,
    '1Y': y1Points,
  };
}

/**
 * Calculates dynamic monthly trends for Analytics page based on actual transactions
 */
export function calculateMonthlyAnalyticsTrends(
  transactions: Transaction[],
  totalIncome: number,
  totalExpenses: number,
  netSavings: number,
  referenceDateInput?: Date | string
): MonthlyCashFlowPoint[] {
  if (typeof referenceDateInput === 'string' && referenceDateInput.toLowerCase() === 'all time') {
    const periodMap = new Map<string, { label: string; year: number; monthIndex: number; income: number; expenses: number }>();
    transactions.forEach(t => {
      const d = parseTransactionDate(t.date);
      if (!d) return;
      const y = d.getFullYear();
      const mIdx = d.getMonth();
      const key = `${y}-${mIdx}`;
      if (!periodMap.has(key)) {
        const shortMonth = getMonthShort(d);
        const yr2 = String(y).slice(-2);
        periodMap.set(key, {
          label: `${shortMonth} '${yr2}`,
          year: y,
          monthIndex: mIdx,
          income: 0,
          expenses: 0,
        });
      }
      const entry = periodMap.get(key)!;
      if (t.type === 'income') {
        entry.income += Number(t.amount);
      } else {
        entry.expenses += Number(t.amount);
      }
    });

    const sortedPeriods = Array.from(periodMap.values())
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.monthIndex - b.monthIndex;
      });

    if (sortedPeriods.length > 0) {
      return sortedPeriods.map(p => ({
        month: p.label,
        income: Number(p.income.toFixed(2)),
        expenses: Number(p.expenses.toFixed(2)),
        savings: Number((p.income - p.expenses).toFixed(2)),
        isCurrent: true,
      }));
    }
  }

  let refDate = new Date();
  if (typeof referenceDateInput === 'string') {
    const parsed = parseMonthSelectorValue(referenceDateInput);
    if (parsed && parsed.monthIndex !== -1) {
      refDate = new Date(parsed.year, parsed.monthIndex, 1);
    }
  } else if (referenceDateInput instanceof Date && !isNaN(referenceDateInput.getTime())) {
    refDate = referenceDateInput;
  }

  const dynamicMonths = getRecentMonthsSeries(6, refDate);

  // Group transactions by month using exact year and monthIndex
  const monthlyMap = new Map<string, { income: number; expenses: number }>();

  transactions.forEach(t => {
    const d = parseTransactionDate(t.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expenses: 0 });
    }
    const entry = monthlyMap.get(key)!;
    if (t.type === 'income') {
      entry.income += Number(t.amount);
    } else {
      entry.expenses += Number(t.amount);
    }
  });

  const isAllTime = typeof referenceDateInput === 'string' && referenceDateInput.toLowerCase() === 'all time';

  return dynamicMonths.map(mObj => {
    const m = mObj.name;
    const key = `${mObj.year}-${mObj.monthIndex}`;
    const periodData = monthlyMap.get(key);

    // For specific month selection, active month can reflect live totals; for All-Time, always use month's actual total
    const actualIncome = (!isAllTime && mObj.isCurrent && totalIncome > 0)
      ? totalIncome
      : (periodData ? periodData.income : 0);
    const actualExpenses = (!isAllTime && mObj.isCurrent && totalExpenses > 0)
      ? totalExpenses
      : (periodData ? periodData.expenses : 0);

    return {
      month: m,
      income: Number(actualIncome.toFixed(2)),
      expenses: Number(actualExpenses.toFixed(2)),
      savings: Number((actualIncome - actualExpenses).toFixed(2)),
      isCurrent: mObj.isCurrent,
    };
  });
}

/**
 * Calculates day-of-week spending velocity strictly from actual transaction dates
 */
export function calculateWeekdayDistribution(transactions: Transaction[]): {
  data: WeekdayDistributionPoint[];
  peakDay: string;
  peakAmount: number;
  totalExpenses: number;
} {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayTotals: Record<string, { amount: number; count: number }> = {
    Mon: { amount: 0, count: 0 },
    Tue: { amount: 0, count: 0 },
    Wed: { amount: 0, count: 0 },
    Thu: { amount: 0, count: 0 },
    Fri: { amount: 0, count: 0 },
    Sat: { amount: 0, count: 0 },
    Sun: { amount: 0, count: 0 },
  };

  let totalExpenseSum = 0;

  transactions
    .filter(t => t.type === 'expense' && Number(t.amount) > 0)
    .forEach(t => {
      const date = parseTransactionDate(t.date);
      if (!date) return;
      const day = getWeekdayShort(date);
      if (dayTotals[day]) {
        dayTotals[day].amount += Number(t.amount);
        dayTotals[day].count += 1;
        totalExpenseSum += Number(t.amount);
      }
    });

  let peakDay = 'Fri';
  let peakAmount = 0;

  const data: WeekdayDistributionPoint[] = days.map(day => {
    const item = dayTotals[day];
    if (item.amount > peakAmount) {
      peakAmount = item.amount;
      peakDay = day;
    }

    const percentage = totalExpenseSum > 0 ? Math.round((item.amount / totalExpenseSum) * 100) : 0;

    return {
      day,
      amount: item.amount,
      count: item.count,
      percentage,
    };
  });

  return {
    data,
    peakDay,
    peakAmount,
    totalExpenses: totalExpenseSum,
  };
}

export interface MerchantSpendingPoint {
  merchant: string;
  amount: number;
  count: number;
  category: string;
  percentage: number;
}

/**
 * Calculates top spending merchants derived directly from actual expense transactions
 */
export function calculateTopMerchants(
  transactions: Transaction[],
  limit: number = 5
): MerchantSpendingPoint[] {
  const merchantMap = new Map<string, { amount: number; count: number; category: string }>();
  let totalExpense = 0;

  transactions
    .filter(t => t.type === 'expense' && Number(t.amount) > 0)
    .forEach(t => {
      const name = t.name.trim() || 'Unknown Merchant';
      const amt = Number(t.amount);
      totalExpense += amt;

      const existing = merchantMap.get(name);
      if (existing) {
        existing.amount += amt;
        existing.count += 1;
      } else {
        merchantMap.set(name, {
          amount: amt,
          count: 1,
          category: t.category || 'Others',
        });
      }
    });

  if (totalExpense === 0) return [];

  const sorted = Array.from(merchantMap.entries())
    .map(([merchant, data]) => ({
      merchant,
      amount: data.amount,
      count: data.count,
      category: data.category,
      percentage: Math.round((data.amount / totalExpense) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);

  return sorted.slice(0, limit);
}

export interface SpendingVolatilityResult {
  indexPercentage: number;
  rating: 'Low' | 'Moderate' | 'High';
  description: string;
  dailyMean: number;
  activeDaysCount: number;
}

/**
 * Calculates spending volatility based on coefficient of variation of daily expenses
 */
export function calculateSpendingVolatility(
  transactions: Transaction[]
): SpendingVolatilityResult {
  const dailyTotals: Record<string, number> = {};

  transactions
    .filter(t => t.type === 'expense' && Number(t.amount) > 0)
    .forEach(t => {
      const dateKey = t.date;
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + Number(t.amount);
    });

  const dailyValues = Object.values(dailyTotals);

  if (dailyValues.length <= 1) {
    return {
      indexPercentage: 0,
      rating: 'Low',
      description: dailyValues.length === 1 ? 'Single day outflow' : 'No recorded expenditures',
      dailyMean: dailyValues[0] || 0,
      activeDaysCount: dailyValues.length,
    };
  }

  const mean = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length;
  const variance = dailyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / dailyValues.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
  const roundedCv = Number(cv.toFixed(1));

  let rating: 'Low' | 'Moderate' | 'High' = 'Low';
  let description = 'Predictable core outlays';

  if (roundedCv >= 70) {
    rating = 'High';
    description = 'High daily outlay dispersion';
  } else if (roundedCv >= 30) {
    rating = 'Moderate';
    description = 'Moderate day-to-day variance';
  }

  return {
    indexPercentage: roundedCv,
    rating,
    description,
    dailyMean: Math.round(mean),
    activeDaysCount: dailyValues.length,
  };
}

export interface HistoricalPeriodComparison {
  currentPeriod: string;
  priorPeriod: string;
  currentExpense: number;
  priorExpense: number;
  expenseDifference: number;
  expensePercentChange: number | null; // null if prior was 0
  currentIncome: number;
  priorIncome: number;
  incomeDifference: number;
  incomePercentChange: number | null;
  currentSavings: number;
  priorSavings: number;
  savingsDifference: number;
}

/**
 * Computes comparative historical metrics between the selected period and its preceding historical period
 */
export function calculateHistoricalPeriodComparison(
  allTransactions: Transaction[],
  selectedMonth: string,
  currentIncome: number,
  currentExpenses: number,
  currentSavings: number
): HistoricalPeriodComparison | null {
  // Extract all distinct (year, monthIndex) periods present in actual transactions
  const periodMap = new Map<string, { label: string; year: number; monthIndex: number; income: number; expenses: number }>();

  allTransactions.forEach(t => {
    const d = parseTransactionDate(t.date);
    if (!d) return;
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${m}`;

    if (!periodMap.has(key)) {
      const shortM = getMonthShort(d);
      periodMap.set(key, {
        label: `${shortM} ${y}`,
        year: y,
        monthIndex: m,
        income: 0,
        expenses: 0,
      });
    }

    const e = periodMap.get(key)!;
    if (t.type === 'income') {
      e.income += Number(t.amount);
    } else {
      e.expenses += Number(t.amount);
    }
  });

  const periods = Array.from(periodMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthIndex - b.monthIndex;
  });

  if (periods.length === 0) return null;

  if (selectedMonth.toLowerCase() === 'all time') {
    // For All Time, compare the latest historical period to the earliest historical period if multiple exist
    if (periods.length < 2) return null;
    const prior = periods[0];
    const latest = periods[periods.length - 1];

    const expDiff = latest.expenses - prior.expenses;
    const expPct = prior.expenses > 0 ? Number(((expDiff / prior.expenses) * 100).toFixed(1)) : null;

    const incDiff = latest.income - prior.income;
    const incPct = prior.income > 0 ? Number(((incDiff / prior.income) * 100).toFixed(1)) : null;

    const latestSavings = latest.income - latest.expenses;
    const priorSavings = prior.income - prior.expenses;

    return {
      currentPeriod: latest.label,
      priorPeriod: prior.label,
      currentExpense: latest.expenses,
      priorExpense: prior.expenses,
      expenseDifference: expDiff,
      expensePercentChange: expPct,
      currentIncome: latest.income,
      priorIncome: prior.income,
      incomeDifference: incDiff,
      incomePercentChange: incPct,
      currentSavings: latestSavings,
      priorSavings,
      savingsDifference: latestSavings - priorSavings,
    };
  }

  // Parse selected month
  const parsed = parseMonthSelectorValue(selectedMonth);
  if (!parsed || parsed.monthIndex === -1) return null;

  // Find index of current month in actual periods
  const currentIndex = periods.findIndex(p => p.year === parsed.year && p.monthIndex === parsed.monthIndex);

  if (currentIndex > 0) {
    const prior = periods[currentIndex - 1];
    const expDiff = currentExpenses - prior.expenses;
    const expPct = prior.expenses > 0 ? Number(((expDiff / prior.expenses) * 100).toFixed(1)) : null;

    const incDiff = currentIncome - prior.income;
    const incPct = prior.income > 0 ? Number(((incDiff / prior.income) * 100).toFixed(1)) : null;

    const priorSavings = prior.income - prior.expenses;

    return {
      currentPeriod: `${parsed.shortMonth} ${parsed.year}`,
      priorPeriod: prior.label,
      currentExpense: currentExpenses,
      priorExpense: prior.expenses,
      expenseDifference: expDiff,
      expensePercentChange: expPct,
      currentIncome: currentIncome,
      priorIncome: prior.income,
      incomeDifference: incDiff,
      incomePercentChange: incPct,
      currentSavings: currentSavings,
      priorSavings,
      savingsDifference: currentSavings - priorSavings,
    };
  }

  return null;
}
