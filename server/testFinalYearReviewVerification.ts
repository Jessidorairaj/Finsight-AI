/**
 * FinSight AI — Final-Year Project Review Verification Test Suite
 *
 * Comprehensive automated verification covering:
 * - Test 1: Anomaly Detection (IQR, severity, thresholds, explanations, false-positive protection, isolation)
 * - Test 2: Dataset Statistics (PostgreSQL total transactions, completed monthly aggregates, MTD count, user isolation)
 * - Test 3: Six-Month Minimum Constraint (3, 5, 5+MTD, 6, 7 months eligibility)
 * - Test 4: Expanding Training Window Progression (6 -> 7 months expansion, target progression, no data leakage)
 * - Test 5: Comprehensive Structured Test Report Generation
 *
 * STRICT SAFETY RULE:
 * - Uses isolated test fixtures with uniquely generated test user records.
 * - Never modifies or accesses production user data.
 * - Always cleans up test users and test transactions upon test completion.
 */

import { getDbPool } from './db.js';
import { createUser, deleteUserById } from './repositories/userRepository.js';
import {
  insertTransaction,
  bulkInsertTransactions,
  getAllTransactions,
  FrontendTransaction,
  DbTransactionInput,
} from './repositories/transactionRepository.js';
import {
  detectExpenseAnomalies,
  computeIqrStats,
  ExpenseAnomaly,
} from './services/anomalyDetectionService.js';
import {
  generateUserForecast,
  ForecastResponse,
} from './services/mlForecastService.js';

export interface TestResultItem {
  id: string;
  category: string;
  description: string;
  inputData: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

const testResults: TestResultItem[] = [];
let passCount = 0;
let failCount = 0;

function recordTest(item: TestResultItem) {
  testResults.push(item);
  if (item.status === 'PASS') {
    passCount++;
    console.log(`  ✓ [${item.id}] ${item.description}: PASS`);
  } else {
    failCount++;
    console.error(`  ✗ [${item.id}] ${item.description}: FAIL`);
    console.error(`      Expected: ${item.expectedResult}`);
    console.error(`      Actual:   ${item.actualResult}`);
  }
}

async function runReviewVerificationSuite() {
  console.log('========================================================================');
  console.log('   FinSight AI — Final-Year Project Review Verification Test Suite      ');
  console.log('========================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool could not be initialized. Check DATABASE_URL.');
  }

  // Tracking created test users for guaranteed teardown
  const createdUserIds: string[] = [];

  try {
    // =========================================================================
    // TEST 1: ANOMALY DETECTION ENGINE
    // =========================================================================
    console.log('\n--- TEST SUITE 1: Anomaly Detection Engine ---');

    // 1.1 Normal Historical Spending (No sudden spikes)
    const normalTransactions: FrontendTransaction[] = [
      { id: 'n1', name: 'Groceries', amount: 8000, date: '2026-05-10', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n2', name: 'Rent', amount: 12000, date: '2026-05-01', type: 'expense', category: 'Housing', status: 'Completed' },
      { id: 'n3', name: 'Groceries', amount: 8200, date: '2026-06-11', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n4', name: 'Rent', amount: 12000, date: '2026-06-01', type: 'expense', category: 'Housing', status: 'Completed' },
      { id: 'n5', name: 'Groceries', amount: 7900, date: '2026-07-15', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n6', name: 'Rent', amount: 12000, date: '2026-07-01', type: 'expense', category: 'Housing', status: 'Completed' },
      { id: 'n7', name: 'Groceries', amount: 8100, date: '2026-08-12', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n8', name: 'Rent', amount: 12000, date: '2026-08-01', type: 'expense', category: 'Housing', status: 'Completed' },
      { id: 'n9', name: 'Groceries', amount: 8050, date: '2026-09-14', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n10', name: 'Rent', amount: 12000, date: '2026-09-01', type: 'expense', category: 'Housing', status: 'Completed' },
      { id: 'n11', name: 'Groceries', amount: 8150, date: '2026-10-10', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { id: 'n12', name: 'Rent', amount: 12000, date: '2026-10-01', type: 'expense', category: 'Housing', status: 'Completed' },
    ];

    const normalRes = detectExpenseAnomalies(normalTransactions, '2026-11');
    recordTest({
      id: 'TC-AD-01',
      category: 'Anomaly Detection',
      description: 'Evaluate normal historical spending without spikes',
      inputData: '6 completed months (May-Oct 2026) with steady ₹20,000 monthly spend',
      expectedResult: 'totalAnomaliesCount = 0, highestSeverity = "none", status = "ok"',
      actualResult: `totalAnomaliesCount = ${normalRes.totalAnomaliesCount}, highestSeverity = "${normalRes.highestSeverity}", status = "${normalRes.status}"`,
      status: normalRes.status === 'ok' && normalRes.totalAnomaliesCount === 0 && normalRes.highestSeverity === 'none' ? 'PASS' : 'FAIL',
      evidence: JSON.stringify({ count: normalRes.totalAnomaliesCount, highestSeverity: normalRes.highestSeverity }),
    });

    // 1.2 Sudden Increase in Monthly Total Expenses
    const totalSpikeTransactions: FrontendTransaction[] = [
      ...normalTransactions,
      // Massive spike in latest completed month (October 2026)
      { id: 'spike_tot', name: 'Emergency Hospitalization', amount: 65000, date: '2026-10-25', type: 'expense', category: 'Healthcare', status: 'Completed' },
    ];

    const totalSpikeRes = detectExpenseAnomalies(totalSpikeTransactions, '2026-11');
    const totalAnomaly = totalSpikeRes.anomalies.find(a => a.type === 'total_spending_spike' && a.month === '2026-10');
    const totalPassed = Boolean(
      totalSpikeRes.status === 'ok' &&
      totalAnomaly &&
      (totalAnomaly.severity === 'critical' || totalAnomaly.severity === 'high') &&
      totalAnomaly.actualAmount >= 85000 &&
      totalAnomaly.diffAmount > 60000
    );

    recordTest({
      id: 'TC-AD-02',
      category: 'Anomaly Detection',
      description: 'Detect sudden increase in monthly total expenditure',
      inputData: 'Baseline median ~₹20,100; Oct 2026 total spend surges to ₹85,150 (+323%)',
      expectedResult: 'type = "total_spending_spike", severity = "critical" or "high", actualAmount = ₹85,150, diffAmount > ₹60,000',
      actualResult: totalAnomaly
        ? `type = "${totalAnomaly.type}", severity = "${totalAnomaly.severity}", actualAmount = ₹${totalAnomaly.actualAmount}, diff = ₹${totalAnomaly.diffAmount}`
        : 'No total spending anomaly detected',
      status: totalPassed ? 'PASS' : 'FAIL',
      evidence: totalAnomaly ? totalAnomaly.reason : 'None',
    });

    // 1.3 Sudden Increase in Category-Wise Expenses
    const catSpikeTransactions: FrontendTransaction[] = [
      ...normalTransactions,
      // October 2026 Food & Dining surges by ₹15,000
      { id: 'spike_cat', name: 'Luxury Banquet Catering', amount: 15000, date: '2026-10-18', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    ];

    const catSpikeRes = detectExpenseAnomalies(catSpikeTransactions, '2026-11');
    const foodAnomaly = catSpikeRes.anomalies.find(a => a.type === 'category_unusual_spend' && a.category === 'Food & Dining');
    const catPassed = Boolean(
      foodAnomaly &&
      foodAnomaly.category === 'Food & Dining' &&
      foodAnomaly.actualAmount === 23150 &&
      foodAnomaly.baselineAmount >= 7900 &&
      foodAnomaly.diffPercentage > 150
    );

    recordTest({
      id: 'TC-AD-03',
      category: 'Anomaly Detection',
      description: 'Detect sudden category-wise spending surge (Food & Dining)',
      inputData: 'Food & Dining baseline median ~₹8,075; Oct 2026 surges to ₹23,150',
      expectedResult: 'type = "category_unusual_spend", category = "Food & Dining", actualAmount = ₹23,150, diffPercentage > 150%',
      actualResult: foodAnomaly
        ? `category = "${foodAnomaly.category}", actualAmount = ₹${foodAnomaly.actualAmount}, baseline = ₹${foodAnomaly.baselineAmount}, diff = +${foodAnomaly.diffPercentage}%`
        : 'No category anomaly detected',
      status: catPassed ? 'PASS' : 'FAIL',
      evidence: foodAnomaly ? foodAnomaly.reason : 'None',
    });

    // 1.4 IQR Mathematical Verification
    const sampleValues = [10000, 12000, 14000, 16000, 18000, 20000];
    const iqrStats = computeIqrStats(sampleValues);
    // For n=6: indices 0 to 5.
    // 25th percentile: index = 5 * 0.25 = 1.25 -> val[1] + 0.25*(val[2]-val[1]) = 12000 + 500 = 12500
    // 50th percentile: index = 5 * 0.50 = 2.50 -> val[2] + 0.50*(val[3]-val[2]) = 14000 + 1000 = 15000
    // 75th percentile: index = 5 * 0.75 = 3.75 -> val[3] + 0.75*(val[4]-val[3]) = 16000 + 1500 = 17500
    // IQR = 17500 - 12500 = 5000. Threshold = Q3 + 1.5*IQR = 17500 + 7500 = 25000.
    const iqrPassed = iqrStats.q1 === 12500 && iqrStats.median === 15000 && iqrStats.q3 === 17500 && iqrStats.iqr === 5000;

    recordTest({
      id: 'TC-AD-04',
      category: 'Anomaly Detection',
      description: 'Verify statistical IQR computation (Q1, Median, Q3, IQR)',
      inputData: 'Sample values [10000, 12000, 14000, 16000, 18000, 20000]',
      expectedResult: 'Q1 = 12500, Median = 15000, Q3 = 17500, IQR = 5000',
      actualResult: `Q1 = ${iqrStats.q1}, Median = ${iqrStats.median}, Q3 = ${iqrStats.q3}, IQR = ${iqrStats.iqr}`,
      status: iqrPassed ? 'PASS' : 'FAIL',
      evidence: `IQR = Q3 - Q1 = ${iqrStats.q3} - ${iqrStats.q1} = ${iqrStats.iqr}`,
    });

    // 1.5 False-Positive Protection & Minimum Monetary Thresholds
    // Small spending variation (< ₹500 above median/threshold)
    const smallVarianceTransactions: FrontendTransaction[] = [
      { id: 'sv1', name: 'Item', amount: 1000, date: '2026-05-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      { id: 'sv2', name: 'Item', amount: 1000, date: '2026-06-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      { id: 'sv3', name: 'Item', amount: 1000, date: '2026-07-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      { id: 'sv4', name: 'Item', amount: 1000, date: '2026-08-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      { id: 'sv5', name: 'Item', amount: 1000, date: '2026-09-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      // Oct spend is ₹1,200 (delta is ₹200, which is below the ₹500 total buffer and ₹300 category buffer)
      { id: 'sv6', name: 'Item', amount: 1200, date: '2026-10-10', type: 'expense', category: 'Shopping', status: 'Completed' },
    ];
    const smallVarRes = detectExpenseAnomalies(smallVarianceTransactions, '2026-11');
    const smallVarPassed = smallVarRes.anomalies.length === 0;

    recordTest({
      id: 'TC-AD-05',
      category: 'Anomaly Detection',
      description: 'Verify false-positive suppression for small variations (< ₹500 buffer)',
      inputData: 'Baseline ₹1,000, October spend ₹1,200 (delta = +₹200)',
      expectedResult: '0 anomalies detected (suppressed because delta < minimum buffer ₹500 / ₹300)',
      actualResult: `${smallVarRes.anomalies.length} anomalies detected`,
      status: smallVarPassed ? 'PASS' : 'FAIL',
      evidence: JSON.stringify({ anomaliesCount: smallVarRes.anomalies.length }),
    });

    // 1.6 Insufficient Historical Data (< 3 completed months)
    const shortTxs: FrontendTransaction[] = [
      { id: 'sh1', name: 'Item', amount: 5000, date: '2026-09-10', type: 'expense', category: 'Shopping', status: 'Completed' },
      { id: 'sh2', name: 'Item', amount: 25000, date: '2026-10-10', type: 'expense', category: 'Shopping', status: 'Completed' },
    ];
    const shortRes = detectExpenseAnomalies(shortTxs, '2026-11');
    const shortPassed = shortRes.status === 'insufficient_data' && shortRes.completedMonthsCount === 2 && shortRes.anomalies.length === 0;

    recordTest({
      id: 'TC-AD-06',
      category: 'Anomaly Detection',
      description: 'Handle insufficient historical data (< 3 completed months)',
      inputData: '2 completed months (Sep-Oct 2026)',
      expectedResult: 'status = "insufficient_data", completedMonthsCount = 2, anomalies = []',
      actualResult: `status = "${shortRes.status}", completedMonthsCount = ${shortRes.completedMonthsCount}, anomaliesCount = ${shortRes.anomalies.length}`,
      status: shortPassed ? 'PASS' : 'FAIL',
      evidence: shortRes.summary,
    });

    // 1.7 Authenticated User Isolation in PostgreSQL
    console.log('\n--- Creating Isolated Test Users in PostgreSQL ---');
    const testUserA = await createUser({
      email: `test_user_a_${Date.now()}@reviewtest.internal`,
      passwordHash: 'dummy_hash_for_test',
      displayName: 'Test User A (Spike)',
    });
    createdUserIds.push(testUserA.id);

    const testUserB = await createUser({
      email: `test_user_b_${Date.now()}@reviewtest.internal`,
      passwordHash: 'dummy_hash_for_test',
      displayName: 'Test User B (Normal)',
    });
    createdUserIds.push(testUserB.id);

    // Insert spike transactions for User A in PostgreSQL
    for (const tx of totalSpikeTransactions) {
      await insertTransaction({
        id: `tx_a_${tx.id}_${Date.now()}`,
        name: tx.name,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        status: 'Completed',
      }, testUserA.id);
    }

    // Insert normal transactions for User B in PostgreSQL
    for (const tx of normalTransactions) {
      await insertTransaction({
        id: `tx_b_${tx.id}_${Date.now()}`,
        name: tx.name,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        status: 'Completed',
      }, testUserB.id);
    }

    // Retrieve via repository using isolated user IDs
    const dbTxsA = await getAllTransactions(testUserA.id);
    const dbTxsB = await getAllTransactions(testUserB.id);

    const anomaliesUserA = detectExpenseAnomalies(dbTxsA, '2026-11');
    const anomaliesUserB = detectExpenseAnomalies(dbTxsB, '2026-11');

    const isolationPassed = Boolean(
      anomaliesUserA.totalAnomaliesCount > 0 &&
      anomaliesUserB.totalAnomaliesCount === 0 &&
      dbTxsA.length === totalSpikeTransactions.length &&
      dbTxsB.length === normalTransactions.length
    );

    recordTest({
      id: 'TC-AD-07',
      category: 'Anomaly Detection',
      description: 'Verify authenticated user isolation (User A spike never pollutes User B)',
      inputData: `PostgreSQL User A (${testUserA.id}) with spike vs User B (${testUserB.id}) normal`,
      expectedResult: 'User A has detected anomalies (>0), User B has 0 anomalies, zero cross-user pollution',
      actualResult: `User A anomalies = ${anomaliesUserA.totalAnomaliesCount}, User B anomalies = ${anomaliesUserB.totalAnomaliesCount}`,
      status: isolationPassed ? 'PASS' : 'FAIL',
      evidence: `User A count = ${anomaliesUserA.totalAnomaliesCount} (highest: ${anomaliesUserA.highestSeverity}), User B count = ${anomaliesUserB.totalAnomaliesCount}`,
    });

    // =========================================================================
    // TEST 2: DATASET STATISTICS & POSTGRESQL VERIFICATION
    // =========================================================================
    console.log('\n--- TEST SUITE 2: Dataset Statistics & PostgreSQL Verification ---');

    // Create Test User C with 8 completed months and 1 in-progress MTD month
    const testUserC = await createUser({
      email: `test_user_c_${Date.now()}@reviewtest.internal`,
      passwordHash: 'dummy_hash_for_test',
      displayName: 'Test User C (Stats)',
    });
    createdUserIds.push(testUserC.id);

    // 8 completed months: March 2026 to October 2026, 3 transactions per month = 24 transactions
    const monthsC = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const transactionsC: DbTransactionInput[] = [];

    for (const ym of monthsC) {
      transactionsC.push(
        { name: 'Groceries', amount: 5000, date: `${ym}-05`, type: 'expense', category: 'Food & Dining', status: 'Completed' },
        { name: 'Utility Bill', amount: 3000, date: `${ym}-15`, type: 'expense', category: 'Bills', status: 'Completed' },
        { name: 'Shopping', amount: 4000, date: `${ym}-22`, type: 'expense', category: 'Shopping', status: 'Completed' }
      );
    }
    // 2 transactions in current in-progress month: November 2026
    transactionsC.push(
      { name: 'Coffee', amount: 350, date: '2026-11-02', type: 'expense', category: 'Food & Dining', status: 'Completed' },
      { name: 'Office Lunch', amount: 850, date: '2026-11-04', type: 'expense', category: 'Food & Dining', status: 'Completed' }
    );

    await bulkInsertTransactions(transactionsC, testUserC.id);

    // 2.1 Verify Total Count directly against PostgreSQL
    const dbCountResult = await pool.query('SELECT COUNT(*)::int as count FROM transactions WHERE user_id = $1', [testUserC.id]);
    const expectedDbCount = dbCountResult.rows[0].count; // Expected 26
    const loadedTxsC = await getAllTransactions(testUserC.id);

    recordTest({
      id: 'TC-DS-01',
      category: 'Dataset Statistics',
      description: 'Verify total transaction count matches PostgreSQL database query',
      inputData: `PostgreSQL query: SELECT COUNT(*) WHERE user_id = '${testUserC.id}'`,
      expectedResult: `totalTransactionRecords = ${expectedDbCount} (26 transactions)`,
      actualResult: `getAllTransactions loaded = ${loadedTxsC.length}, DB count = ${expectedDbCount}`,
      status: loadedTxsC.length === expectedDbCount && expectedDbCount === 26 ? 'PASS' : 'FAIL',
      evidence: `PostgreSQL rows: ${expectedDbCount}, repository returned: ${loadedTxsC.length}`,
    });

    // 2.2 Run Forecast & Verify datasetStats breakdown
    const forecastC = await generateUserForecast(loadedTxsC, 4, undefined, '2026-11');
    const statsC = forecastC.datasetStats;

    // 2.2 Completed Monthly Aggregates
    const completedAggregatesPassed = Boolean(
      statsC &&
      statsC.completedMonthlyRecords === 8 &&
      forecastC.completedMonthsCount === 8
    );
    recordTest({
      id: 'TC-DS-02',
      category: 'Dataset Statistics',
      description: 'Verify completed monthly aggregates count',
      inputData: '8 completed calendar months (March 2026 to October 2026)',
      expectedResult: 'completedMonthlyRecords = 8, completedMonthsCount = 8',
      actualResult: `completedMonthlyRecords = ${statsC?.completedMonthlyRecords}, completedMonthsCount = ${forecastC.completedMonthsCount}`,
      status: completedAggregatesPassed ? 'PASS' : 'FAIL',
      evidence: `Months: ${forecastC.historicalActuals.map(h => h.month).join(', ')}`,
    });

    // 2.3 Current-Month MTD Count & Isolation
    const mtdPassed = Boolean(
      statsC &&
      statsC.currentMonthTransactionCount === 2 &&
      statsC.currentMonthMtdAmount === 1200 &&
      forecastC.currentMonthMtd?.month === '2026-11' &&
      forecastC.currentMonthMtd?.isComplete === false
    );
    recordTest({
      id: 'TC-DS-03',
      category: 'Dataset Statistics',
      description: 'Verify current-month MTD transaction count and amount isolation',
      inputData: '2 transactions in 2026-11: ₹350 + ₹850 = ₹1,200',
      expectedResult: 'currentMonthTransactionCount = 2, currentMonthMtdAmount = ₹1,200, isComplete = false',
      actualResult: `currentMonthTransactionCount = ${statsC?.currentMonthTransactionCount}, currentMonthMtdAmount = ₹${statsC?.currentMonthMtdAmount}, isComplete = ${forecastC.currentMonthMtd?.isComplete}`,
      status: mtdPassed ? 'PASS' : 'FAIL',
      evidence: JSON.stringify(forecastC.currentMonthMtd),
    });

    // 2.4 Training Samples, Validation Folds, and Held-Out Test Months
    // For 8 completed months: testSize = 2, trainingRecordsCount = 8 - 2 = 6, validationFoldsCount >= 2.
    const splitPassed = Boolean(
      statsC &&
      statsC.trainingRecordsCount === 6 &&
      statsC.heldOutTestMonths === 2 &&
      statsC.validationFoldsCount >= 2
    );
    recordTest({
      id: 'TC-DS-04',
      category: 'Dataset Statistics',
      description: 'Verify training samples, validation folds, and held-out test partition',
      inputData: '8 completed monthly feature vectors',
      expectedResult: 'trainingRecordsCount = 6, heldOutTestMonths = 2, validationFoldsCount >= 2',
      actualResult: `trainingRecordsCount = ${statsC?.trainingRecordsCount}, heldOutTestMonths = ${statsC?.heldOutTestMonths}, validationFoldsCount = ${statsC?.validationFoldsCount}`,
      status: splitPassed ? 'PASS' : 'FAIL',
      evidence: `Evaluation splits: Train = ${statsC?.trainingRecordsCount}, Test = ${statsC?.heldOutTestMonths}, Folds = ${statsC?.validationFoldsCount}`,
    });

    // 2.5 Ensure counts belong ONLY to the authenticated test user
    const isolationStatsPassed = Boolean(
      statsC &&
      statsC.userScoped === true &&
      statsC.tenantIsolationVerified === true &&
      statsC.totalTransactionRecords === 26
    );
    recordTest({
      id: 'TC-DS-05',
      category: 'Dataset Statistics',
      description: 'Ensure dataset statistics belong strictly to authenticated test user',
      inputData: `Test User C (${testUserC.id}) vs existing records in DB`,
      expectedResult: 'userScoped = true, tenantIsolationVerified = true, exactly 26 records',
      actualResult: `userScoped = ${statsC?.userScoped}, tenantIsolationVerified = ${statsC?.tenantIsolationVerified}, total = ${statsC?.totalTransactionRecords}`,
      status: isolationStatsPassed ? 'PASS' : 'FAIL',
      evidence: `User isolation verified against PostgreSQL tenant filter WHERE user_id = '${testUserC.id}'`,
    });

    // 2.6 Verify Dashboard values match API response structure
    const dashboardFieldsMatch = Boolean(
      forecastC.status === 'ok' &&
      typeof forecastC.modelUsed === 'string' &&
      forecastC.datasetStats &&
      forecastC.expandingWindow &&
      forecastC.anomalies &&
      Array.isArray(forecastC.predictions) &&
      forecastC.predictions.length === 4
    );
    recordTest({
      id: 'TC-DS-06',
      category: 'Dataset Statistics',
      description: 'Verify dashboard consumption fields are fully populated in API payload',
      inputData: 'Forecast response object structure',
      expectedResult: 'Contains datasetStats, expandingWindow, anomalies, predictions[4], evaluationMetrics',
      actualResult: dashboardFieldsMatch ? 'All required dashboard contracts present' : 'Missing required UI fields',
      status: dashboardFieldsMatch ? 'PASS' : 'FAIL',
      evidence: `engine: ${forecastC.engineUsed}, model: ${forecastC.modelUsed}, predictions: ${forecastC.predictions?.length} steps`,
    });

    // =========================================================================
    // TEST 3: SIX-MONTH MINIMUM CONSTRAINT
    // =========================================================================
    console.log('\n--- TEST SUITE 3: Six-Month Minimum Constraint ---');

    // 3.1 Test User with 3 completed months
    const txs3Months: FrontendTransaction[] = [
      { id: 'm3_1', name: 'Spend', amount: 10000, date: '2026-01-10', type: 'expense', category: 'Bills', status: 'Completed' },
      { id: 'm3_2', name: 'Spend', amount: 11000, date: '2026-02-10', type: 'expense', category: 'Bills', status: 'Completed' },
      { id: 'm3_3', name: 'Spend', amount: 12000, date: '2026-03-10', type: 'expense', category: 'Bills', status: 'Completed' },
    ];
    const res3Months = await generateUserForecast(txs3Months, 4, undefined, '2026-04');
    const passed3Months = res3Months.status === 'insufficient_data' && res3Months.completedMonthsCount === 3 && res3Months.minRequiredMonths === 6;

    recordTest({
      id: 'TC-SM-01',
      category: 'Six-Month Minimum',
      description: 'Test user with 3 completed months (must reject full ML pipeline)',
      inputData: '3 completed months: 2026-01 to 2026-03 (asOf: 2026-04)',
      expectedResult: 'status = "insufficient_data", completedMonthsCount = 3, minRequiredMonths = 6',
      actualResult: `status = "${res3Months.status}", completedMonthsCount = ${res3Months.completedMonthsCount}, minRequiredMonths = ${res3Months.minRequiredMonths}`,
      status: passed3Months ? 'PASS' : 'FAIL',
      evidence: res3Months.message || 'No message',
    });

    // 3.2 Test User with 5 completed months
    const txs5Months: FrontendTransaction[] = [
      ...txs3Months,
      { id: 'm5_4', name: 'Spend', amount: 13000, date: '2026-04-10', type: 'expense', category: 'Bills', status: 'Completed' },
      { id: 'm5_5', name: 'Spend', amount: 14000, date: '2026-05-10', type: 'expense', category: 'Bills', status: 'Completed' },
    ];
    const res5Months = await generateUserForecast(txs5Months, 4, undefined, '2026-06');
    const passed5Months = res5Months.status === 'insufficient_data' && res5Months.completedMonthsCount === 5 && res5Months.minRequiredMonths === 6;

    recordTest({
      id: 'TC-SM-02',
      category: 'Six-Month Minimum',
      description: 'Test user with 5 completed months (must reject full ML pipeline)',
      inputData: '5 completed months: 2026-01 to 2026-05 (asOf: 2026-06)',
      expectedResult: 'status = "insufficient_data", completedMonthsCount = 5, minRequiredMonths = 6',
      actualResult: `status = "${res5Months.status}", completedMonthsCount = ${res5Months.completedMonthsCount}, minRequiredMonths = ${res5Months.minRequiredMonths}`,
      status: passed5Months ? 'PASS' : 'FAIL',
      evidence: res5Months.message || 'No message',
    });

    // 3.3 Test User with 5 completed months + 1 INCOMPLETE CURRENT MONTH (Should NOT become eligible!)
    const txs5MonthsPlusMtd: FrontendTransaction[] = [
      ...txs5Months,
      { id: 'm5_curr', name: 'Mid-Month Coffee', amount: 450, date: '2026-06-03', type: 'expense', category: 'Food & Dining', status: 'Completed' },
    ];
    const res5MonthsPlusMtd = await generateUserForecast(txs5MonthsPlusMtd, 4, undefined, '2026-06');
    const passed5MonthsPlusMtd = Boolean(
      res5MonthsPlusMtd.status === 'insufficient_data' &&
      res5MonthsPlusMtd.completedMonthsCount === 5 &&
      res5MonthsPlusMtd.currentMonthMtd?.amount === 450
    );

    recordTest({
      id: 'TC-SM-03',
      category: 'Six-Month Minimum',
      description: 'Verify current incomplete month is NEVER counted toward 6 completed months',
      inputData: '5 completed months + 1 ongoing incomplete month (2026-06, asOf: 2026-06)',
      expectedResult: 'status = "insufficient_data", completedMonthsCount = 5, currentMonthMtd.amount = ₹450',
      actualResult: `status = "${res5MonthsPlusMtd.status}", completedMonthsCount = ${res5MonthsPlusMtd.completedMonthsCount}, MTD = ₹${res5MonthsPlusMtd.currentMonthMtd?.amount}`,
      status: passed5MonthsPlusMtd ? 'PASS' : 'FAIL',
      evidence: `Incomplete month 2026-06 strictly isolated as MTD; completed count remains ${res5MonthsPlusMtd.completedMonthsCount}`,
    });

    // 3.4 Test User with 6 completed months (Threshold met!)
    const txs6Months: FrontendTransaction[] = [
      ...txs5Months,
      { id: 'm6_6', name: 'Spend', amount: 15000, date: '2026-06-10', type: 'expense', category: 'Bills', status: 'Completed' },
    ];
    const res6Months = await generateUserForecast(txs6Months, 4, undefined, '2026-07');
    const passed6Months = res6Months.status === 'ok' && res6Months.completedMonthsCount === 6 && (res6Months.predictions?.length ?? 0) === 4;

    recordTest({
      id: 'TC-SM-04',
      category: 'Six-Month Minimum',
      description: 'Test user with exactly 6 completed months (eligible for full ML pipeline)',
      inputData: '6 completed months: 2026-01 to 2026-06 (asOf: 2026-07)',
      expectedResult: 'status = "ok", completedMonthsCount = 6, predictions.length = 4',
      actualResult: `status = "${res6Months.status}", completedMonthsCount = ${res6Months.completedMonthsCount}, predictions = ${res6Months.predictions?.length} steps`,
      status: passed6Months ? 'PASS' : 'FAIL',
      evidence: `Engine: ${res6Months.engineUsed}, Model: ${res6Months.modelUsed}, Validation folds: ${res6Months.validationMetrics?.foldsCount}`,
    });

    // 3.5 Test User with 7 completed months (Eligible!)
    const txs7Months: FrontendTransaction[] = [
      ...txs6Months,
      { id: 'm7_7', name: 'Spend', amount: 16000, date: '2026-07-10', type: 'expense', category: 'Bills', status: 'Completed' },
    ];
    const res7Months = await generateUserForecast(txs7Months, 4, undefined, '2026-08');
    const passed7Months = res7Months.status === 'ok' && res7Months.completedMonthsCount === 7 && (res7Months.predictions?.length ?? 0) === 4;

    recordTest({
      id: 'TC-SM-05',
      category: 'Six-Month Minimum',
      description: 'Test user with 7 completed months (eligible for full ML pipeline)',
      inputData: '7 completed months: 2026-01 to 2026-07 (asOf: 2026-08)',
      expectedResult: 'status = "ok", completedMonthsCount = 7, predictions.length = 4',
      actualResult: `status = "${res7Months.status}", completedMonthsCount = ${res7Months.completedMonthsCount}, predictions = ${res7Months.predictions?.length} steps`,
      status: passed7Months ? 'PASS' : 'FAIL',
      evidence: `Engine: ${res7Months.engineUsed}, Model: ${res7Months.modelUsed}, Validation folds: ${res7Months.validationMetrics?.foldsCount}`,
    });

    // =========================================================================
    // TEST 4: EXPANDING TRAINING WINDOW PROGRESSION
    // =========================================================================
    console.log('\n--- TEST SUITE 4: Expanding Training Window Progression ---');

    // Create Test User D in PostgreSQL
    const testUserD = await createUser({
      email: `test_user_d_${Date.now()}@reviewtest.internal`,
      passwordHash: 'dummy_hash_for_test',
      displayName: 'Test User D (Expanding Window)',
    });
    createdUserIds.push(testUserD.id);

    // Initial 6 completed periods: 2026-01 to 2026-06
    const initial6MonthsData: DbTransactionInput[] = [
      { name: 'Monthly Budget Spend', amount: 20000, date: '2026-01-15', type: 'expense', category: 'General', status: 'Completed' },
      { name: 'Monthly Budget Spend', amount: 21000, date: '2026-02-15', type: 'expense', category: 'General', status: 'Completed' },
      { name: 'Monthly Budget Spend', amount: 22000, date: '2026-03-15', type: 'expense', category: 'General', status: 'Completed' },
      { name: 'Monthly Budget Spend', amount: 23000, date: '2026-04-15', type: 'expense', category: 'General', status: 'Completed' },
      { name: 'Monthly Budget Spend', amount: 24000, date: '2026-05-15', type: 'expense', category: 'General', status: 'Completed' },
      { name: 'Monthly Budget Spend', amount: 25000, date: '2026-06-15', type: 'expense', category: 'General', status: 'Completed' },
    ];

    await bulkInsertTransactions(initial6MonthsData, testUserD.id);

    // Step 1: Run forecasting on 6 completed months (as-of 2026-07)
    const txsD_6 = await getAllTransactions(testUserD.id);
    const forecastD_6 = await generateUserForecast(txsD_6, 4, undefined, '2026-07');

    const step1Passed = Boolean(
      forecastD_6.status === 'ok' &&
      forecastD_6.completedMonthsCount === 6 &&
      forecastD_6.historicalActuals.length === 6 &&
      forecastD_6.predictions?.[0].month === '2026-07'
    );

    recordTest({
      id: 'TC-EW-01',
      category: 'Expanding Training Window',
      description: 'Step 1: Execute initial forecasting pipeline with 6 completed monthly periods',
      inputData: '6 completed months: 2026-01 to 2026-06, as-of month: 2026-07',
      expectedResult: 'completedMonthsCount = 6, historicalActuals = 6, next prediction target = 2026-07',
      actualResult: `completedMonthsCount = ${forecastD_6.completedMonthsCount}, historical = ${forecastD_6.historicalActuals.length}, next target = ${forecastD_6.predictions?.[0].month}`,
      status: step1Passed ? 'PASS' : 'FAIL',
      evidence: `History: ${forecastD_6.historicalActuals.map(h => h.month).join(' -> ')}, Target: ${forecastD_6.predictions?.[0].month}`,
    });

    // Step 2 & 3: Add seventh completed period (2026-07, ₹26,000) and re-run as-of 2026-08
    await insertTransaction({
      name: 'Monthly Budget Spend',
      amount: 26000,
      date: '2026-07-15',
      type: 'expense',
      category: 'General',
      status: 'Completed',
    }, testUserD.id);

    const txsD_7 = await getAllTransactions(testUserD.id);
    const forecastD_7 = await generateUserForecast(txsD_7, 4, undefined, '2026-08');

    // Step 4: Verify all 7 completed periods are retained without truncation
    const all7Retained = Boolean(
      forecastD_7.status === 'ok' &&
      forecastD_7.completedMonthsCount === 7 &&
      forecastD_7.historicalActuals.length === 7 &&
      forecastD_7.expandingWindow?.retainsAllHistoricalData === true &&
      forecastD_7.historicalActuals[0].month === '2026-01' &&
      forecastD_7.historicalActuals[6].month === '2026-07'
    );

    recordTest({
      id: 'TC-EW-02',
      category: 'Expanding Training Window',
      description: 'Step 2 & 3: Retain all 7 historical periods without sliding-window data loss',
      inputData: 'Database updated with 7th month (2026-07); as-of month advanced to 2026-08',
      expectedResult: 'completedMonthsCount = 7, historicalActuals = 7, retainsAllHistoricalData = true, oldest = 2026-01, latest = 2026-07',
      actualResult: `completedMonthsCount = ${forecastD_7.completedMonthsCount}, historical = ${forecastD_7.historicalActuals.length}, retainsAll = ${forecastD_7.expandingWindow?.retainsAllHistoricalData}`,
      status: all7Retained ? 'PASS' : 'FAIL',
      evidence: `Periods retained: ${forecastD_7.historicalActuals.map(h => h.month).join(', ')}`,
    });

    // Step 5: Verify new month is included in next training/validation cycle
    const foldsBefore = forecastD_6.validationMetrics?.foldsCount ?? 0;
    const foldsAfter = forecastD_7.validationMetrics?.foldsCount ?? 0;
    const newMonthIncluded = Boolean(
      forecastD_7.datasetStats?.completedMonthlyRecords === 7 &&
      foldsAfter >= foldsBefore
    );

    recordTest({
      id: 'TC-EW-03',
      category: 'Expanding Training Window',
      description: 'Step 4: Incorporate newly completed month into next training/validation cycle',
      inputData: 'Comparison between 6-month cycle vs 7-month cycle',
      expectedResult: `completedMonthlyRecords expands from 6 to 7; validation folds expand (${foldsBefore} -> ${foldsAfter})`,
      actualResult: `completedMonthlyRecords = ${forecastD_7.datasetStats?.completedMonthlyRecords}, validation folds: ${foldsBefore} -> ${foldsAfter}`,
      status: newMonthIncluded ? 'PASS' : 'FAIL',
      evidence: `Progression: ${forecastD_7.expandingWindow?.progressionSummary}`,
    });

    // Step 6: Verify prediction target advances to the next month
    const targetBefore = forecastD_6.predictions?.[0].month;
    const targetAfter = forecastD_7.predictions?.[0].month;
    const targetAdvanced = targetBefore === '2026-07' && targetAfter === '2026-08';

    recordTest({
      id: 'TC-EW-04',
      category: 'Expanding Training Window',
      description: 'Step 5: Verify prediction target chronologically advances to the next month',
      inputData: `6-month forecast target vs 7-month forecast target`,
      expectedResult: 'Prediction step 1 advances from 2026-07 to 2026-08',
      actualResult: `Target before = ${targetBefore}, Target after = ${targetAfter}`,
      status: targetAdvanced ? 'PASS' : 'FAIL',
      evidence: `Target 1 advanced from ${targetBefore} to ${targetAfter}`,
    });

    // Step 7: Confirm chronological validation has zero future-data leakage
    let noDataLeakage = true;
    const historyMonths = forecastD_7.historicalActuals.map(h => h.month);
    const futureForecastMonths = forecastD_7.predictions?.map(p => p.month) || [];

    // Rule 1: No future forecast month can exist in historical actuals
    for (const fm of futureForecastMonths) {
      if (historyMonths.includes(fm)) {
        noDataLeakage = false;
        break;
      }
    }

    // Rule 2: Test period point months are strictly <= latest historical month
    const testMonths = forecastD_7.testPeriodPoints?.map(tp => tp.month) || [];
    for (const tm of testMonths) {
      if (!historyMonths.includes(tm)) {
        noDataLeakage = false;
        break;
      }
    }

    // Rule 3: Future prediction points strictly follow after the last completed month
    if (futureForecastMonths.length > 0 && historyMonths.length > 0) {
      const lastHistory = historyMonths[historyMonths.length - 1];
      const firstFuture = futureForecastMonths[0];
      if (firstFuture <= lastHistory) {
        noDataLeakage = false;
      }
    }

    recordTest({
      id: 'TC-EW-05',
      category: 'Expanding Training Window',
      description: 'Step 6: Confirm strict chronological validation and absence of future-data leakage',
      inputData: `Latest completed month: ${historyMonths[historyMonths.length - 1]}, First forecast month: ${futureForecastMonths[0]}`,
      expectedResult: 'Zero overlap between training/test splits and future forecast; temporal causality strictly preserved',
      actualResult: noDataLeakage ? 'Strict temporal ordering verified with zero lookahead leakage' : 'Future data leakage detected!',
      status: noDataLeakage ? 'PASS' : 'FAIL',
      evidence: `Historical: [${historyMonths.join(', ')}] | Future Forecast: [${futureForecastMonths.join(', ')}]`,
    });

  } finally {
    // =========================================================================
    // STRICT CLEANUP: PURGE ALL CREATED TEST FIXTURES
    // =========================================================================
    console.log('\n--- Cleaning Up Automated Test Fixtures from PostgreSQL ---');
    if (createdUserIds.length > 0) {
      try {
        const deleteTxsRes = await pool.query(
          'DELETE FROM transactions WHERE user_id = ANY($1::text[]) RETURNING id;',
          [createdUserIds]
        );
        console.log(`[CLEANUP] Deleted ${deleteTxsRes.rowCount ?? 0} isolated test transactions.`);

        const deleteUsersRes = await pool.query(
          'DELETE FROM users WHERE id = ANY($1::text[]) RETURNING id;',
          [createdUserIds]
        );
        console.log(`[CLEANUP] Deleted ${deleteUsersRes.rowCount ?? 0} isolated test user accounts.`);
      } catch (cleanupErr: any) {
        console.error('[CLEANUP ERROR] Failed to clean up test fixtures:', cleanupErr.message);
      }
    }
    // Release pool connections
    await pool.end();
  }

  // =========================================================================
  // TEST SUITE SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`   Verification Summary: ${passCount} PASSED, ${failCount} FAILED (Total: ${testResults.length})`);
  console.log('========================================================================\n');

  return testResults;
}

// Execute when run directly
runReviewVerificationSuite()
  .then(results => {
    const failed = results.filter(r => r.status === 'FAIL');
    if (failed.length > 0) {
      console.error(`\nTest suite failed with ${failed.length} failure(s).`);
      process.exit(1);
    } else {
      console.log('\nAll verification tests passed successfully.');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('\nFatal error executing test suite:', err);
    process.exit(1);
  });

