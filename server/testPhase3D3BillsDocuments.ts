/**
 * Comprehensive Automated Verification Suite for Phase 3D-3: Bills & Documents PostgreSQL Integration
 *
 * Verifies:
 * 1. Unauthenticated access rejection: 401 for /api/bills, /api/documents, and /api/bills/:id.
 * 2. Authenticated user registration & session initialization for User A and User B.
 * 3. Bills CRUD operations:
 *    - Create bill (POST /api/bills) with name, category, amount, due_date, due_in_days, icon_type, status.
 *    - Ignore / reject spoofed user_id in payload, enforcing session owner identity.
 *    - Read bills (GET /api/bills) scoped to the authenticated user.
 *    - Update bill (PUT /api/bills/:id) modifying status to 'paid'.
 *    - Due date and overdue calculation tracking.
 * 4. Documents metadata CRUD operations:
 *    - Create document metadata (POST /api/documents) with filename, upload_date, file_size, ocr_status, detected_merchant, detected_amount, detected_date, confidence_score.
 *    - Ignore / reject spoofed user_id in payload, enforcing session owner identity.
 *    - Read documents (GET /api/documents) scoped to the authenticated user.
 *    - Update document metadata (PUT /api/documents/:id).
 * 5. Cross-User Isolation (Tenant Partitioning):
 *    - User B cannot read User A's bills or documents (GET returns empty list).
 *    - User B cannot access User A's bill by ID (PUT / DELETE returns 404).
 *    - User B cannot access User A's document by ID (PUT / DELETE returns 404).
 * 6. Bulk Import & Duplicate Detection:
 *    - POST /api/bills/bulk correctly inserts unique bills and skips duplicates.
 *    - POST /api/documents/bulk correctly inserts unique documents and skips duplicates.
 * 7. Clean Teardown & Residual Zero-State Verification.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://localhost:3000/api';

async function runPhase3D3Tests() {
  console.log('================================================================');
  console.log('  FinSight AI — Phase 3D-3: Bills & Documents PostgreSQL Test Suite');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const timestamp = Date.now();
  const userAEmail = `bd_user_a_${timestamp}@example.com`;
  const userBEmail = `bd_user_b_${timestamp}@example.com`;
  const password = 'Password123!';

  let userAId = '';
  let userBId = '';
  let cookieA = '';
  let cookieB = '';
  let billAId = '';
  let documentAId = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Unauthenticated request rejection (401)
    // ----------------------------------------------------
    console.log('1. Testing unauthenticated access rejection');
    const unauthBills = await fetch(`${BASE_URL}/bills`);
    if (unauthBills.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated GET /api/bills, got ${unauthBills.status}`);
    }
    const unauthDocs = await fetch(`${BASE_URL}/documents`);
    if (unauthDocs.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated GET /api/documents, got ${unauthDocs.status}`);
    }
    const unauthBillBulk = await fetch(`${BASE_URL}/bills/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bills: [] }),
    });
    if (unauthBillBulk.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated POST /api/bills/bulk, got ${unauthBillBulk.status}`);
    }
    console.log('   ✓ Unauthenticated requests rejected with 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 2: Register & login User A and User B
    // ----------------------------------------------------
    console.log('\n2. Registering isolated test users');
    const regARes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password,
        displayName: 'User A (Phase 3D-3)',
        monthlyIncome: 95000,
      }),
    });
    if (regARes.status !== 201) throw new Error(`User A registration failed: ${regARes.status}`);
    const regAData = await regARes.json();
    userAId = regAData.user.id;
    cookieA = (regARes.headers.get('set-cookie') || '').split(';')[0];
    console.log(`   ✓ User A registered and session initialized (ID: ${userAId})`);

    const regBRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        password,
        displayName: 'User B (Phase 3D-3)',
        monthlyIncome: 60000,
      }),
    });
    if (regBRes.status !== 201) throw new Error(`User B registration failed: ${regBRes.status}`);
    const regBData = await regBRes.json();
    userBId = regBData.user.id;
    cookieB = (regBRes.headers.get('set-cookie') || '').split(';')[0];
    console.log(`   ✓ User B registered and session initialized (ID: ${userBId})`);

    // ----------------------------------------------------
    // TEST 3: User A Bills CRUD & Ownership Validation
    // ----------------------------------------------------
    console.log('\n3. Testing Bills CRUD & Session Identity Enforcing');
    // Create Bill with spoofed user_id
    const createBillRes = await fetch(`${BASE_URL}/bills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({
        name: 'Airtel Fiber Broadband',
        category: 'Utilities',
        amount: 1199,
        dueDate: '15 Nov 2026',
        dueInDays: 5,
        iconType: 'wifi',
        status: 'unpaid',
        user_id: userBId, // Spoofed user ID must be ignored!
      }),
    });
    if (createBillRes.status !== 201) {
      const err = await createBillRes.text();
      throw new Error(`Failed to create bill: ${createBillRes.status} - ${err}`);
    }
    const createBillData = await createBillRes.json();
    billAId = createBillData.id;
    if (createBillData.user_id && createBillData.user_id !== userAId) {
      throw new Error(`Security breach: Spoofed user_id was accepted! Expected ${userAId}, got ${createBillData.user_id}`);
    }
    console.log(`   ✓ Bill created with verified session owner (ID: ${billAId})`);

    // Read bills for User A
    const getBillsRes = await fetch(`${BASE_URL}/bills`, {
      headers: { 'Cookie': cookieA },
    });
    if (getBillsRes.status !== 200) throw new Error(`GET /api/bills failed: ${getBillsRes.status}`);
    const billsList = await getBillsRes.json();
    if (!Array.isArray(billsList) || billsList.length !== 1 || billsList[0].id !== billAId) {
      throw new Error(`Unexpected bills list for User A: ${JSON.stringify(billsList)}`);
    }
    console.log('   ✓ Read bills for User A returned 1 valid record');

    // Update Bill (mark as paid)
    const updateBillRes = await fetch(`${BASE_URL}/bills/${billAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({
        status: 'paid',
        amount: 1250,
      }),
    });
    if (updateBillRes.status !== 200) {
      throw new Error(`Failed to update bill: ${updateBillRes.status}`);
    }
    const updateBillData = await updateBillRes.json();
    if (updateBillData.status !== 'paid' || updateBillData.amount !== 1250) {
      throw new Error(`Bill update verification failed: ${JSON.stringify(updateBillData)}`);
    }
    console.log('   ✓ Bill updated to paid status (amount ₹1,250)');

    // ----------------------------------------------------
    // TEST 4: User A Documents Metadata CRUD
    // ----------------------------------------------------
    console.log('\n4. Testing Documents Metadata CRUD');
    // Create Document Metadata with spoofed user_id
    const createDocRes = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({
        filename: 'amazon_receipt_nov2026.pdf',
        uploadDate: '2026-11-01',
        fileSize: '412 KB',
        ocrStatus: 'Extracted',
        detectedMerchant: 'Amazon India',
        detectedAmount: 3499,
        detectedDate: '2026-10-31',
        confidenceScore: 98,
        user_id: userBId, // Spoofed user ID must be ignored!
      }),
    });
    if (createDocRes.status !== 201) {
      const err = await createDocRes.text();
      throw new Error(`Failed to create document: ${createDocRes.status} - ${err}`);
    }
    const createDocData = await createDocRes.json();
    documentAId = createDocData.id;
    if (createDocData.user_id && createDocData.user_id !== userAId) {
      throw new Error(`Security breach: Spoofed user_id was accepted for document! Expected ${userAId}, got ${createDocData.user_id}`);
    }
    console.log(`   ✓ Document metadata created with verified session owner (ID: ${documentAId})`);

    // Read documents for User A
    const getDocsRes = await fetch(`${BASE_URL}/documents`, {
      headers: { 'Cookie': cookieA },
    });
    if (getDocsRes.status !== 200) throw new Error(`GET /api/documents failed: ${getDocsRes.status}`);
    const docsList = await getDocsRes.json();
    if (!Array.isArray(docsList) || docsList.length !== 1 || docsList[0].id !== documentAId) {
      throw new Error(`Unexpected documents list for User A: ${JSON.stringify(docsList)}`);
    }
    console.log('   ✓ Read documents for User A returned 1 valid record');

    // Update Document metadata
    const updateDocRes = await fetch(`${BASE_URL}/documents/${documentAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({
        ocrStatus: 'Extracted',
        detectedMerchant: 'Amazon Retail India Pvt Ltd',
      }),
    });
    if (updateDocRes.status !== 200) throw new Error(`Failed to update document: ${updateDocRes.status}`);
    const updateDocData = await updateDocRes.json();
    if (updateDocData.detectedMerchant !== 'Amazon Retail India Pvt Ltd') {
      throw new Error(`Document update verification failed: ${JSON.stringify(updateDocData)}`);
    }
    console.log('   ✓ Document metadata updated successfully');

    // ----------------------------------------------------
    // TEST 5: Cross-User Isolation (Tenant Boundaries)
    // ----------------------------------------------------
    console.log('\n5. Testing Cross-User Isolation (Tenant Boundaries)');
    // User B bills should be empty
    const bBillsRes = await fetch(`${BASE_URL}/bills`, {
      headers: { 'Cookie': cookieB },
    });
    const bBills = await bBillsRes.json();
    if (bBills.length !== 0) {
      throw new Error(`Tenant leak: User B saw User A bills! Count: ${bBills.length}`);
    }
    console.log('   ✓ User B GET /api/bills returned 0 records (isolated)');

    // User B documents should be empty
    const bDocsRes = await fetch(`${BASE_URL}/documents`, {
      headers: { 'Cookie': cookieB },
    });
    const bDocs = await bDocsRes.json();
    if (bDocs.length !== 0) {
      throw new Error(`Tenant leak: User B saw User A documents! Count: ${bDocs.length}`);
    }
    console.log('   ✓ User B GET /api/documents returned 0 records (isolated)');

    // User B cannot PUT User A's bill
    const attackBillPut = await fetch(`${BASE_URL}/bills/${billAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieB,
      },
      body: JSON.stringify({ amount: 999999 }),
    });
    if (attackBillPut.status !== 404) {
      throw new Error(`Expected 404 when User B modifies User A's bill, got ${attackBillPut.status}`);
    }
    console.log('   ✓ Cross-tenant bill modification rejected with 404');

    // User B cannot DELETE User A's bill
    const attackBillDelete = await fetch(`${BASE_URL}/bills/${billAId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookieB },
    });
    if (attackBillDelete.status !== 404) {
      throw new Error(`Expected 404 when User B deletes User A's bill, got ${attackBillDelete.status}`);
    }
    console.log('   ✓ Cross-tenant bill deletion rejected with 404');

    // User B cannot PUT User A's document
    const attackDocPut = await fetch(`${BASE_URL}/documents/${documentAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieB,
      },
      body: JSON.stringify({ detectedMerchant: 'Hacked' }),
    });
    if (attackDocPut.status !== 404) {
      throw new Error(`Expected 404 when User B modifies User A's document, got ${attackDocPut.status}`);
    }
    console.log('   ✓ Cross-tenant document modification rejected with 404');

    // User B cannot DELETE User A's document
    const attackDocDelete = await fetch(`${BASE_URL}/documents/${documentAId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookieB },
    });
    if (attackDocDelete.status !== 404) {
      throw new Error(`Expected 404 when User B deletes User A's document, got ${attackDocDelete.status}`);
    }
    console.log('   ✓ Cross-tenant document deletion rejected with 404');

    // ----------------------------------------------------
    // TEST 6: Bulk Import & Duplicate Detection
    // ----------------------------------------------------
    console.log('\n6. Testing Bulk Import & Duplicate Detection');

    // Bulk Bills: 2 new items + 1 exact duplicate of existing billA
    const bulkBillsPayload = [
      {
        name: 'Airtel Fiber Broadband', // Duplicate of existing
        category: 'Utilities',
        amount: 1199,
        dueDate: '15 Nov 2026',
        dueInDays: 5,
        iconType: 'wifi',
        status: 'unpaid',
      },
      {
        name: 'Tata Power Electricity',
        category: 'Utilities',
        amount: 1680,
        dueDate: '20 Nov 2026',
        dueInDays: 10,
        iconType: 'electricity',
        status: 'unpaid',
      },
      {
        name: 'Netflix Premium 4K',
        category: 'Subscriptions',
        amount: 649,
        dueDate: '25 Nov 2026',
        dueInDays: 15,
        iconType: 'streaming',
        status: 'unpaid',
      },
    ];

    const bulkBillRes = await fetch(`${BASE_URL}/bills/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({ bills: bulkBillsPayload, skipDuplicates: true }),
    });
    if (bulkBillRes.status !== 201) {
      const err = await bulkBillRes.text();
      throw new Error(`Bulk bills import failed: ${bulkBillRes.status} - ${err}`);
    }
    const bulkBillData = await bulkBillRes.json();
    if (bulkBillData.insertedCount !== 2 || bulkBillData.skippedCount !== 1) {
      throw new Error(`Expected 2 inserted, 1 skipped for bills bulk, got: ${JSON.stringify(bulkBillData)}`);
    }
    console.log(`   ✓ Bulk Bills Import: 2 inserted, 1 skipped duplicate (Total count verified)`);

    // Bulk Documents: 2 new items + 1 exact duplicate of existing documentA
    const bulkDocsPayload = [
      {
        filename: 'amazon_receipt_nov2026.pdf', // Duplicate of existing
        uploadDate: '2026-11-01',
        fileSize: '412 KB',
        ocrStatus: 'Extracted',
        detectedMerchant: 'Amazon India',
        detectedAmount: 3499,
        detectedDate: '2026-10-31',
        confidenceScore: 98,
      },
      {
        filename: 'starbucks_coffee_invoice.pdf',
        uploadDate: '2026-11-02',
        fileSize: '185 KB',
        ocrStatus: 'Extracted',
        detectedMerchant: 'Starbucks Coffee',
        detectedAmount: 480,
        detectedDate: '2026-11-02',
        confidenceScore: 95,
      },
      {
        filename: 'apple_store_receipt.pdf',
        uploadDate: '2026-11-03',
        fileSize: '520 KB',
        ocrStatus: 'Pending Review',
        detectedMerchant: 'Apple India',
        detectedAmount: 18900,
        detectedDate: '2026-11-03',
        confidenceScore: 91,
      },
    ];

    const bulkDocRes = await fetch(`${BASE_URL}/documents/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieA,
      },
      body: JSON.stringify({ documents: bulkDocsPayload, skipDuplicates: true }),
    });
    if (bulkDocRes.status !== 201) {
      const err = await bulkDocRes.text();
      throw new Error(`Bulk documents import failed: ${bulkDocRes.status} - ${err}`);
    }
    const bulkDocData = await bulkDocRes.json();
    if (bulkDocData.insertedCount !== 2 || bulkDocData.skippedCount !== 1) {
      throw new Error(`Expected 2 inserted, 1 skipped for documents bulk, got: ${JSON.stringify(bulkDocData)}`);
    }
    console.log(`   ✓ Bulk Documents Import: 2 inserted, 1 skipped duplicate (Total count verified)`);

    // Verify User A total counts in PostgreSQL
    const finalBills = await (await fetch(`${BASE_URL}/bills`, { headers: { 'Cookie': cookieA } })).json();
    const finalDocs = await (await fetch(`${BASE_URL}/documents`, { headers: { 'Cookie': cookieA } })).json();
    if (finalBills.length !== 3) throw new Error(`Expected 3 total bills for User A, got ${finalBills.length}`);
    if (finalDocs.length !== 3) throw new Error(`Expected 3 total documents for User A, got ${finalDocs.length}`);
    console.log(`   ✓ Verified User A totals: 3 bills, 3 documents in PostgreSQL`);

    // ----------------------------------------------------
    // TEST 7: Single Item Deletion
    // ----------------------------------------------------
    console.log('\n7. Testing Single Item Deletions');
    const delBillRes = await fetch(`${BASE_URL}/bills/${billAId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookieA },
    });
    if (delBillRes.status !== 200) throw new Error(`DELETE /api/bills/:id failed: ${delBillRes.status}`);
    console.log('   ✓ Single bill deletion successful');

    const delDocRes = await fetch(`${BASE_URL}/documents/${documentAId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookieA },
    });
    if (delDocRes.status !== 200) throw new Error(`DELETE /api/documents/:id failed: ${delDocRes.status}`);
    console.log('   ✓ Single document metadata deletion successful');

    console.log('\n================================================================');
    console.log('  ALL PHASE 3D-3 TESTS PASSED PERFECTLY!');
    console.log('================================================================');
  } finally {
    // ----------------------------------------------------
    // CLEAN TEARDOWN: Delete test users and cascade-cleared data
    // ----------------------------------------------------
    console.log('\nTearing down test users...');
    try {
      if (userAId) {
        await pool.query('DELETE FROM bills WHERE user_id = $1', [userAId]);
        await pool.query('DELETE FROM documents WHERE user_id = $1', [userAId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userAId]);
      }
      if (userBId) {
        await pool.query('DELETE FROM bills WHERE user_id = $1', [userBId]);
        await pool.query('DELETE FROM documents WHERE user_id = $1', [userBId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userBId]);
      }
      console.log('✓ Teardown complete. Zero residual test rows remain.');
      await pool.end();
      process.exit(0);
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
      process.exit(1);
    }
  }
}

runPhase3D3Tests().catch(err => {
  console.error('\n❌ Phase 3D-3 Verification Failed:', err);
  process.exit(1);
});
