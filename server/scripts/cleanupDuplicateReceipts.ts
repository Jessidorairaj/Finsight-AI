/**
 * FinSight AI — Safe Duplicate Receipt Cleanup Utility
 *
 * Scans for duplicate receipt transactions, displays candidate duplicates,
 * and provides safe cleanup.
 *
 * Usage:
 *   Dry run (default, preview only):
 *     npx tsx server/scripts/cleanupDuplicateReceipts.ts
 *
 *   Execute cleanup (requires explicit confirmation):
 *     npx tsx server/scripts/cleanupDuplicateReceipts.ts --confirm
 */

import { getDbPool } from '../db.js';
import { generateReceiptFingerprint } from '../services/receiptFingerprintService.js';

async function main() {
  const pool = getDbPool();
  if (!pool) {
    console.error('Database pool not configured.');
    process.exit(1);
  }

  const isConfirmed = process.argv.includes('--confirm');

  console.log('================================================================');
  console.log('  FinSight AI — Duplicate Receipt Transaction Cleanup Tool');
  console.log('================================================================\n');

  if (!isConfirmed) {
    console.log('🔒 DRY RUN MODE: No database modifications will be performed.\n');
  } else {
    console.log('⚡ CONFIRMED EXECUTION MODE: Applying safe deduplication...\n');
  }

  // 1. Specifically look for Green Leaf Cafe duplicate records for the target user
  const targetUser = 'usr_1793218238197_wlal7w';

  const txQuery = `
    SELECT id, name, category, amount, date, notes, user_id, created_at, receipt_fingerprint
    FROM transactions
    WHERE user_id = $1
      AND (name ILIKE '%Green%Leaf%' OR notes ILIKE '%Green_Leaf%')
      AND amount = 546.00
      AND date = '2026-10-31'
    ORDER BY created_at ASC;
  `;

  const txRes = await pool.query(txQuery, [targetUser]);

  if (txRes.rows.length <= 1) {
    console.log(`Found ${txRes.rows.length} Green Leaf Cafe transaction(s). No duplicates exist.`);
    process.exit(0);
  }

  console.log(`Found ${txRes.rows.length} transaction(s) for Green Leaf Cafe (₹546.00, 2026-10-31):\n`);

  for (let i = 0; i < txRes.rows.length; i++) {
    const row = txRes.rows[i];
    console.log(`[Transaction #${i + 1}] ID: ${row.id}, User: ${row.user_id}, Name: "${row.name}", Date: ${row.date}, Amount: ₹${row.amount}, Created: ${row.created_at}`);
  }
  console.log('');

  const primaryTx = txRes.rows[0]; // Earliest created: preserve
  // All subsequent identical transactions are redundant duplicates
  const duplicateTxs = txRes.rows.slice(1);

  // Query linked documents for each transaction
  const allTxIds = txRes.rows.map(r => r.id);
  const docQuery = `
    SELECT id, filename, detected_merchant, detected_amount, detected_date, invoice_number, transaction_id, created_at
    FROM documents
    WHERE transaction_id = ANY($1::text[]);
  `;
  const docRes = await pool.query(docQuery, [allTxIds]);

  const docLinkedToPrimary = docRes.rows.find(d => d.transaction_id === primaryTx.id);

  console.log('----------------------------------------------------------------');
  console.log('1. TRANSACTION TO PRESERVE (Primary / Earliest Ingested):');
  console.log('----------------------------------------------------------------');
  console.log(`  Transaction ID   : ${primaryTx.id}`);
  console.log(`  User ID          : ${primaryTx.user_id}`);
  console.log(`  Merchant Name    : ${primaryTx.name}`);
  console.log(`  Amount           : ₹${primaryTx.amount}`);
  console.log(`  Date             : ${primaryTx.date}`);
  console.log(`  Category         : ${primaryTx.category}`);
  console.log(`  Created At       : ${primaryTx.created_at}`);
  console.log(`  Linked Document  : ${docLinkedToPrimary ? `${docLinkedToPrimary.id} (${docLinkedToPrimary.filename})` : 'None'}`);

  console.log('\n----------------------------------------------------------------');
  console.log(`2. DUPLICATE TRANSACTIONS TO REMOVE (${duplicateTxs.length} redundant ingestion(s)):`);
  console.log('----------------------------------------------------------------');
  for (const dup of duplicateTxs) {
    const docLinked = docRes.rows.find(d => d.transaction_id === dup.id);
    console.log(`  - Transaction ID : ${dup.id}`);
    console.log(`    User ID        : ${dup.user_id}`);
    console.log(`    Merchant Name  : ${dup.name}`);
    console.log(`    Amount         : ₹${dup.amount}`);
    console.log(`    Date           : ${dup.date}`);
    console.log(`    Created At     : ${dup.created_at}`);
    console.log(`    Linked Document: ${docLinked ? `${docLinked.id} (${docLinked.filename})` : 'None'}`);
  }

  const { fingerprint: computedFp } = generateReceiptFingerprint({
    merchant: primaryTx.name,
    date: primaryTx.date,
    amount: parseFloat(primaryTx.amount),
    invoiceNumber: '008421',
  });

  console.log('\n----------------------------------------------------------------');
  console.log('3. PLANNED ACTIONS:');
  console.log('----------------------------------------------------------------');
  for (const dup of duplicateTxs) {
    const docLinked = docRes.rows.find(d => d.transaction_id === dup.id);
    if (docLinked) {
      console.log(`  [Action] Relink document "${docLinked.id}" transaction_id to preserved "${primaryTx.id}"`);
    }
    console.log(`  [Action] Delete redundant duplicate transaction "${dup.id}"`);
  }
  console.log(`  [Action] Backfill receipt_fingerprint "${computedFp}" on preserved transaction "${primaryTx.id}"`);

  const duplicateIds = duplicateTxs.map(d => d.id);

  if (!isConfirmed) {
    console.log('\n================================================================');
    console.log('  SAFEGUARD NOTICE:');
    console.log('  Nothing was modified or deleted.');
    console.log('  To apply this cleanup, run:');
    console.log('    npx tsx server/scripts/cleanupDuplicateReceipts.ts --confirm');
    console.log('================================================================\n');

    console.log('Equivalent SQL for manual review:');
    console.log(`
      BEGIN;
      -- 1. Relink duplicate document(s) to primary transaction
      UPDATE documents 
      SET transaction_id = '${primaryTx.id}', 
          receipt_fingerprint = '${computedFp}', 
          updated_at = CURRENT_TIMESTAMP 
      WHERE transaction_id IN ('${duplicateIds.join("', '")}');

      -- 2. Update primary transaction with normalized fingerprint
      UPDATE transactions 
      SET receipt_fingerprint = '${computedFp}' 
      WHERE id = '${primaryTx.id}';

      -- 3. Delete redundant duplicate transaction(s)
      DELETE FROM transactions 
      WHERE id IN ('${duplicateIds.join("', '")}');
      COMMIT;
    `);

    process.exit(0);
  }

  // Confirmed execution inside atomic transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Relink documents pointing to duplicates
    for (const dup of duplicateTxs) {
      const docLinked = docRes.rows.find(d => d.transaction_id === dup.id);
      if (docLinked) {
        await client.query(
          `UPDATE documents 
           SET transaction_id = $1, receipt_fingerprint = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3;`,
          [primaryTx.id, computedFp, docLinked.id]
        );
        console.log(`  ✓ Relinked document "${docLinked.id}" to primary transaction "${primaryTx.id}"`);
      }

      // 2. Delete redundant duplicate transaction
      await client.query(
        `DELETE FROM transactions 
         WHERE id = $1;`,
        [dup.id]
      );
      console.log(`  ✓ Deleted redundant duplicate transaction "${dup.id}"`);
    }

    // 3. Set fingerprint on primary transaction
    await client.query(
      `UPDATE transactions 
       SET receipt_fingerprint = $1 
       WHERE id = $2;`,
      [computedFp, primaryTx.id]
    );
    console.log(`  ✓ Updated primary transaction "${primaryTx.id}" with fingerprint "${computedFp}"`);

    await client.query('COMMIT');

    console.log('\n================================================================');
    console.log('  SUCCESSFULLY DEDUPLICATED GREEN LEAF CAFE TRANSACTIONS! ✓');
    console.log(`  Preserved Transaction ID: ${primaryTx.id}`);
    console.log(`  Removed Duplicate IDs   : ${duplicateIds.join(', ')}`);
    console.log('================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Deduplication transaction failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
