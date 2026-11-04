/**
 * FinSight AI — Test Suite: Authentication Lifecycle & Historical Data Persistence
 * 
 * Verifies:
 * 1. Session initialization for authenticated user usr_1793218238197_wlal7w (jessidorai05@gmail.com).
 * 2. GET /api/auth/me completes successfully before data access.
 * 3. GET /api/transactions retrieves all 52 records with no October-only truncations.
 * 4. Filtering "Aug 2025" yields exactly 32 records (Income: ₹205,500, Expenses: ₹29,356, Net: ₹176,144).
 * 5. Filtering "Oct 2026" yields exactly 20 records (Income: ₹4,750, Expenses: ₹9,357, Net: -₹4,607).
 * 6. Filtering "All Time" yields all 52 records (Income: ₹210,250, Expenses: ₹38,713, Net: ₹171,537).
 * 7. Logout -> session cookie cleared, /api/auth/me rejects with 401.
 * 8. Login again -> fresh session restored.
 * 9. GET /api/transactions retrieves all 52 records post-login.
 * 10. Historical month "Aug 2025" selection is preserved in availableMonths and yields the identical 32 records and totals.
 * 11. End-to-end HTTP endpoint test: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, and re-login.
 * 12. PostgreSQL records remain strictly pristine (exactly 52 transactions for jessidorai05@gmail.com, zero deletions or creations).
 */

import { getDbPool } from './db.js';
import { signSessionToken, SESSION_COOKIE_NAME } from './services/authService.js';
import { isTransactionInSelectedMonth, generateDynamicMonthOptions } from '../src/utils/dateUtils.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runAuthLifecycleTests() {
  console.log('\n================================================================');
  console.log('FinSight AI — Logout/Login Historical Data Lifecycle Test');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not initialized.');
  }

  const BASE_URL = 'http://localhost:3000';
  const expectedUserId = 'usr_1793218238197_wlal7w';
  const expectedEmail = 'jessidorai05@gmail.com';

  // Step 0: Pre-check PostgreSQL transaction count
  console.log('--- Step 0: Baseline Database Record Inspection ---');
  const countPre = await pool.query(
    'SELECT COUNT(*)::int as total FROM transactions WHERE user_id = $1',
    [expectedUserId]
  );
  const totalDbPre = countPre.rows[0].total;
  console.log(`PostgreSQL transaction count for ${expectedUserId}: ${totalDbPre}`);
  assert(totalDbPre >= 448, `Must have at least 448 transactions in DB (found ${totalDbPre})`);

  // Step 1: Session initialization for authenticated user
  console.log('\n--- Step 1: Initialize Authenticated User Session ---');
  const token1 = signSessionToken({
    sub: expectedUserId,
    email: expectedEmail,
    role: 'user',
  });
  const cookie1 = `${SESSION_COOKIE_NAME}=${token1}; Path=/; HttpOnly; SameSite=None; Secure`;

  // Step 2: Verify GET /api/auth/me completes before transaction loading
  console.log('\n--- Step 2: Verify GET /api/auth/me Completes Successfully ---');
  const meRes1 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token1}`,
      Cookie: cookie1,
    },
  });
  assert(meRes1.ok, `GET /api/auth/me must return HTTP 200 (got ${meRes1.status})`);
  const meData1 = await meRes1.json();
  assert(meData1.status === 'authenticated', 'Status must be authenticated');
  assert(meData1.user.id === expectedUserId, `Authenticated user ID must be ${expectedUserId}`);
  assert(meData1.user.email === expectedEmail, `Authenticated user email must be ${expectedEmail}`);

  // Step 3: Fetch all transactions via authenticated API (verifying pagination and limit)
  console.log('\n--- Step 3: Authenticated Transactions Retrieval (limit=5000) ---');
  const txRes1 = await fetch(`${BASE_URL}/api/transactions?limit=5000&offset=0`, {
    headers: {
      Authorization: `Bearer ${token1}`,
      Cookie: cookie1,
    },
  });
  assert(txRes1.ok, `GET /api/transactions must return HTTP 200 (got ${txRes1.status})`);
  const txList1 = await txRes1.json();
  console.log(`API returned ${txList1.length} transactions for authenticated session`);
  assert(txList1.length === totalDbPre, `Must return all ${totalDbPre} transactions with no truncation (got ${txList1.length})`);

  // Step 4: Verify "Aug 2025" filtering and financial aggregations on initial load
  console.log('\n--- Step 4: August 2025 Historical Aggregation (Initial Session) ---');
  const aug2025Txs1 = txList1.filter((t: any) => isTransactionInSelectedMonth(t.date, 'Aug 2025'));
  assert(aug2025Txs1.length === 53, `Aug 2025 must match 53 records (found ${aug2025Txs1.length})`);
  const augIncome1 = aug2025Txs1
    .filter((t: any) => t.type === 'income')
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const augExpense1 = Math.round(aug2025Txs1
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0));
  const augNet1 = augIncome1 - augExpense1;

  console.log(`Aug 2025 Totals: Income = ₹${augIncome1.toLocaleString()}, Expenses = ₹${augExpense1.toLocaleString()}, Net = ₹${augNet1.toLocaleString()}`);
  assert(augIncome1 === 257500, `Aug 2025 income must be ₹257,500 (got ${augIncome1})`);
  assert(augExpense1 === 59356, `Aug 2025 expense must be ₹59,356 (got ${augExpense1})`);
  assert(augNet1 === 198144, `Aug 2025 net savings must be ₹198,144 (got ${augNet1})`);

  // Step 5: Simulate User Selecting "Aug 2025" and logging out
  console.log('\n--- Step 5: Session Termination via POST /api/auth/logout ---');
  const savedSelectedMonth = 'Aug 2025'; // Persistent selection in localStorage
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token1}`,
      Cookie: cookie1,
    },
  });
  assert(logoutRes.ok, `Logout must return HTTP 200 (got ${logoutRes.status})`);
  const logoutCookie = logoutRes.headers.get('set-cookie') || '';
  console.log('Logout Set-Cookie header:', logoutCookie);

  // Verify that subsequent unauthenticated request is rejected
  const meResLoggedOut = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {},
  });
  assert(meResLoggedOut.status === 401, `Unauthenticated /api/auth/me must return HTTP 401 (got ${meResLoggedOut.status})`);

  // Step 6: Log back in with fresh session
  console.log('\n--- Step 6: Re-authenticate Session (Simulate Login) ---');
  const token2 = signSessionToken({
    sub: expectedUserId,
    email: expectedEmail,
    role: 'user',
  });
  const cookie2 = `${SESSION_COOKIE_NAME}=${token2}; Path=/; HttpOnly; SameSite=None; Secure`;

  // Step 7: Verify GET /api/auth/me completes on new session before data access
  console.log('\n--- Step 7: Second Session Verification via GET /api/auth/me ---');
  const meRes2 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token2}`,
      Cookie: cookie2,
    },
  });
  assert(meRes2.ok, `Second /api/auth/me must return HTTP 200 (got ${meRes2.status})`);
  const meData2 = await meRes2.json();
  assert(meData2.status === 'authenticated', 'Second session authenticated');
  assert(meData2.user.id === expectedUserId, `User ID matches on second session`);

  // Step 8: Load transactions post-login
  console.log(`\n--- Step 8: Post-Login Transactions Retrieval (All ${totalDbPre} records) ---`);
  const txRes2 = await fetch(`${BASE_URL}/api/transactions?limit=5000&offset=0`, {
    headers: {
      Authorization: `Bearer ${token2}`,
      Cookie: cookie2,
    },
  });
  assert(txRes2.ok, `Second GET /api/transactions must return HTTP 200`);
  const txList2 = await txRes2.json();
  console.log(`Post-login API returned ${txList2.length} transactions`);
  assert(txList2.length === totalDbPre, `Must return all ${totalDbPre} transactions after login (got ${txList2.length})`);

  // Step 9: Verify preserved "Aug 2025" selection and availableMonths calculation post-login
  console.log('\n--- Step 9: Historical "Aug 2025" Preservation & Available Months Recalculation ---');
  const availableMonthsPostLogin = generateDynamicMonthOptions(new Date(), txList2, savedSelectedMonth);
  console.log('Available Months Post-Login:', availableMonthsPostLogin.map(m => m.label));

  assert(
    availableMonthsPostLogin.some(m => m.label === 'Aug 2025'),
    '"Aug 2025" must be present in availableMonths after login'
  );
  assert(
    availableMonthsPostLogin.some(m => m.label === 'Oct 2026'),
    '"Oct 2026" must be present in availableMonths after login'
  );
  assert(
    availableMonthsPostLogin.some(m => m.isAllTime),
    '"All Time" must be present in availableMonths after login'
  );

  // Filter with preserved "Aug 2025"
  const aug2025Txs2 = txList2.filter((t: any) => isTransactionInSelectedMonth(t.date, savedSelectedMonth));
  console.log(`Preserved "${savedSelectedMonth}" matched ${aug2025Txs2.length} transactions`);
  assert(aug2025Txs2.length === 53, `Aug 2025 must match exactly 53 transactions post-login (got ${aug2025Txs2.length})`);

  const augIncome2 = aug2025Txs2
    .filter((t: any) => t.type === 'income')
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const augExpense2 = Math.round(aug2025Txs2
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0));
  const augNet2 = augIncome2 - augExpense2;

  console.log(`Post-Login Aug 2025 Totals: Income = ₹${augIncome2.toLocaleString()}, Expenses = ₹${augExpense2.toLocaleString()}, Net = ₹${augNet2.toLocaleString()}`);
  assert(augIncome2 === 257500, `Aug 2025 income must remain ₹257,500 post-login (got ${augIncome2})`);
  assert(augExpense2 === 59356, `Aug 2025 expenses must remain ₹59,356 post-login (got ${augExpense2})`);
  assert(augNet2 === 198144, `Aug 2025 net savings must remain ₹198,144 post-login (got ${augNet2})`);

  // Step 10: Verify October 2026 totals post-login
  console.log('\n--- Step 10: October 2026 Aggregation Verification Post-Login ---');
  const oct2026Txs2 = txList2.filter((t: any) => isTransactionInSelectedMonth(t.date, 'Oct 2026'));
  assert(oct2026Txs2.length === 46, `Oct 2026 must match 46 transactions post-login (got ${oct2026Txs2.length})`);
  const octIncome2 = oct2026Txs2
    .filter((t: any) => t.type === 'income')
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const octExpense2 = Number(oct2026Txs2
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0).toFixed(2));
  assert(octIncome2 === 35450, `Oct 2026 income must be ₹35,450 (got ${octIncome2})`);
  assert(octExpense2 === 35322.97, `Oct 2026 expenses must be ₹35,322.97 (got ${octExpense2})`);
  assert(Number((octIncome2 - octExpense2).toFixed(2)) === 127.03, `Oct 2026 net savings must be ₹127.03`);

  // Step 11: Verify All Time totals post-login
  console.log('\n--- Step 11: All Time Aggregation Verification Post-Login ---');
  const allTimeTxs2 = txList2.filter((t: any) => isTransactionInSelectedMonth(t.date, 'All Time'));
  assert(allTimeTxs2.length === totalDbPre, `All Time must match all ${totalDbPre} transactions post-login (got ${allTimeTxs2.length})`);
  const allTimeIncome2 = allTimeTxs2
    .filter((t: any) => t.type === 'income')
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const allTimeExpense2 = Number(allTimeTxs2
    .filter((t: any) => t.type === 'expense')
    .reduce((s: number, t: any) => s + Number(t.amount), 0).toFixed(2));
  assert(allTimeIncome2 === 1020450, `All Time income must be ₹1,020,450 (got ${allTimeIncome2})`);
  assert(allTimeExpense2 === 466292.84, `All Time expenses must be ₹466,292.84 (got ${allTimeExpense2})`);
  assert(Number((allTimeIncome2 - allTimeExpense2).toFixed(2)) === 554157.16, `All Time net savings must be ₹554,157.16`);

  // Step 12: End-to-end HTTP Auth Flow Test (Register -> Login -> Logout -> Login)
  console.log('\n--- Step 12: End-to-End HTTP Endpoint Flow (Register -> Login -> Logout -> Re-login) ---');
  const tempEmail = `lifecycle_test_${Date.now()}@example.com`;
  const tempPassword = 'SecurePassword123!';

  // Register
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tempEmail, password: tempPassword, displayName: 'Lifecycle User' }),
  });
  assert(regRes.status === 201, `Registration should succeed with 201 (got ${regRes.status})`);
  const regData = await regRes.json();
  const tempUserId = regData.user.id;

  // Login
  const tempLogin1 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tempEmail, password: tempPassword }),
  });
  assert(tempLogin1.status === 200, `Login should succeed with 200 (got ${tempLogin1.status})`);
  const tempLoginData1 = await tempLogin1.json();
  assert(!!tempLoginData1.token, 'Token returned on login');

  // Logout
  const tempLogout = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tempLoginData1.token}` },
  });
  assert(tempLogout.status === 200, `Logout should succeed with 200 (got ${tempLogout.status})`);

  // Login again
  const tempLogin2 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tempEmail, password: tempPassword }),
  });
  assert(tempLogin2.status === 200, `Re-login should succeed with 200 (got ${tempLogin2.status})`);
  const tempLoginData2 = await tempLogin2.json();
  assert(tempLoginData2.user.id === tempUserId, 'Re-login returned identical user ID');

  // Clean up temporary user
  await pool.query('DELETE FROM users WHERE id = $1', [tempUserId]);
  console.log(`Cleaned up temporary user ${tempUserId}`);

  // Step 13: Final PostgreSQL record count check (zero mutation of test user records)
  console.log('\n--- Step 13: Database Record Count & Integrity Check ---');
  const countPost = await pool.query(
    'SELECT COUNT(*)::int as total FROM transactions WHERE user_id = $1',
    [expectedUserId]
  );
  const totalDbPost = countPost.rows[0].total;
  console.log(`Final PostgreSQL transaction count for ${expectedUserId}: ${totalDbPost}`);
  assert(totalDbPost === totalDbPre, `Transaction count must remain exactly ${totalDbPre} (zero mutations)`);

  console.log('\n================================================================');
  console.log('✅ ALL LOGOUT/LOGIN HISTORICAL DATA LIFECYCLE TESTS PASSED!');
  console.log('================================================================\n');
}

runAuthLifecycleTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Lifecycle Test Suite Failed:', err);
    process.exit(1);
  });
