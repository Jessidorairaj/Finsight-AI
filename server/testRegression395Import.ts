/**
 * FinSight AI — Regression Test Suite
 * Task: Import 395 transactions and verify they appear immediately for the authenticated user.
 * 
 * Verifies:
 * 1. Existing user usr_1793694459965_qsmsix retains all 395 transactions in Neon DB.
 * 2. Authenticated GET /api/transactions as user returns all 395 records with HTTP 200.
 * 3. A fresh user importing the identical 395 CSV transactions receives all 395 records
 *    without cross-tenant primary key collision drops.
 * 4. Idempotent re-import skips duplicates cleanly without mutating total count.
 * 5. Dashboard calculations for All Time reflect genuine non-zero totals.
 * 6. Clean up of test user leaves persistent data pristine.
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDbPool } from './db.js';
import { signSessionToken, SESSION_COOKIE_NAME } from './services/authService.js';
import { getAllTransactions } from './repositories/transactionRepository.js';
import { deleteUserById } from './repositories/userRepository.js';

const BASE_URL = 'http://localhost:3000';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runRegressionSuite() {
  console.log('\n================================================================');
  console.log('FinSight AI — Regression Test: 395 Transactions Import & Visibility');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not available');
  }

  // -------------------------------------------------------------
  // Test 1: Verify persistent user usr_1793694459965_qsmsix data
  // -------------------------------------------------------------
  console.log('--- Test 1: Baseline Inspection for usr_1793694459965_qsmsix ---');
  const userAId = 'usr_1793694459965_qsmsix';
  const userAEmail = 'jessi@gmail.com';

  const countResA = await pool.query(
    'SELECT count(*)::int as total FROM transactions WHERE user_id = $1',
    [userAId]
  );
  const totalA = countResA.rows[0].total;
  console.log(`Database count for ${userAId}: ${totalA}`);
  assert(totalA === 395, `Database must contain exactly 395 transactions for ${userAId} (found ${totalA})`);

  // -------------------------------------------------------------
  // Test 2: Call transactions API as user usr_1793694459965_qsmsix
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Authenticated GET /api/transactions for usr_1793694459965_qsmsix ---');
  const tokenA = signSessionToken({ sub: userAId, email: userAEmail, role: 'user' });
  const cookieA = `${SESSION_COOKIE_NAME}=${tokenA}; Path=/; HttpOnly; SameSite=None; Secure`;

  const apiResA = await fetch(`${BASE_URL}/api/transactions?limit=5000&offset=0`, {
    headers: {
      Authorization: `Bearer ${tokenA}`,
      Cookie: cookieA,
    },
  });
  assert(apiResA.ok, `GET /api/transactions must return HTTP 200 (got ${apiResA.status})`);
  const dataA = await apiResA.json();
  assert(Array.isArray(dataA), 'API response must be an array of transactions');
  assert(dataA.length === 395, `API must return all 395 transactions for ${userAId} (got ${dataA.length})`);

  // -------------------------------------------------------------
  // Test 3: Fresh User Importing the Identical 395 Statement Transactions
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Fresh User Importing 395 CSV Transactions ---');
  const testUserEmail = `reg_tester_${Date.now()}@finsight.ai`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUserEmail,
      password: 'Password123!',
      displayName: 'Import Regression Tester',
      monthlyIncome: 75000,
    }),
  });
  assert(regRes.status === 201, `User registration succeeded (got ${regRes.status})`);
  const regData = await regRes.json();
  const testUserId = regData.user.id;
  const testToken = regData.token;
  const testCookie = `${SESSION_COOKIE_NAME}=${testToken}; Path=/; HttpOnly; SameSite=None; Secure`;

  console.log(`Registered fresh user: ${testUserId} (${testUserEmail})`);

  // Verify initial transaction count is 0
  const initialTxs = await getAllTransactions(testUserId, 100, 0);
  assert(initialTxs.length === 0, `Initial transaction count for new user must be 0 (got ${initialTxs.length})`);

  // Prepare batch of 395 transactions using the same IDs/payload as User A
  // (Simulates importing the same bank statement CSV)
  const candidateBatch = dataA.map((t: any) => ({
    id: t.id, // Potentially colliding ID
    name: t.name,
    category: t.category,
    amount: Number(t.amount),
    date: t.date,
    type: t.type,
    paymentMethod: t.paymentMethod,
    status: t.status,
  }));

  console.log(`Submitting 395 transactions in 50-item batches to POST /api/transactions/bulk for ${testUserId}...`);
  const batchSize = 50;
  let totalImportedForTestUser = 0;

  for (let b = 0; b < Math.ceil(candidateBatch.length / batchSize); b++) {
    const chunk = candidateBatch.slice(b * batchSize, (b + 1) * batchSize);
    const bulkRes = await fetch(`${BASE_URL}/api/transactions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
        Cookie: testCookie,
      },
      body: JSON.stringify({ transactions: chunk, onConflict: 'skip' }),
    });

    assert(bulkRes.status === 201, `Batch ${b + 1} bulk insert returned HTTP 201 (got ${bulkRes.status})`);
    const bulkData = await bulkRes.json();
    totalImportedForTestUser += bulkData.insertedCount;
  }

  console.log(`Total transactions inserted for new user: ${totalImportedForTestUser}`);
  assert(totalImportedForTestUser === 395, `Must insert all 395 transactions without cross-tenant collisions (got ${totalImportedForTestUser})`);

  // -------------------------------------------------------------
  // Test 4: Verify All 395 Transactions Appear for the Authenticated User
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Authenticated Retrieval of 395 Transactions for New User ---');
  const apiResNewUser = await fetch(`${BASE_URL}/api/transactions?limit=5000&offset=0`, {
    headers: {
      Authorization: `Bearer ${testToken}`,
      Cookie: testCookie,
    },
  });
  assert(apiResNewUser.ok, `GET /api/transactions returned HTTP 200 for new user`);
  const dataNewUser = await apiResNewUser.json();
  assert(dataNewUser.length === 395, `New user must see all 395 imported transactions (got ${dataNewUser.length})`);

  // Verify financial totals are non-zero
  const totalIncome = dataNewUser
    .filter((t: any) => t.type === 'income')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const totalExpenses = dataNewUser
    .filter((t: any) => t.type === 'expense')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  console.log(`Imported totals for ${testUserId}: Income = ₹${totalIncome.toLocaleString()}, Expenses = ₹${totalExpenses.toLocaleString()}`);
  assert(totalIncome > 0, `Total income must be non-zero (got ₹${totalIncome})`);
  assert(totalExpenses > 0, `Total expenses must be non-zero (got ₹${totalExpenses})`);

  // -------------------------------------------------------------
  // Test 5: Idempotent Re-Import (Retry deduplication)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Re-import Deduplication for the Same User ---');
  const retryChunk = candidateBatch.slice(0, 50);
  const retryRes = await fetch(`${BASE_URL}/api/transactions/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testToken}`,
      Cookie: testCookie,
    },
    body: JSON.stringify({ transactions: retryChunk, onConflict: 'skip' }),
  });
  assert(retryRes.status === 201, `Retry bulk returned HTTP 201`);
  const retryData = await retryRes.json();
  assert(retryData.insertedCount === 0, `Retry must insert 0 new records (got ${retryData.insertedCount})`);
  assert(retryData.skippedCount === 50, `Retry must skip all 50 duplicate records (got ${retryData.skippedCount})`);

  // Verify DB count remains exactly 395
  const countAfterRetry = await pool.query(
    'SELECT count(*)::int as total FROM transactions WHERE user_id = $1',
    [testUserId]
  );
  assert(countAfterRetry.rows[0].total === 395, `Record count remained exactly 395 after retry (got ${countAfterRetry.rows[0].total})`);

  // -------------------------------------------------------------
  // Clean Up Test User
  // -------------------------------------------------------------
  console.log('\n--- Cleanup: Removing Ephemeral Test User ---');
  await pool.query('DELETE FROM transactions WHERE user_id = $1', [testUserId]);
  await deleteUserById(testUserId);
  console.log(`Cleaned up ephemeral user ${testUserId} and its transactions.`);

  // Final verification that User A records remain exactly 395
  const finalCountA = await pool.query(
    'SELECT count(*)::int as total FROM transactions WHERE user_id = $1',
    [userAId]
  );
  assert(finalCountA.rows[0].total === 395, `User A must still have exactly 395 transactions (found ${finalCountA.rows[0].total})`);

  console.log('\n================================================================');
  console.log('✅ ALL 395 TRANSACTION IMPORT & VISIBILITY REGRESSION TESTS PASSED!');
  console.log('================================================================\n');
}

runRegressionSuite()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Regression Test Suite Failed:', err);
    process.exit(1);
  });

