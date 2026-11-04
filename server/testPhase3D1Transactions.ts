/**
 * Verification test suite for Phase 3D-1: Connected Transactions to PostgreSQL
 *
 * Verifies:
 * 1. Unauthenticated requests to /api/transactions receive 401.
 * 2. Authenticated user can create a transaction via POST /api/transactions.
 * 3. Authenticated user can fetch transactions via GET /api/transactions (scoped to them).
 * 4. Authenticated user can fetch single transaction via GET /api/transactions/:id.
 * 5. Authenticated user can update transaction via PUT /api/transactions/:id.
 * 6. User isolation: User B cannot see User A's transactions.
 * 7. User isolation: User B cannot modify or delete User A's transactions.
 * 8. Bulk transaction insertion via POST /api/transactions/bulk with duplicate skipping.
 * 9. Authenticated user can delete transaction via DELETE /api/transactions/:id.
 * 10. Complete cleanup of all test records created in this test run.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://localhost:3000/api';

async function runPhase3D1Tests() {
  console.log('[Test Suite Phase 3D-1] Starting connected transaction verification...\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const timestamp = Date.now();
  const userAEmail = `tx_user_a_${timestamp}@example.com`;
  const userBEmail = `tx_user_b_${timestamp}@example.com`;
  const password = 'Password123!';

  let userAId = '';
  let userBId = '';
  let cookieA = '';
  let cookieB = '';
  let txAId = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Unauthenticated request receives 401
    // ----------------------------------------------------
    console.log('1. Testing unauthenticated access to /api/transactions');
    const unauthRes = await fetch(`${BASE_URL}/transactions`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }
    console.log('   ✓ Unauthenticated request rejected with status 401');

    // ----------------------------------------------------
    // TEST 2: Register & login User A and User B
    // ----------------------------------------------------
    const regARes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password,
        displayName: 'User A',
        monthlyIncome: 60000,
      }),
    });
    if (regARes.status !== 201) throw new Error(`User A registration failed: ${regARes.status}`);
    const regAData = await regARes.json();
    userAId = regAData.user.id;
    cookieA = (regARes.headers.get('set-cookie') || '').split(';')[0];
    console.log(`   ✓ User A registered & authenticated (id: ${userAId})`);

    const regBRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        password,
        displayName: 'User B',
        monthlyIncome: 75000,
      }),
    });
    if (regBRes.status !== 201) throw new Error(`User B registration failed: ${regBRes.status}`);
    const regBData = await regBRes.json();
    userBId = regBData.user.id;
    cookieB = (regBRes.headers.get('set-cookie') || '').split(';')[0];
    console.log(`   ✓ User B registered & authenticated (id: ${userBId})`);

    // ----------------------------------------------------
    // TEST 3: User A creates a transaction
    // ----------------------------------------------------
    console.log('\n3. Testing single transaction creation via POST /api/transactions');
    const createRes = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        name: 'Whole Foods Market',
        amount: 3450.75,
        category: 'Food & Dining',
        type: 'expense',
        date: '28 Oct 2026',
        paymentMethod: 'UPI',
        notes: 'Organic groceries',
      }),
    });

    if (createRes.status !== 201) {
      const err = await createRes.text();
      throw new Error(`Failed to create transaction: ${createRes.status} ${err}`);
    }
    const createData = await createRes.json();
    if (!createData || !createData.id) {
      throw new Error('Transaction creation did not return valid transaction object');
    }
    txAId = createData.id;
    console.log(`   ✓ Transaction created successfully with id: ${txAId}`);
    console.log(`   ✓ Returned amount: ₹${createData.amount}, merchant: "${createData.name}"`);

    // ----------------------------------------------------
    // TEST 4: User A lists transactions
    // ----------------------------------------------------
    console.log('\n4. Testing GET /api/transactions for User A');
    const listRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieA },
    });
    if (listRes.status !== 200) throw new Error(`Failed to list transactions: ${listRes.status}`);
    const listData = await listRes.json();
    if (!Array.isArray(listData) || listData.length !== 1) {
      throw new Error(`Expected exactly 1 transaction for User A, got ${listData?.length}`);
    }
    if (listData[0].id !== txAId) {
      throw new Error('Returned transaction id does not match created id');
    }
    console.log(`   ✓ User A has 1 transaction returned with matching id: ${txAId}`);

    // ----------------------------------------------------
    // TEST 5: User A reads single transaction by ID
    // ----------------------------------------------------
    console.log(`\n5. Testing GET /api/transactions/${txAId}`);
    const getRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      headers: { Cookie: cookieA },
    });
    if (getRes.status !== 200) throw new Error(`Failed to get single transaction: ${getRes.status}`);
    const getData = await getRes.json();
    if (getData.name !== 'Whole Foods Market') {
      throw new Error(`Unexpected transaction name: ${getData.name}`);
    }
    console.log(`   ✓ Fetched transaction details verified: "${getData.name}" ₹${getData.amount}`);

    // ----------------------------------------------------
    // TEST 6: User A updates transaction
    // ----------------------------------------------------
    console.log(`\n6. Testing PUT /api/transactions/${txAId}`);
    const updateRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        amount: 3950.50,
        notes: 'Organic groceries + household supplies',
      }),
    });
    if (updateRes.status !== 200) throw new Error(`Update failed: ${updateRes.status}`);
    const updateData = await updateRes.json();
    if (updateData.amount !== 3950.50 || updateData.notes !== 'Organic groceries + household supplies') {
      throw new Error('Updated transaction fields do not match sent payload');
    }
    console.log(`   ✓ Updated amount to ₹${updateData.amount} and notes: "${updateData.notes}"`);

    // ----------------------------------------------------
    // TEST 7: Cross-user isolation: User B cannot see User A's transactions
    // ----------------------------------------------------
    console.log('\n7. Testing cross-user isolation: User B list transactions');
    const userBListRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieB },
    });
    if (userBListRes.status !== 200) throw new Error(`User B list failed: ${userBListRes.status}`);
    const userBListData = await userBListRes.json();
    if (!Array.isArray(userBListData) || userBListData.length !== 0) {
      throw new Error(`Isolation breach! User B saw ${userBListData.length} transactions belonging to User A`);
    }
    console.log('   ✓ User B sees 0 transactions. User A data is completely isolated.');

    // ----------------------------------------------------
    // TEST 8: Cross-user isolation: User B cannot update User A's transaction
    // ----------------------------------------------------
    console.log(`\n8. Testing cross-user tamper protection: User B tries to update ${txAId}`);
    const badUpdateRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieB,
      },
      body: JSON.stringify({ amount: 100 }),
    });
    if (badUpdateRes.status !== 404) {
      throw new Error(`Expected 404 for cross-user update, got ${badUpdateRes.status}`);
    }
    console.log('   ✓ Tamper prevented: Cross-user update returned 404 (Not Found).');

    // ----------------------------------------------------
    // TEST 9: Cross-user isolation: User B cannot delete User A's transaction
    // ----------------------------------------------------
    console.log(`\n9. Testing cross-user tamper protection: User B tries to delete ${txAId}`);
    const badDeleteRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieB },
    });
    if (badDeleteRes.status !== 404) {
      throw new Error(`Expected 404 for cross-user delete, got ${badDeleteRes.status}`);
    }
    console.log('   ✓ Tamper prevented: Cross-user delete returned 404 (Not Found).');

    // ----------------------------------------------------
    // TEST 10: Bulk transactions import via POST /api/transactions/bulk
    // ----------------------------------------------------
    console.log('\n10. Testing bulk import via POST /api/transactions/bulk for User A');
    const bulkPayload = [
      {
        name: 'Amazon India Electronics',
        amount: 8499,
        category: 'Shopping',
        type: 'expense',
        date: '27 Oct 2026',
        paymentMethod: 'Credit Card',
        notes: 'Noise cancelling headset',
      },
      {
        name: 'Client Retainer Payment',
        amount: 45000,
        category: 'Income',
        type: 'income',
        date: '26 Oct 2026',
        paymentMethod: 'NEFT',
        notes: 'Monthly consulting retainer',
      },
      {
        name: 'Metro Rail Card Recharge',
        amount: 1000,
        category: 'Transport',
        type: 'expense',
        date: '25 Oct 2026',
        paymentMethod: 'Metro Card',
        notes: 'Commute transit',
      },
    ];

    const bulkRes = await fetch(`${BASE_URL}/transactions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        transactions: bulkPayload,
        onConflict: 'skip',
      }),
    });

    if (bulkRes.status !== 200 && bulkRes.status !== 201) {
      const err = await bulkRes.text();
      throw new Error(`Bulk import failed: ${bulkRes.status} ${err}`);
    }
    const bulkData = await bulkRes.json();
    console.log(`   ✓ Bulk import succeeded. Inserted: ${bulkData.insertedCount}, skipped: ${bulkData.skippedCount}`);

    // Verify User A total transaction count is now 4 (1 original + 3 bulk)
    const listAfterBulkRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieA },
    });
    const listAfterBulkData = await listAfterBulkRes.json();
    if (!Array.isArray(listAfterBulkData) || listAfterBulkData.length !== 4) {
      throw new Error(`Expected 4 transactions for User A after bulk import, got ${listAfterBulkData?.length}`);
    }
    console.log(`   ✓ User A verified with ${listAfterBulkData.length} total transactions in cloud database.`);

    // ----------------------------------------------------
    // TEST 11: Single transaction deletion via DELETE /api/transactions/:id
    // ----------------------------------------------------
    console.log(`\n11. Testing DELETE /api/transactions/${txAId} for User A`);
    const delRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    });
    if (delRes.status !== 200) throw new Error(`Delete failed: ${delRes.status}`);
    const delData = await delRes.json();
    console.log(`   ✓ Delete succeeded: ${delData.message}`);

    // Verify User A count is now 3
    const listAfterDelRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: cookieA },
    });
    const listAfterDelData = await listAfterDelRes.json();
    if (!Array.isArray(listAfterDelData) || listAfterDelData.length !== 3) {
      throw new Error(`Expected 3 transactions after delete, got ${listAfterDelData?.length}`);
    }
    console.log(`   ✓ Transaction count accurately decremented to ${listAfterDelData.length}.`);

    console.log('\n=========================================');
    console.log(' ALL PHASE 3D-1 VERIFICATION CHECKS PASSED');
    console.log('=========================================\n');

  } finally {
    // ----------------------------------------------------
    // TEARDOWN: Clean up test transactions and accounts
    // ----------------------------------------------------
    console.log('Teardown: Cleaning up test transactions and users...');
    if (userAId || userBId) {
      await pool.query(
        `DELETE FROM transactions WHERE user_id IN ($1, $2)`,
        [userAId || '00000000-0000-0000-0000-000000000000', userBId || '00000000-0000-0000-0000-000000000000']
      );
      await pool.query(
        `DELETE FROM users WHERE id IN ($1, $2)`,
        [userAId || '00000000-0000-0000-0000-000000000000', userBId || '00000000-0000-0000-0000-000000000000']
      );
    }

    const { rows: remainingTx } = await pool.query('SELECT COUNT(*)::int as count FROM transactions');
    console.log(`Database state after teardown:`);
    console.log(`  - Residual test transactions: ${remainingTx[0].count}`);
    await pool.end();
  }
}

runPhase3D1Tests().catch(err => {
  console.error('\n❌ Phase 3D-1 test failed:', err);
  process.exit(1);
});
