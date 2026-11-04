import { parseCSVStatement } from '../src/services/csvParser.js';
import { bulkInsertTransactions, getAllTransactions } from './repositories/transactionRepository.js';
import { createUser } from './repositories/userRepository.js';
import { hashPassword } from './services/authService.js';
import { generateUserForecast } from './services/mlForecastService.js';
import { getDbPool } from './db.js';

async function runTests() {
  console.log('=== FinSight AI New User Onboarding & CSV Bulk Import Verification ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failCount++;
    }
  }

  try {
    // ----------------------------------------------------
    // Test 1: CSV Parser with various formats and skipped rows
    // ----------------------------------------------------
    console.log('--- 1. Testing CSV Bank Statement Parsing & Line Tracking ---');
    const sampleCsv = `Date,Description,Debit,Credit,Balance
01-10-2026,"Opening Balance",,,"50,000.00"
02-10-2026,"Swiggy Order #8921","₹ 450.50",,49549.50
03-10-2026,"Salary Credit",,"₹ 75,000.00",124549.50
04-10-2026,"Invalid row with no amounts and no balance",,,
05-10-2026,"Coffee House - Debit only",Rs. 180,,124369.50
06-10-2026,"Interest Credit",,125.00,124494.50
07-10-2026,"Closing Balance Summary",,,"1,24,494.50"
`;

    const parsed = parseCSVStatement(sampleCsv, 'sample.csv', []);
    assert(parsed.totalLines === 8, `Total lines parsed: expected 8 (header + 7 rows), got ${parsed.totalLines}`);
    assert(parsed.validCount === 4, `Valid transaction count: expected 4, got ${parsed.validCount}`);
    assert(parsed.errors.length === 3, `Skipped rows count: expected 3, got ${parsed.errors.length}`);

    // Verify row 2 is opening balance (skipped with balance summary reason)
    const row2Error = parsed.errors.find(e => e.row === 2);
    assert(!!row2Error && row2Error.reason.toLowerCase().includes('balance summary'), `Row 2 detected as balance summary row (${row2Error?.reason})`);

    // Verify row 5 is missing amount
    const row5Error = parsed.errors.find(e => e.row === 5);
    assert(!!row5Error && row5Error.reason.toLowerCase().includes('missing or non-numeric amount'), `Row 5 detected as missing amount (${row5Error?.reason})`);

    // Verify debit transaction amount and type
    const swiggyTx = parsed.candidates.find(c => c.name.includes('Swiggy'));
    assert(!!swiggyTx && swiggyTx.amount === 450.5 && swiggyTx.type === 'expense', `Swiggy expense amount: 450.5, type: expense`);

    // Verify credit transaction amount and type
    const salaryTx = parsed.candidates.find(c => c.name.includes('Salary'));
    assert(!!salaryTx && salaryTx.amount === 75000 && salaryTx.type === 'income', `Salary income amount: 75000, type: income`);

    // ----------------------------------------------------
    // Test 2: 408-row Statement Simulation (395 valid, 13 skipped)
    // ----------------------------------------------------
    console.log('\n--- 2. Testing 408-Row Large Statement Parsing ---');
    let largeCsv = 'Date,Description,Debit,Credit,Balance\n';
    let expectedValid = 0;
    let expectedSkipped = 0;

    for (let i = 1; i <= 408; i++) {
      if (i % 31 === 0) {
        // Month-end balance row
        largeCsv += `2026-10-${(i % 28) + 1},"Month End Balance",,,"1,00,000.00"\n`;
        expectedSkipped++;
      } else {
        if (i % 2 === 0) {
          largeCsv += `2026-10-${(i % 28) + 1},"Expense Merchant ${i}","₹ ${i * 10}.50",,"${50000 - i * 10}"\n`;
        } else {
          largeCsv += `2026-10-${(i % 28) + 1},"Income Deposit ${i}",,"Rs. ${i * 50}.00","${50000 + i * 50}"\n`;
        }
        expectedValid++;
      }
    }

    const largeParsed = parseCSVStatement(largeCsv, 'large.csv', []);
    assert(largeParsed.validCount === expectedValid, `408-row statement valid rows: expected ${expectedValid}, got ${largeParsed.validCount}`);
    assert(largeParsed.errors.length === expectedSkipped, `408-row statement skipped rows: expected ${expectedSkipped}, got ${largeParsed.errors.length}`);
    assert(largeParsed.candidates.every(c => c.amount > 0), 'All candidate amounts are strictly positive numbers');

    // ----------------------------------------------------
    // Test 3: New User Registration & Account Isolation
    // ----------------------------------------------------
    console.log('\n--- 3. Testing New User Registration & Scoped Ledger ---');
    const testEmailUserA = `test_user_a_${Date.now()}@finsight.ai`;
    const passwordHashA = await hashPassword('password123');
    const userA = await createUser({
      email: testEmailUserA,
      passwordHash: passwordHashA,
      displayName: 'Aarav Mehta',
      monthlyIncome: 50000,
    });
    assert(!!userA && userA.name === 'Aarav Mehta', `User A created with full name "Aarav Mehta": ${userA.id}`);

    // Verify empty ledger for new user
    const userATxs = await getAllTransactions(userA.id, 100, 0);
    assert(userATxs.length === 0, `User A initial transaction count in database is 0 (got ${userATxs.length})`);

    // Verify Forecast for new user returns insufficient_data
    const forecastUserA = await generateUserForecast(userATxs, 4);
    assert(
      forecastUserA.status === 'insufficient_data',
      `User A forecast status is 'insufficient_data' (got '${forecastUserA.status}')`
    );
    assert(
      forecastUserA.completedMonthsCount === 0,
      `User A completed months count is 0 (got ${forecastUserA.completedMonthsCount})`
    );

    // ----------------------------------------------------
    // Test 4: Bulk Import with Deterministic IDs & Batching
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Bulk Import Batching & Retry Idempotency ---');
    const testBatchTxs = largeParsed.candidates.slice(0, 100).map((c, idx) => ({
      id: `tx_det_${c.date.replace(/[^0-9]/g, '')}_${Math.round(c.amount * 100)}_${idx}`,
      name: c.name,
      amount: c.amount,
      category: c.category,
      type: c.type,
      date: c.date,
      paymentMethod: 'Bank Transfer',
      status: 'Completed' as const,
    }));

    // First insertion of 100 transactions
    const insertResult1 = await bulkInsertTransactions(testBatchTxs, userA.id, 'skip');
    assert(insertResult1.inserted.length === 100, `First bulk insert: 100 transactions inserted`);
    assert(insertResult1.skippedCount === 0, `First bulk insert: 0 skipped`);

    // Verify user A now has 100 transactions
    const userATxsAfter = await getAllTransactions(userA.id, 500, 0);
    assert(userATxsAfter.length === 100, `User A now has 100 transactions in database`);

    // Retry insertion of the EXACT same 100 transactions (Idempotency test)
    const insertResult2 = await bulkInsertTransactions(testBatchTxs, userA.id, 'skip');
    assert(
      insertResult2.inserted.length === 0,
      `Idempotent retry: 0 duplicate transactions inserted on retry (got ${insertResult2.inserted.length})`
    );
    assert(
      insertResult2.skippedCount === 100,
      `Idempotent retry: all 100 existing transactions cleanly skipped via ON CONFLICT (id) DO NOTHING`
    );

    // Verify total count in DB remains strictly 100 (no duplicate rows created)
    const userATxsAfterRetry = await getAllTransactions(userA.id, 500, 0);
    assert(userATxsAfterRetry.length === 100, `Database transaction count remained 100 after retry (no duplicates)`);

    // ----------------------------------------------------
    // Test 5: Multi-Tenant Account Isolation
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Multi-Tenant Account Isolation ---');
    const testEmailUserB = `test_user_b_${Date.now()}@finsight.ai`;
    const passwordHashB = await hashPassword('password123');
    const userB = await createUser({
      email: testEmailUserB,
      passwordHash: passwordHashB,
      displayName: 'Sneha Patel',
      monthlyIncome: 60000,
    });
    assert(!!userB && userB.name === 'Sneha Patel', `User B created: ${userB.id}`);

    // Verify User B cannot see User A's 100 transactions
    const userBTxs = await getAllTransactions(userB.id, 100, 0);
    assert(userBTxs.length === 0, `User B sees 0 transactions (User A's 100 transactions remain isolated)`);

    // Clean up test users from database to leave DB clean
    const pool = getDbPool();
    if (pool) {
      await pool.query('DELETE FROM transactions WHERE user_id = $1 OR user_id = $2;', [userA.id, userB.id]);
      await pool.query('DELETE FROM users WHERE id = $1 OR id = $2;', [userA.id, userB.id]);
      console.log('Cleaned up ephemeral test user records from database.');
    }

    console.log(`\n=== Verification Summary: ${passCount} Passed, ${failCount} Failed ===`);
    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
