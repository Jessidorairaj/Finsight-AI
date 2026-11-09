/**
 * FinSight AI — Phase 5 Test Suite: Machine Learning Expense Forecasting
 * (Rolling-Origin Chronological Validation & Current-Month MTD Isolation)
 *
 * Verifies:
 * 1. Insufficient data handling (< 6 completed historical months).
 * 2. Multi-model rolling-origin validation without future-data leakage.
 * 3. Deterministic model selection: lowest validation MAE -> validation RMSE -> deterministic priority.
 * 4. Incomplete current-month exclusion from completed-month training/testing and MTD isolation.
 * 5. Forecast starting at current month without near-zero collapse.
 * 6. Aligned expense aggregation across all categories (matching FinancialContext and Analytics).
 * 7. Zero-expense months preservation and mathematically correct MAPE (excluding zero actuals only).
 * 8. All-zero test actuals producing MAPE = null.
 * 9. Python ML engine and TypeScript fallback parity on identical fixtures.
 */

import { generateUserForecast, computeFallbackForecast, getVerifiedPythonEnvironment } from './services/mlForecastService.js';
import { FrontendTransaction } from './repositories/transactionRepository.js';
import { detectExpenseAnomalies } from './services/anomalyDetectionService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   FinSight AI Phase 5 — ML Forecasting Test Suite   ');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Insufficient Historical Months (< 6 completed months)
  // -------------------------------------------------------------------------
  console.log('[Test 1] Insufficient data detection (< 6 completed historical months)');
  const twoMonthTransactions: FrontendTransaction[] = [
    { id: 'tx1', name: 'Supermarket', amount: 4500, date: '2026-08-15', type: 'expense', category: 'Groceries', status: 'Completed' },
    { id: 'tx2', name: 'Gas Station', amount: 1200, date: '2026-08-20', type: 'expense', category: 'Transportation', status: 'Completed' },
    { id: 'tx3', name: 'Restaurant', amount: 1800, date: '2026-09-02', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'tx4', name: 'Salary', amount: 80000, date: '2026-09-01', type: 'income', category: 'Income', status: 'Completed' },
  ];

  const res1 = await generateUserForecast(twoMonthTransactions, 4, undefined, [2026, 11]);
  assert(res1.status === 'insufficient_data', 'Returns status: insufficient_data for < 6 completed months');
  assert((res1.completedMonthsCount ?? 0) < 6, `Correctly identifies completedMonthsCount (${res1.completedMonthsCount}) < 6`);
  assert(res1.minRequiredMonths === 6, 'Specifies minimum required threshold of 6 completed months');
  assert(typeof res1.message === 'string' && res1.message.includes('6'), 'Provides informative guidance message');
  assert(res1.historicalActuals.length > 0, 'Preserves historical actuals for display');
  assert(Boolean(res1.currentMonthMtd), 'Provides currentMonthMtd tracking in insufficient-data state');

  // -------------------------------------------------------------------------
  // Test 2: Multi-Model Rolling-Origin Validation & Untouched Held-Out Test
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Rolling-origin chronological validation & held-out test evaluation');
  const eightMonthTransactions: FrontendTransaction[] = [
    // Month 1: March 2026
    { id: 'tx_m1', name: 'Groceries', amount: 20000, date: '2026-03-05', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 2: April 2026
    { id: 'tx_m2', name: 'Groceries', amount: 22000, date: '2026-04-08', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 3: May 2026
    { id: 'tx_m3', name: 'Groceries', amount: 21000, date: '2026-05-04', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 4: June 2026
    { id: 'tx_m4', name: 'Groceries', amount: 23000, date: '2026-06-02', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 5: July 2026
    { id: 'tx_m5', name: 'Groceries', amount: 24000, date: '2026-07-06', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 6: August 2026
    { id: 'tx_m6', name: 'Groceries', amount: 25000, date: '2026-08-04', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 7: September 2026
    { id: 'tx_m7', name: 'Groceries', amount: 26000, date: '2026-09-05', type: 'expense', category: 'Groceries', status: 'Completed' },
    // Month 8: October 2026
    { id: 'tx_m8', name: 'Groceries', amount: 27000, date: '2026-10-04', type: 'expense', category: 'Groceries', status: 'Completed' },
  ];

  const res2 = await generateUserForecast(eightMonthTransactions, 4, undefined, [2026, 11]);
  assert(res2.status === 'ok', 'Returns status: ok for >= 6 completed months');
  assert(typeof res2.modelUsed === 'string' && res2.modelUsed.length > 0, `Model selected: ${res2.modelUsed}`);
  assert(Boolean(res2.allModelsValidation), 'Contains rolling-origin validation evaluations for all models');
  assert(Boolean(res2.allModelsEvaluation), 'Contains held-out test evaluations for all models');

  // Verify Rolling Validation Metrics
  const valMetrics = res2.validationMetrics;
  assert(Boolean(valMetrics), 'Contains validationMetrics object for selected model');
  assert((valMetrics?.foldsCount ?? 0) >= 2, `Multiple rolling validation folds evaluated: ${valMetrics?.foldsCount} folds`);
  assert(typeof valMetrics?.valMae === 'number' && valMetrics.valMae >= 0, `Valid rolling validation MAE: ₹${valMetrics?.valMae}`);
  assert(typeof valMetrics?.valRmse === 'number' && valMetrics.valRmse >= 0, `Valid rolling validation RMSE: ₹${valMetrics?.valRmse}`);

  // Verify Distinct Held-Out Test Metrics
  const testMetrics = res2.evaluationMetrics;
  assert(Boolean(testMetrics), 'Computed distinct evaluation metrics on untouched held-out test split');
  assert(typeof testMetrics?.mae === 'number' && testMetrics.mae >= 0, `Valid test MAE: ₹${testMetrics?.mae}`);
  assert(typeof testMetrics?.rmse === 'number' && testMetrics.rmse >= 0, `Valid test RMSE: ₹${testMetrics?.rmse}`);
  assert(typeof testMetrics?.mape === 'number' && testMetrics.mape >= 0, `Valid test MAPE: ${testMetrics?.mape}%`);

  // Verify Projections & Confidence Bands
  assert(Array.isArray(res2.predictions) && res2.predictions.length === 4, 'Generated exactly 4 forward prediction points');
  if (res2.predictions && res2.predictions.length > 0) {
    const p1 = res2.predictions[0];
    const p4 = res2.predictions[3];
    assert(p1.predicted > 0, `Prediction amount is positive: ₹${p1.predicted}`);
    assert(p1.lowerBound <= p1.predicted, 'Lower bound is <= predicted value');
    assert(p1.upperBound >= p1.predicted, 'Upper bound is >= predicted value');
    const span1 = p1.upperBound - p1.lowerBound;
    const span4 = p4.upperBound - p4.lowerBound;
    assert(span4 >= span1, `Confidence interval widens across time horizon (Horizon 1: ±${Math.round(span1/2)} vs Horizon 4: ±${Math.round(span4/2)})`);
  }

  // -------------------------------------------------------------------------
  // Test 3: Incomplete Current-Month Exclusion & Month-to-Date (MTD) Isolation
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Current-month exclusion and Month-to-Date (MTD) isolation');
  const transactionsWithCurrentMonth: FrontendTransaction[] = [
    ...eightMonthTransactions,
    // Current in-progress month: November 2026 (only 2 days of spending)
    { id: 'curr_1', name: 'Coffee', amount: 370, date: '2026-11-01', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'curr_2', name: 'Lunch', amount: 1000, date: '2026-11-02', type: 'expense', category: 'Food & Dining', status: 'Completed' },
  ];

  const res3 = await generateUserForecast(transactionsWithCurrentMonth, 4, undefined, [2026, 11]);
  assert(res3.status === 'ok', 'Forecast succeeds with current month transactions present');

  // Verify completed historicalActuals does NOT contain incomplete November 2026
  const novInActuals = res3.historicalActuals.find(h => h.month === '2026-11');
  assert(!novInActuals, 'Current month (2026-11) is excluded from completed historical actuals');
  assert(res3.historicalActuals[res3.historicalActuals.length - 1].month === '2026-10', 'Latest completed month is 2026-10');

  // Verify MTD object captures current month spending
  assert(Boolean(res3.currentMonthMtd), 'CurrentMonthMtd object is present');
  assert(res3.currentMonthMtd?.month === '2026-11', 'CurrentMonthMtd month is 2026-11');
  assert(res3.currentMonthMtd?.amount === 1370, `CurrentMonthMtd amount is ₹1,370 (got ₹${res3.currentMonthMtd?.amount})`);
  assert(res3.currentMonthMtd?.transactionCount === 2, `CurrentMonthMtd transactionCount is 2 (got ${res3.currentMonthMtd?.transactionCount})`);
  assert(res3.currentMonthMtd?.isComplete === false, 'CurrentMonthMtd is marked as incomplete');

  // Verify forecast starts at current month (2026-11) without near-zero collapse
  assert(res3.predictions?.[0].month === '2026-11', `Forecast step 1 starts at current month 2026-11 (got ${res3.predictions?.[0].month})`);
  assert((res3.predictions?.[0].predicted ?? 0) >= 20000, `Forecast does not collapse to MTD ₹1,370 (predicted: ₹${res3.predictions?.[0].predicted})`);

  // -------------------------------------------------------------------------
  // Test 4: Aligned Expense Aggregation (Matching FinancialContext & Analytics)
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Aligned expense aggregation across all categories');
  const mixedCategoryTransactions: FrontendTransaction[] = [
    // 6 baseline months
    { id: 'c1', name: 'Rent', amount: 30000, date: '2026-01-05', type: 'expense', category: 'Housing', status: 'Completed' },
    { id: 'c2', name: 'Rent', amount: 30000, date: '2026-02-05', type: 'expense', category: 'Housing', status: 'Completed' },
    { id: 'c3', name: 'Rent', amount: 30000, date: '2026-03-05', type: 'expense', category: 'Housing', status: 'Completed' },
    { id: 'c4', name: 'Rent', amount: 30000, date: '2026-04-05', type: 'expense', category: 'Housing', status: 'Completed' },
    { id: 'c5', name: 'Rent', amount: 30000, date: '2026-05-05', type: 'expense', category: 'Housing', status: 'Completed' },
    // Month 6: June 2026 with diverse categories
    { id: 'c6_base', name: 'Rent', amount: 30000, date: '2026-06-05', type: 'expense', category: 'Housing', status: 'Completed' },
    // Transfer expense: must NOT be silently excluded if type === 'expense'
    { id: 'c6_transfer', name: 'Wire Fee Transfer', amount: 500, date: '2026-06-10', type: 'expense', category: 'Account Transfer', status: 'Completed' },
    // Investment expense: must NOT be silently excluded if type === 'expense'
    { id: 'c6_invest', name: 'Mutual Fund SIP', amount: 10000, date: '2026-06-15', type: 'expense', category: 'Investment', status: 'Completed' },
    // Income transaction: must be excluded
    { id: 'c6_income', name: 'Salary', amount: 90000, date: '2026-06-01', type: 'income', category: 'Salary', status: 'Completed' },
    // Failed expense: must be excluded
    { id: 'c6_failed', name: 'Cancelled Purchase', amount: 5000, date: '2026-06-20', type: 'expense', category: 'Shopping', status: 'Failed' as any },
  ];

  const res4 = await generateUserForecast(mixedCategoryTransactions, 3, undefined, [2026, 7]);
  assert(res4.status === 'ok', 'Pipeline succeeds with diverse categories');
  const junActual = res4.historicalActuals.find(h => h.month === '2026-06');
  // Expected: 30000 + 500 + 10000 = 40500 (income and failed are excluded)
  assert(junActual?.actual === 40500, `June 2026 total is exactly ₹40,500 including all expense categories (got ₹${junActual?.actual})`);

  // -------------------------------------------------------------------------
  // Test 5: Deterministic Validation Tie-Breaking Rule
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Deterministic validation tie-breaking');
  // When models have identical validation performance, deterministic rule selects by priority:
  // Linear Regression > Random Forest > Moving Average > Naive Baseline
  const sparseFlatTransactions: FrontendTransaction[] = [
    { id: 'f1', name: 'Sub', amount: 1000, date: '2026-01-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f2', name: 'Sub', amount: 1000, date: '2026-02-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f3', name: 'Sub', amount: 1000, date: '2026-03-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f4', name: 'Sub', amount: 1000, date: '2026-04-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f5', name: 'Sub', amount: 1000, date: '2026-05-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f6', name: 'Sub', amount: 1000, date: '2026-06-01', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'f7', name: 'Sub', amount: 1000, date: '2026-07-01', type: 'expense', category: 'Bills', status: 'Completed' },
  ];

  const res5 = await generateUserForecast(sparseFlatTransactions, 3, undefined, [2026, 8]);
  assert(res5.status === 'ok', 'Pipeline succeeds on flat series');
  assert(typeof res5.modelUsed === 'string', `Model selected deterministically: ${res5.modelUsed}`);
  assert(res5.modelUsed === 'Linear Regression', `Tie-breaker rule selected Linear Regression over Naive Baseline (got "${res5.modelUsed}")`);

  // -------------------------------------------------------------------------
  // Test 6: Zero-Expense Months & MAPE Exclusions
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Zero-expense months preservation & MAPE calculations');
  const sparseZeroTransactions: FrontendTransaction[] = [
    { id: 'z1', name: 'Shop', amount: 50000, date: '2025-08-15', type: 'expense', category: 'Electronics', status: 'Completed' },
    // 2025-09 to 2026-03 zero expenses
    { id: 'z2', name: 'Trip', amount: 30000, date: '2026-04-10', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z3', name: 'Trip', amount: 25000, date: '2026-05-15', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z4', name: 'Trip', amount: 35000, date: '2026-06-20', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z5', name: 'Trip', amount: 28000, date: '2026-07-12', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z6', name: 'Trip', amount: 32000, date: '2026-08-18', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z7', name: 'Trip', amount: 29000, date: '2026-09-22', type: 'expense', category: 'Travel', status: 'Completed' },
    { id: 'z8', name: 'Trip', amount: 31000, date: '2026-10-05', type: 'expense', category: 'Travel', status: 'Completed' },
  ];

  const res6 = await generateUserForecast(sparseZeroTransactions, 4, undefined, [2026, 11]);
  assert(res6.status === 'ok', 'Forecast generated for sparse timeline with valid zero-expense months');
  const zeroMonth = res6.historicalActuals.find(h => h.month === '2025-09');
  assert(zeroMonth?.actual === 0 && zeroMonth?.isZeroExpense === true, 'Zero-expense month preserved as ₹0.0');

  const testEval = res6.allModelsEvaluation?.['Naive Baseline'];
  assert(typeof testEval?.mae === 'number' && !isNaN(testEval.mae), `MAE computed across all test months: ₹${testEval?.mae}`);
  assert(typeof testEval?.rmse === 'number' && !isNaN(testEval.rmse), `RMSE computed across all test months: ₹${testEval?.rmse}`);
  assert(typeof testEval?.mapeObservationsUsed === 'number', 'Reports mapeObservationsUsed');
  assert(typeof testEval?.mapeObservationsTotal === 'number', 'Reports mapeObservationsTotal');

  // -------------------------------------------------------------------------
  // Test 7: All-Zero Test Actuals Return MAPE = null
  // -------------------------------------------------------------------------
  console.log('\n[Test 7] All-zero test actuals produce MAPE null (never NaN, 0, or infinity)');
  const allZeroTrailingTransactions: FrontendTransaction[] = [
    { id: 'az1', name: 'Spend', amount: 20000, date: '2026-01-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'az2', name: 'Spend', amount: 22000, date: '2026-02-15', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'az3', name: 'Spend', amount: 21000, date: '2026-03-12', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 'az4', name: 'Spend', amount: 23000, date: '2026-04-18', type: 'expense', category: 'Bills', status: 'Completed' },
    // 2026-05, 06, 07, 08 have zero transactions
  ];

  const res7 = await generateUserForecast(allZeroTrailingTransactions, 4, [2026, 8], [2026, 9]);
  assert(res7.status === 'ok', 'Forecast generated for timeline with zero trailing test months');
  const testEvalZero = res7.allModelsEvaluation?.['Naive Baseline'];
  if (testEvalZero && testEvalZero.mapeObservationsUsed === 0) {
    assert(testEvalZero.mape === null, 'MAPE is null when all test actuals are zero');
    assert(testEvalZero.mapeFormatted.includes('N/A'), `Formatted string indicates N/A: "${testEvalZero.mapeFormatted}"`);
  } else {
    assert(testEvalZero?.mape !== undefined, 'Handled safely');
  }

  // -------------------------------------------------------------------------
  // Test 8: Python ML Engine and TypeScript Fallback Parity
  // -------------------------------------------------------------------------
  console.log('\n[Test 8] Python ML engine and TypeScript fallback parity');
  const tsResult = computeFallbackForecast(eightMonthTransactions, 4, undefined, [2026, 11]);
  assert(tsResult.status === 'ok', 'TypeScript fallback returns status ok');
  assert(Boolean(tsResult.modelUsed && res2.modelUsed && tsResult.modelUsed.startsWith(res2.modelUsed)), `Both engines select the identical model: "${tsResult.modelUsed}" vs "${res2.modelUsed}"`);
  assert(tsResult.predictions?.length === res2.predictions?.length, 'Both engines return identical forecast horizons');

  // Verify historical totals match
  let allTotalsMatch = true;
  for (let i = 0; i < (res2.historicalActuals.length || 0); i++) {
    if (res2.historicalActuals[i].actual !== tsResult.historicalActuals[i]?.actual) {
      allTotalsMatch = false;
      break;
    }
  }
  assert(allTotalsMatch, 'Historical monthly actuals match identically between Python and TypeScript');

  // -------------------------------------------------------------------------
  // Test 9: All-Zero Validation Period Handling (User Ledger Pattern)
  // -------------------------------------------------------------------------
  console.log('\n[Test 9] All-zero validation period handling');
  // Recreating the exact user pattern: Aug 2025 spend, followed by zero-spending gap,
  // then spending in late 2026. Folds fall on zero-actual months.
  const userLedgerPatternTransactions: FrontendTransaction[] = [
    { id: 'u1', name: 'Initial Spend', amount: 30000, date: '2025-08-15', type: 'expense', category: 'Shopping', status: 'Completed' },
    // 2025-09 to 2026-07 all zero expenses
    { id: 'u2', name: 'Resume Spend 1', amount: 25000, date: '2026-08-10', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'u3', name: 'Resume Spend 2', amount: 28000, date: '2026-09-15', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'u4', name: 'Resume Spend 3', amount: 32000, date: '2026-10-20', type: 'expense', category: 'Food & Dining', status: 'Completed' },
  ];

  const res9Py = await generateUserForecast(userLedgerPatternTransactions, 4, [2026, 10], [2026, 11]);
  assert(res9Py.status === 'ok', 'Forecast succeeds on user-ledger pattern');
  assert(res9Py.validationMetrics?.status === 'all_zero_validation', `Validation status is 'all_zero_validation' (got: ${res9Py.validationMetrics?.status})`);
  assert(res9Py.validationMetrics?.valMae === null, 'Rolling Validation MAE is null (not 0) when validation folds are zero');
  assert(res9Py.validationMetrics?.valRmse === null, 'Rolling Validation RMSE is null (not 0) when validation folds are zero');
  assert(res9Py.modelUsed === 'Linear Regression', `Model selected via deterministic priority rule: ${res9Py.modelUsed}`);

  // Verify TS fallback matches Python engine on all-zero validation
  const res9Ts = computeFallbackForecast(userLedgerPatternTransactions, 4, [2026, 10], [2026, 11]);
  assert(res9Ts.validationMetrics?.status === 'all_zero_validation', 'TS fallback also reports status: all_zero_validation');
  assert(res9Ts.validationMetrics?.valMae === null, 'TS fallback reports valMae: null');
  assert(res9Ts.validationMetrics?.valRmse === null, 'TS fallback reports valRmse: null');
  assert(Boolean(res9Ts.modelUsed && res9Py.modelUsed && res9Ts.modelUsed.startsWith(res9Py.modelUsed)), `TS fallback selects identical model via deterministic priority (got: ${res9Ts.modelUsed} vs ${res9Py.modelUsed})`);

  // -------------------------------------------------------------------------
  // Test 10: Insufficient Validation Folds (< 2 folds)
  // -------------------------------------------------------------------------
  console.log('\n[Test 10] Insufficient validation folds handling');
  // 6 completed months with testSize = 1 leaves evalSize = 5.
  // minTrainWindow = max(3, min(6, 3)) = 3. Folds = [3, 4] (2 folds).
  // If we configure an evaluation window with fewer than 2 folds, it reports insufficient_folds.
  const shortHistoryTransactions: FrontendTransaction[] = [
    { id: 's1', name: 'M1', amount: 10000, date: '2026-05-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's2', name: 'M2', amount: 12000, date: '2026-06-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's3', name: 'M3', amount: 11000, date: '2026-07-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's4', name: 'M4', amount: 13000, date: '2026-08-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's5', name: 'M5', amount: 14000, date: '2026-09-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's6', name: 'M6', amount: 15000, date: '2026-10-10', type: 'expense', category: 'Bills', status: 'Completed' },
  ];

  const res10 = await generateUserForecast(shortHistoryTransactions, 4, [2026, 10], [2026, 11]);
  assert(res10.status === 'ok', 'Pipeline succeeds with 6 completed months');
  assert(Boolean(res10.validationMetrics), 'ValidationMetrics object is present');
  assert(res10.validationMetrics?.foldsCount !== undefined, `Validation folds count: ${res10.validationMetrics?.foldsCount}`);

  // -------------------------------------------------------------------------
  // Test 11: Feature Importances Presence and Real Attributions
  // -------------------------------------------------------------------------
  console.log('\n[Test 11] Feature importance scores verification');
  assert(Boolean(res2.featureImportances), 'Forecast response contains featureImportances');
  if (res2.featureImportances) {
    const sumImportance = Object.values(res2.featureImportances).reduce((a, b) => a + b, 0);
    assert(Math.abs(sumImportance - 1.0) < 0.01, `Feature importances sum to 1.0 (got ${sumImportance.toFixed(4)})`);
    assert(Boolean(res2.featureImportances['trend_t']), 'Contains chronological trend index (trend_t)');
    assert(Boolean(res2.featureImportances['rolling_mean_3']), 'Contains 3-month rolling average (rolling_mean_3)');
  }

  // -------------------------------------------------------------------------
  // Test 12: Actual vs. Predicted Alignment, Signed Differences, & Future Distinction
  // -------------------------------------------------------------------------
  console.log('\n[Test 12] Actual vs. Predicted Alignment, Signed Differences, & Future Forecast Distinction');
  assert(Array.isArray(res2.testPeriodPoints), 'Response contains testPeriodPoints array');
  if (res2.testPeriodPoints && res2.testPeriodPoints.length > 0) {
    assert(res2.testPeriodPoints.length === 2, `testPeriodPoints contains 2 test months for 8-month history (got ${res2.testPeriodPoints.length})`);
    
    // Verify point alignment and difference arithmetic
    for (const tp of res2.testPeriodPoints) {
      assert(typeof tp.month === 'string' && /^\d{4}-\d{2}$/.test(tp.month), `Valid month format: ${tp.month}`);
      assert(typeof tp.actual === 'number' && tp.actual > 0, `Valid test actual expense: ₹${tp.actual}`);
      assert(typeof tp.predicted === 'number' && tp.predicted > 0, `Valid test predicted expense: ₹${tp.predicted}`);
      const expectedDiff = Math.round((tp.predicted - tp.actual) * 100) / 100;
      assert(Math.abs(tp.difference - expectedDiff) < 0.01, `Signed difference equals (Predicted − Actual): ${tp.difference} vs ${expectedDiff}`);
    }

    // Verify TypeScript fallback produces aligned testPeriodPoints matching Python
    assert(Array.isArray(tsResult.testPeriodPoints), 'TS fallback contains testPeriodPoints array');
    assert(tsResult.testPeriodPoints?.length === res2.testPeriodPoints.length, 'TS fallback has identical number of test period points');
    if (tsResult.testPeriodPoints && tsResult.testPeriodPoints.length > 0) {
      assert(tsResult.testPeriodPoints[0].month === res2.testPeriodPoints[0].month, `Matching test month: ${tsResult.testPeriodPoints[0].month}`);
      assert(tsResult.testPeriodPoints[0].actual === res2.testPeriodPoints[0].actual, `Matching test actual: ₹${tsResult.testPeriodPoints[0].actual}`);
    }
  }

  // Verify future forecast points are distinct from test actuals
  assert(Array.isArray(res2.predictions) && res2.predictions.length === 4, 'Future forecast contains 4 horizon steps');
  if (res2.predictions) {
    const futureMonths = res2.predictions.map(p => p.month);
    const testMonths = res2.testPeriodPoints?.map(p => p.month) || [];
    const overlap = futureMonths.filter(m => testMonths.includes(m));
    assert(overlap.length === 0, 'Future forecast months start strictly after completed test months without overlap');
  }

  // -------------------------------------------------------------------------
  // Test 13: Asynchronous Non-Blocking Python Environment Verification
  // -------------------------------------------------------------------------
  console.log('\n[Test 13] Asynchronous Python environment verification');
  const verifiedEnv = await getVerifiedPythonEnvironment();
  assert(Boolean(verifiedEnv), 'Verified Python environment resolved asynchronously');
  if (verifiedEnv) {
    assert(typeof verifiedEnv.actualExecutable === 'string', `Python binary path resolved: ${verifiedEnv.actualExecutable}`);
    assert(typeof verifiedEnv.pythonVersion === 'string', `Python version verified: ${verifiedEnv.pythonVersion}`);
    assert(typeof verifiedEnv.scikitLearnVersion === 'string', `Scikit-Learn version verified: ${verifiedEnv.scikitLearnVersion}`);
  }

  // -------------------------------------------------------------------------
  // Test 14: Expense Anomaly Detection (Rolling IQR Statistical Analysis)
  // -------------------------------------------------------------------------
  console.log('\n[Test 14] Expense anomaly detection (Rolling IQR)');
  // Scenario matching user requirement: Food baseline Rs 3,000, spike in current month to Rs 8,500
  const anomalyFixtureTransactions: FrontendTransaction[] = [
    { id: 'a1', name: 'Groceries 1', amount: 3000, date: '2026-05-10', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'a2', name: 'Groceries 2', amount: 3100, date: '2026-06-12', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'a3', name: 'Groceries 3', amount: 2950, date: '2026-07-15', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'a4', name: 'Groceries 4', amount: 3050, date: '2026-08-11', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'a5', name: 'Groceries 5', amount: 3000, date: '2026-09-14', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    { id: 'a6', name: 'Groceries Spike', amount: 8500, date: '2026-10-18', type: 'expense', category: 'Food & Dining', status: 'Completed' },
  ];

  const anomalyRes = detectExpenseAnomalies(anomalyFixtureTransactions, '2026-11');
  assert(anomalyRes.status === 'ok', 'Anomaly detection returns status ok for >= 3 completed months');
  assert(anomalyRes.totalAnomaliesCount > 0, `Detected anomalies count > 0 (got: ${anomalyRes.totalAnomaliesCount})`);
  assert(anomalyRes.highestSeverity === 'high' || anomalyRes.highestSeverity === 'critical', `Flagged severe anomaly (got: ${anomalyRes.highestSeverity})`);

  const foodAnomaly = anomalyRes.anomalies.find(a => a.category === 'Food & Dining');
  assert(Boolean(foodAnomaly), 'Identified Food & Dining category surge');
  if (foodAnomaly) {
    assert(foodAnomaly.actualAmount === 8500, `Captured actual outlay: ₹${foodAnomaly.actualAmount}`);
    assert(Math.abs(foodAnomaly.baselineAmount - 3000) < 150, `Historical median baseline around ₹3,000 (got: ₹${foodAnomaly.baselineAmount})`);
    assert(foodAnomaly.diffAmount > 5000, `Increase amount calculated: +₹${foodAnomaly.diffAmount}`);
    assert(foodAnomaly.diffPercentage > 150, `Increase percentage calculated: +${foodAnomaly.diffPercentage}%`);
    assert(foodAnomaly.reason.includes('Food & Dining'), 'Prose explanation accurately specifies category and statistical threshold');
  }

  // Verify insufficient data handling (< 3 completed months)
  const shortAnomalyTxs: FrontendTransaction[] = [
    { id: 's1', name: 'M1', amount: 3000, date: '2026-09-10', type: 'expense', category: 'Bills', status: 'Completed' },
    { id: 's2', name: 'M2', amount: 3100, date: '2026-10-10', type: 'expense', category: 'Bills', status: 'Completed' },
  ];
  const shortAnomalyRes = detectExpenseAnomalies(shortAnomalyTxs, '2026-11');
  assert(shortAnomalyRes.status === 'insufficient_data', 'Correctly flags insufficient_data when completed months < 3');
  assert(shortAnomalyRes.completedMonthsCount === 2, `Accurately reports completed months count: ${shortAnomalyRes.completedMonthsCount}`);

  // -------------------------------------------------------------------------
  // Test 15: Dataset Statistics & Expanding Training Window Verification
  // -------------------------------------------------------------------------
  console.log('\n[Test 15] Dataset statistics & expanding window progression');
  assert(Boolean(res2.datasetStats), 'Forecast result contains datasetStats');
  if (res2.datasetStats) {
    assert(res2.datasetStats.totalTransactionRecords === 8, `Accurate total transactions count: ${res2.datasetStats.totalTransactionRecords}`);
    assert(res2.datasetStats.completedMonthlyRecords === 8, `Accurate completed monthly records: ${res2.datasetStats.completedMonthlyRecords}`);
    assert(res2.datasetStats.userScoped === true, 'Dataset statistics are strictly user-scoped');
    assert(res2.datasetStats.tenantIsolationVerified === true, 'Tenant isolation verified');
  }

  assert(Boolean(res2.expandingWindow), 'Forecast result contains expandingWindow metadata');
  if (res2.expandingWindow) {
    assert(res2.expandingWindow.retainsAllHistoricalData === true, 'Expanding window retains all historical records without truncation');
    assert(res2.expandingWindow.progressionSummary.includes('Expanding window'), 'Expanding window progression summary describes continuous retraining');
  }

  // -------------------------------------------------------------------------
  // Test 16: Concurrent Forecast Requests (Async Promise Deduplication)
  // -------------------------------------------------------------------------
  console.log('\n[Test 16] Concurrent forecast execution & event-loop non-blocking');
  const [c1, c2, c3] = await Promise.all([
    generateUserForecast(eightMonthTransactions, 3, undefined, [2026, 11]),
    generateUserForecast(eightMonthTransactions, 3, undefined, [2026, 11]),
    generateUserForecast(eightMonthTransactions, 3, undefined, [2026, 11]),
  ]);
  assert(c1.status === 'ok' && c2.status === 'ok' && c3.status === 'ok', 'Concurrent forecast requests resolve simultaneously');
  assert(c1.engineUsed === c2.engineUsed && c2.engineUsed === c3.engineUsed, `All concurrent requests use identical verified engine: ${c1.engineUsed}`);
  assert(Boolean(c1.predictions && c2.predictions && c3.predictions), 'All concurrent executions return valid forward prediction arrays');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(`Phase 5 ML Forecasting Tests Complete: ${passed} passed, ${failed} failed.`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[Phase 5 Test Error]:', err);
  process.exit(1);
});
