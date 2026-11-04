/**
 * FinSight AI — Grounded Financial Chatbot Service
 *
 * Provides real-time financial intelligence strictly grounded in the authenticated
 * user's PostgreSQL database records (transactions, budgets, savings goals, bills, and recurring entries).
 *
 * Connects to Google Gemini (gemini-2.5-flash) server-side, with a comprehensive
 * deterministic fallback engine for offline or unconfigured environments.
 */

import { GoogleGenAI } from '@google/genai';
import { parseTransactionDate, formatStandardDate } from '../../src/utils/dateUtils.js';
import { getAllTransactions, FrontendTransaction } from '../repositories/transactionRepository.js';
import {
  getAllBudgets,
  getAllGoals,
  getAllBills,
  FrontendBudget,
  FrontendGoal,
  FrontendBill,
} from '../repositories/financialEntitiesRepository.js';
import {
  getAllRecurringTransactions,
  FrontendRecurringTransaction,
} from '../repositories/recurringTransactionsRepository.js';

export interface ChatMessageItem {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

export interface ChatStageTimings {
  authMs: number;
  dbRetrievalMs: number;
  metricCalculationMs: number;
  intentDetectionMs: number;
  promptBuildMs: number;
  geminiMs: number;
  totalMs: number;
}

export interface ChatResponse {
  reply: string;
  grounded: boolean;
  engineUsed: 'gemini' | 'grounded-engine';
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    transactionCount: number;
  };
  timings?: ChatStageTimings;
}

export interface AffordabilityCalculation {
  itemAmount: number;
  itemName: string;
  category: string;
  availableCash: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  upcomingBillsTotal: number;
  upcomingBillsCount: number;
  uncommittedCash: number;
  hasBudget: boolean;
  budgetAllocated: number;
  budgetSpent: number;
  budgetRemaining: number;
  isOverBudgetAfterPurchase: boolean;
  projectedRemainingCash: number;
  projectedMonthlySurplus: number;
  verdict: 'affordable' | 'manageable_with_caution' | 'stretch' | 'not_recommended';
  verdictTitle: string;
  verdictSummary: string;
}

export interface GeminiClientLike {
  models: {
    generateContent: (params: {
      model: string;
      contents: any;
      config?: any;
    }) => Promise<{ text?: string | null }>;
  };
}

let customGeminiClient: GeminiClientLike | null = null;

/**
 * Redacts potential credentials, API keys, and bearer tokens from error strings before logging.
 * Recursively inspects the error's cause chain to extract underlying network/system codes and errors.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  const parts: string[] = [];
  let current: any = err;
  let depth = 0;

  while (current && depth < 4) {
    let msg = current instanceof Error ? current.message : String(current);
    const extras: string[] = [];
    if (current.code) extras.push(`code: ${current.code}`);
    if (current.status || current.statusCode) extras.push(`status: ${current.status || current.statusCode}`);
    if (current.syscall) extras.push(`syscall: ${current.syscall}`);
    if (extras.length > 0 && !msg.includes(extras[0])) {
      msg = `${msg} (${extras.join(', ')})`;
    }

    // Redact sensitive patterns
    msg = msg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
    msg = msg.replace(/(?:key|token|bearer|api_key|apikey)[:=\s]+[0-9A-Za-z-_]{20,}/gi, '$1=[REDACTED]');
    msg = msg.replace(/(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');

    if (!parts.includes(msg)) {
      parts.push(msg);
    }
    current = current.cause;
    depth++;
  }

  return parts.join(' -> ');
}

/**
 * Injects a mock or custom Gemini client for unit and integration testing.
 * Pass null to restore default behavior (using official GoogleGenAI with process.env.GEMINI_API_KEY).
 */
export function setTestGeminiClient(client: GeminiClientLike | null): void {
  customGeminiClient = client;
}

export interface UserFinancialContext {
  userId: string;
  transactions: FrontendTransaction[];
  budgets: FrontendBudget[];
  goals: FrontendGoal[];
  bills: FrontendBill[];
  recurring: FrontendRecurringTransaction[];
  timings?: {
    dbRetrievalMs: number;
    metricCalculationMs: number;
  };
  aggregates: {
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    transactionCount: number;
    monthlyData: Record<string, { income: number; expenses: number; net: number; count: number; categories: Record<string, number> }>;
    categoryTotals: Record<string, number>;
    recentTransactions: FrontendTransaction[];
    budgetStatus: Array<{
      category: string;
      month: string;
      allocated: number;
      spent: number;
      remaining: number;
      percentage: number;
      isOverBudget: boolean;
      isNearLimit: boolean;
    }>;
    upcomingBills: FrontendBill[];
    overdueBills: FrontendBill[];
    goalsProgress: Array<{
      title: string;
      targetAmount: number;
      currentAmount: number;
      remaining: number;
      percentage: number;
      targetDate?: string;
    }>;
  };
}

export interface PeriodMetrics {
  periodKey: 'last_month' | 'this_month' | 'this_week' | 'today' | 'last_3_months' | 'year_to_date' | 'specific_month';
  label: string;
  startDate: Date;
  endDate: Date; // exclusive upper bound
  income: number;
  expenses: number;
  net: number;
  count: number;
  categories: Record<string, number>;
  topCategory?: { name: string; amount: number; percentage: number };
  transactions: FrontendTransaction[];
}

export interface StandardPeriods {
  lastMonth: PeriodMetrics;
  thisMonth: PeriodMetrics;
  thisWeek: PeriodMetrics;
  today: PeriodMetrics;
  last3Months: PeriodMetrics;
  yearToDate: PeriodMetrics;
}

/**
 * Calculates income, expenses, and net cash flow for transactions strictly within [startDate, endDate).
 */
export function calculatePeriodMetrics(
  transactions: FrontendTransaction[],
  startDate: Date,
  endDate: Date,
  label: string,
  periodKey: PeriodMetrics['periodKey']
): PeriodMetrics {
  let income = 0;
  let expenses = 0;
  const categories: Record<string, number> = {};
  const matchingTxs: FrontendTransaction[] = [];

  for (const tx of transactions) {
    const txDate = parseTransactionDate(tx.date);
    if (!txDate) continue;

    // Strict boundary: txDate >= startDate && txDate < endDate
    if (txDate.getTime() >= startDate.getTime() && txDate.getTime() < endDate.getTime()) {
      matchingTxs.push(tx);
      if (tx.type === 'income') {
        income += tx.amount;
      } else {
        expenses += tx.amount;
        const cat = tx.category || 'Others';
        categories[cat] = (categories[cat] || 0) + tx.amount;
      }
    }
  }

  let topCategory: { name: string; amount: number; percentage: number } | undefined = undefined;
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (sortedCategories.length > 0) {
    const [name, amount] = sortedCategories[0];
    const percentage = expenses > 0 ? parseFloat(((amount / expenses) * 100).toFixed(1)) : 0;
    topCategory = { name, amount, percentage };
  }

  return {
    periodKey,
    label,
    startDate,
    endDate,
    income: parseFloat(income.toFixed(2)),
    expenses: parseFloat(expenses.toFixed(2)),
    net: parseFloat((income - expenses).toFixed(2)),
    count: matchingTxs.length,
    categories,
    topCategory,
    transactions: matchingTxs,
  };
}

/**
 * Computes standard relative financial periods based on the current reference date in user's timezone.
 */
export function calculateStandardPeriods(
  transactions: FrontendTransaction[],
  refDate: Date = new Date()
): StandardPeriods {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0-indexed

  // 1. Last Month: first day of previous month up to (excluding) first day of current month
  const lastMonthStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
  const lastMonthEnd = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
  const lastMonthDaysEnd = new Date(lastMonthEnd.getTime() - 24 * 60 * 60 * 1000);
  const lastMonthLabel = `Last Month (${formatStandardDate(lastMonthStart)} – ${formatStandardDate(lastMonthDaysEnd)})`;
  const lastMonth = calculatePeriodMetrics(transactions, lastMonthStart, lastMonthEnd, lastMonthLabel, 'last_month');

  // 2. This Month: first day of current month up to first day of next month
  const thisMonthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
  const thisMonthEnd = new Date(currentYear, currentMonth + 1, 1, 0, 0, 0, 0);
  const thisMonthLabel = `This Month (${formatStandardDate(thisMonthStart)} – Till Today)`;
  const thisMonth = calculatePeriodMetrics(transactions, thisMonthStart, thisMonthEnd, thisMonthLabel, 'this_month');

  // 3. This Week: Monday 00:00:00 up to start of tomorrow
  const dayOfWeek = refDate.getDay(); // 0 is Sunday, 1 is Monday...
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const thisWeekStart = new Date(currentYear, currentMonth, refDate.getDate() - distanceToMonday, 0, 0, 0, 0);
  const thisWeekEnd = new Date(currentYear, currentMonth, refDate.getDate() + 1, 0, 0, 0, 0);
  const thisWeekLabel = `This Week (${formatStandardDate(thisWeekStart)} – ${formatStandardDate(refDate)})`;
  const thisWeek = calculatePeriodMetrics(transactions, thisWeekStart, thisWeekEnd, thisWeekLabel, 'this_week');

  // 4. Today: start of today up to start of tomorrow
  const todayStart = new Date(currentYear, currentMonth, refDate.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(currentYear, currentMonth, refDate.getDate() + 1, 0, 0, 0, 0);
  const todayLabel = `Today (${formatStandardDate(refDate)})`;
  const today = calculatePeriodMetrics(transactions, todayStart, todayEnd, todayLabel, 'today');

  // 5. Last 3 Months: first day of 3 months ago up to first day of current month
  const last3MonthsStart = new Date(currentYear, currentMonth - 3, 1, 0, 0, 0, 0);
  const last3MonthsEnd = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
  const last3MonthsDaysEnd = new Date(last3MonthsEnd.getTime() - 24 * 60 * 60 * 1000);
  const last3MonthsLabel = `Last 3 Months (${formatStandardDate(last3MonthsStart)} – ${formatStandardDate(last3MonthsDaysEnd)})`;
  const last3Months = calculatePeriodMetrics(transactions, last3MonthsStart, last3MonthsEnd, last3MonthsLabel, 'last_3_months');

  // 6. Year to Date: Jan 1 of current year up to start of next year
  const ytdStart = new Date(currentYear, 0, 1, 0, 0, 0, 0);
  const ytdEnd = new Date(currentYear + 1, 0, 1, 0, 0, 0, 0);
  const ytdLabel = `Year to Date (${formatStandardDate(ytdStart)} – Till Today)`;
  const yearToDate = calculatePeriodMetrics(transactions, ytdStart, ytdEnd, ytdLabel, 'year_to_date');

  return {
    lastMonth,
    thisMonth,
    thisWeek,
    today,
    last3Months,
    yearToDate,
  };
}

/**
 * Detects whether user message refers to a specific time range.
 */
export function detectQueryTimePeriod(
  query: string,
  transactions: FrontendTransaction[],
  refDate: Date = new Date()
): PeriodMetrics | null {
  const clean = query.toLowerCase();
  const periods = calculateStandardPeriods(transactions, refDate);

  // 1. Last Month (e.g. "last month", "previous month", "past month")
  if (/\b(?:last|previous|past)\s+month\b/i.test(clean)) {
    return periods.lastMonth;
  }

  // 2. This Month (e.g. "this month", "current month")
  if (/\b(?:this|current)\s+month\b/i.test(clean)) {
    return periods.thisMonth;
  }

  // 3. This Week (e.g. "this week", "current week")
  if (/\b(?:this|current)\s+week\b/i.test(clean)) {
    return periods.thisWeek;
  }

  // 3. Last 3 Months (e.g. "last 3 months", "past 3 months", "past 90 days")
  if (/\b(?:last|past)\s+(?:3|three)\s+months?\b/i.test(clean) || /\b(?:past|last)\s+90\s+days\b/i.test(clean)) {
    return periods.last3Months;
  }

  // 4. Year to Date (e.g. "year to date", "ytd", "this year")
  if (/\b(?:year\s+to\s+date|ytd|this\s+year)\b/i.test(clean)) {
    return periods.yearToDate;
  }

  // 5. Today (strictly when NOT part of "till today" when another period is queried)
  if (/\btoday\b/i.test(clean) && !/\btill\s+today\b/i.test(clean)) {
    return periods.today;
  }

  // 6. Explicit Named Month (e.g. "in October", "September 2026", "October expenses")
  const monthList = [
    { name: 'january', short: 'jan', month: 0 },
    { name: 'february', short: 'feb', month: 1 },
    { name: 'march', short: 'mar', month: 2 },
    { name: 'april', short: 'apr', month: 3 },
    { name: 'may', short: 'may', month: 4 },
    { name: 'june', short: 'jun', month: 5 },
    { name: 'july', short: 'jul', month: 6 },
    { name: 'august', short: 'aug', month: 7 },
    { name: 'september', short: 'sep', month: 8 },
    { name: 'october', short: 'oct', month: 9 },
    { name: 'november', short: 'nov', month: 10 },
    { name: 'december', short: 'dec', month: 11 },
  ];

  for (const m of monthList) {
    const monthRegex = new RegExp(`\\b(?:in|for|during|of)?\\s*(${m.name}|${m.short})\\b(?:\\s*(20\\d\\d))?`, 'i');
    const match = clean.match(monthRegex);
    if (match) {
      let year = refDate.getFullYear();
      if (match[2]) {
        year = parseInt(match[2], 10);
      }
      const monthStart = new Date(year, m.month, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, m.month + 1, 1, 0, 0, 0, 0);
      const monthDaysEnd = new Date(monthEnd.getTime() - 24 * 60 * 60 * 1000);
      const label = `${m.name.charAt(0).toUpperCase() + m.name.slice(1)} ${year} (${formatStandardDate(monthStart)} – ${formatStandardDate(monthDaysEnd)})`;
      return calculatePeriodMetrics(transactions, monthStart, monthEnd, label, 'specific_month');
    }
  }

  return null;
}

/**
 * Standardizes date string to a normalized Month label, e.g. "Nov 2026", "Oct 2026".
 */
function normalizeMonthLabel(dateStr: string): string {
  if (!dateStr) return 'Unknown';
  const clean = dateStr.trim();

  // If already like "Nov 2026" or "November 2026"
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Check if string has e.g. "2026-11" or "2026-11-04"
  const isoMatch = clean.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthNum = parseInt(isoMatch[2], 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return `${monthNames[monthNum - 1]} ${year}`;
    }
  }

  // Check for "04 Nov 2026" or "Nov 2026"
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b(${monthNames[i]}|${fullMonths[i]})\\b`, 'i').test(clean)) {
      const yearMatch = clean.match(/\b(20\d\d)\b/);
      const year = yearMatch ? yearMatch[1] : '2026';
      return `${monthNames[i]} ${year}`;
    }
  }

  return clean;
}

/**
 * Extracts purchase / affordability parameters (amount, item name, category) from user message.
 */
export function extractAffordabilityParams(
  query: string
): { itemAmount: number; itemName: string; category: string } | null {
  const clean = query.toLowerCase();

  const isAffordQuery =
    /\b(?:afford|affordability|can\s+i\s+buy|should\s+i\s+spend|can\s+i\s+get|can\s+i\s+purchase|should\s+i\s+buy|buy\s+a|buy\s+an|purchasing)\b/i.test(clean) ||
    clean.includes('gadget') ||
    clean.includes('laptop') ||
    clean.includes('iphone') ||
    clean.includes('vacation');

  if (!isAffordQuery) {
    return null;
  }

  // Extract amount: handles Indian (1,50,000) and International (150,000) formats
  let amount = 15000;
  const amountPattern = /(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?\b/i;
  const match = clean.match(amountPattern);
  if (match) {
    const rawNum = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(rawNum) && rawNum > 0) {
      const unit = match[2] ? match[2].toLowerCase() : '';
      if (unit === 'k' || unit === 'thousand') {
        amount = rawNum * 1000;
      } else if (unit === 'lakh' || unit === 'lac') {
        amount = rawNum * 100000;
      } else if (unit === 'crore') {
        amount = rawNum * 10000000;
      } else {
        amount = rawNum;
      }
    }
  }

  let itemName = 'unplanned purchase';
  let category = 'Shopping';

  if (/\b(?:gadget|laptop|macbook|phone|iphone|tv|camera|headphones?|ipad|tablet|electronics|smartwatch|pc|monitor)\b/i.test(clean)) {
    const m = clean.match(/\b(gadget|laptop|macbook|phone|iphone|tv|camera|headphones?|ipad|tablet|electronics|smartwatch|pc|monitor)\b/i);
    itemName = m ? m[0] : 'gadget';
    category = 'Electronics & Gadgets';
  } else if (/\b(?:dinner|lunch|restaurant|food|swiggy|zomato|cafe|meal|groceries|buffet|dining)\b/i.test(clean)) {
    const m = clean.match(/\b(dinner|lunch|restaurant|food|swiggy|zomato|cafe|meal|groceries|buffet|dining)\b/i);
    itemName = m ? m[0] : 'dining expense';
    category = 'Food & Dining';
  } else if (/\b(?:trip|vacation|flight|hotel|tour|travel|holiday)\b/i.test(clean)) {
    const m = clean.match(/\b(trip|vacation|flight|hotel|tour|travel|holiday)\b/i);
    itemName = m ? m[0] : 'travel trip';
    category = 'Travel';
  } else if (/\b(?:clothes|shoes|zara|jacket|shirt|dress|shopping|watch|apparel|jeans)\b/i.test(clean)) {
    const m = clean.match(/\b(clothes|shoes|zara|jacket|shirt|dress|shopping|watch|apparel|jeans)\b/i);
    itemName = m ? m[0] : 'clothing item';
    category = 'Shopping';
  }

  return { itemAmount: amount, itemName, category };
}

/**
 * Calculates complete affordability metrics and cautious financial recommendation in backend code.
 * Explicitly distinguishes available liquid cash from current monthly cash flow.
 */
export function calculateAffordability(
  query: string,
  ctx: UserFinancialContext,
  refDate: Date = new Date()
): AffordabilityCalculation | null {
  const params = extractAffordabilityParams(query);
  if (!params) {
    return null;
  }

  const { itemAmount, itemName, category } = params;
  const { aggregates } = ctx;
  const standardPeriods = calculateStandardPeriods(ctx.transactions, refDate);

  // Available Cash: Cumulative liquid net savings till today across entire ledger
  const availableCash = aggregates.netSavings;

  // Monthly Cash Flow: Income, expenses, and net surplus generated in the current month
  const monthlyIncome = standardPeriods.thisMonth.income;
  const monthlyExpenses = standardPeriods.thisMonth.expenses;
  const monthlySurplus = standardPeriods.thisMonth.net;

  // Upcoming Obligations: Unpaid bills coming due
  const upcomingBillsTotal = aggregates.upcomingBills.reduce((acc, b) => acc + b.amount, 0);
  const upcomingBillsCount = aggregates.upcomingBills.length;

  // Uncommitted Cash Buffer: Liquid cash remaining after setting aside upcoming bills
  const uncommittedCash = Math.max(0, availableCash - upcomingBillsTotal);

  // Category Budget Impact
  const budgetObj = aggregates.budgetStatus.find(
    (b) =>
      b.category.toLowerCase().includes(category.toLowerCase()) ||
      category.toLowerCase().includes(b.category.toLowerCase())
  );
  const hasBudget = Boolean(budgetObj);
  const budgetAllocated = budgetObj ? budgetObj.allocated : 0;
  const budgetSpent = budgetObj ? budgetObj.spent : 0;
  const budgetRemaining = budgetObj ? budgetObj.remaining : 0;
  const isOverBudgetAfterPurchase = hasBudget ? budgetSpent + itemAmount > budgetAllocated : false;

  // Post-purchase projections
  const projectedRemainingCash = availableCash - itemAmount;
  const projectedMonthlySurplus = monthlySurplus - itemAmount;

  // Cautious Evaluation
  let verdict: 'affordable' | 'manageable_with_caution' | 'stretch' | 'not_recommended';
  let verdictTitle = '';
  let verdictSummary = '';

  if (availableCash < itemAmount) {
    verdict = 'not_recommended';
    verdictTitle = '⚠️ Not Recommended (Deficit Incurred)';
    verdictSummary = `This purchase would exceed your total liquid savings (₹${availableCash.toLocaleString('en-IN')}) and push your ledger into a deficit of ₹${Math.abs(projectedRemainingCash).toLocaleString('en-IN')}. We strongly advise deferring this purchase or creating a dedicated savings goal to fund it over time.`;
  } else if (itemAmount > uncommittedCash) {
    verdict = 'stretch';
    verdictTitle = '🚨 High Caution (Upcoming Bills at Risk)';
    verdictSummary = `While your cumulative net savings stand at ₹${availableCash.toLocaleString('en-IN')}, you have ₹${upcomingBillsTotal.toLocaleString('en-IN')} in committed upcoming bills. Completing this purchase leaves only ₹${projectedRemainingCash.toLocaleString('en-IN')}, which compromises your ability to settle required upcoming obligations without dipping below zero.`;
  } else if (itemAmount > monthlySurplus) {
    verdict = 'manageable_with_caution';
    verdictTitle = '💡 Manageable with Caution (Draws from Prior Savings)';
    const surplusDeficit = itemAmount - monthlySurplus;
    verdictSummary = `This purchase (₹${itemAmount.toLocaleString('en-IN')}) exceeds your current month's net cash flow (₹${monthlySurplus.toLocaleString('en-IN')}). It will consume 100% of this month's surplus plus ₹${surplusDeficit.toLocaleString('en-IN')} drawn from past accumulated savings. However, your remaining liquid cash reserve will remain positive at ₹${projectedRemainingCash.toLocaleString('en-IN')}, with your ₹${upcomingBillsTotal.toLocaleString('en-IN')} in upcoming bills fully protected.`;
  } else {
    verdict = 'affordable';
    verdictTitle = '✅ Affordable with Prudence';
    verdictSummary = `Your current monthly cash flow (₹${monthlySurplus.toLocaleString('en-IN')} surplus) comfortably covers this expense without needing to draw on past savings. After the purchase and safeguarding ₹${upcomingBillsTotal.toLocaleString('en-IN')} for upcoming bills, your remaining liquid reserve will stand at ₹${projectedRemainingCash.toLocaleString('en-IN')}.`;
  }

  return {
    itemAmount,
    itemName,
    category,
    availableCash,
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    upcomingBillsTotal,
    upcomingBillsCount,
    uncommittedCash,
    hasBudget,
    budgetAllocated,
    budgetSpent,
    budgetRemaining,
    isOverBudgetAfterPurchase,
    projectedRemainingCash,
    projectedMonthlySurplus,
    verdict,
    verdictTitle,
    verdictSummary,
  };
}

/**
 * Formats an AffordabilityCalculation into clear, structured markdown.
 */
export function formatAffordabilityResponse(calc: AffordabilityCalculation): string {
  let res = `### Affordability Assessment: ₹${calc.itemAmount.toLocaleString('en-IN')} (${calc.itemName})\n\n`;

  res += `1. **Available Cash (Cumulative Liquid Reserves)**: ₹${calc.availableCash.toLocaleString('en-IN')}\n`;
  res += `   *(Total liquid net savings accumulated across your database ledger till today)*\n\n`;

  res += `2. **Current Monthly Cash Flow (This Month)**: ${calc.monthlySurplus >= 0 ? '+' : ''}₹${calc.monthlySurplus.toLocaleString('en-IN')}\n`;
  res += `   *(Income earned this month: ₹${calc.monthlyIncome.toLocaleString('en-IN')} | Expenses this month: ₹${calc.monthlyExpenses.toLocaleString('en-IN')})*\n\n`;

  if (calc.upcomingBillsTotal > 0) {
    res += `3. **Committed Obligations & Bills**: ₹${calc.upcomingBillsTotal.toLocaleString('en-IN')} (${calc.upcomingBillsCount} unpaid upcoming bill(s))\n`;
    res += `   - **Uncommitted Liquid Buffer**: ₹${calc.uncommittedCash.toLocaleString('en-IN')} *(Available cash after safeguarding upcoming bills)*\n\n`;
  } else {
    res += `3. **Committed Obligations & Bills**: ₹0 (No unpaid upcoming bills)\n\n`;
  }

  if (calc.hasBudget) {
    res += `4. **Category Budget Impact (${calc.category})**:\n`;
    res += `   - Envelope Limit: ₹${calc.budgetAllocated.toLocaleString('en-IN')} | Spent to Date: ₹${calc.budgetSpent.toLocaleString('en-IN')} | Remaining: ₹${calc.budgetRemaining.toLocaleString('en-IN')}\n`;
    if (calc.isOverBudgetAfterPurchase) {
      const overBy = (calc.budgetSpent + calc.itemAmount) - calc.budgetAllocated;
      res += `   - ⚠️ **Budget Warning**: This purchase would push this category over budget by ₹${overBy.toLocaleString('en-IN')}.\n\n`;
    } else {
      res += `   - ✅ **Budget Compliant**: Fits within your remaining category budget envelope.\n\n`;
    }
  }

  res += `5. **Projected Cash Reserve after Purchase**: ₹${calc.projectedRemainingCash.toLocaleString('en-IN')}\n\n`;
  res += `---\n`;
  res += `#### Recommendation: ${calc.verdictTitle}\n`;
  res += `${calc.verdictSummary}`;

  return res;
}

/**
 * Assembles a comprehensive, database-verified financial context snapshot for the user.
 */
export async function buildUserFinancialContext(userId: string): Promise<UserFinancialContext> {
  const dbStart = performance.now();
  const [transactions, budgets, goals, bills, recurring] = await Promise.all([
    getAllTransactions(userId, 5000),
    getAllBudgets(userId),
    getAllGoals(userId),
    getAllBills(userId),
    getAllRecurringTransactions(userId),
  ]);
  const dbEnd = performance.now();

  const calcStart = performance.now();
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryTotals: Record<string, number> = {};
  const monthlyData: Record<string, { income: number; expenses: number; net: number; count: number; categories: Record<string, number> }> = {};

  for (const tx of transactions) {
    const amt = tx.amount;
    const month = normalizeMonthLabel(tx.date);

    if (!monthlyData[month]) {
      monthlyData[month] = { income: 0, expenses: 0, net: 0, count: 0, categories: {} };
    }
    monthlyData[month].count += 1;

    if (tx.type === 'income') {
      totalIncome += amt;
      monthlyData[month].income += amt;
    } else {
      totalExpenses += amt;
      monthlyData[month].expenses += amt;
      const cat = tx.category || 'Others';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      monthlyData[month].categories[cat] = (monthlyData[month].categories[cat] || 0) + amt;
    }
    monthlyData[month].net = monthlyData[month].income - monthlyData[month].expenses;
  }

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? parseFloat(((netSavings / totalIncome) * 100).toFixed(1)) : 0;

  // Resolve current active month (e.g. latest month with transactions or "Nov 2026")
  const availableMonths = Object.keys(monthlyData);
  const currentMonthKey = availableMonths.includes('Nov 2026') ? 'Nov 2026' : (availableMonths[0] || 'Current');

  // Budget Status calculations
  const currentMonthCategories = monthlyData[currentMonthKey]?.categories || {};
  const budgetStatus = budgets.map((b) => {
    // If budget is for this month or "All"
    const isApplicable = b.month === 'All' || b.month === currentMonthKey || b.month.toLowerCase() === currentMonthKey.toLowerCase();
    const spent = isApplicable ? (currentMonthCategories[b.category] || 0) : 0;
    const remaining = Math.max(0, b.allocated - spent);
    const percentage = b.allocated > 0 ? Math.round((spent / b.allocated) * 100) : 0;
    const isOverBudget = spent > b.allocated;
    const isNearLimit = !isOverBudget && percentage >= 80;

    return {
      category: b.category,
      month: b.month,
      allocated: b.allocated,
      spent,
      remaining,
      percentage,
      isOverBudget,
      isNearLimit,
    };
  });

  // Goals progress
  const goalsProgress = goals.map((g) => {
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    const percentage = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
    return {
      title: g.title,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      remaining,
      percentage,
      targetDate: g.targetDate || undefined,
    };
  });

  // Bills status
  const upcomingBills = bills.filter((b) => b.status === 'unpaid' && b.dueInDays >= 0);
  const overdueBills = bills.filter((b) => b.status === 'unpaid' && b.dueInDays < 0);
  const calcEnd = performance.now();

  return {
    userId,
    transactions,
    budgets,
    goals,
    bills,
    recurring,
    timings: {
      dbRetrievalMs: parseFloat((dbEnd - dbStart).toFixed(2)),
      metricCalculationMs: parseFloat((calcEnd - calcStart).toFixed(2)),
    },
    aggregates: {
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netSavings: parseFloat(netSavings.toFixed(2)),
      savingsRate,
      transactionCount: transactions.length,
      monthlyData,
      categoryTotals,
      recentTransactions: transactions.slice(0, 10),
      budgetStatus,
      upcomingBills,
      overdueBills,
      goalsProgress,
    },
  };
}

export type ChatIntent =
  | 'expense_total'
  | 'income_total'
  | 'net_cash_flow'
  | 'remaining_balance'
  | 'category_spending'
  | 'budget_status'
  | 'savings_goals'
  | 'upcoming_bills'
  | 'affordability'
  | 'month_comparison'
  | 'savings_advice'
  | 'current_balance'
  | 'general_overview'
  | 'ambiguous';

export interface IntentDetectionResult {
  intent: ChatIntent;
  category: string | null;
}

/**
 * Extracts a matching expense category or category alias from the user query.
 */
export function extractCategoryFromQuery(
  clean: string,
  transactions: FrontendTransaction[] = [],
  budgets: FrontendBudget[] = []
): string | null {
  if (/\b(?:food|dining|restaurant|swiggy|zomato|cafe|groceries|grocery|meal|buffet|eating\s+out|takeout)\b/i.test(clean)) {
    return 'Food & Dining';
  }
  if (/\b(?:shopping|clothes|clothing|shoes|apparel|amazon|flipkart|zara|fashion|mall)\b/i.test(clean)) {
    return 'Shopping';
  }
  if (/\b(?:travel|flight|flights|hotel|hotels|vacation|trip|uber|ola|fuel|petrol|commute|transport|transportation)\b/i.test(clean)) {
    return 'Travel';
  }
  if (/\b(?:electronics?|gadgets?|laptop|phone|iphone|tv|camera|headphones?|pc|monitor|smartwatch)\b/i.test(clean)) {
    return 'Electronics & Gadgets';
  }
  if (/\b(?:utilities|utility|electricity|power|water|gas|wifi|broadband|internet|recharge)\b/i.test(clean)) {
    return 'Utilities';
  }
  if (/\b(?:entertainment|movies?|cinema|netflix|prime|hotstar|spotify|concert|gaming)\b/i.test(clean)) {
    return 'Entertainment';
  }
  if (/\b(?:health|healthcare|medical|medicine|hospital|clinic|doctor|pharmacy|fitness|gym)\b/i.test(clean)) {
    return 'Health & Fitness';
  }
  if (/\b(?:education|course|tuition|books?|training|school|college)\b/i.test(clean)) {
    return 'Education';
  }
  if (/\b(?:investment|investments|stocks?|mutual\s+funds?|sip|crypto)\b/i.test(clean)) {
    return 'Investments';
  }

  // Check against active categories in user's budgets
  for (const b of budgets) {
    if (clean.includes(b.category.toLowerCase())) {
      return b.category;
    }
  }

  // Check against active categories in user's transactions
  for (const t of transactions) {
    if (t.category && clean.includes(t.category.toLowerCase())) {
      return t.category;
    }
  }

  return null;
}

/**
 * Classifies user message into a specific financial intent and extracted category.
 */
export function detectChatIntent(
  query: string,
  transactions: FrontendTransaction[] = [],
  budgets: FrontendBudget[] = []
): IntentDetectionResult {
  const clean = query.toLowerCase().trim();

  // 1. Affordability of a proposed purchase
  if (extractAffordabilityParams(query) !== null) {
    const params = extractAffordabilityParams(query);
    return { intent: 'affordability', category: params?.category || null };
  }

  // 2. Current bank / account balance inquiry
  if (/\b(?:current\s+balance|bank\s+balance|account\s+balance|available\s+balance|how\s+much\s+(?:money\s+)?(?:do\s+i\s+have|in\s+(?:my\s+)?(?:bank|account)))\b/i.test(clean)) {
    return { intent: 'current_balance', category: null };
  }

  // 3. Remaining balance / cash left after period or expenses
  if (
    (/\b(?:left|remaining|surplus|balance|leftover)\b/i.test(clean) &&
      (/\b(?:after|till\s+today|from)\b/i.test(clean) || /\b(?:expenses?|spending)\b/i.test(clean) || /\b(?:month|week|today)\b/i.test(clean))) ||
    /\b(?:how\s+much\s+is\s+left|cash\s+left)\b/i.test(clean)
  ) {
    return { intent: 'remaining_balance', category: null };
  }

  // 4. Budget status inquiry
  if (/\b(?:budget|budgets|over\s+budget|under\s+budget|near\s+limit|budget\s+limit|exceed(?:ed|ing)?\s+budget|budget\s+status)\b/i.test(clean)) {
    return { intent: 'budget_status', category: extractCategoryFromQuery(clean, transactions, budgets) };
  }

  // 5. Savings Goals
  if (/\b(?:goals?|target|targets|saving\s+for|emergency\s+fund)\b/i.test(clean) && !/\b(?:advice|tips?)\b/i.test(clean)) {
    return { intent: 'savings_goals', category: null };
  }

  // 6. Upcoming Bills & Recurring
  if (/\b(?:bills?|due|due\s+date|subscriptions?|recurring|overdue|unpaid\s+bills?)\b/i.test(clean)) {
    return { intent: 'upcoming_bills', category: null };
  }

  // 7. Month Comparison
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const matchedMonths = monthNames.filter((m) => new RegExp(`\\b${m}`, 'i').test(clean));
  if (matchedMonths.length >= 2 || /\b(?:compare|comparison|vs\.?|versus|difference\s+between)\b/i.test(clean)) {
    return { intent: 'month_comparison', category: null };
  }

  // 8. Category spending (e.g. "How much did I spend on food this month?")
  const cat = extractCategoryFromQuery(clean, transactions, budgets);
  if (cat && (/\b(?:spend|spent|cost|pay|paid|how\s+much|expenses?|outflow|on\s+food)\b/i.test(clean) || clean.includes(cat.toLowerCase()))) {
    return { intent: 'category_spending', category: cat };
  }

  // 9. Income Total (e.g. "How much did I earn last month?")
  if (
    /\b(?:income|earn|earned|earnings|salary|made|received|inflows?|total\s+income|how\s+much\s+did\s+i\s+(?:earn|make))\b/i.test(clean) &&
    !/\b(?:expenses?|spent|spending)\b/i.test(clean)
  ) {
    return { intent: 'income_total', category: null };
  }

  // 10. Net Cash Flow
  if (/\b(?:net\s+cash\s+flow|net\s+savings|net\s+flow|net\s+position)\b/i.test(clean)) {
    return { intent: 'net_cash_flow', category: null };
  }

  // 11. Expense Total (e.g. "What were my total expenses this month?")
  if (/\b(?:expenses?|spend|spent|total\s+spent|outflow|outflows|total\s+expenses|how\s+much\s+did\s+i\s+spend|spending)\b/i.test(clean)) {
    return { intent: 'expense_total', category: null };
  }

  // 12. Savings Advice
  if (/\b(?:advice|advise|tips?|how\s+can\s+i\s+save|ways\s+to\s+save|recommend(?:ation)?|improve\s+savings)\b/i.test(clean)) {
    return { intent: 'savings_advice', category: null };
  }

  // 13. General overview
  if (/\b(?:summary|overview|all\s+time|overall|how\s+am\s+i\s+doing|financial\s+health|ledger)\b/i.test(clean)) {
    return { intent: 'general_overview', category: null };
  }

  // 14. Ambiguous
  return { intent: 'ambiguous', category: null };
}

/**
 * Builds a focused, intent-specific system instruction for Gemini grounded strictly in DB context.
 */
function buildSystemPrompt(
  ctx: UserFinancialContext,
  refDate: Date = new Date(),
  userMessage?: string,
  intentResult?: IntentDetectionResult,
  requestedPeriod?: PeriodMetrics | null
): string {
  const { aggregates } = ctx;
  const standardPeriods = calculateStandardPeriods(ctx.transactions, refDate);
  const detectedIntent = intentResult?.intent || 'general_overview';
  const targetCategory = intentResult?.category || null;

  let affordabilitySection = '';
  if (detectedIntent === 'affordability' && userMessage) {
    const affordCalc = calculateAffordability(userMessage, ctx, refDate);
    if (affordCalc) {
      affordabilitySection = `
=== PRE-CALCULATED BACKEND AFFORDABILITY ANALYSIS ===
Evaluated Item: "${affordCalc.itemName}" for ₹${affordCalc.itemAmount.toLocaleString('en-IN')} (Category: ${affordCalc.category})
- Cumulative Liquid Reserves (Available Cash): ₹${affordCalc.availableCash.toLocaleString('en-IN')}
- Current Monthly Cash Flow (This Month Net): ${affordCalc.monthlySurplus >= 0 ? '+' : ''}₹${affordCalc.monthlySurplus.toLocaleString('en-IN')} (Income: ₹${affordCalc.monthlyIncome.toLocaleString('en-IN')}, Expenses: ₹${affordCalc.monthlyExpenses.toLocaleString('en-IN')})
- Committed Upcoming Bills: ₹${affordCalc.upcomingBillsTotal.toLocaleString('en-IN')} across ${affordCalc.upcomingBillsCount} unpaid bill(s)
- Uncommitted Cash Buffer: ₹${affordCalc.uncommittedCash.toLocaleString('en-IN')}
${affordCalc.hasBudget ? `- Category Budget (${affordCalc.category}): Limit ₹${affordCalc.budgetAllocated.toLocaleString('en-IN')} | Spent ₹${affordCalc.budgetSpent.toLocaleString('en-IN')} | Remaining ₹${affordCalc.budgetRemaining.toLocaleString('en-IN')} | Exceeds: ${affordCalc.isOverBudgetAfterPurchase}` : '- Category Budget: None configured'}
- Projected Post-Purchase Liquid Cash: ₹${affordCalc.projectedRemainingCash.toLocaleString('en-IN')}
- Projected Post-Purchase Monthly Net Cash Flow: ₹${affordCalc.projectedMonthlySurplus.toLocaleString('en-IN')}
- Backend Cautious Verdict: ${affordCalc.verdictTitle}
- Recommendation Summary: ${affordCalc.verdictSummary}
====================================================`;
    }
  }

  // Target metrics block specifically tailored to what the user asked
  let targetMetricsBlock = '';
  const cleanMsg = (userMessage || '').toLowerCase();
  const isAllTime = cleanMsg.includes('all time') || cleanMsg.includes('overall') || cleanMsg.includes('all-time') || cleanMsg.includes('across all');

  if (detectedIntent === 'expense_total') {
    if (isAllTime || (!requestedPeriod && !cleanMsg.includes('this month') && !cleanMsg.includes('current month') && !cleanMsg.includes('last month'))) {
      targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (ALL-TIME EXPENSE TOTAL) ===
- Total Cumulative Expenses: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}
- Total Cumulative Income: ₹${aggregates.totalIncome.toLocaleString('en-IN')}
- Cumulative Net Savings: ₹${aggregates.netSavings.toLocaleString('en-IN')} (${aggregates.savingsRate}% savings rate)
- Total Recorded Transactions: ${aggregates.transactionCount}
`;
    } else {
      const p = requestedPeriod || standardPeriods.thisMonth;
      targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (EXPENSE TOTAL) ===
- Requested Period: ${p.label}
- Total Expenses in Period: ₹${p.expenses.toLocaleString('en-IN')}
- Total Transactions in Period: ${p.count}
${p.topCategory ? `- Top Spending Category: ${p.topCategory.name} (₹${p.topCategory.amount.toLocaleString('en-IN')}, ${p.topCategory.percentage}% of period spending)` : ''}
`;
    }
  } else if (detectedIntent === 'income_total') {
    if (isAllTime || (!requestedPeriod && !cleanMsg.includes('last month') && !cleanMsg.includes('this month') && !cleanMsg.includes('current month'))) {
      targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (ALL-TIME INCOME TOTAL) ===
- Total Cumulative Income: ₹${aggregates.totalIncome.toLocaleString('en-IN')}
- Total Cumulative Expenses: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}
- Cumulative Net Savings: ₹${aggregates.netSavings.toLocaleString('en-IN')} (${aggregates.savingsRate}% savings rate)
`;
    } else {
      const p = requestedPeriod || standardPeriods.lastMonth;
      targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (INCOME TOTAL) ===
- Requested Period: ${p.label}
- Total Income in Period: ₹${p.income.toLocaleString('en-IN')}
- Income Transactions in Period: ${p.transactions.filter((t) => t.type === 'income').length}
- Net Cash Flow for Period: ${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')}
`;
    }
  } else if (detectedIntent === 'remaining_balance') {
    const p = requestedPeriod || standardPeriods.lastMonth;
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (REMAINING BALANCE / PERIOD CASH FLOW) ===
- Evaluated Period: ${p.label}
- Income in Period: ₹${p.income.toLocaleString('en-IN')}
- Expenses in Period: ₹${p.expenses.toLocaleString('en-IN')}
- Net Cash Flow Remaining from Period: ${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')}
- Cumulative Tracked Net Savings Across Entire Statement History (Till Today): ₹${aggregates.netSavings.toLocaleString('en-IN')}
CRITICAL REQUIREMENT:
1. Directly state the period net cash flow first (${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')}) along with period income (₹${p.income.toLocaleString('en-IN')}) and period expenses (₹${p.expenses.toLocaleString('en-IN')}).
2. Distinguish this period cash flow from cumulative tracked net savings (₹${aggregates.netSavings.toLocaleString('en-IN')}).
3. Explicitly state that actual current bank balance cannot be determined from ledger totals alone because opening bank balance or external accounts are not stored in the transaction ledger.
`;
  } else if (detectedIntent === 'category_spending') {
    const catName = targetCategory || 'Food & Dining';
    const p = requestedPeriod || standardPeriods.thisMonth;
    const catSpent = p.categories[catName] || 0;
    const budgetObj = aggregates.budgetStatus.find((b) => b.category.toLowerCase().includes(catName.toLowerCase()));
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (CATEGORY SPENDING: ${catName}) ===
- Period: ${p.label}
- Spending on ${catName}: ₹${catSpent.toLocaleString('en-IN')}
- Total Expenses in Period: ₹${p.expenses.toLocaleString('en-IN')}
- Percentage of Period Expenses: ${p.expenses > 0 ? ((catSpent / p.expenses) * 100).toFixed(1) : 0}%
${budgetObj ? `- Category Budget: Allocated ₹${budgetObj.allocated.toLocaleString('en-IN')} | Spent to Date: ₹${budgetObj.spent.toLocaleString('en-IN')} | Remaining: ₹${budgetObj.remaining.toLocaleString('en-IN')} (${budgetObj.percentage}% used)${budgetObj.isOverBudget ? ' [OVER BUDGET]' : budgetObj.isNearLimit ? ' [NEAR LIMIT]' : ' [HEALTHY]'}` : '- No active budget envelope configured for this category.'}
`;
  } else if (detectedIntent === 'budget_status') {
    const overBudgets = aggregates.budgetStatus.filter((b) => b.isOverBudget);
    const nearLimit = aggregates.budgetStatus.filter((b) => b.isNearLimit);
    const healthy = aggregates.budgetStatus.filter((b) => !b.isOverBudget && !b.isNearLimit);
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (BUDGET STATUS) ===
- Over Budget Categories (${overBudgets.length}): ${overBudgets.map((b) => `${b.category} (Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')}, Over by ₹${(b.spent - b.allocated).toLocaleString('en-IN')})`).join(', ') || 'None'}
- Near Limit Categories (${nearLimit.length}): ${nearLimit.map((b) => `${b.category} (Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')}, Remaining ₹${b.remaining.toLocaleString('en-IN')})`).join(', ') || 'None'}
- Healthy Categories (${healthy.length}): ${healthy.map((b) => `${b.category} (Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')}, Remaining ₹${b.remaining.toLocaleString('en-IN')})`).join(', ') || 'None'}
CRITICAL RULE:
Start your response directly with "Yes, you are currently over budget in..." or "No, you are not over budget." based on whether over-budget categories exist.
`;
  } else if (detectedIntent === 'current_balance') {
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (CURRENT ACCOUNT BALANCE) ===
- Cumulative Tracked Net Savings (Till Today): ₹${aggregates.netSavings.toLocaleString('en-IN')}
- Cumulative Tracked Income: ₹${aggregates.totalIncome.toLocaleString('en-IN')}
- Cumulative Tracked Expenses: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}
CRITICAL MANDATORY INSTRUCTION:
You MUST state that the actual current available bank balance cannot be determined from ledger totals alone because the transaction ledger does not track an opening bank balance, interest credits, or external off-ledger accounts. State that ₹${aggregates.netSavings.toLocaleString('en-IN')} represents cumulative tracked net savings, not live bank account balance.
`;
  } else if (detectedIntent === 'upcoming_bills') {
    const billsList = ctx.bills.map((b) => `- Bill: "${b.name}" | Amount: ₹${b.amount.toLocaleString('en-IN')} | Due: ${b.dueDate} | Status: ${b.status} (${b.dueInDays < 0 ? `${Math.abs(b.dueInDays)} days overdue` : `Due in ${b.dueInDays} days`})`).join('\n') || 'No bills recorded.';
    const recurringList = ctx.recurring.map((r) => `- Recurring ${r.type.toUpperCase()}: "${r.name}" | Amount: ₹${r.amount.toLocaleString('en-IN')} | Frequency: ${r.frequency} | Next Due: ${r.nextDueDate}`).join('\n') || 'No recurring entries recorded.';
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (BILLS & RECURRING) ===
Active Bills:
${billsList}

Recurring Schedules:
${recurringList}
`;
  } else if (detectedIntent === 'savings_goals') {
    const goalsList = aggregates.goalsProgress.map((g) => `- Goal: "${g.title}" | Target: ₹${g.targetAmount.toLocaleString('en-IN')} | Saved: ₹${g.currentAmount.toLocaleString('en-IN')} | Remaining: ₹${g.remaining.toLocaleString('en-IN')} (${g.percentage}% achieved)${g.targetDate ? ` | Target Date: ${g.targetDate}` : ''}`).join('\n') || 'No active savings goals.';
    targetMetricsBlock = `
=== TARGET METRICS FOR USER QUESTION (SAVINGS GOALS) ===
${goalsList}
`;
  }

  let supportingContext = '';
  if (detectedIntent === 'general_overview' || detectedIntent === 'savings_advice' || detectedIntent === 'ambiguous') {
    supportingContext = `
=== SUPPORTING DATABASE CONTEXT ===
- This Month (${standardPeriods.thisMonth.label}): Income ₹${standardPeriods.thisMonth.income.toLocaleString('en-IN')}, Expenses ₹${standardPeriods.thisMonth.expenses.toLocaleString('en-IN')}, Net ${standardPeriods.thisMonth.net >= 0 ? '+' : ''}₹${standardPeriods.thisMonth.net.toLocaleString('en-IN')}
- Last Month (${standardPeriods.lastMonth.label}): Income ₹${standardPeriods.lastMonth.income.toLocaleString('en-IN')}, Expenses ₹${standardPeriods.lastMonth.expenses.toLocaleString('en-IN')}, Net ${standardPeriods.lastMonth.net >= 0 ? '+' : ''}₹${standardPeriods.lastMonth.net.toLocaleString('en-IN')}
- Cumulative All-Time: Income ₹${aggregates.totalIncome.toLocaleString('en-IN')}, Expenses ₹${aggregates.totalExpenses.toLocaleString('en-IN')}, Net Savings ₹${aggregates.netSavings.toLocaleString('en-IN')}
- Active Budgets: ${aggregates.budgetStatus.length} envelope(s)
- Unpaid Bills: ${aggregates.upcomingBills.length} upcoming, ${aggregates.overdueBills.length} overdue
- Active Goals: ${aggregates.goalsProgress.length} goal(s)
==================================`;
  }

  return `You are FinSight AI, a grounded personal financial copilot with access to the user's authentic PostgreSQL ledger.
Reference date: ${formatStandardDate(refDate)}.
USER INTENT DETECTED: "${detectedIntent}"

GROUND RULES:
1. DIRECT ANSWER FIRST: Put the direct answer to the user's specific question in the very first sentence. Use Indian Rupees (₹) with Indian number grouping (e.g. ₹15,000).
2. DO NOT DUMP UNREQUESTED LEDGER SUMMARIES: Answer ONLY what was asked using the target data below. Do not append unrequested all-time ledger summaries or unrelated periods.
3. If asked whether over budget, begin directly with "Yes, you are currently over budget in..." or "No, you are not over budget."
4. If asked about remaining cash or balance from a period, state the period net cash flow first (+₹X). You MUST explicitly cite the period income (₹A), period expenses (₹B), and cumulative tracked net savings (₹Y). You MUST also state that actual current bank balance cannot be determined from ledger totals alone because an opening bank balance is not tracked.
5. If asked about affordability, adhere faithfully to the backend pre-calculated analysis and recommendation.
6. Never invent figures or transactions. State only the facts from the target data below.

${targetMetricsBlock}
${affordabilitySection}
${supportingContext}`.trim();
}

/**
 * Deterministic grounded intelligence engine.
 * Delivers focused, intent-specific responses grounded in PostgreSQL records.
 * Puts direct answers first and does NOT append unrequested generic all-time summaries.
 */
export function generateGroundedFallbackResponse(
  userMessage: string,
  ctx: UserFinancialContext,
  refDate: Date = new Date()
): string {
  const clean = userMessage.toLowerCase().trim();
  const { aggregates } = ctx;

  // Empty state check
  if (aggregates.transactionCount === 0) {
    if (clean.includes('budget')) {
      return `You currently have ${ctx.budgets.length} budget envelope(s) configured, but no recorded transactions in your ledger. Import a bank CSV or add transactions to track your actual spending against your budgets.`;
    }
    if (clean.includes('goal')) {
      return `You currently have ${ctx.goals.length} savings goal(s) set up. As you record income and deposits, FinSight AI will track your progress toward your target amounts.`;
    }
    return `Your FinSight AI ledger is currently empty with 0 recorded transactions. To get personalized financial insights, please import your bank statement CSV or add your income and expenses.`;
  }

  // Detect time period and specific financial intent
  const requestedPeriod = detectQueryTimePeriod(userMessage, ctx.transactions, refDate);
  const { intent, category } = detectChatIntent(userMessage, ctx.transactions, ctx.budgets);
  const standardPeriods = calculateStandardPeriods(ctx.transactions, refDate);

  // 1. Affordability Scenarios (e.g. "Can I afford a ₹15,000 gadget this month?")
  if (intent === 'affordability') {
    const affordCalc = calculateAffordability(userMessage, ctx, refDate);
    if (affordCalc) {
      return formatAffordabilityResponse(affordCalc);
    }
  }

  // 2. Current Bank / Account Balance Inquiries
  if (intent === 'current_balance') {
    return (
      `### Current Account Balance Information\n\n` +
      `- **Cumulative Tracked Ledger Net Savings**: ₹${aggregates.netSavings.toLocaleString('en-IN')}\n` +
      `- **Cumulative Tracked Income**: ₹${aggregates.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Cumulative Tracked Expenses**: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}\n\n` +
      `⚠️ **Important Notice on Account Balance**: Your actual current available bank balance **cannot be determined from ledger totals alone**. ` +
      `FinSight AI tracks recorded income and expense transactions from your imported statements, but does not record an opening bank balance, external bank accounts, interest credits, or off-ledger cash. ` +
      `The ₹${aggregates.netSavings.toLocaleString('en-IN')} figure represents your cumulative tracked net cash surplus, not your live bank account balance.`
    );
  }

  // 3. Remaining Balance / Cash Left after Period or Expenses
  // e.g. "How much is left after last month's expenses?", "How much is left till today after all the expenses in last month?"
  if (intent === 'remaining_balance') {
    const period = requestedPeriod || standardPeriods.lastMonth;
    const periodName = period.periodKey === 'last_month' ? 'last month' : period.periodKey === 'this_month' ? 'this month' : period.label.split('(')[0].trim().toLowerCase();

    let res = `### Remaining Cash Flow: ${period.net >= 0 ? '+' : ''}₹${period.net.toLocaleString('en-IN')} (${period.label})\n\n`;
    res += `After all expenses in **${periodName}**, your net remaining cash flow was **${period.net >= 0 ? '+' : ''}₹${period.net.toLocaleString('en-IN')}** (Total Income: ₹${period.income.toLocaleString('en-IN')} minus Total Expenses: ₹${period.expenses.toLocaleString('en-IN')}).\n\n`;
    res += `### Cumulative Tracked Ledger Position:\n`;
    res += `- **Cumulative Tracked Net Savings (Till Today)**: ₹${aggregates.netSavings.toLocaleString('en-IN')}\n`;
    res += `- **Cumulative Tracked Income**: ₹${aggregates.totalIncome.toLocaleString('en-IN')}\n`;
    res += `- **Cumulative Tracked Expenses**: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}\n`;
    res += `- **Overall Tracked Savings Rate**: ${aggregates.savingsRate}%\n\n`;
    res += `⚠️ **Important Notice on Account Balance**: Actual current available bank balance cannot be determined from ledger totals alone. Your transaction ledger records statement activity but does not track an opening bank balance, untracked bank accounts, or external cash reserves.`;
    return res;
  }

  // 4. Category Spending (e.g. "How much did I spend on food this month?", "How much did I spend on Food & Dining?")
  if (intent === 'category_spending' && category) {
    const targetPeriod = requestedPeriod || (clean.includes('this month') ? standardPeriods.thisMonth : null);

    if (targetPeriod) {
      const catSpent = targetPeriod.categories[category] || 0;
      const pct = targetPeriod.expenses > 0 ? ((catSpent / targetPeriod.expenses) * 100).toFixed(1) : '0';
      const budgetObj = aggregates.budgetStatus.find(
        (b) => b.category.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(b.category.toLowerCase())
      );

      let msg = `You spent **₹${catSpent.toLocaleString('en-IN')}** on **${category}** during **${targetPeriod.label}**`;
      msg += ` (${pct}% of your ${targetPeriod.label.toLowerCase()} expenses).\n\n`;

      if (budgetObj) {
        msg += `**Category Budget Status**:\n`;
        msg += `- Allocated Envelope: ₹${budgetObj.allocated.toLocaleString('en-IN')}\n`;
        msg += `- Current Spent: ₹${budgetObj.spent.toLocaleString('en-IN')} (${budgetObj.percentage}% used)\n`;
        msg += `- Remaining Budget: ₹${budgetObj.remaining.toLocaleString('en-IN')}${budgetObj.isOverBudget ? ' ⚠️ (Over Budget)' : budgetObj.isNearLimit ? ' ⚠️ (Near Limit)' : ' (Healthy)'}`;
      } else {
        msg += `No monthly budget envelope is currently configured for ${category}.`;
      }
      return msg.trim();
    } else {
      // Overall / All-time category spending
      const allTimeCatSpent = aggregates.categoryTotals[category] || 0;
      const pct = aggregates.totalExpenses > 0 ? ((allTimeCatSpent / aggregates.totalExpenses) * 100).toFixed(1) : '0';
      const budgetObj = aggregates.budgetStatus.find(
        (b) => b.category.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(b.category.toLowerCase())
      );

      let msg = `Based on your live ledger, your total **${category}** expenditure stands at **₹${allTimeCatSpent.toLocaleString('en-IN')}** (${pct}% of your total expenses).\n\n`;
      if (budgetObj) {
        msg += `**Active Budget Status**:\n`;
        msg += `- Allocated Envelope: ₹${budgetObj.allocated.toLocaleString('en-IN')}\n`;
        msg += `- Current Spent: ₹${budgetObj.spent.toLocaleString('en-IN')} (${budgetObj.percentage}% used)\n`;
        msg += `- Remaining Budget: ₹${budgetObj.remaining.toLocaleString('en-IN')}${budgetObj.isOverBudget ? ' ⚠️ (Over Budget)' : budgetObj.isNearLimit ? ' ⚠️ (Near Limit)' : ' (Healthy)'}`;
      }
      return msg.trim();
    }
  }

  // 5. Income Total (e.g. "How much did I earn last month?")
  if (intent === 'income_total') {
    const isAllTime = clean.includes('all time') || clean.includes('overall') || clean.includes('all-time') || clean.includes('across all');
    if (isAllTime || (!requestedPeriod && !clean.includes('last month') && !clean.includes('this month') && !clean.includes('current month'))) {
      let res = `### Total Cumulative Income: ₹${aggregates.totalIncome.toLocaleString('en-IN')}\n\n`;
      res += `Across your entire recorded statement history, your total income was **₹${aggregates.totalIncome.toLocaleString('en-IN')}**.\n\n`;
      res += `- **Total Cumulative Expenses**: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}\n`;
      res += `- **Cumulative Net Savings**: ₹${aggregates.netSavings.toLocaleString('en-IN')} (${aggregates.savingsRate}% savings rate)`;
      return res.trim();
    }

    const p = requestedPeriod || standardPeriods.lastMonth;
    const periodName = p.periodKey === 'last_month' ? 'last month' : p.periodKey === 'this_month' ? 'this month' : p.label;

    let res = `### Total Income: ₹${p.income.toLocaleString('en-IN')} (${p.label})\n\n`;
    res += `During **${periodName}**, your total recorded income was **₹${p.income.toLocaleString('en-IN')}** across ${p.transactions.filter((t) => t.type === 'income').length} transaction(s).\n\n`;
    res += `- **Expenses in Period**: ₹${p.expenses.toLocaleString('en-IN')}\n`;
    res += `- **Net Cash Flow in Period**: ${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')} (${p.net >= 0 ? 'Net Surplus' : 'Net Deficit'})`;
    return res;
  }

  // 6. Expense Total (e.g. "What were my total expenses this month?", "What is my total spending overall across all time?")
  if (intent === 'expense_total') {
    const isAllTime = clean.includes('all time') || clean.includes('overall') || clean.includes('all-time') || clean.includes('across all');
    if (isAllTime || (!requestedPeriod && !clean.includes('this month') && !clean.includes('current month') && !clean.includes('last month'))) {
      let res = `### Total Cumulative Expenses: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}\n\n`;
      res += `Across your entire recorded statement history, your total spending was **₹${aggregates.totalExpenses.toLocaleString('en-IN')}** across ${aggregates.transactionCount} transaction(s).\n\n`;
      res += `- **Total Cumulative Income**: ₹${aggregates.totalIncome.toLocaleString('en-IN')}\n`;
      res += `- **Cumulative Net Savings**: ₹${aggregates.netSavings.toLocaleString('en-IN')} (${aggregates.savingsRate}% savings rate)`;
      return res.trim();
    }

    const p = requestedPeriod || standardPeriods.thisMonth;
    const periodName = p.periodKey === 'this_month' ? 'this month' : p.periodKey === 'last_month' ? 'last month' : p.label;

    let res = `### Total Expenses: ₹${p.expenses.toLocaleString('en-IN')} (${p.label})\n\n`;
    res += `During **${periodName}**, your total spending was **₹${p.expenses.toLocaleString('en-IN')}** across ${p.count} transaction(s).\n\n`;

    if (p.topCategory) {
      res += `- **Primary Outflow**: ${p.topCategory.name} (₹${p.topCategory.amount.toLocaleString('en-IN')}, ${p.topCategory.percentage}% of period spending)\n`;
    }

    const sortedCats = Object.entries(p.categories).sort((a, b) => b[1] - a[1]);
    if (sortedCats.length > 1) {
      res += `\n**Top Categories in Period**:\n`;
      for (const [catName, amt] of sortedCats.slice(0, 3)) {
        const pct = p.expenses > 0 ? ((amt / p.expenses) * 100).toFixed(1) : '0';
        res += `- ${catName}: ₹${amt.toLocaleString('en-IN')} (${pct}%)\n`;
      }
    }

    res += `\n- **Income in Period**: ₹${p.income.toLocaleString('en-IN')}\n`;
    res += `- **Net Cash Flow in Period**: ${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')}`;
    return res.trim();
  }

  // 7. Budget Status (e.g. "Am I over budget?", "What is my budget status?")
  if (intent === 'budget_status') {
    if (aggregates.budgetStatus.length === 0) {
      return `You have not set up any category budgets yet. Head to the **Budgets** page to allocate monthly spending limits for categories like Food & Dining, Shopping, and Travel.`;
    }

    const overBudgets = aggregates.budgetStatus.filter((b) => b.isOverBudget);
    const nearLimitBudgets = aggregates.budgetStatus.filter((b) => b.isNearLimit);
    const healthyBudgets = aggregates.budgetStatus.filter((b) => !b.isOverBudget && !b.isNearLimit);

    let report = '';
    if (overBudgets.length > 0) {
      report += `### Budget Status: ⚠️ Over Budget in ${overBudgets.length} Category(ies)\n\n`;
      report += `**Yes, you are currently over budget** in the following categories:\n`;
      for (const b of overBudgets) {
        report += `- **${b.category}**: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')} (${b.percentage}% used, over by ₹${(b.spent - b.allocated).toLocaleString('en-IN')})\n`;
      }
      report += '\n';

      if (nearLimitBudgets.length > 0) {
        report += `⚡ **Categories Near Limit (>80%)**:\n`;
        for (const b of nearLimitBudgets) {
          report += `- **${b.category}**: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')} (${b.percentage}% used, ₹${b.remaining.toLocaleString('en-IN')} remaining)\n`;
        }
        report += '\n';
      }
    } else if (nearLimitBudgets.length > 0) {
      report += `### Budget Status: ⚡ Within Limits (Watchlist Alert)\n\n`;
      report += `**No, you are not over budget**, but you have **${nearLimitBudgets.length} category(ies)** approaching limit (>80% used):\n`;
      for (const b of nearLimitBudgets) {
        report += `- **${b.category}**: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')} (${b.percentage}% used, ₹${b.remaining.toLocaleString('en-IN')} remaining)\n`;
      }
      report += '\n';
    } else {
      report += `### Budget Status: ✅ Healthy & On Track\n\n`;
      report += `**No, you are not over budget**. All ${healthyBudgets.length} active category budget envelope(s) are comfortably within their limits:\n`;
      for (const b of healthyBudgets) {
        report += `- **${b.category}**: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')} (${b.percentage}% used, ₹${b.remaining.toLocaleString('en-IN')} remaining)\n`;
      }
      return report.trim();
    }

    if (healthyBudgets.length > 0) {
      report += `✅ **Healthy Categories**:\n`;
      for (const b of healthyBudgets) {
        report += `- **${b.category}**: Spent ₹${b.spent.toLocaleString('en-IN')} of ₹${b.allocated.toLocaleString('en-IN')} (${b.percentage}% used, ₹${b.remaining.toLocaleString('en-IN')} remaining)\n`;
      }
    }
    return report.trim();
  }

  // 8. Savings Goals Progress
  if (intent === 'savings_goals') {
    if (aggregates.goalsProgress.length === 0) {
      return `You currently have no active savings goals. Head to the **Goals** section to define targets for emergency funds, vacations, or major investments.`;
    }

    let report = `### Savings Goals Progress:\n\n`;
    for (const g of aggregates.goalsProgress) {
      report += `- **${g.title}**: ₹${g.currentAmount.toLocaleString('en-IN')} of ₹${g.targetAmount.toLocaleString('en-IN')} (${g.percentage}% achieved, ₹${g.remaining.toLocaleString('en-IN')} remaining)${g.targetDate ? ` • Target Date: ${g.targetDate}` : ''}\n`;
    }
    return report.trim();
  }

  // 9. Upcoming Bills & Recurring
  if (intent === 'upcoming_bills') {
    let report = `### Bills & Recurring Overview:\n\n`;
    if (aggregates.overdueBills.length > 0) {
      report += `🚨 **Overdue Bills**:\n`;
      for (const b of aggregates.overdueBills) {
        report += `- **${b.name}**: ₹${b.amount.toLocaleString('en-IN')} (Due: ${b.dueDate}, ${Math.abs(b.dueInDays)} days overdue)\n`;
      }
      report += '\n';
    }

    if (aggregates.upcomingBills.length > 0) {
      report += `📅 **Upcoming Unpaid Bills**:\n`;
      for (const b of aggregates.upcomingBills) {
        report += `- **${b.name}**: ₹${b.amount.toLocaleString('en-IN')} (Due: ${b.dueDate}, in ${b.dueInDays} days)\n`;
      }
      report += '\n';
    }

    if (ctx.recurring.length > 0) {
      report += `🔄 **Active Recurring Schedules**:\n`;
      for (const r of ctx.recurring) {
        report += `- **${r.name}**: ₹${r.amount.toLocaleString('en-IN')} (${r.frequency} ${r.type}, next due: ${r.nextDueDate})\n`;
      }
    }

    if (aggregates.overdueBills.length === 0 && aggregates.upcomingBills.length === 0 && ctx.recurring.length === 0) {
      report += `You have no unpaid bills or recurring entries due.`;
    }
    return report.trim();
  }

  // 10. Net Cash Flow Inquiry
  if (intent === 'net_cash_flow') {
    const p = requestedPeriod || standardPeriods.thisMonth;
    let res = `### Net Cash Flow: ${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')} (${p.label})\n\n`;
    res += `During **${p.label}**, your net cash flow was **${p.net >= 0 ? '+' : ''}₹${p.net.toLocaleString('en-IN')}** (${p.net >= 0 ? 'Net Surplus' : 'Net Deficit'}).\n`;
    res += `- **Total Income**: ₹${p.income.toLocaleString('en-IN')}\n`;
    res += `- **Total Expenses**: ₹${p.expenses.toLocaleString('en-IN')}`;
    return res;
  }

  // 11. Time-specific period query fallback (when user explicitly requests a period breakdown)
  if (requestedPeriod) {
    let report = `### Period Financial Breakdown: ${requestedPeriod.label}\n`;
    report += `- **Income in Period**: ₹${requestedPeriod.income.toLocaleString('en-IN')}\n`;
    report += `- **Expenses in Period**: ₹${requestedPeriod.expenses.toLocaleString('en-IN')}\n`;
    report += `- **Net Cash Flow in Period**: ${requestedPeriod.net >= 0 ? '+' : ''}₹${requestedPeriod.net.toLocaleString('en-IN')}${requestedPeriod.net < 0 ? ' (Net Outflow / Deficit)' : ' (Net Surplus)'}\n`;
    report += `- **Transactions in Period**: ${requestedPeriod.count}\n`;

    if (requestedPeriod.topCategory) {
      report += `- **Primary Outflow**: ${requestedPeriod.topCategory.name} (₹${requestedPeriod.topCategory.amount.toLocaleString('en-IN')}, ${requestedPeriod.topCategory.percentage}% of period expenses)\n`;
    }
    return report.trim();
  }

  // 12. Month Comparisons
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mentionedMonths: string[] = [];
  for (const m of monthNames) {
    if (clean.includes(m)) {
      const matchKey = Object.keys(aggregates.monthlyData).find((k) => k.toLowerCase().includes(m));
      if (matchKey && !mentionedMonths.includes(matchKey)) {
        mentionedMonths.push(matchKey);
      }
    }
  }

  if (mentionedMonths.length >= 1 && (clean.includes('compare') || clean.includes('vs') || clean.includes('difference') || clean.includes('month'))) {
    let report = `### Monthly Spending Comparison:\n\n`;
    for (const m of mentionedMonths) {
      const d = aggregates.monthlyData[m];
      report += `**${m}**:\n`;
      report += `- Income: ₹${d.income.toLocaleString('en-IN')}\n`;
      report += `- Expenses: ₹${d.expenses.toLocaleString('en-IN')}\n`;
      report += `- Net Savings: ₹${d.net.toLocaleString('en-IN')}\n`;
      report += `- Transactions: ${d.count}\n\n`;
    }
    if (mentionedMonths.length === 2) {
      const m1 = aggregates.monthlyData[mentionedMonths[0]];
      const m2 = aggregates.monthlyData[mentionedMonths[1]];
      const expDiff = m1.expenses - m2.expenses;
      report += `**Summary**: Expenses in ${mentionedMonths[0]} were **${expDiff >= 0 ? '+' : '-'}₹${Math.abs(expDiff).toLocaleString('en-IN')}** compared to ${mentionedMonths[1]}.`;
    }
    return report.trim();
  }

  // 13. Savings Advice
  if (intent === 'savings_advice') {
    const topCategories = Object.entries(aggregates.categoryTotals).sort((a, b) => b[1] - a[1]);
    let report = `### FinSight AI Personalized Savings Guidance:\n\n`;
    report += `1. **Current Baseline**: Your total income is **₹${aggregates.totalIncome.toLocaleString('en-IN')}** and total expenses are **₹${aggregates.totalExpenses.toLocaleString('en-IN')}**, yielding **₹${aggregates.netSavings.toLocaleString('en-IN')}** in net savings (${aggregates.savingsRate}% rate).\n`;

    if (topCategories.length > 0) {
      const [topCat, topAmt] = topCategories[0];
      const pct = aggregates.totalExpenses > 0 ? ((topAmt / aggregates.totalExpenses) * 100).toFixed(1) : '0';
      report += `2. **Address Top Outflow**: Your largest spending category is **${topCat}** at **₹${topAmt.toLocaleString('en-IN')}** (${pct}% of all expenses). Setting a 10% budget reduction could unlock ~₹${Math.round(topAmt * 0.1).toLocaleString('en-IN')} in monthly savings.\n`;
    }

    if (aggregates.upcomingBills.length > 0) {
      report += `3. **Upcoming Cash Outflows**: You have ${aggregates.upcomingBills.length} unpaid bill(s) coming due. Ensure your liquid balance covers them before allocating to discretionary purchases.\n`;
    }

    report += `4. **Emergency Reserve**: Maintain a baseline reserve of 3-6 months of average expenses (~₹${Math.round((aggregates.totalExpenses / Math.max(1, Object.keys(aggregates.monthlyData).length)) * 3).toLocaleString('en-IN')}).`;
    return report;
  }

  // 14. Explicit General Overview (when user explicitly asks for overview/summary)
  if (intent === 'general_overview') {
    const topCategories = Object.entries(aggregates.categoryTotals).sort((a, b) => b[1] - a[1]);
    const primaryCat = topCategories[0] ? `${topCategories[0][0]} (₹${topCategories[0][1].toLocaleString('en-IN')})` : 'N/A';

    return (
      `### FinSight AI Ledger Summary:\n\n` +
      `- **Total Income**: ₹${aggregates.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Expenses**: ₹${aggregates.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Net Savings**: ₹${aggregates.netSavings.toLocaleString('en-IN')} (${aggregates.savingsRate}% savings rate)\n` +
      `- **Primary Expense Category**: ${primaryCat}\n` +
      `- **Recorded Transactions**: ${aggregates.transactionCount}\n` +
      `- **Active Budgets**: ${ctx.budgets.length} | **Savings Goals**: ${ctx.goals.length}`
    );
  }

  // 15. Ambiguous or Unrecognized Query -> Concise Clarification without dumping summary
  return (
    `I'm here to help with your finances! Would you like to check:\n` +
    `• Your expenses or income for this month or last month?\n` +
    `• Whether you are over budget?\n` +
    `• Spending on a specific category (e.g. Food & Dining)?\n` +
    `• Or whether you can afford an upcoming purchase?`
  );
}

/**
 * Processes an incoming user chat message with authenticated financial context.
 */
export async function processChatMessage(
  userId: string,
  userMessage: string,
  history: ChatMessageItem[] = [],
  refDate: Date = new Date(),
  mode: 'auto' | 'gemini' | 'engine' = 'auto',
  authMs: number = 0
): Promise<ChatResponse> {
  const reqStart = performance.now();
  const context = await buildUserFinancialContext(userId);
  const dbRetrievalMs = context.timings?.dbRetrievalMs || 0;
  const metricCalculationMs = context.timings?.metricCalculationMs || 0;

  const intentStart = performance.now();
  const requestedPeriod = detectQueryTimePeriod(userMessage, context.transactions, refDate);
  const intentResult = detectChatIntent(userMessage, context.transactions, context.budgets);
  const intentDetectionMs = parseFloat((performance.now() - intentStart).toFixed(2));

  let promptBuildMs = 0;
  let geminiMs = 0;

  const getTimings = (): ChatStageTimings => {
    const totalMs = parseFloat((performance.now() - reqStart + authMs).toFixed(2));
    return {
      authMs: parseFloat(authMs.toFixed(2)),
      dbRetrievalMs,
      metricCalculationMs,
      intentDetectionMs,
      promptBuildMs: parseFloat(promptBuildMs.toFixed(2)),
      geminiMs: parseFloat(geminiMs.toFixed(2)),
      totalMs,
    };
  };

  const logTimings = (engineUsed: 'gemini' | 'grounded-engine', timings: ChatStageTimings) => {
    console.log(
      `[Chat Stage Timings] User: ${userId} | Mode: ${mode} | Engine: ${engineUsed} | ` +
      `Auth: ${timings.authMs}ms | DB: ${timings.dbRetrievalMs}ms | Calc: ${timings.metricCalculationMs}ms | ` +
      `Intent: ${timings.intentDetectionMs}ms | Prompt: ${timings.promptBuildMs}ms | ` +
      `Gemini: ${timings.geminiMs}ms | Total: ${timings.totalMs}ms`
    );
  };

  // 0. Empty State Check: If user has 0 transactions, return deterministic onboarding guidance
  if (context.aggregates.transactionCount === 0) {
    const reply = generateGroundedFallbackResponse(userMessage, context, refDate);
    const timings = getTimings();
    logTimings('grounded-engine', timings);
    return {
      reply,
      grounded: true,
      engineUsed: 'grounded-engine',
      summary: {
        totalIncome: 0,
        totalExpenses: 0,
        netSavings: 0,
        savingsRate: 0,
        transactionCount: 0,
      },
      timings,
    };
  }

  // 1. Engine mode: Bypass Gemini completely
  if (mode === 'engine') {
    const reply = generateGroundedFallbackResponse(userMessage, context, refDate);
    const timings = getTimings();
    logTimings('grounded-engine', timings);
    return {
      reply,
      grounded: true,
      engineUsed: 'grounded-engine',
      summary: {
        totalIncome: context.aggregates.totalIncome,
        totalExpenses: context.aggregates.totalExpenses,
        netSavings: context.aggregates.netSavings,
        savingsRate: context.aggregates.savingsRate,
        transactionCount: context.aggregates.transactionCount,
      },
      timings,
    };
  }

  // 2. Check Gemini configuration
  const apiKey = process.env.GEMINI_API_KEY;
  const isGeminiConfigured =
    Boolean(customGeminiClient) ||
    (Boolean(apiKey) &&
      apiKey!.trim() !== '' &&
      !apiKey!.startsWith('MY_GEMINI') &&
      apiKey!.length > 20);

  // In 'gemini' mode, if Gemini is not configured, do not silently switch!
  if (mode === 'gemini' && !isGeminiConfigured) {
    throw new Error('Gemini service is unavailable: GEMINI_API_KEY is not configured on the server. Please configure your API key or select "FinSight Engine" or "Auto" mode.');
  }

  // 3. Attempt Gemini (for 'gemini' or 'auto' mode)
  if (isGeminiConfigured) {
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    try {
      const ai = customGeminiClient || new GoogleGenAI({ apiKey });
      const promptStart = performance.now();
      const systemInstruction = buildSystemPrompt(context, refDate, userMessage, intentResult, requestedPeriod);
      promptBuildMs = performance.now() - promptStart;

      // Convert history to Gemini contents format
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      // Append validated prior history items (capped to last 4 for prompt efficiency)
      const recentHistory = history.slice(-4);
      for (const item of recentHistory) {
        contents.push({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content }],
        });
      }

      // Append current user message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      let response: any = null;
      let lastCallErr: any = null;

      // Fast, bounded execution with timeout and backup retry
      const geminiStart = performance.now();
      const maxTokens = intentResult.intent === 'affordability' || intentResult.intent === 'remaining_balance' ? 350 : 250;

      for (let attempt = 1; attempt <= 2; attempt++) {
        // On attempt 2, if attempt 1 encountered 503, timeout, or spike on 3.5, fall back to faster 3.1
        const activeModel = attempt === 2 && modelName === 'gemini-3.5-flash-lite'
          ? 'gemini-3.1-flash-lite'
          : modelName;

        try {
          const generatePromise = ai.models.generateContent({
            model: activeModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.1,
              maxOutputTokens: maxTokens,
            },
          });

          // Enforce 15-second bounded timeout per attempt to avoid multi-minute stalls
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini request timed out after 15000ms on ${activeModel}`)), 15000)
          );

          response = await Promise.race([generatePromise, timeoutPromise]);
          break;
        } catch (callErr: any) {
          lastCallErr = callErr;
          const status = callErr?.status || callErr?.statusCode;
          const msg = String(callErr?.message || '');
          const isTransient = status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('timed out');
          if (attempt === 1 && isTransient) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw callErr;
        }
      }
      geminiMs = performance.now() - geminiStart;

      if (!response && lastCallErr) {
        throw lastCallErr;
      }

      const replyText =
        response && typeof response.text === 'string'
          ? response.text.trim()
          : response && typeof (response as any).text === 'function'
            ? (response as any).text().trim()
            : '';

      if (replyText) {
        const timings = getTimings();
        logTimings('gemini', timings);
        return {
          reply: replyText,
          grounded: true,
          engineUsed: 'gemini',
          summary: {
            totalIncome: context.aggregates.totalIncome,
            totalExpenses: context.aggregates.totalExpenses,
            netSavings: context.aggregates.netSavings,
            savingsRate: context.aggregates.savingsRate,
            transactionCount: context.aggregates.transactionCount,
          },
          timings,
        };
      }
    } catch (err: any) {
      const sanitizedReason = sanitizeErrorMessage(err);
      const diagnosticInfo = {
        name: err?.name || 'Error',
        status: err?.status || err?.statusCode || undefined,
        code: err?.code || err?.cause?.code || undefined,
        cause: err?.cause ? sanitizeErrorMessage(err.cause) : undefined,
        message: sanitizedReason,
        model: modelName,
        stage: 'gemini_generate_content',
      };
      console.warn(`[ChatbotService Gemini Diagnostic]:`, JSON.stringify(diagnosticInfo));

      // In 'gemini' mode, do not silently switch! Return clear error!
      if (mode === 'gemini') {
        throw new Error(`Gemini (${modelName}) failed to generate response: ${sanitizedReason}`);
      }
      // In 'auto' mode, fall through to deterministic engine
    }
  }

  // 4. Fallback to Grounded Deterministic Intelligence Engine (Auto mode fallback or missing key in auto)
  const reply = generateGroundedFallbackResponse(userMessage, context, refDate);
  const timings = getTimings();
  logTimings('grounded-engine', timings);
  return {
    reply,
    grounded: true,
    engineUsed: 'grounded-engine',
    summary: {
      totalIncome: context.aggregates.totalIncome,
      totalExpenses: context.aggregates.totalExpenses,
      netSavings: context.aggregates.netSavings,
      savingsRate: context.aggregates.savingsRate,
      transactionCount: context.aggregates.transactionCount,
    },
    timings,
  };
}
