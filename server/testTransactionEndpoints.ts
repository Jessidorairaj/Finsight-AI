/**
 * Automated verification test suite for FinSight AI Transaction CRUD Endpoints.
 * Tests: GET, POST, PUT, DELETE, and POST /bulk against Neon PostgreSQL.
 * Guarantees 100% cleanup of all test records.
 */

const BASE_URL = 'http://localhost:3000/api/transactions';

async function runTests() {
  console.log('[Test Suite] Starting transaction endpoints verification...\n');

  const createdIds: string[] = [];

  try {
    // 1. Test GET /api/transactions
    console.log('1. Testing GET /api/transactions');
    const getRes = await fetch(BASE_URL);
    if (!getRes.ok) throw new Error(`GET /api/transactions failed with status ${getRes.status}`);
    const initialList = await getRes.json();
    console.log(`   ✓ Received ${initialList.length} existing transactions. Status: ${getRes.status}\n`);

    // 2. Test POST /api/transactions (Single Create)
    const testId1 = `tx_automated_test_${Date.now()}_1`;
    createdIds.push(testId1);
    console.log(`2. Testing POST /api/transactions with ID: ${testId1}`);

    const postPayload = {
      id: testId1,
      name: 'Diagnostic Supermarket Outflow',
      category: 'Food & Dining',
      amount: 1250.75,
      date: '2026-10-28',
      type: 'expense',
      paymentMethod: 'UPI',
      status: 'Completed',
      notes: 'Automated test record',
    };

    const postRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postPayload),
    });

    if (postRes.status !== 201) {
      throw new Error(`POST /api/transactions failed with status ${postRes.status}`);
    }
    const createdTx = await postRes.json();
    console.log(`   ✓ Created transaction: ${createdTx.id}, amount: ₹${createdTx.amount}. Status: 201\n`);

    // 3. Test duplicate ID rejection (409 Conflict)
    console.log(`3. Testing duplicate rejection on POST /api/transactions`);
    const dupRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postPayload),
    });

    if (dupRes.status !== 409) {
      throw new Error(`Expected 409 Conflict for duplicate ID, got ${dupRes.status}`);
    }
    const dupBody = await dupRes.json();
    console.log(`   ✓ Duplicate rejected correctly: "${dupBody.message}". Status: 409\n`);

    // 4. Test GET /api/transactions/:id
    console.log(`4. Testing GET /api/transactions/${testId1}`);
    const getSingleRes = await fetch(`${BASE_URL}/${testId1}`);
    if (getSingleRes.status !== 200) {
      throw new Error(`GET /api/transactions/${testId1} failed with status ${getSingleRes.status}`);
    }
    const fetchedTx = await getSingleRes.json();
    if (fetchedTx.amount !== 1250.75) {
      throw new Error(`Amount mismatch: expected 1250.75, got ${fetchedTx.amount}`);
    }
    console.log(`   ✓ Retrieved matching transaction: name="${fetchedTx.name}", amount=${fetchedTx.amount}. Status: 200\n`);

    // 5. Test PUT /api/transactions/:id
    console.log(`5. Testing PUT /api/transactions/${testId1}`);
    const putPayload = {
      amount: 1450.50,
      notes: 'Updated via test suite',
      category: 'Shopping',
    };

    const putRes = await fetch(`${BASE_URL}/${testId1}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putPayload),
    });

    if (putRes.status !== 200) {
      throw new Error(`PUT /api/transactions/${testId1} failed with status ${putRes.status}`);
    }
    const updatedTx = await putRes.json();
    if (updatedTx.amount !== 1450.50 || updatedTx.category !== 'Shopping') {
      throw new Error('PUT update did not reflect updated fields');
    }
    console.log(`   ✓ Updated transaction: amount=${updatedTx.amount}, category="${updatedTx.category}". Status: 200\n`);

    // 6. Test POST /api/transactions/bulk
    const testIdBulk1 = `tx_automated_bulk_${Date.now()}_a`;
    const testIdBulk2 = `tx_automated_bulk_${Date.now()}_b`;
    createdIds.push(testIdBulk1, testIdBulk2);

    console.log('6. Testing POST /api/transactions/bulk');
    const bulkPayload = {
      transactions: [
        {
          id: testIdBulk1,
          name: 'Consulting Honorarium',
          category: 'Income',
          amount: 25000.00,
          date: '2026-10-25',
          type: 'income',
          status: 'Completed',
        },
        {
          id: testIdBulk2,
          name: 'Broadband Fiber Monthly',
          category: 'Bills & Utilities',
          amount: 999.00,
          date: '2026-10-26',
          type: 'expense',
          status: 'Completed',
        },
      ],
      onConflict: 'skip',
    };

    const bulkRes = await fetch(`${BASE_URL}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkPayload),
    });

    if (bulkRes.status !== 201) {
      throw new Error(`POST /api/transactions/bulk failed with status ${bulkRes.status}`);
    }
    const bulkResult = await bulkRes.json();
    console.log(`   ✓ Bulk insert completed: insertedCount=${bulkResult.insertedCount}, skippedCount=${bulkResult.skippedCount}. Status: 201\n`);

    // 7. Cleanup & DELETE tests
    console.log('7. Cleaning up test records using DELETE /api/transactions/:id');
    for (const id of createdIds) {
      const delRes = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      if (delRes.status !== 200) {
        throw new Error(`DELETE /api/transactions/${id} failed with status ${delRes.status}`);
      }
      console.log(`   ✓ Deleted test record: ${id}. Status: 200`);
    }

    // 8. Verify clean state (404 on deleted IDs)
    console.log('\n8. Verifying 404 on deleted IDs');
    for (const id of createdIds) {
      const checkRes = await fetch(`${BASE_URL}/${id}`);
      if (checkRes.status !== 404) {
        throw new Error(`Expected 404 for deleted ID ${id}, got ${checkRes.status}`);
      }
    }
    console.log('   ✓ All test records confirmed non-existent (404 Not Found).\n');

    console.log('====================================================');
    console.log('🎉 ALL TRANSACTION CRUD & BULK TESTS PASSED CLEANLY');
    console.log('   Zero residual test data left on Neon PostgreSQL.');
    console.log('====================================================');
  } catch (error) {
    console.error('\n❌ Test failure:', error instanceof Error ? error.message : error);

    // Emergency cleanup
    console.log('\nAttempting emergency cleanup for IDs:', createdIds);
    for (const id of createdIds) {
      try {
        await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
      } catch {}
    }
    process.exit(1);
  }
}

runTests();
