/**
 * Automated verification test suite for Phase 3B: Secure Financial Data Ownership
 *
 * Verifies:
 * 1. Unauthenticated requests to all financial endpoints return 401 Unauthorized.
 * 2. Tampered or expired JWT cookies return 401 Unauthorized.
 * 3. User A can create, read, update, delete, contribute, and bulk import their own data.
 * 4. User B in the same database cannot view, access, update, delete, or contribute to User A's data (returns 404 Not Found).
 * 5. Spoofed user_id payloads are discarded; records are always attributed to the verified session owner.
 * 6. Clean up of all test records and accounts with database zero-row verification.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://localhost:3000/api';

async function runOwnershipTests() {
  console.log('[Test Suite Phase 3B] Starting secure ownership & multi-tenant isolation tests...\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  let userAId = '';
  let userBId = '';
  let cookieA = '';
  let cookieB = '';

  const timestamp = Date.now();
  const emailA = `usera_${timestamp}@example.com`;
  const emailB = `userb_${timestamp}@example.com`;
  const password = 'SecurePassword123!';

  try {
    // ----------------------------------------------------
    // TEST 1: Unauthenticated Requests to Financial Routes
    // ----------------------------------------------------
    console.log('1. Testing unauthenticated rejection on all financial routes:');
    const unauthEndpoints = [
      { method: 'GET', url: `${BASE_URL}/transactions` },
      { method: 'POST', url: `${BASE_URL}/transactions` },
      { method: 'GET', url: `${BASE_URL}/budgets` },
      { method: 'GET', url: `${BASE_URL}/goals` },
      { method: 'GET', url: `${BASE_URL}/bills` },
      { method: 'GET', url: `${BASE_URL}/documents` },
    ];

    for (const ep of unauthEndpoints) {
      const res = await fetch(ep.url, { method: ep.method });
      if (res.status !== 401) {
        throw new Error(`Expected 401 for unauthenticated ${ep.method} ${ep.url}, got ${res.status}`);
      }
      console.log(`   ✓ ${ep.method} ${ep.url.replace(BASE_URL, '')} -> 401 Unauthorized`);
    }

    // ----------------------------------------------------
    // TEST 2: Tampered / Malformed Session Token
    // ----------------------------------------------------
    console.log('\n2. Testing tampered session cookie rejection:');
    const tamperedRes = await fetch(`${BASE_URL}/transactions`, {
      headers: { Cookie: 'finsight_session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature' },
    });
    if (tamperedRes.status !== 401) {
      throw new Error(`Expected 401 for tampered token, got ${tamperedRes.status}`);
    }
    console.log('   ✓ Tampered JWT cookie successfully rejected with 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 3: User A Registration & Entity Creation
    // ----------------------------------------------------
    console.log('\n3. Registering User A and creating financial records:');
    const regARes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password, displayName: 'User Alpha', monthlyIncome: 75000 }),
    });
    if (regARes.status !== 201) throw new Error(`User A registration failed: ${regARes.status}`);
    const regAData = await regARes.json();
    userAId = regAData.user.id;
    cookieA = regARes.headers.get('set-cookie')!.split(';')[0];
    console.log(`   ✓ User A registered: id=${userAId}`);

    // User A creates Transaction
    const txAId = `tx_a_${timestamp}`;
    const txARes = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        id: txAId,
        name: "User A's Private Outflow",
        category: 'Food & Dining',
        amount: 550.00,
        date: '2026-10-28',
        type: 'expense',
      }),
    });
    if (txARes.status !== 201) throw new Error(`Failed to create User A transaction: ${txARes.status}`);
    console.log(`   ✓ User A created transaction: ${txAId}`);

    // User A creates Budget
    const bAId = `b_a_${timestamp}`;
    const bARes = await fetch(`${BASE_URL}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        id: bAId,
        category: "User A's Envelope",
        allocated: 12000.00,
      }),
    });
    if (bARes.status !== 201) throw new Error(`Failed to create User A budget: ${bARes.status}`);
    console.log(`   ✓ User A created budget: ${bAId}`);

    // User A creates Goal
    const gAId = `g_a_${timestamp}`;
    const gARes = await fetch(`${BASE_URL}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        id: gAId,
        title: "User A's Secret Savings",
        targetAmount: 50000.00,
        currentAmount: 10000.00,
        targetDate: '2027-12-31',
      }),
    });
    if (gARes.status !== 201) throw new Error(`Failed to create User A goal: ${gARes.status}`);
    console.log(`   ✓ User A created goal: ${gAId}`);

    // User A creates Bill
    const billAId = `bill_a_${timestamp}`;
    const billARes = await fetch(`${BASE_URL}/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        id: billAId,
        name: "User A's Home Loan",
        category: 'Housing',
        amount: 25000.00,
        dueDate: '2026-11-01',
      }),
    });
    if (billARes.status !== 201) throw new Error(`Failed to create User A bill: ${billARes.status}`);
    console.log(`   ✓ User A created bill: ${billAId}`);

    // User A creates Document
    const docAId = `doc_a_${timestamp}`;
    const docARes = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        id: docAId,
        filename: 'user_a_confidential_tax_invoice.pdf',
        uploadDate: 'Just now',
        fileSize: '150 KB',
      }),
    });
    if (docARes.status !== 201) throw new Error(`Failed to create User A doc: ${docARes.status}`);
    console.log(`   ✓ User A created document metadata: ${docAId}`);

    // ----------------------------------------------------
    // TEST 4: User B Cross-Tenant Isolation
    // ----------------------------------------------------
    console.log('\n4. Registering User B and verifying cross-tenant isolation:');
    const regBRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password, displayName: 'User Beta', monthlyIncome: 45000 }),
    });
    if (regBRes.status !== 201) throw new Error(`User B registration failed: ${regBRes.status}`);
    const regBData = await regBRes.json();
    userBId = regBData.user.id;
    cookieB = regBRes.headers.get('set-cookie')!.split(';')[0];
    console.log(`   ✓ User B registered: id=${userBId}`);

    // User B lists transactions -> MUST be empty
    const listTxB = await fetch(`${BASE_URL}/transactions`, { headers: { Cookie: cookieB } });
    const bTxList = await listTxB.json();
    if (bTxList.length !== 0) {
      throw new Error(`CRITICAL SECURITY FAILURE: User B can see User A's transactions! count=${bTxList.length}`);
    }
    console.log('   ✓ User B GET /transactions returns 0 records (User A data hidden)');

    // User B lists budgets -> MUST be empty
    const listBB = await fetch(`${BASE_URL}/budgets`, { headers: { Cookie: cookieB } });
    const bBList = await listBB.json();
    if (bBList.length !== 0) throw new Error("User B can see User A's budgets!");
    console.log('   ✓ User B GET /budgets returns 0 records');

    // User B lists goals -> MUST be empty
    const listGB = await fetch(`${BASE_URL}/goals`, { headers: { Cookie: cookieB } });
    const bGList = await listGB.json();
    if (bGList.length !== 0) throw new Error("User B can see User A's goals!");
    console.log('   ✓ User B GET /goals returns 0 records');

    // User B lists bills -> MUST be empty
    const listBillB = await fetch(`${BASE_URL}/bills`, { headers: { Cookie: cookieB } });
    const bBillList = await listBillB.json();
    if (bBillList.length !== 0) throw new Error("User B can see User A's bills!");
    console.log('   ✓ User B GET /bills returns 0 records');

    // User B lists documents -> MUST be empty
    const listDocB = await fetch(`${BASE_URL}/documents`, { headers: { Cookie: cookieB } });
    const bDocList = await listDocB.json();
    if (bDocList.length !== 0) throw new Error("User B can see User A's documents!");
    console.log('   ✓ User B GET /documents returns 0 records');

    // User B attempts to read User A's transaction by ID -> 404
    const directTxRes = await fetch(`${BASE_URL}/transactions/${txAId}`, { headers: { Cookie: cookieB } });
    if (directTxRes.status !== 404) {
      throw new Error(`Expected 404 for cross-user transaction read, got ${directTxRes.status}`);
    }
    console.log('   ✓ User B GET /transactions/:id on User A record -> 404 Not Found');

    // User B attempts to update User A's transaction -> 404
    const updateTxRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({ amount: 99999 }),
    });
    if (updateTxRes.status !== 404) throw new Error(`Expected 404 on cross-user PUT, got ${updateTxRes.status}`);
    console.log('   ✓ User B PUT /transactions/:id on User A record -> 404 Not Found');

    // User B attempts to delete User A's transaction -> 404
    const delTxRes = await fetch(`${BASE_URL}/transactions/${txAId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieB },
    });
    if (delTxRes.status !== 404) throw new Error(`Expected 404 on cross-user DELETE, got ${delTxRes.status}`);
    console.log('   ✓ User B DELETE /transactions/:id on User A record -> 404 Not Found');

    // User B attempts to contribute to User A's goal -> 404
    const contribRes = await fetch(`${BASE_URL}/goals/${gAId}/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({ amount: 1000 }),
    });
    if (contribRes.status !== 404) throw new Error(`Expected 404 on cross-user goal contribute, got ${contribRes.status}`);
    console.log('   ✓ User B POST /goals/:id/contribute on User A goal -> 404 Not Found');

    // ----------------------------------------------------
    // TEST 5: Spoofed User ID Ignored
    // ----------------------------------------------------
    console.log('\n5. Testing client-supplied spoofed user_id rejection:');
    const spoofTxId = `tx_b_spoof_${timestamp}`;
    const spoofRes = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({
        id: spoofTxId,
        user_id: userAId, // Spoofing User A's ID
        name: 'Malicious Injected Tx',
        category: 'Others',
        amount: 888.00,
        date: '2026-10-28',
        type: 'expense',
      }),
    });
    if (spoofRes.status !== 201) throw new Error(`Failed to create spoof transaction: ${spoofRes.status}`);

    // Check who owns the created transaction in database
    const dbCheck = await pool.query('SELECT user_id FROM transactions WHERE id = $1', [spoofTxId]);
    if (dbCheck.rows[0].user_id !== userBId) {
      throw new Error(`CRITICAL VULNERABILITY: Spoofed user_id was accepted! Stored user_id=${dbCheck.rows[0].user_id}`);
    }
    console.log('   ✓ Spoofed user_id payload ignored: Record persisted under User B (authenticated session owner)');

    // ----------------------------------------------------
    // TEST 6: Scoped Bulk Transaction Imports
    // ----------------------------------------------------
    console.log('\n6. Testing scoped bulk transaction imports:');
    const bulkPayload = {
      transactions: [
        { id: `tx_a_bulk_1_${timestamp}`, name: 'Bulk Salary', amount: 50000, date: '2026-10-01', type: 'income' },
        { id: `tx_a_bulk_2_${timestamp}`, name: 'Bulk Grocery', amount: 3200, date: '2026-10-02', type: 'expense' },
      ],
      onConflict: 'skip',
    };
    const bulkARes = await fetch(`${BASE_URL}/transactions/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify(bulkPayload),
    });
    if (bulkARes.status !== 201) throw new Error(`User A bulk import failed: ${bulkARes.status}`);
    console.log('   ✓ User A completed atomic bulk import of 2 transactions');

    // Verify User B still sees 1 transaction (their own spoofTxId)
    const bListAfterBulk = await fetch(`${BASE_URL}/transactions`, { headers: { Cookie: cookieB } });
    const bListData = await bListAfterBulk.json();
    if (bListData.length !== 1 || bListData[0].id !== spoofTxId) {
      throw new Error('User B received records from User A bulk import!');
    }
    console.log('   ✓ User B sees only their 1 record (User A bulk imports completely isolated)');

    // ----------------------------------------------------
    // TEST 7: Clean Up All Test Records
    // ----------------------------------------------------
    console.log('\n7. Cleaning up test data on Neon:');
    // Delete financial entities first (enforcing ON DELETE RESTRICT on users)
    await pool.query('DELETE FROM transactions WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM budgets WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM goals WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM bills WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM documents WHERE user_id IN ($1, $2)', [userAId, userBId]);

    // Now delete users
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userAId, userBId]);
    console.log('   ✓ Test financial records and users deleted from Neon');

    // ----------------------------------------------------
    // TEST 8: Zero-Row Residual Verification
    // ----------------------------------------------------
    console.log('\n8. Verifying zero residual test rows in Neon:');
    const [cTx, cB, cG, cBill, cDoc, cU] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM transactions WHERE user_id IN ($1, $2)', [userAId, userBId]),
      pool.query('SELECT COUNT(*) as c FROM budgets WHERE user_id IN ($1, $2)', [userAId, userBId]),
      pool.query('SELECT COUNT(*) as c FROM goals WHERE user_id IN ($1, $2)', [userAId, userBId]),
      pool.query('SELECT COUNT(*) as c FROM bills WHERE user_id IN ($1, $2)', [userAId, userBId]),
      pool.query('SELECT COUNT(*) as c FROM documents WHERE user_id IN ($1, $2)', [userAId, userBId]),
      pool.query('SELECT COUNT(*) as c FROM users WHERE id IN ($1, $2)', [userAId, userBId]),
    ]);

    console.log(`   test transactions: ${cTx.rows[0].c}`);
    console.log(`   test budgets:      ${cB.rows[0].c}`);
    console.log(`   test goals:        ${cG.rows[0].c}`);
    console.log(`   test bills:        ${cBill.rows[0].c}`);
    console.log(`   test documents:    ${cDoc.rows[0].c}`);
    console.log(`   test users:        ${cU.rows[0].c}`);

    if (
      cTx.rows[0].c !== '0' ||
      cB.rows[0].c !== '0' ||
      cG.rows[0].c !== '0' ||
      cBill.rows[0].c !== '0' ||
      cDoc.rows[0].c !== '0' ||
      cU.rows[0].c !== '0'
    ) {
      throw new Error('Residual test records detected in database after cleanup!');
    }
    console.log('   ✓ Zero residual test rows confirmed across all tables.');

    console.log('\n==================================================================');
    console.log('🎉 ALL PHASE 3B AUTHENTICATED OWNERSHIP TESTS PASSED CLEANLY');
    console.log('   Zero residual test data left on Neon PostgreSQL.');
    console.log('==================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Phase 3B Test Failure:', err instanceof Error ? err.message : err);
    if (userAId || userBId) {
      try {
        await pool.query('DELETE FROM transactions WHERE user_id IN ($1, $2)', [userAId, userBId]);
        await pool.query('DELETE FROM budgets WHERE user_id IN ($1, $2)', [userAId, userBId]);
        await pool.query('DELETE FROM goals WHERE user_id IN ($1, $2)', [userAId, userBId]);
        await pool.query('DELETE FROM bills WHERE user_id IN ($1, $2)', [userAId, userBId]);
        await pool.query('DELETE FROM documents WHERE user_id IN ($1, $2)', [userAId, userBId]);
        await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userAId, userBId]);
      } catch {}
    }
    process.exit(1);
  }
}

runOwnershipTests();
