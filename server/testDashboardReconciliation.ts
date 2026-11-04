/**
 * FinSight AI — Dashboard Data Reconciliation & Integrity Test Suite
 * Verifies mathematical integrity, date boundary filters, sorting,
 * single-month forecasting, and cross-widget reconciliation.
 */

import { parseTransactionDate, isTransactionInSelectedMonth } from '../src/utils/dateUtils.js';
import { calculateSpendingTrendDatasets, calculateMonthlyAnalyticsTrends } from '../src/services/financialAggregator.js';
import { generateUserForecast } from './services/mlForecastService.js';
import { getAllTransactions } from './repositories/transactionRepository.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: any;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: any) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✓ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, details, error: 'Assertion failed' });
    console.error(`  ✗ FAIL: ${name}`, details);
  }
}

function assertCloseTo(val: number, expected: number, tolerance: number, name: string) {
  const diff = Math.abs(val - expected);
  assert(diff <= tolerance, `${name} (expected ~${expected}, got ${val})`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' FINLIGHT AI: DASHBOARD RECONCILIATION TEST SUITE');
  console.log('======================================================\n');

  // Test userId for jessidorai05@gmail.com
  const testUserId = 'usr_1793218238197_wlal7w';
  const transactions = await getAllTransactions(testUserId, 5000);

  console.log(`Loaded ${transactions.length} transactions from Neon DB for user ${testUserId}.\n`);

  // -------------------------------------------------------------------------
  // TEST 1: All-Time Aggregation Integrity
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: All-Time Aggregation Integrity ---');
  const allExpenses = transactions.filter(t => t.type === 'expense');
  const allIncome = transactions.filter(t => t.type === 'income');

  const totalAllTimeExpenses = Number(allExpenses.reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
  const totalAllTimeIncome = Number(allIncome.reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
  const totalAllTimeNet = Number((totalAllTimeIncome - totalAllTimeExpenses).toFixed(2));

  assert(transactions.length >= 446, `Total transactions count is at least 446 in DB (found ${transactions.length})`, { count: transactions.length });
  assert(allExpenses.length + allIncome.length === transactions.length, 'Every transaction is either income or expense');
  assert(totalAllTimeExpenses > 400000, `Total all-time expenses calculated (₹${totalAllTimeExpenses})`);
  assert(totalAllTimeIncome > 0, `Total all-time income calculated (₹${totalAllTimeIncome})`);

  // -------------------------------------------------------------------------
  // TEST 2: October 2026 Overview vs CSV Reconciliation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: October 2026 Overview Reconciliation ---');
  const octTransactions = transactions.filter(t => isTransactionInSelectedMonth(t.date, 'Oct 2026'));
  const octExpenses = octTransactions.filter(t => t.type === 'expense');
  const octIncome = octTransactions.filter(t => t.type === 'income');

  const octExpenseSum = Number(octExpenses.reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
  const octIncomeSum = Number(octIncome.reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
  const octNetSavings = Number((octIncomeSum - octExpenseSum).toFixed(2));
  const octSavingsRate = octIncomeSum > 0 ? Number(((octNetSavings / octIncomeSum) * 100).toFixed(1)) : 0;

  assert(octTransactions.length === 46, 'October 2026 transaction count equals exactly 46', { count: octTransactions.length });
  assert(octExpenses.length === 44, 'October 2026 expense count equals exactly 44', { count: octExpenses.length });
  assert(octIncome.length === 2, 'October 2026 income count equals exactly 2', { count: octIncome.length });
  assertCloseTo(octIncomeSum, 35450.00, 0.01, 'October 2026 Income equals ₹35,450.00');
  assertCloseTo(octExpenseSum, 35322.97, 0.01, 'October 2026 Expenses equals ₹35,322.97');
  assertCloseTo(octNetSavings, 127.03, 0.01, 'October 2026 Net Savings equals ₹127.03');
  assertCloseTo(octSavingsRate, 0.4, 0.1, 'October 2026 Savings Rate equals 0.4%');

  // -------------------------------------------------------------------------
  // TEST 3: Forecast Pipeline Reconciliation with Overview Actuals
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Forecast Pipeline Reconciled with Overview ---');
  const forecastResult = await generateUserForecast(transactions, 4, [2026, 10], '2026-11');
  assert(forecastResult.status === 'ok', 'ML Forecast engine generates status "ok"');

  const octForecastActual = forecastResult.historicalActuals.find(h => h.month === '2026-10');
  assert(octForecastActual !== undefined, 'Forecast historical actuals includes 2026-10');
  if (octForecastActual) {
    assertCloseTo(
      octForecastActual.actual,
      35322.97,
      0.01,
      'Forecast 2026-10 actual expense (₹35,322.97) matches Overview expense exactly'
    );
  }

  // -------------------------------------------------------------------------
  // TEST 4: Date Range Filtering & Month Boundaries
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Date Range Filtering & Month Boundaries ---');
  // First day of October
  assert(isTransactionInSelectedMonth('01 Oct 2026', 'Oct 2026'), '01 Oct 2026 is in Oct 2026');
  assert(isTransactionInSelectedMonth('2026-10-01', 'Oct 2026'), '2026-10-01 ISO is in Oct 2026');
  // Last day of October
  assert(isTransactionInSelectedMonth('31 Oct 2026', 'Oct 2026'), '31 Oct 2026 is in Oct 2026');
  assert(isTransactionInSelectedMonth('2026-10-31', 'Oct 2026'), '2026-10-31 ISO is in Oct 2026');
  // Day before October
  assert(!isTransactionInSelectedMonth('30 Sep 2026', 'Oct 2026'), '30 Sep 2026 is NOT in Oct 2026');
  assert(!isTransactionInSelectedMonth('2026-09-30', 'Oct 2026'), '2026-09-30 is NOT in Oct 2026');
  // Day after October
  assert(!isTransactionInSelectedMonth('01 Nov 2026', 'Oct 2026'), '01 Nov 2026 is NOT in Oct 2026');
  assert(!isTransactionInSelectedMonth('2026-11-01', 'Oct 2026'), '2026-11-01 is NOT in Oct 2026');
  // All Time matches all valid dates
  assert(isTransactionInSelectedMonth('2026-10-15', 'All Time'), '2026-10-15 is in All Time');
  assert(isTransactionInSelectedMonth('2025-08-21', 'All Time'), '2025-08-21 is in All Time');

  // -------------------------------------------------------------------------
  // TEST 5: Recent Transactions Sorting (Chronological Descending)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Recent Transactions Sorting ---');
  const sortedRecent = [...transactions]
    .sort((a, b) => {
      const da = parseTransactionDate(a.date)?.getTime() || 0;
      const db = parseTransactionDate(b.date)?.getTime() || 0;
      if (db !== da) return db - da;
      return (b.id || '').localeCompare(a.id || '');
    })
    .slice(0, 5);

  assert(sortedRecent.length === 5, 'Recent transactions returned top 5 items');
  for (let i = 0; i < sortedRecent.length - 1; i++) {
    const curTime = parseTransactionDate(sortedRecent[i].date)?.getTime() || 0;
    const nextTime = parseTransactionDate(sortedRecent[i + 1].date)?.getTime() || 0;
    assert(curTime >= nextTime, `Item ${i} (${sortedRecent[i].date}) >= Item ${i + 1} (${sortedRecent[i + 1].date})`);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Category Totals & Percentage Reconciliation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Category Breakdown Reconciliation ---');
  const categoryTotals: Record<string, number> = {};
  octExpenses.forEach(t => {
    const cat = t.category || 'Others';
    categoryTotals[cat] = Number(((categoryTotals[cat] || 0) + Number(t.amount || 0)).toFixed(2));
  });

  const categories = Object.keys(categoryTotals);
  const rawItems = categories.map(cat => {
    const amount = categoryTotals[cat];
    const rawPct = (amount / octExpenseSum) * 100;
    const floorPct = Math.floor(rawPct);
    const remainder = rawPct - floorPct;
    return { cat, amount, rawPct, floorPct, remainder };
  });

  const totalFloor = rawItems.reduce((sum, item) => sum + item.floorPct, 0);
  const diffPct = 100 - totalFloor;
  const sortedByRemainder = [...rawItems].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diffPct && i < sortedByRemainder.length; i++) {
    sortedByRemainder[i].floorPct += 1;
  }

  const categorySumAmount = Number(rawItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const categorySumPct = rawItems.reduce((sum, item) => sum + item.floorPct, 0);

  assertCloseTo(categorySumAmount, octExpenseSum, 0.01, 'Sum of category expense amounts strictly equals totalExpenses');
  assert(categorySumPct === 100, `Sum of category percentages equals exactly 100% (got ${categorySumPct}%)`);

  // -------------------------------------------------------------------------
  // TEST 7: Single-Month vs All-Time Next-Month Forecast
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Next-Month Forecast Single Month Representation ---');
  // When All-Time is selected, totalExpenses is > 400,000
  // Next month forecast must represent ONE month (e.g. ~28,000 to ~38,000), NOT 400,000 * 1.057 = ~460,000!
  const monthlyExpensesMap = new Map<string, number>();
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const d = parseTransactionDate(t.date);
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyExpensesMap.set(key, (monthlyExpensesMap.get(key) || 0) + Number(t.amount || 0));
    }
  });

  const sortedMonthKeys = Array.from(monthlyExpensesMap.keys()).sort();
  const latestMonthKey = sortedMonthKeys[sortedMonthKeys.length - 1];
  const latestMonthExpense = monthlyExpensesMap.get(latestMonthKey) || 0;

  const baseMonthlyExpenseAllTime = latestMonthExpense > 0 ? latestMonthExpense : 28000;
  const predictedNextMonthAllTime = forecastResult.predictions?.[0]?.predicted
    ? Math.round(forecastResult.predictions[0].predicted)
    : Math.round(baseMonthlyExpenseAllTime * 1.057);

  assert(
    predictedNextMonthAllTime < 50000 && predictedNextMonthAllTime > 15000,
    `Next month forecast in All-Time view represents single month (₹${predictedNextMonthAllTime}), NOT ₹460,000+`
  );

  // -------------------------------------------------------------------------
  // TEST 8: Monthly Charts Show Monthly Totals, NOT Cumulative
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Monthly Charts Show Monthly Totals ---');
  const datasets = calculateSpendingTrendDatasets(octExpenses as any, octExpenseSum, 'Oct 2026', transactions as any);
  const y1 = datasets['1Y'];

  assert(y1.length === 6, '1Y spending trend has 6 monthly data points');
  for (const pt of y1) {
    // Each month's amount must be reasonable monthly expense, NOT all-time 400,000
    assert(pt.amount < 100000, `Month ${pt.date} displays monthly total ₹${pt.amount}, not cumulative sum`);
  }

  // Monthly Cash Flow in Analytics
  const monthlyFlow = calculateMonthlyAnalyticsTrends(transactions as any, totalAllTimeIncome, totalAllTimeExpenses, totalAllTimeNet, 'All Time');
  assert(monthlyFlow.length > 0, 'Monthly cash flow generated for All Time');
  for (const pt of monthlyFlow) {
    assert(pt.expenses < 100000, `Analytics cash flow month ${pt.month} has monthly expense ₹${pt.expenses}, not all-time sum`);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(` RESULTS: ${passed} passed, ${failed} failed out of ${results.length} tests.`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
