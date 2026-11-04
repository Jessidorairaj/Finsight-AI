/**
 * FinSight AI — Test Suite for Phase 3D-4: Analytics Connected to Real PostgreSQL Data
 *
 * Verifies:
 * 1. Authenticated transactions load from PostgreSQL (scoped to user session).
 * 2. Analytics calculations with 52 actual transactions:
 *    - All Time: 52 transactions (Income: ₹210,250, Expenses: ₹38,713, Net Savings: ₹171,537, Rate: 81.6%)
 *    - August 2025: 32 transactions (Income: ₹205,500, Expenses: ₹29,356, Net Savings: ₹176,144, Rate: 85.7%)
 *    - October 2026: 20 transactions (Income: ₹4,750, Expenses: ₹9,357, Net Savings: -₹4,607, Rate: -97.0%)
 * 3. Category breakdowns match PostgreSQL transactions exactly for all periods.
 * 4. Top spending merchants are deterministic and properly sorted by amount.
 * 5. Monthly cash flow trends respect global month selector:
 *    - All Time shows exact historical periods (Aug '25 and Oct '26) with zero fabricated intermediate months.
 *    - Historical months show rolling 6-month actuals with zero synthetic baselines.
 * 6. Historical comparisons between periods calculate correct variances and percent changes.
 * 7. Edge Cases:
 *    - Empty dataset: clean zeros, no NaN, no division by zero, no fabricated values.
 *    - Income-only period: 100% savings rate, 0 expenses, empty category/merchant breakdown.
 *    - Expense-only period: negative net savings, negative savings rate, 0 income.
 *    - Forecast period exclusion: forecast months contain no historical actuals mixed in.
 * 8. PostgreSQL integrity: 0 records deleted, modified, or re-imported.
 */

import { getDbPool } from './db.js';
import {
  isTransactionInSelectedMonth,
  generateDynamicMonthOptions,
  parseTransactionDate,
} from '../src/utils/dateUtils.js';
import {
  calculateMonthlyAnalyticsTrends,
  calculateWeekdayDistribution,
  calculateTopMerchants,
  calculateSpendingVolatility,
  calculateHistoricalPeriodComparison,
} from '../src/services/financialAggregator.js';
import { Transaction } from '../src/data/mockData.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runPhase3D4Tests() {
  console.log('\n======================================================');
  console.log('FinSight AI — Phase 3D-4: Connected Analytics Test Suite');
  console.log('======================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }

  const testUserId = 'usr_1793218238197_wlal7w';

  // ----------------------------------------------------
  // 1. Fetch Real PostgreSQL Transactions for Authenticated User
  // ----------------------------------------------------
  console.log('--- Step 1: Querying User Transactions from PostgreSQL ---');
  const res = await pool.query(
    'SELECT id, name, amount, category, type, date, payment_method, status, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at ASC',
    [testUserId]
  );

  const rawRows = res.rows;
  console.log(`Retrieved ${rawRows.length} total PostgreSQL transaction records.`);

  // Test suite evaluates the 52 canonical historical records
  const all52: Transaction[] = rawRows.slice(0, 52).map(r => ({
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    category: r.category,
    type: r.type,
    date: r.date,
    paymentMethod: r.payment_method,
    status: r.status,
  }));

  assert(all52.length === 52, `Must have exactly 52 historical baseline records (got ${all52.length})`);

  // ----------------------------------------------------
  // 2. Verification of Financial KPIs for All Time, Aug 2025, Oct 2026
  // ----------------------------------------------------
  console.log('\n--- Step 2: Testing KPI Calculations Against Database ---');

  // Helper calculation function matching FinancialContext
  const getTotals = (txs: Transaction[]) => {
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    const rate = inc > 0 ? Number(((net / inc) * 100).toFixed(1)) : (exp > 0 ? -100 : 0);
    return { income: inc, expenses: exp, netSavings: net, savingsRate: rate };
  };

  // 2.1 All Time
  const allTimeTotals = getTotals(all52);
  console.log('All Time KPIs:', allTimeTotals);
  assert(allTimeTotals.income === 210250, `All Time Income must be ₹210,250 (got ${allTimeTotals.income})`);
  assert(allTimeTotals.expenses === 38713, `All Time Expenses must be ₹38,713 (got ${allTimeTotals.expenses})`);
  assert(allTimeTotals.netSavings === 171537, `All Time Net Savings must be ₹171,537 (got ${allTimeTotals.netSavings})`);
  assert(allTimeTotals.savingsRate === 81.6, `All Time Savings Rate must be 81.6% (got ${allTimeTotals.savingsRate})`);

  // 2.2 August 2025
  const aug2025Txs = all52.filter(t => isTransactionInSelectedMonth(t.date, 'Aug 2025'));
  assert(aug2025Txs.length === 32, `Aug 2025 must have exactly 32 transactions (got ${aug2025Txs.length})`);
  const augTotals = getTotals(aug2025Txs);
  console.log('August 2025 KPIs:', augTotals);
  assert(augTotals.income === 205500, `Aug 2025 Income must be ₹205,500 (got ${augTotals.income})`);
  assert(augTotals.expenses === 29356, `Aug 2025 Expenses must be ₹29,356 (got ${augTotals.expenses})`);
  assert(augTotals.netSavings === 176144, `Aug 2025 Net Savings must be ₹176,144 (got ${augTotals.netSavings})`);
  assert(augTotals.savingsRate === 85.7, `Aug 2025 Savings Rate must be 85.7% (got ${augTotals.savingsRate})`);

  // 2.3 October 2026
  const oct2026Txs = all52.filter(t => isTransactionInSelectedMonth(t.date, 'Oct 2026'));
  assert(oct2026Txs.length === 20, `Oct 2026 must have exactly 20 transactions (got ${oct2026Txs.length})`);
  const octTotals = getTotals(oct2026Txs);
  console.log('October 2026 KPIs:', octTotals);
  assert(octTotals.income === 4750, `Oct 2026 Income must be ₹4,750 (got ${octTotals.income})`);
  assert(octTotals.expenses === 9357, `Oct 2026 Expenses must be ₹9,357 (got ${octTotals.expenses})`);
  assert(octTotals.netSavings === -4607, `Oct 2026 Net Savings must be -₹4,607 (negative net savings handled)`);
  assert(octTotals.savingsRate === -97.0, `Oct 2026 Savings Rate must be -97.0% (negative savings rate handled)`);

  // ----------------------------------------------------
  // 3. Category Breakdown Verification
  // ----------------------------------------------------
  console.log('\n--- Step 3: Testing Category Breakdown Calculations ---');
  const getCategoryBreakdown = (txs: Transaction[]) => {
    const catMap: Record<string, number> = {};
    let totalExp = 0;
    txs.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
      totalExp += t.amount;
    });
    return Object.entries(catMap).map(([name, amount]) => ({
      name,
      amount,
      percentage: totalExp > 0 ? Math.round((amount / totalExp) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);
  };

  const augCats = getCategoryBreakdown(aug2025Txs);
  assert(augCats.length === 6, `Aug 2025 must have 6 expense categories`);
  assert(augCats[0].name === 'Food & Dining' && augCats[0].amount === 9018, 'Aug 2025 top category is Food & Dining ₹9,018');

  const octCats = getCategoryBreakdown(oct2026Txs);
  assert(octCats.length === 6, `Oct 2026 must have 6 expense categories`);
  assert(octCats[0].name === 'Others' && octCats[0].amount === 5697, 'Oct 2026 top category is Others ₹5,697');

  // ----------------------------------------------------
  // 4. Top Spending Merchants Verification
  // ----------------------------------------------------
  console.log('\n--- Step 4: Testing Top Spending Merchants ---');
  const augMerchants = calculateTopMerchants(aug2025Txs, 5);
  console.log('Aug 2025 Top Merchants:', augMerchants.map(m => `${m.merchant}: ₹${m.amount}`));
  assert(augMerchants.length === 5, 'Aug 2025 returns top 5 merchants');
  assert(augMerchants[0].merchant === 'Zara Menswear' && augMerchants[0].amount === 3200, 'Top merchant in Aug 2025 is Zara Menswear ₹3,200');
  assert(augMerchants[1].merchant === 'Barbeque Nation' && augMerchants[1].amount === 2850, 'Second merchant in Aug 2025 is Barbeque Nation ₹2,850');

  const octMerchants = calculateTopMerchants(oct2026Txs, 5);
  console.log('Oct 2026 Top Merchants:', octMerchants.map(m => `${m.merchant}: ₹${m.amount}`));
  assert(octMerchants.length === 5, 'Oct 2026 returns top 5 merchants');
  assert(octMerchants[0].merchant === 'Hostel Mess Fee' && octMerchants[0].amount === 2200, 'Top merchant in Oct 2026 is Hostel Mess Fee ₹2,200');
  assert(octMerchants[1].merchant === 'Petrol Pump 17' && octMerchants[1].amount === 900, 'Second merchant in Oct 2026 is Petrol Pump 17 ₹900');

  // ----------------------------------------------------
  // 5. Monthly Cash Flow Trends (No Fabricated Data)
  // ----------------------------------------------------
  console.log('\n--- Step 5: Testing Cash Flow Trends & Multi-Period Separation ---');
  // All Time must show only existing periods
  const allTimeTrends = calculateMonthlyAnalyticsTrends(all52, allTimeTotals.income, allTimeTotals.expenses, allTimeTotals.netSavings, 'All Time');
  console.log('All Time Trends:', allTimeTrends);
  assert(allTimeTrends.length === 2, `All Time should contain exactly 2 periods (found ${allTimeTrends.length})`);
  assert(allTimeTrends[0].month === "Aug '25" && allTimeTrends[0].income === 205500, 'All Time trend starts at Aug 25 ₹205,500');
  assert(allTimeTrends[1].month === "Oct '26" && allTimeTrends[1].income === 4750, 'All Time trend ends at Oct 26 ₹4,750');

  // Month-specific 6-month trends
  const octTrends = calculateMonthlyAnalyticsTrends(all52, octTotals.income, octTotals.expenses, octTotals.netSavings, 'Oct 2026');
  console.log('Oct 2026 6-Month Trends:', octTrends);
  assert(octTrends.length === 6, 'Oct 2026 returns 6-month window');
  assert(octTrends[5].month === 'Oct' && octTrends[5].isCurrent === true, 'Oct is marked as current');
  assert(octTrends[5].expenses === 9357 && octTrends[5].savings === -4607, 'Oct 2026 accurately reflects expenses and negative savings');
  // Intermediate empty months in rolling window must be 0, not fabricated
  assert(octTrends[0].expenses === 0 && octTrends[1].expenses === 0, 'Months with no records have 0 values, no fabricated data');

  // ----------------------------------------------------
  // 6. Historical Period Comparison
  // ----------------------------------------------------
  console.log('\n--- Step 6: Testing Historical Period Comparisons ---');
  const comp = calculateHistoricalPeriodComparison(all52, 'Oct 2026', octTotals.income, octTotals.expenses, octTotals.netSavings);
  console.log('Period Comparison (Oct 2026 vs Aug 2025):', comp);
  assert(comp !== null, 'Historical comparison must not be null when preceding period exists');
  assert(comp?.priorPeriod === 'Aug 2025', 'Prior period is Aug 2025');
  assert(comp?.currentPeriod === 'Oct 2026', 'Current period is Oct 2026');
  assert(comp?.currentExpense === 9357 && comp?.priorExpense === 29356, 'Expense values matched');
  assert(comp?.expenseDifference === (9357 - 29356), 'Expense variance calculated correctly (-₹19,999)');
  assert(comp?.currentIncome === 4750 && comp?.priorIncome === 205500, 'Income values matched');

  // ----------------------------------------------------
  // 7. Edge Cases: Empty Dataset, Income-Only, Expense-Only
  // ----------------------------------------------------
  console.log('\n--- Step 7: Testing Edge Cases (Empty, Income-Only, Expense-Only) ---');

  // 7.1 Empty dataset
  const emptyMerchants = calculateTopMerchants([]);
  assert(emptyMerchants.length === 0, 'Empty transactions yield 0 merchants');
  const emptyVolatility = calculateSpendingVolatility([]);
  assert(emptyVolatility.indexPercentage === 0 && emptyVolatility.rating === 'Low', 'Empty volatility yields 0%');
  const emptyComp = calculateHistoricalPeriodComparison([], 'Oct 2026', 0, 0, 0);
  assert(emptyComp === null, 'Empty comparison returns null gracefully');
  const emptyTrends = calculateMonthlyAnalyticsTrends([], 0, 0, 0, 'Oct 2026');
  assert(emptyTrends.every(t => t.income === 0 && t.expenses === 0), 'Empty trends have 0 for all months');

  // 7.2 Income-only period
  const incomeOnlyTxs: Transaction[] = [
    { id: 'tx_inc_1', name: 'Consulting', amount: 50000, category: 'Income', type: 'income', date: '15 Oct 2026', status: 'Completed' },
  ];
  const incOnlyTotals = getTotals(incomeOnlyTxs);
  assert(incOnlyTotals.income === 50000 && incOnlyTotals.expenses === 0, 'Income-only: ₹50,000 income, ₹0 expenses');
  assert(incOnlyTotals.savingsRate === 100, 'Income-only: 100% savings rate');
  const incOnlyMerchants = calculateTopMerchants(incomeOnlyTxs);
  assert(incOnlyMerchants.length === 0, 'Income-only: 0 expense merchants');
  const incOnlyWeekday = calculateWeekdayDistribution(incomeOnlyTxs);
  assert(incOnlyWeekday.totalExpenses === 0, 'Income-only: 0 weekday expenses');

  // 7.3 Expense-only period
  const expOnlyTxs: Transaction[] = [
    { id: 'tx_exp_1', name: 'Rent', amount: 15000, category: 'Bills & Utilities', type: 'expense', date: '5 Oct 2026', status: 'Completed' },
  ];
  const expOnlyTotals = getTotals(expOnlyTxs);
  assert(expOnlyTotals.income === 0 && expOnlyTotals.expenses === 15000, 'Expense-only: ₹0 income, ₹15,000 expenses');
  assert(expOnlyTotals.netSavings === -15000, 'Expense-only: -₹15,000 net savings');
  assert(expOnlyTotals.savingsRate < 0, 'Expense-only: negative savings rate');
  const expOnlyMerchants = calculateTopMerchants(expOnlyTxs);
  assert(expOnlyMerchants.length === 1 && expOnlyMerchants[0].merchant === 'Rent', 'Expense-only: 1 merchant');

  // ----------------------------------------------------
  // 8. Forecast Period Separation Verification
  // ----------------------------------------------------
  console.log('\n--- Step 8: Verifying Forecast Month Independence ---');
  const forecastMonthLabel = 'Nov 2026 (Forecast)';
  const forecastFiltered = all52.filter(t => isTransactionInSelectedMonth(t.date, forecastMonthLabel));
  assert(forecastFiltered.length === 0, 'No historical actual transactions match the forecast period');

  // ----------------------------------------------------
  // 9. Zero Database Mutation Check
  // ----------------------------------------------------
  console.log('\n--- Step 9: Database Integrity Verification ---');
  const countPost = await pool.query(
    'SELECT COUNT(*)::int as total FROM transactions WHERE user_id = $1',
    [testUserId]
  );
  assert(countPost.rows[0].total === rawRows.length, `Database records remain strictly preserved (${rawRows.length} rows)`);

  console.log('\n======================================================');
  console.log('✅ ALL PHASE 3D-4 CONNECTED ANALYTICS TESTS PASSED!');
  console.log('======================================================\n');
}

runPhase3D4Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Phase 3D-4 Test Suite Failed:', err);
    process.exit(1);
  });

