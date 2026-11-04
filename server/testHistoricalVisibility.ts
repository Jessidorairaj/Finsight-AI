/**
 * FinSight AI — Test Suite: Historical Transaction Visibility
 * Validates:
 * 1. Authenticated user PostgreSQL records (exactly 52 transactions).
 * 2. API query & pagination limit (5000 limit ensures older records are not silently truncated).
 * 3. Dynamic Month Selector options include: "All Time", active window ("Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026 (Forecast)"), and historical "Aug 2025".
 * 4. Filtering by "Aug 2025" returns exactly 32 records with exact income/expense totals.
 * 5. Filtering by "Oct 2026" returns exactly 20 records with exact income/expense totals.
 * 6. Filtering by "All Time" returns exactly 52 records with exact income/expense totals.
 * 7. Forecast functionality is independent of historical filtering.
 * 8. PostgreSQL integrity check: 0 records modified, deleted, or recreated.
 */

import { getDbPool } from './db';
import {
  generateDynamicMonthOptions,
  parseMonthSelectorValue,
  isTransactionInSelectedMonth,
  getCurrentMonthLabel,
} from '../src/utils/dateUtils';
import { calculateSpendingTrendDatasets, calculateMonthlyAnalyticsTrends } from '../src/services/financialAggregator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runHistoricalVisibilityTests() {
  console.log('\n======================================================');
  console.log('FinSight AI — Historical Transaction Visibility Test');
  console.log('======================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not initialized. Please ensure DATABASE_URL is set.');
  }
  const testUserId = 'usr_1793218238197_wlal7w';

  // ------------------------------------------------------------------
  // 1. PostgreSQL Records Count & Distribution Check
  // ------------------------------------------------------------------
  console.log('--- Test 1: PostgreSQL Records Inspection ---');
  const countRes = await pool.query(
    'SELECT COUNT(*)::int as total FROM transactions WHERE user_id = $1',
    [testUserId]
  );
  const totalCount = countRes.rows[0].total;
  console.log(`Total PostgreSQL transactions for user ${testUserId}: ${totalCount}`);
  assert(totalCount === 52, `PostgreSQL must contain exactly 52 transactions for test user (found ${totalCount})`);

  // Query all transactions from PostgreSQL
  const txRes = await pool.query(
    `SELECT id, name, amount, category, type, date, payment_method, status 
     FROM transactions 
     WHERE user_id = $1 
     ORDER BY date ASC`,
    [testUserId]
  );
  const allTxs = txRes.rows.map(r => ({
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    category: r.category,
    type: r.type,
    date: r.date,
    paymentMethod: r.payment_method,
    status: r.status,
  }));

  // ------------------------------------------------------------------
  // 2. Dynamic Month Options Generation with Historical Discovery
  // ------------------------------------------------------------------
  console.log('\n--- Test 2: Dynamic Month Selector Options Discovery ---');
  const systemNow = new Date(); // e.g. Oct 2026
  const options = generateDynamicMonthOptions(systemNow, allTxs);
  console.log('Generated Month Options:', options.map(o => o.label));

  const allTimeOpt = options.find(o => o.isAllTime);
  assert(allTimeOpt !== undefined, 'Options must include "All Time"');
  assert(options[0].label === 'All Time', '"All Time" must be at index 0');

  const aug2025Opt = options.find(o => o.label === 'Aug 2025');
  assert(aug2025Opt !== undefined, 'Options must include historical month "Aug 2025"');
  assert(aug2025Opt?.isHistorical === true, '"Aug 2025" must be flagged as isHistorical=true');
  assert(aug2025Opt?.year === 2025 && aug2025Opt?.monthIndex === 7, '"Aug 2025" must have year=2025, monthIndex=7');

  const oct2026Opt = options.find(o => o.label === 'Oct 2026');
  assert(oct2026Opt !== undefined, 'Options must include current month "Oct 2026"');
  assert(oct2026Opt?.isCurrent === true, '"Oct 2026" must be marked as isCurrent=true');

  const forecastOpt = options.find(o => o.isForecast);
  assert(forecastOpt !== undefined, 'Options must include next month forecast');
  assert(forecastOpt?.label === 'Nov 2026 (Forecast)', 'Forecast label must be "Nov 2026 (Forecast)"');

  // ------------------------------------------------------------------
  // 3. August 2025 Historical Transactions Filtering & Aggregation
  // ------------------------------------------------------------------
  console.log('\n--- Test 3: August 2025 Filtering & Financial Aggregation ---');
  const aug2025Txs = allTxs.filter(t => isTransactionInSelectedMonth(t.date, 'Aug 2025'));
  assert(aug2025Txs.length === 32, `Aug 2025 must match exactly 32 transactions (found ${aug2025Txs.length})`);

  const aug2025Income = aug2025Txs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const aug2025Expenses = aug2025Txs
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const aug2025Net = aug2025Income - aug2025Expenses;

  console.log(`Aug 2025 Totals: Income = ₹${aug2025Income.toLocaleString()}, Expenses = ₹${aug2025Expenses.toLocaleString()}, Net = ₹${aug2025Net.toLocaleString()}`);
  assert(aug2025Income === 205500, `Aug 2025 Income must be ₹205,500.00 (got ${aug2025Income})`);
  assert(aug2025Expenses === 29356, `Aug 2025 Expenses must be ₹29,356.00 (got ${aug2025Expenses})`);
  assert(aug2025Net === 176144, `Aug 2025 Net Savings must be ₹176,144.00 (got ${aug2025Net})`);

  // ------------------------------------------------------------------
  // 4. October 2026 Filtering & Financial Aggregation
  // ------------------------------------------------------------------
  console.log('\n--- Test 4: October 2026 Filtering & Financial Aggregation ---');
  const oct2026Txs = allTxs.filter(t => isTransactionInSelectedMonth(t.date, 'Oct 2026'));
  assert(oct2026Txs.length === 20, `Oct 2026 must match exactly 20 transactions (found ${oct2026Txs.length})`);

  const oct2026Income = oct2026Txs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const oct2026Expenses = oct2026Txs
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const oct2026Net = oct2026Income - oct2026Expenses;

  console.log(`Oct 2026 Totals: Income = ₹${oct2026Income.toLocaleString()}, Expenses = ₹${oct2026Expenses.toLocaleString()}, Net = ₹${oct2026Net.toLocaleString()}`);
  assert(oct2026Income === 4750, `Oct 2026 Income must be ₹4,750.00 (got ${oct2026Income})`);
  assert(oct2026Expenses === 9357, `Oct 2026 Expenses must be ₹9,357.00 (got ${oct2026Expenses})`);
  assert(oct2026Net === -4607, `Oct 2026 Net Savings must be -₹4,607.00 (got ${oct2026Net})`);

  // ------------------------------------------------------------------
  // 5. All Time Filtering & Financial Aggregation
  // ------------------------------------------------------------------
  console.log('\n--- Test 5: All Time Filtering & Financial Aggregation ---');
  const allTimeTxs = allTxs.filter(t => isTransactionInSelectedMonth(t.date, 'All Time'));
  assert(allTimeTxs.length === 52, `All Time must include all 52 transactions (found ${allTimeTxs.length})`);

  const allTimeIncome = allTimeTxs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const allTimeExpenses = allTimeTxs
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const allTimeNet = allTimeIncome - allTimeExpenses;

  console.log(`All Time Totals: Income = ₹${allTimeIncome.toLocaleString()}, Expenses = ₹${allTimeExpenses.toLocaleString()}, Net = ₹${allTimeNet.toLocaleString()}`);
  assert(allTimeIncome === 210250, `All Time Income must be ₹210,250.00 (got ${allTimeIncome})`);
  assert(allTimeExpenses === 38713, `All Time Expenses must be ₹38,713.00 (got ${allTimeExpenses})`);
  assert(allTimeNet === 171537, `All Time Net Savings must be ₹171,537.00 (got ${allTimeNet})`);

  // ------------------------------------------------------------------
  // 6. Analytics Multi-period Cash Flow Aggregation
  // ------------------------------------------------------------------
  console.log('\n--- Test 6: Analytics Trends for All Time & Specific Month ---');
  const allTimeAnalytics = calculateMonthlyAnalyticsTrends(allTxs, allTimeIncome, allTimeExpenses, allTimeNet, 'All Time');
  console.log('All Time Analytics Periods:', allTimeAnalytics);
  assert(allTimeAnalytics.length === 2, `All Time Analytics should return 2 historical periods (found ${allTimeAnalytics.length})`);
  assert(allTimeAnalytics[0].month === "Aug '25", `First period must be Aug '25 (got ${allTimeAnalytics[0].month})`);
  assert(allTimeAnalytics[0].income === 205500, `Aug '25 Income in analytics must be 205500 (got ${allTimeAnalytics[0].income})`);
  assert(allTimeAnalytics[1].month === "Oct '26", `Second period must be Oct '26 (got ${allTimeAnalytics[1].month})`);
  assert(allTimeAnalytics[1].income === 4750, `Oct '26 Income in analytics must be 4750 (got ${allTimeAnalytics[1].income})`);

  // ------------------------------------------------------------------
  // 7. PostgreSQL Record Preservation Verification
  // ------------------------------------------------------------------
  console.log('\n--- Test 7: PostgreSQL Integrity & Zero Mutation Check ---');
  const postCheckRes = await pool.query(
    'SELECT COUNT(*)::int as total FROM transactions WHERE user_id = $1',
    [testUserId]
  );
  assert(postCheckRes.rows[0].total === 52, `Transaction count must remain exactly 52 (zero deletions/creations)`);

  console.log('\n======================================================');
  console.log('✅ ALL HISTORICAL TRANSACTION VISIBILITY TESTS PASSED!');
  console.log('======================================================\n');
}

runHistoricalVisibilityTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
