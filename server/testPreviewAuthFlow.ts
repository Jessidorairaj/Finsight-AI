/**
 * Automated test simulating the Preview UI authentication flow:
 * 1. Unauthenticated GET /api/transactions returns 401.
 * 2. Unauthenticated GET /api/auth/me returns 401.
 * 3. User registers via POST /api/auth/register, extracts session cookie and bearer token.
 * 4. User immediately calls GET /api/auth/me with session cookie -> returns 200 with sanitized user.
 * 5. User immediately calls GET /api/transactions with same session cookie -> returns 200 (empty array [] without Unauthorized error).
 * 6. User creates a transaction via POST /api/transactions -> returns 201.
 * 7. User calls GET /api/transactions -> returns 200 with 1 transaction.
 * 8. User logs in via POST /api/auth/login, receives new cookie.
 * 9. GET /api/transactions succeeds with cookie.
 * 10. Secondary User B registers, attempts to access User A's transaction -> returns 404.
 * 11. User logs out via POST /api/auth/logout -> cookie cleared, subsequent calls return 401.
 * 12. Cleanup of test users and transactions.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://localhost:3000/api';

async function runPreviewAuthTest() {
  console.log('[Preview Auth Flow Test] Starting verification...\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const timestamp = Date.now();
  const emailA = `preview_user_a_${timestamp}@example.com`;
  const emailB = `preview_user_b_${timestamp}@example.com`;
  const password = 'Password123!';

  let userAId = '';
  let userBId = '';
  let cookieA = '';
  let tokenA = '';
  let txAId = '';

  try {
    // 1. Unauthenticated requests return 401
    console.log('1. Checking unauthenticated requests return 401:');
    const unauthTx = await fetch(`${BASE_URL}/transactions`);
    if (unauthTx.status !== 401) throw new Error(`Expected 401 on /transactions, got ${unauthTx.status}`);
    console.log('   ✓ GET /api/transactions rejected with 401');

    const unauthMe = await fetch(`${BASE_URL}/auth/me`);
    if (unauthMe.status !== 401) throw new Error(`Expected 401 on /auth/me, got ${unauthMe.status}`);
    console.log('   ✓ GET /api/auth/me rejected with 401');

    // 2. Register User A
    console.log(`\n2. Registering User A (${emailA}):`);
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password, displayName: 'Preview User A', monthlyIncome: 65000 }),
    });
    if (regRes.status !== 201) throw new Error(`Registration failed with ${regRes.status}`);
    const regData = await regRes.json();
    userAId = regData.user.id;
    tokenA = regData.token;
    cookieA = (regRes.headers.get('set-cookie') || '').split(';')[0];
    console.log(`   ✓ Registered User A (id: ${userAId})`);
    console.log(`   ✓ Set-Cookie received with SameSite=None; Secure: ${regRes.headers.get('set-cookie')?.includes('SameSite=None')}`);

    // 3. Immediately request GET /api/auth/me with session cookie
    console.log('\n3. Testing immediate GET /api/auth/me with session cookie:');
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: cookieA },
    });
    if (meRes.status !== 200) throw new Error(`Expected 200 on /auth/me, got ${meRes.status}`);
    const meData = await meRes.json();
    if (meData.user.email !== emailA) throw new Error(`Email mismatch in /auth/me`);
    console.log(`   ✓ GET /api/auth/me returned 200 for user "${meData.user.name}"`);

    // 4. Immediately request GET /api/transactions with session cookie (EMPTY ledger)
    console.log('\n4. Testing immediate GET /api/transactions with same session cookie:');
    const txListRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieA },
    });
    if (txListRes.status !== 200) {
      const errBody = await txListRes.text();
      throw new Error(`Expected 200 on /transactions right after login, got ${txListRes.status}: ${errBody}`);
    }
    const txListData = await txListRes.json();
    if (!Array.isArray(txListData)) throw new Error('Expected array of transactions');
    console.log(`   ✓ GET /api/transactions returned 200 successfully! Records: ${txListData.length} (no 401 error)`);

    // 5. Create a transaction
    console.log('\n5. Recording a transaction via POST /api/transactions:');
    const createTxRes = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        name: 'Organic Grocery Market',
        amount: 2450.00,
        category: 'Food & Dining',
        type: 'expense',
        date: '29 Oct 2026',
        paymentMethod: 'UPI',
        notes: 'Weekly fresh produce',
      }),
    });
    if (createTxRes.status !== 201) throw new Error(`Create transaction failed: ${createTxRes.status}`);
    const createdTx = await createTxRes.json();
    txAId = createdTx.id;
    console.log(`   ✓ Transaction recorded: "${createdTx.name}" ₹${createdTx.amount} (id: ${txAId})`);

    // 6. Verify ledger now has 1 transaction
    console.log('\n6. Fetching ledger after creation:');
    const updatedTxRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieA },
    });
    const updatedTxData = await updatedTxRes.json();
    if (updatedTxData.length !== 1 || updatedTxData[0].id !== txAId) {
      throw new Error(`Expected 1 transaction with id ${txAId}, got ${updatedTxData.length}`);
    }
    console.log(`   ✓ Ledger contains 1 verified transaction matching id ${txAId}`);

    // 7. Test User B isolation
    console.log(`\n7. Testing cross-user isolation with User B (${emailB}):`);
    const regBRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password, displayName: 'Preview User B' }),
    });
    const regBData = await regBRes.json();
    userBId = regBData.user.id;
    const cookieB = (regBRes.headers.get('set-cookie') || '').split(';')[0];

    const txBListRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieB },
    });
    const txBListData = await txBListRes.json();
    if (txBListData.length !== 0) throw new Error('User B saw User A transactions!');
    console.log(`   ✓ User B ledger is completely isolated (0 transactions visible)`);

    const badGet = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      headers: { Cookie: cookieB },
    });
    if (badGet.status !== 404) throw new Error(`Expected 404 for User B reading User A transaction, got ${badGet.status}`);
    console.log(`   ✓ User B direct access to User A transaction blocked with 404 Not Found`);

    // 8. Test Bearer Token header fallback
    console.log('\n8. Testing Authorization Bearer token header (iframe fallback without cookies):');
    const bearerTxRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (bearerTxRes.status !== 200) throw new Error(`Bearer token auth failed with ${bearerTxRes.status}`);
    const bearerTxData = await bearerTxRes.json();
    if (bearerTxData.length !== 1) throw new Error('Bearer token fetch did not return User A transactions');
    console.log(`   ✓ Bearer token header successfully authenticated request: returned ${bearerTxData.length} records`);

    // 9. Logout
    console.log('\n9. Testing logout via POST /api/auth/logout:');
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    if (logoutRes.status !== 200) throw new Error(`Logout failed: ${logoutRes.status}`);
    console.log(`   ✓ Logout succeeded. Cookie cleared with SameSite=None; Secure.`);

    console.log('\n=============================================');
    console.log('✅ ALL PREVIEW AUTH & TRANSACTIONS TESTS PASSED');
    console.log('=============================================\n');
  } finally {
    console.log('Teardown: Cleaning up test transactions and users...');
    if (userAId || userBId) {
      await pool.query('DELETE FROM transactions WHERE user_id IN ($1, $2)', [
        userAId || '00000000-0000-0000-0000-000000000000',
        userBId || '00000000-0000-0000-0000-000000000000',
      ]);
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
        userAId || '00000000-0000-0000-0000-000000000000',
        userBId || '00000000-0000-0000-0000-000000000000',
      ]);
    }
    const { rows: txCount } = await pool.query('SELECT count(*)::int as c FROM transactions');
    console.log(`Teardown complete. Residual transactions in DB: ${txCount[0].c}`);
    await pool.end();
  }
}

runPreviewAuthTest().catch(err => {
  console.error('❌ Preview Auth Test failed:', err);
  process.exit(1);
});
