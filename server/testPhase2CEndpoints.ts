/**
 * Automated verification test suite for Phase 2C endpoints:
 * Budgets, Goals, Bills, and Documents.
 * Tests CRUD + Goal contribution and guarantees 100% clean-up of temporary rows.
 */

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('[Test Suite Phase 2C] Starting verification...\n');

  try {
    // ----------------------------------------
    // 1. BUDGETS
    // ----------------------------------------
    console.log('1. Testing Budgets API');
    const budgetId = `b_test_${Date.now()}`;
    const budgetPayload = {
      id: budgetId,
      category: 'Dining Diagnostic Test',
      allocated: 8500.00,
      color: '#00E5BE',
      suggestedByAI: 8000.00,
    };

    // POST
    const createBRes = await fetch(`${BASE_URL}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budgetPayload),
    });
    if (createBRes.status !== 201) throw new Error(`POST /budgets failed: ${createBRes.status}`);
    const createdB = await createBRes.json();
    console.log(`   ✓ Created budget: id=${createdB.id}, allocated=₹${createdB.allocated}`);

    // GET by ID
    const getBRes = await fetch(`${BASE_URL}/budgets/${budgetId}`);
    if (getBRes.status !== 200) throw new Error(`GET /budgets/:id failed: ${getBRes.status}`);
    console.log(`   ✓ Retrieved budget by ID`);

    // PUT
    const putBRes = await fetch(`${BASE_URL}/budgets/${budgetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocated: 9000.00 }),
    });
    if (putBRes.status !== 200) throw new Error(`PUT /budgets/:id failed: ${putBRes.status}`);
    const updatedB = await putBRes.json();
    if (updatedB.allocated !== 9000) throw new Error(`Allocated mismatch in budget update`);
    console.log(`   ✓ Updated budget allocated to ₹${updatedB.allocated}`);

    // DELETE
    const delBRes = await fetch(`${BASE_URL}/budgets/${budgetId}`, { method: 'DELETE' });
    if (delBRes.status !== 200) throw new Error(`DELETE /budgets/:id failed: ${delBRes.status}`);
    console.log(`   ✓ Deleted budget`);

    // Verify 404
    const verifyBRes = await fetch(`${BASE_URL}/budgets/${budgetId}`);
    if (verifyBRes.status !== 404) throw new Error(`Expected 404 for deleted budget, got ${verifyBRes.status}`);
    console.log(`   ✓ Confirmed budget 404 cleanup\n`);

    // ----------------------------------------
    // 2. GOALS & CONTRIBUTION
    // ----------------------------------------
    console.log('2. Testing Goals API & Contribution');
    const goalId = `g_test_${Date.now()}`;
    const goalPayload = {
      id: goalId,
      title: 'Emergency Fund Diagnostic',
      targetAmount: 50000.00,
      currentAmount: 10000.00,
      targetDate: '2027-01-01',
      category: 'Savings',
      monthlyContribution: 5000.00,
    };

    // POST
    const createGRes = await fetch(`${BASE_URL}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalPayload),
    });
    if (createGRes.status !== 201) throw new Error(`POST /goals failed: ${createGRes.status}`);
    const createdG = await createGRes.json();
    console.log(`   ✓ Created goal: id=${createdG.id}, target=₹${createdG.targetAmount}, current=₹${createdG.currentAmount}`);

    // POST Contribute (add 2500.00)
    const contribRes = await fetch(`${BASE_URL}/goals/${goalId}/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500.00 }),
    });
    if (contribRes.status !== 200) throw new Error(`POST /goals/:id/contribute failed: ${contribRes.status}`);
    const contribResult = await contribRes.json();
    if (contribResult.goal.currentAmount !== 12500.00) {
      throw new Error(`Expected currentAmount 12500.00, got ${contribResult.goal.currentAmount}`);
    }
    console.log(`   ✓ Contributed ₹2500.00: new currentAmount=₹${contribResult.goal.currentAmount}`);

    // PUT
    const putGRes = await fetch(`${BASE_URL}/goals/${goalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Emergency Fund Renamed' }),
    });
    if (putGRes.status !== 200) throw new Error(`PUT /goals/:id failed: ${putGRes.status}`);
    console.log(`   ✓ Updated goal title`);

    // DELETE
    const delGRes = await fetch(`${BASE_URL}/goals/${goalId}`, { method: 'DELETE' });
    if (delGRes.status !== 200) throw new Error(`DELETE /goals/:id failed: ${delGRes.status}`);
    console.log(`   ✓ Deleted goal`);

    // Verify 404
    const verifyGRes = await fetch(`${BASE_URL}/goals/${goalId}`);
    if (verifyGRes.status !== 404) throw new Error(`Expected 404 for deleted goal, got ${verifyGRes.status}`);
    console.log(`   ✓ Confirmed goal 404 cleanup\n`);

    // ----------------------------------------
    // 3. BILLS
    // ----------------------------------------
    console.log('3. Testing Bills API');
    const billId = `bill_test_${Date.now()}`;
    const billPayload = {
      id: billId,
      name: 'Cloud Fiber Internet',
      category: 'Utilities',
      amount: 1199.00,
      dueDate: '2026-11-05',
      dueInDays: 8,
      status: 'unpaid',
      iconType: 'wifi',
    };

    // POST
    const createBillRes = await fetch(`${BASE_URL}/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billPayload),
    });
    if (createBillRes.status !== 201) throw new Error(`POST /bills failed: ${createBillRes.status}`);
    const createdBill = await createBillRes.json();
    console.log(`   ✓ Created bill: id=${createdBill.id}, name="${createdBill.name}", amount=₹${createdBill.amount}`);

    // PUT
    const putBillRes = await fetch(`${BASE_URL}/bills/${billId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });
    if (putBillRes.status !== 200) throw new Error(`PUT /bills/:id failed: ${putBillRes.status}`);
    const updatedBill = await putBillRes.json();
    if (updatedBill.status !== 'paid') throw new Error(`Status mismatch on bill update`);
    console.log(`   ✓ Updated bill status to "paid"`);

    // DELETE
    const delBillRes = await fetch(`${BASE_URL}/bills/${billId}`, { method: 'DELETE' });
    if (delBillRes.status !== 200) throw new Error(`DELETE /bills/:id failed: ${delBillRes.status}`);
    console.log(`   ✓ Deleted bill`);

    // Verify 404
    const verifyBillRes = await fetch(`${BASE_URL}/bills/${billId}`);
    if (verifyBillRes.status !== 404) throw new Error(`Expected 404 for deleted bill`);
    console.log(`   ✓ Confirmed bill 404 cleanup\n`);

    // ----------------------------------------
    // 4. DOCUMENTS (METADATA ONLY)
    // ----------------------------------------
    console.log('4. Testing Documents Metadata API');
    const docId = `doc_test_${Date.now()}`;
    const docPayload = {
      id: docId,
      filename: 'supermarket_receipt_probe.pdf',
      uploadDate: 'Just now',
      fileSize: '412 KB',
      ocrStatus: 'Processing',
      detectedMerchant: 'Fresh Harvest Mart',
      detectedAmount: 1845.50,
      detectedDate: '2026-10-27',
      confidenceScore: 98.4,
    };

    // POST
    const createDocRes = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docPayload),
    });
    if (createDocRes.status !== 201) throw new Error(`POST /documents failed: ${createDocRes.status}`);
    const createdDoc = await createDocRes.json();
    console.log(`   ✓ Created doc metadata: id=${createdDoc.id}, filename="${createdDoc.filename}", amount=₹${createdDoc.detectedAmount}`);

    // PUT
    const putDocRes = await fetch(`${BASE_URL}/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ocrStatus: 'Extracted', confidenceScore: 99.2 }),
    });
    if (putDocRes.status !== 200) throw new Error(`PUT /documents/:id failed: ${putDocRes.status}`);
    const updatedDoc = await putDocRes.json();
    if (updatedDoc.ocrStatus !== 'Extracted') throw new Error('Status mismatch on doc update');
    console.log(`   ✓ Updated doc ocrStatus to "Extracted" (confidence: ${updatedDoc.confidenceScore}%)`);

    // DELETE
    const delDocRes = await fetch(`${BASE_URL}/documents/${docId}`, { method: 'DELETE' });
    if (delDocRes.status !== 200) throw new Error(`DELETE /documents/:id failed: ${delDocRes.status}`);
    console.log(`   ✓ Deleted doc metadata`);

    // Verify 404
    const verifyDocRes = await fetch(`${BASE_URL}/documents/${docId}`);
    if (verifyDocRes.status !== 404) throw new Error(`Expected 404 for deleted doc`);
    console.log(`   ✓ Confirmed doc 404 cleanup\n`);

    console.log('==================================================================');
    console.log('🎉 ALL PHASE 2C TESTS (BUDGETS, GOALS, BILLS, DOCS) PASSED CLEANLY');
    console.log('   Zero residual test data left on Neon PostgreSQL.');
    console.log('==================================================================');
  } catch (err) {
    console.error('\n❌ Test failure:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

runTests();
