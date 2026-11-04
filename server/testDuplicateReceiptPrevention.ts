/**
 * FinSight AI — Duplicate Receipt-to-Ledger Regression Test Suite
 *
 * Verifies:
 * 1. Same document ingested twice: rejected with 409 (same-document duplicate prevention).
 * 2. Same receipt uploaded under a different document ID: rejected with 409 and linked to existing tx.
 * 3. Same merchant/date/amount but different receipt numbers: allowed (legitimate separate purchases).
 * 4. Different users uploading identical receipt details: allowed (one per user, multi-tenant isolation).
 * 5. Concurrent duplicate requests: exactly one transaction created; race condition caught atomically.
 * 6. Missing receipt number: fallback merchant+date+amount fingerprint prevents duplicates on the same day,
 *    while allowing legitimate purchases on different dates.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://127.0.0.1:3000/api';

async function runDuplicateTests() {
  console.log('================================================================');
  console.log('  FinSight AI — Cross-Document Duplicate Ingestion Test Suite');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const timestamp = Date.now();
  let userAId = '';
  let userBId = '';
  let cookieA = '';
  let cookieB = '';

  const createdTxIds: string[] = [];
  const createdDocIds: string[] = [];

  try {
    // ----------------------------------------------------
    // SETUP: Register User A and User B
    // ----------------------------------------------------
    console.log('Setup: Registering test users...');
    const userAEmail = `dup_user_a_${timestamp}@finsight.test`;
    const userBEmail = `dup_user_b_${timestamp}@finsight.test`;

    const regARes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password: 'SecurePassword123!', displayName: 'User A DupTest' }),
    });
    const regAData = await regARes.json();
    userAId = regAData.user.id;
    const rawCookieA = regARes.headers.get('set-cookie') || '';
    cookieA = rawCookieA.split(';')[0];

    const regBRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userBEmail, password: 'SecurePassword123!', displayName: 'User B DupTest' }),
    });
    const regBData = await regBRes.json();
    userBId = regBData.user.id;
    const rawCookieB = regBRes.headers.get('set-cookie') || '';
    cookieB = rawCookieB.split(';')[0];

    console.log(`  ✓ Test users ready: User A (${userAId}), User B (${userBId})\n`);

    // Helper to create test document metadata
    async function createDoc(cookie: string, details: {
      filename: string;
      merchant: string;
      amount: number;
      date: string;
      invoiceNumber?: string;
    }): Promise<string> {
      const res = await fetch(`${BASE_URL}/documents`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: details.filename,
          detectedMerchant: details.merchant,
          detectedAmount: details.amount,
          detectedDate: details.date,
          invoiceNumber: details.invoiceNumber || '',
          ocrStatus: 'Extracted',
          confidenceScore: 95,
        }),
      });
      const data = await res.json();
      createdDocIds.push(data.id);
      return data.id;
    }

    // ----------------------------------------------------
    // TEST 1: Same document ingested twice
    // ----------------------------------------------------
    console.log('1. Testing same document ingested twice...');
    const doc1Id = await createDoc(cookieA, {
      filename: 'green_leaf_receipt_1.png',
      merchant: 'Green Leaf Cafe',
      amount: 546.00,
      date: '2026-10-31',
      invoiceNumber: '008421',
    });

    const ingest1Res = await fetch(`${BASE_URL}/documents/${doc1Id}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Green Leaf Cafe', amount: 546.00, date: '2026-10-31', invoiceNumber: '008421' }),
    });
    if (ingest1Res.status !== 201) {
      throw new Error(`Expected 201 on first ingestion, got ${ingest1Res.status}: ${await ingest1Res.text()}`);
    }
    const ingest1Json = await ingest1Res.json();
    const tx1Id = ingest1Json.transaction.id;
    createdTxIds.push(tx1Id);

    // Attempt second ingestion on doc1Id
    const ingest1RetryRes = await fetch(`${BASE_URL}/documents/${doc1Id}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (ingest1RetryRes.status !== 409) {
      throw new Error(`Expected 409 on second ingestion of same doc, got ${ingest1RetryRes.status}`);
    }
    const ingest1RetryJson = await ingest1RetryRes.json();
    if (!ingest1RetryJson.message.includes('already been ingested')) {
      throw new Error(`Unexpected message: ${ingest1RetryJson.message}`);
    }
    console.log('  ✓ Same document ingestion correctly rejected with 409 Conflict\n');

    // ----------------------------------------------------
    // TEST 2: Same receipt uploaded under a different document ID
    // ----------------------------------------------------
    console.log('2. Testing same receipt uploaded under a different document ID...');
    const doc2Id = await createDoc(cookieA, {
      filename: 'green_leaf_receipt_duplicate_upload.png',
      merchant: 'GREENWLEAF CAFE', // Case and slight OCR difference
      amount: 546.00,
      date: '2026-10-31',
      invoiceNumber: '008421',
    });

    const ingest2Res = await fetch(`${BASE_URL}/documents/${doc2Id}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'GREENWLEAF CAFE', amount: 546.00, date: '2026-10-31', invoiceNumber: '008421' }),
    });

    if (ingest2Res.status !== 409) {
      throw new Error(`Expected 409 for duplicate receipt on different doc ID, got ${ingest2Res.status}: ${await ingest2Res.text()}`);
    }
    const ingest2Json = await ingest2Res.json();
    if (ingest2Json.existingTransactionId !== tx1Id) {
      throw new Error(`Expected existingTransactionId ${tx1Id}, got ${ingest2Json.existingTransactionId}`);
    }
    if (ingest2Json.duplicateReason !== 'cross_document_duplicate') {
      throw new Error(`Expected duplicateReason 'cross_document_duplicate', got ${ingest2Json.duplicateReason}`);
    }

    // Verify document 2 is now linked to tx1Id
    const doc2Check = await pool.query('SELECT transaction_id FROM documents WHERE id = $1;', [doc2Id]);
    if (doc2Check.rows[0].transaction_id !== tx1Id) {
      throw new Error(`Expected doc2 to be linked to ${tx1Id}, got ${doc2Check.rows[0].transaction_id}`);
    }

    // Verify only ONE transaction exists in PostgreSQL
    const txCountRes = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND name ILIKE '%Green%' AND amount = 546.00;",
      [userAId]
    );
    if (parseInt(txCountRes.rows[0].count, 10) !== 1) {
      throw new Error(`Expected exactly 1 transaction in DB, found ${txCountRes.rows[0].count}`);
    }
    console.log('  ✓ Cross-document duplicate receipt rejected with 409 Conflict');
    console.log(`  ✓ Document was idempotently linked to existing transaction ${tx1Id}`);
    console.log('  ✓ Ledger contains exactly one transaction\n');

    // ----------------------------------------------------
    // TEST 3: Same merchant/date/amount but different receipt numbers (Allow Both)
    // ----------------------------------------------------
    console.log('3. Testing same merchant/date/amount with different receipt numbers (legitimate separate purchases)...');
    const docStarbucks1Id = await createDoc(cookieA, {
      filename: 'starbucks_morning.pdf',
      merchant: 'Starbucks Coffee',
      amount: 350.00,
      date: '2026-11-02',
      invoiceNumber: 'SB-101',
    });
    const docStarbucks2Id = await createDoc(cookieA, {
      filename: 'starbucks_afternoon.pdf',
      merchant: 'Starbucks Coffee',
      amount: 350.00,
      date: '2026-11-02',
      invoiceNumber: 'SB-102',
    });

    const sb1Res = await fetch(`${BASE_URL}/documents/${docStarbucks1Id}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Starbucks Coffee', amount: 350.00, date: '2026-11-02', invoiceNumber: 'SB-101' }),
    });
    if (sb1Res.status !== 201) throw new Error(`Starbucks 1 failed: ${sb1Res.status}`);
    const sb1Json = await sb1Res.json();
    createdTxIds.push(sb1Json.transaction.id);

    const sb2Res = await fetch(`${BASE_URL}/documents/${docStarbucks2Id}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Starbucks Coffee', amount: 350.00, date: '2026-11-02', invoiceNumber: 'SB-102' }),
    });
    if (sb2Res.status !== 201) {
      throw new Error(`Starbucks 2 with different receipt number was rejected: ${sb2Res.status}: ${await sb2Res.text()}`);
    }
    const sb2Json = await sb2Res.json();
    createdTxIds.push(sb2Json.transaction.id);

    console.log('  ✓ Legitimate separate purchases with distinct receipt numbers both successfully ingested\n');

    // ----------------------------------------------------
    // TEST 4: Different users uploading identical receipt details
    // ----------------------------------------------------
    console.log('4. Testing multi-tenant scoping: Different users uploading identical receipt details...');
    const docUserAId = await createDoc(cookieA, {
      filename: 'blue_tokai_receipt.pdf',
      merchant: 'Blue Tokai Coffee Roasters',
      amount: 420.00,
      date: '2026-11-02',
      invoiceNumber: 'BT-9001',
    });
    const docUserBId = await createDoc(cookieB, {
      filename: 'blue_tokai_receipt.pdf',
      merchant: 'Blue Tokai Coffee Roasters',
      amount: 420.00,
      date: '2026-11-02',
      invoiceNumber: 'BT-9001',
    });

    const btUserARes = await fetch(`${BASE_URL}/documents/${docUserAId}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blue Tokai Coffee', amount: 420.00, date: '2026-11-02', invoiceNumber: 'BT-9001' }),
    });
    if (btUserARes.status !== 201) throw new Error(`User A Blue Tokai failed: ${btUserARes.status}`);
    const btAJson = await btUserARes.json();
    createdTxIds.push(btAJson.transaction.id);

    const btUserBRes = await fetch(`${BASE_URL}/documents/${docUserBId}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blue Tokai Coffee', amount: 420.00, date: '2026-11-02', invoiceNumber: 'BT-9001' }),
    });
    if (btUserBRes.status !== 201) {
      throw new Error(`User B was blocked from ingesting their own receipt: ${btUserBRes.status}: ${await btUserBRes.text()}`);
    }
    const btBJson = await btUserBRes.json();
    createdTxIds.push(btBJson.transaction.id);

    console.log('  ✓ Multi-tenant scoping verified: Both users can ingest their own receipts without collision\n');

    // ----------------------------------------------------
    // TEST 5: Concurrent duplicate requests (Atomic Race Condition Test)
    // ----------------------------------------------------
    console.log('5. Testing concurrent duplicate ingestion requests (Atomic uniqueness)...');
    const docRace1 = await createDoc(cookieA, {
      filename: 'concurrent_receipt_upload_1.png',
      merchant: 'Burger King',
      amount: 299.00,
      date: '2026-11-02',
      invoiceNumber: 'BK-RACE-01',
    });
    const docRace2 = await createDoc(cookieA, {
      filename: 'concurrent_receipt_upload_2.png',
      merchant: 'Burger King',
      amount: 299.00,
      date: '2026-11-02',
      invoiceNumber: 'BK-RACE-01',
    });

    // Fire both requests simultaneously
    const [resRace1, resRace2] = await Promise.all([
      fetch(`${BASE_URL}/documents/${docRace1}/create-transaction`, {
        method: 'POST',
        headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Burger King', amount: 299.00, date: '2026-11-02', invoiceNumber: 'BK-RACE-01' }),
      }),
      fetch(`${BASE_URL}/documents/${docRace2}/create-transaction`, {
        method: 'POST',
        headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Burger King', amount: 299.00, date: '2026-11-02', invoiceNumber: 'BK-RACE-01' }),
      }),
    ]);

    const statuses = [resRace1.status, resRace2.status].sort();
    if (statuses[0] !== 201 || statuses[1] !== 409) {
      throw new Error(`Expected [201, 409] for concurrent race, got [${statuses[0]}, ${statuses[1]}]`);
    }

    const successfulRaceRes = resRace1.status === 201 ? resRace1 : resRace2;
    const conflictRaceRes = resRace1.status === 409 ? resRace1 : resRace2;

    const successJson = await successfulRaceRes.json();
    createdTxIds.push(successJson.transaction.id);

    const conflictJson = await conflictRaceRes.json();
    if (conflictJson.existingTransactionId !== successJson.transaction.id) {
      throw new Error(`Conflict response did not reference winner transaction: ${JSON.stringify(conflictJson)}`);
    }

    // Verify exactly ONE Burger King transaction in DB
    const raceCountRes = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND name = 'Burger King' AND amount = 299.00;",
      [userAId]
    );
    if (parseInt(raceCountRes.rows[0].count, 10) !== 1) {
      throw new Error(`Expected exactly 1 Burger King transaction in DB, found ${raceCountRes.rows[0].count}`);
    }
    console.log('  ✓ Exactly one transaction created during concurrent race; duplicate received 409 Conflict\n');

    // ----------------------------------------------------
    // TEST 6: Missing receipt number (Fallback fingerprint: merchant + date + amount)
    // ----------------------------------------------------
    console.log('6. Testing missing receipt number fallback fingerprint (merchant + date + amount)...');
    const docNoInv1 = await createDoc(cookieA, {
      filename: 'local_bakery_1.png',
      merchant: 'Corner Bakery',
      amount: 180.00,
      date: '2026-11-02',
      // No invoice number
    });
    const docNoInv2 = await createDoc(cookieA, {
      filename: 'local_bakery_2.png',
      merchant: 'Corner Bakery',
      amount: 180.00,
      date: '2026-11-02',
      // No invoice number
    });

    const noInv1Res = await fetch(`${BASE_URL}/documents/${docNoInv1}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Corner Bakery', amount: 180.00, date: '2026-11-02' }),
    });
    if (noInv1Res.status !== 201) throw new Error(`Fallback 1 failed: ${noInv1Res.status}`);
    const noInv1Json = await noInv1Res.json();
    createdTxIds.push(noInv1Json.transaction.id);

    // Second upload with same merchant + date + amount and no receipt number must be blocked
    const noInv2Res = await fetch(`${BASE_URL}/documents/${docNoInv2}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Corner Bakery', amount: 180.00, date: '2026-11-02' }),
    });
    if (noInv2Res.status !== 409) {
      throw new Error(`Expected 409 for duplicate without invoice number on same day, got ${noInv2Res.status}`);
    }

    // However, same merchant and amount on a DIFFERENT date is allowed!
    const docDiffDate = await createDoc(cookieA, {
      filename: 'local_bakery_next_day.png',
      merchant: 'Corner Bakery',
      amount: 180.00,
      date: '2026-11-03',
    });
    const diffDateRes = await fetch(`${BASE_URL}/documents/${docDiffDate}/create-transaction`, {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Corner Bakery', amount: 180.00, date: '2026-11-03' }),
    });
    if (diffDateRes.status !== 201) {
      throw new Error(`Legitimate purchase on a different date was rejected: ${diffDateRes.status}`);
    }
    const diffDateJson = await diffDateRes.json();
    createdTxIds.push(diffDateJson.transaction.id);

    console.log('  ✓ Missing receipt number fallback fingerprint blocks duplicates on the same day');
    console.log('  ✓ Legitimate purchases on different days for the same amount are allowed\n');

    console.log('================================================================');
    console.log('  ALL 6 DUPLICATE INGESTION REGRESSION TESTS PASSED! ✓');
    console.log('================================================================');
  } finally {
    // Teardown test data safely respecting foreign key constraints
    try {
      if (userAId) {
        await pool.query('DELETE FROM documents WHERE user_id = $1;', [userAId]);
        await pool.query('DELETE FROM transactions WHERE user_id = $1;', [userAId]);
        await pool.query('DELETE FROM users WHERE id = $1;', [userAId]);
      }
      if (userBId) {
        await pool.query('DELETE FROM documents WHERE user_id = $1;', [userBId]);
        await pool.query('DELETE FROM transactions WHERE user_id = $1;', [userBId]);
        await pool.query('DELETE FROM users WHERE id = $1;', [userBId]);
      }
    } catch (cleanupErr) {
      console.warn('[Teardown Warning]:', cleanupErr);
    }
  }
}

runDuplicateTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Duplicate Ingestion Regression Tests Failed:\n', err);
    process.exit(1);
  });
