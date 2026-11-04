/**
 * FinSight AI — Test Suite: Transaction Management CRUD, Filters, & Tenant Isolation
 * 
 * Verifies:
 * 1. Adding income and expense transactions manually.
 * 2. Editing transaction amount, type, category, date, description, and notes.
 * 3. Deleting transactions with confirmation.
 * 4. Searching and filtering by date, type, category, and description.
 * 5. Multi-tenant isolation: a user can NEVER read, modify, or delete another user's transactions.
 * 6. Financial context synchrony: live recalculation of Income, Expenses, Net Savings, and Savings Rate.
 * 7. Preservation of existing production records with zero mutations.
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDbPool } from './db.js';
import {
  getAllTransactions,
  getTransactionById,
  insertTransaction,
  updateTransaction,
  deleteTransactionById,
  DbTransactionInput,
  FrontendTransaction,
} from './repositories/transactionRepository.js';
import { createUser, deleteUserById } from './repositories/userRepository.js';
import { isTransactionInSelectedMonth, parseTransactionDate, formatStandardDate } from '../src/utils/dateUtils.js';

function assert(condition: boolean, message: string, details?: any) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`, details || '');
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runAuditTests() {
  console.log('\n================================================================');
  console.log('FinSight AI — Transaction Management End-to-End Audit & Test');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not available');
  }

  // -------------------------------------------------------------
  // Baseline Check: Existing Production Users Integrity
  // -------------------------------------------------------------
  console.log('--- Phase 1: Production Data Baseline Integrity Check ---');
  const prodUsers = [
    { id: 'usr_1793218238197_wlal7w', expectedCount: 448 },
    { id: 'usr_1793694459965_qsmsix', expectedCount: 395 },
    { id: 'usr_1793776914179_cribje', expectedCount: 395 },
  ];

  for (const u of prodUsers) {
    const txs = await getAllTransactions(u.id, 5000, 0);
    assert(
      txs.length === u.expectedCount,
      `Production user ${u.id} must have exactly ${u.expectedCount} transactions (got ${txs.length})`
    );
  }

  // -------------------------------------------------------------
  // Phase 2: Create Ephemeral Test Users (User A and User B)
  // -------------------------------------------------------------
  console.log('\n--- Phase 2: Create Ephemeral Test Users (User A & User B) ---');
  const stamp = Date.now();
  const userA = await createUser({
    email: `test_audit_a_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Auditor A',
    monthlyIncome: 65000,
  });
  console.log(`Created User A: ${userA.id} (${userA.email})`);

  const userB = await createUser({
    email: `test_audit_b_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Auditor B',
    monthlyIncome: 50000,
  });
  console.log(`Created User B: ${userB.id} (${userB.email})`);

  try {
    // -------------------------------------------------------------
    // Phase 3: Add Income and Expense Transactions Manually
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Add Income and Expense Transactions (CREATE) ---');
    
    // Expense transaction
    const expenseInput: DbTransactionInput = {
      name: 'Swiggy Dinner',
      category: 'Food & Dining',
      amount: 850.50,
      date: '04 Nov 2026',
      type: 'expense',
      paymentMethod: 'UPI',
      notes: 'Team dinner outing',
      status: 'Completed',
    };
    const createdExpense = await insertTransaction(expenseInput, userA.id);
    assert(!!createdExpense.id, 'Created expense transaction must have a valid ID');
    assert(createdExpense.amount === 850.50, `Expense amount must match 850.50 (got ${createdExpense.amount})`);
    assert(createdExpense.type === 'expense', 'Transaction type must be "expense"');
    assert(createdExpense.category === 'Food & Dining', 'Category must be "Food & Dining"');
    assert(createdExpense.notes === 'Team dinner outing', 'Notes must match input');

    // Income transaction
    const incomeInput: DbTransactionInput = {
      name: 'Freelance Design Honorarium',
      category: 'Income',
      amount: 25000.00,
      date: '04 Nov 2026',
      type: 'income',
      paymentMethod: 'Bank Transfer',
      notes: 'Q4 branding project milestone',
      status: 'Completed',
    };
    const createdIncome = await insertTransaction(incomeInput, userA.id);
    assert(!!createdIncome.id, 'Created income transaction must have a valid ID');
    assert(createdIncome.amount === 25000.00, `Income amount must match 25000.00 (got ${createdIncome.amount})`);
    assert(createdIncome.type === 'income', 'Transaction type must be "income"');
    assert(createdIncome.category === 'Income', 'Category must be "Income"');

    // Verify in database via direct query
    const dbRows = await pool.query(
      'SELECT id, name, amount, type, user_id FROM transactions WHERE user_id = $1 ORDER BY created_at ASC;',
      [userA.id]
    );
    assert(dbRows.rows.length === 2, `User A must have exactly 2 transactions in DB (got ${dbRows.rows.length})`);
    assert(dbRows.rows[0].user_id === userA.id, 'First transaction user_id must strictly match User A');
    assert(dbRows.rows[1].user_id === userA.id, 'Second transaction user_id must strictly match User A');

    // -------------------------------------------------------------
    // Phase 4: Multi-Tenant Isolation (READ)
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: Tenant Data Isolation on Read (ISOLATION) ---');
    const userATxs = await getAllTransactions(userA.id, 5000, 0);
    assert(userATxs.length === 2, `User A should read 2 transactions (got ${userATxs.length})`);

    const userBTxs = await getAllTransactions(userB.id, 5000, 0);
    assert(userBTxs.length === 0, `User B must see ZERO transactions (got ${userBTxs.length})`);

    // Cross-tenant single item lookup attempt by User B on User A's transaction
    const crossTenantRead = await getTransactionById(createdExpense.id, userB.id);
    assert(crossTenantRead === null, 'User B must NEVER be able to read User A\'s transaction (got record back)');

    // -------------------------------------------------------------
    // Phase 5: Edit Transaction (UPDATE) & Prevent Cross-Tenant Updates
    // -------------------------------------------------------------
    console.log('\n--- Phase 5: Edit Transaction Fields (UPDATE) ---');
    const updatePayload: Partial<DbTransactionInput> = {
      name: 'Swiggy Gourmet Dinner & Dessert',
      amount: 1250.75,
      category: 'Food & Dining',
      date: '04 Nov 2026',
      type: 'expense',
      paymentMethod: 'Credit Card',
      notes: 'Updated team dinner with dessert',
    };

    // User A successfully edits their own transaction
    const updated = await updateTransaction(createdExpense.id, userA.id, updatePayload);
    assert(updated !== null, 'Update on User A\'s transaction should succeed');
    assert(updated!.name === 'Swiggy Gourmet Dinner & Dessert', 'Name should be updated');
    assert(updated!.amount === 1250.75, `Amount should be updated to 1250.75 (got ${updated!.amount})`);
    assert(updated!.paymentMethod === 'Credit Card', 'Payment method should be updated to Credit Card');
    assert(updated!.notes === 'Updated team dinner with dessert', 'Notes should be updated');

    // Verify DB reflection
    const dbExpense = await getTransactionById(createdExpense.id, userA.id);
    assert(dbExpense?.amount === 1250.75, 'Database must persist updated amount 1250.75');

    // Attack Prevention: User B attempts to edit User A's transaction
    console.log('--- Sub-test: Cross-tenant UPDATE attack prevention ---');
    const maliciousUpdate = await updateTransaction(createdExpense.id, userB.id, {
      name: 'Hacked By User B',
      amount: 1.00,
    });
    assert(maliciousUpdate === null, 'User B\'s update attempt on User A\'s transaction must be REJECTED (null)');

    // Verify User A's transaction was completely unmolested
    const postAttackTx = await getTransactionById(createdExpense.id, userA.id);
    assert(postAttackTx?.name === 'Swiggy Gourmet Dinner & Dessert', 'Record name must NOT have changed');
    assert(postAttackTx?.amount === 1250.75, 'Record amount must NOT have changed');

    // -------------------------------------------------------------
    // Phase 6: Cross-Tenant Delete Attack & Delete Operation
    // -------------------------------------------------------------
    console.log('\n--- Phase 6: Delete Transaction & Cross-Tenant Attack (DELETE) ---');
    
    // Attack Prevention: User B attempts to delete User A's transaction
    const maliciousDelete = await deleteTransactionById(createdExpense.id, userB.id);
    assert(maliciousDelete === false, 'User B\'s delete attempt on User A\'s transaction must return FALSE');

    // Verify transaction still exists
    const stillExists = await getTransactionById(createdExpense.id, userA.id);
    assert(stillExists !== null, 'User A\'s transaction must still exist in DB after failed malicious delete');

    // Legitimate Delete by User A
    const legitimateDelete = await deleteTransactionById(createdExpense.id, userA.id);
    assert(legitimateDelete === true, 'User A should be able to delete their own transaction');

    // Verify deletion in database
    const postDeleteCheck = await getTransactionById(createdExpense.id, userA.id);
    assert(postDeleteCheck === null, 'Deleted transaction must no longer exist in DB');

    const remainingTxs = await getAllTransactions(userA.id, 5000, 0);
    assert(remainingTxs.length === 1, `User A should now have exactly 1 transaction (got ${remainingTxs.length})`);
    assert(remainingTxs[0].id === createdIncome.id, 'Remaining transaction must be the income record');

    // -------------------------------------------------------------
    // Phase 7: Search and Filter Logic Validation
    // -------------------------------------------------------------
    console.log('\n--- Phase 7: Search & Filter Logic by Date, Type, Category, Description ---');
    
    // Add diverse transactions to User A to test all filter dimensions
    const testFixture: DbTransactionInput[] = [
      {
        name: 'Blue Tokai Specialty Coffee',
        category: 'Food & Dining',
        amount: 320.00,
        date: '04 Nov 2026',
        type: 'expense',
        paymentMethod: 'UPI',
        notes: 'Cold brew and artisanal croissant',
      },
      {
        name: 'Zara Menswear Flagship',
        category: 'Shopping',
        amount: 3499.00,
        date: '28 Oct 2026',
        type: 'expense',
        paymentMethod: 'Card',
        notes: 'Winter jacket and formal trousers',
      },
      {
        name: 'Uber Premier Airport Ride',
        category: 'Transport',
        amount: 850.00,
        date: '15 Oct 2026',
        type: 'expense',
        paymentMethod: 'UPI',
        notes: 'Airport terminal 2 ride',
      },
      {
        name: 'Fintech Advisory Retainer',
        category: 'Income',
        amount: 15000.00,
        date: '01 Nov 2026',
        type: 'income',
        paymentMethod: 'Bank Transfer',
        notes: 'Monthly advisory retainer fee',
      },
    ];

    for (const f of testFixture) {
      await insertTransaction(f, userA.id);
    }

    const allUserATxs = await getAllTransactions(userA.id, 5000, 0);
    assert(allUserATxs.length === 5, `User A should have 5 total transactions (1 income + 4 new) (got ${allUserATxs.length})`);

    // Helper filter function replicating UI filteredTransactions logic
    function applyUiFilters(
      txList: FrontendTransaction[],
      monthScope: string,
      typeScope: 'All' | 'income' | 'expense',
      categoryScope: string,
      query: string
    ) {
      return txList.filter(tx => {
        const matchesMonth =
          monthScope === 'All Time' || isTransactionInSelectedMonth(tx.date, monthScope);

        const matchesSearch =
          !query ||
          tx.name.toLowerCase().includes(query.toLowerCase()) ||
          tx.category.toLowerCase().includes(query.toLowerCase()) ||
          (tx.notes && tx.notes.toLowerCase().includes(query.toLowerCase())) ||
          (tx.date && tx.date.toLowerCase().includes(query.toLowerCase()));

        const matchesCategory = categoryScope === 'All' || tx.category === categoryScope;
        const matchesType = typeScope === 'All' || tx.type === typeScope;

        return matchesMonth && matchesSearch && matchesCategory && matchesType;
      });
    }

    // 1. Month Filter
    const novTxs = applyUiFilters(allUserATxs, 'November 2026', 'All', 'All', '');
    assert(novTxs.length === 3, `November 2026 should match 3 transactions (got ${novTxs.length})`);

    const octTxs = applyUiFilters(allUserATxs, 'October 2026', 'All', 'All', '');
    assert(octTxs.length === 2, `October 2026 should match 2 transactions (got ${octTxs.length})`);

    const allTimeTxs = applyUiFilters(allUserATxs, 'All Time', 'All', 'All', '');
    assert(allTimeTxs.length === 5, `All Time should match all 5 transactions (got ${allTimeTxs.length})`);

    // 2. Type Filter
    const incomeOnly = applyUiFilters(allUserATxs, 'All Time', 'income', 'All', '');
    assert(incomeOnly.length === 2, `Income filter should return 2 records (got ${incomeOnly.length})`);

    const expenseOnly = applyUiFilters(allUserATxs, 'All Time', 'expense', 'All', '');
    assert(expenseOnly.length === 3, `Expense filter should return 3 records (got ${expenseOnly.length})`);

    // 3. Category Filter
    const shoppingOnly = applyUiFilters(allUserATxs, 'All Time', 'All', 'Shopping', '');
    assert(shoppingOnly.length === 1 && shoppingOnly[0].name.includes('Zara'), 'Category "Shopping" matches Zara');

    const foodOnly = applyUiFilters(allUserATxs, 'All Time', 'All', 'Food & Dining', '');
    assert(foodOnly.length === 1 && foodOnly[0].name.includes('Blue Tokai'), 'Category "Food & Dining" matches Blue Tokai');

    // 4. Search Filter (by description, notes, date, category)
    const searchCoffee = applyUiFilters(allUserATxs, 'All Time', 'All', 'All', 'coffee');
    assert(searchCoffee.length === 1 && searchCoffee[0].name.includes('Blue Tokai'), 'Search by name "coffee"');

    const searchJacket = applyUiFilters(allUserATxs, 'All Time', 'All', 'All', 'jacket');
    assert(searchJacket.length === 1 && searchJacket[0].name.includes('Zara'), 'Search by notes "jacket"');

    const searchDate = applyUiFilters(allUserATxs, 'All Time', 'All', 'All', '28 Oct');
    assert(searchDate.length === 1 && searchDate[0].name.includes('Zara'), 'Search by date text "28 Oct"');

    const searchCaseInsensitive = applyUiFilters(allUserATxs, 'All Time', 'All', 'All', 'AIRPORT');
    assert(searchCaseInsensitive.length === 1 && searchCaseInsensitive[0].name.includes('Uber'), 'Search case-insensitive "AIRPORT"');

    // -------------------------------------------------------------
    // Phase 8: Financial Calculations & Live Reactive Derivations
    // -------------------------------------------------------------
    console.log('\n--- Phase 8: Dynamic Financial Calculations & Totals ---');
    
    // Nov 2026:
    // Income: 25,000 + 15,000 = 40,000.00
    // Expenses: 320.00
    // Net: 39,680.00
    // Savings Rate: (39680 / 40000) * 100 = 99.2%
    const novInc = Number(novTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toFixed(2));
    const novExp = Number(novTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(2));
    const novNet = Number((novInc - novExp).toFixed(2));
    const novRate = Number(((novNet / novInc) * 100).toFixed(1));

    assert(novInc === 40000.00, `Nov Income must be ₹40,000.00 (got ₹${novInc})`);
    assert(novExp === 320.00, `Nov Expenses must be ₹320.00 (got ₹${novExp})`);
    assert(novNet === 39680.00, `Nov Net Savings must be ₹39,680.00 (got ₹${novNet})`);
    assert(novRate === 99.2, `Nov Savings Rate must be 99.2% (got ${novRate}%)`);

    // All Time:
    // Income: 40,000.00
    // Expenses: 320 + 3499 + 850 = 4,669.00
    // Net: 40000 - 4669 = 35,331.00
    // Savings Rate: (35331 / 40000) * 100 = 88.3%
    const allInc = Number(allTimeTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toFixed(2));
    const allExp = Number(allTimeTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(2));
    const allNet = Number((allInc - allExp).toFixed(2));
    const allRate = Number(((allNet / allInc) * 100).toFixed(1));

    assert(allInc === 40000.00, `All Time Income must be ₹40,000.00 (got ₹${allInc})`);
    assert(allExp === 4669.00, `All Time Expenses must be ₹4,669.00 (got ₹${allExp})`);
    assert(allNet === 35331.00, `All Time Net Savings must be ₹35,331.00 (got ₹${allNet})`);
    assert(allRate === 88.3, `All Time Savings Rate must be 88.3% (got ${allRate}%)`);

  } finally {
    // -------------------------------------------------------------
    // Phase 9: Ephemeral Test Data Cleanup
    // -------------------------------------------------------------
    console.log('\n--- Phase 9: Ephemeral Test User & Data Cleanup ---');
    await pool.query('DELETE FROM transactions WHERE user_id = $1 OR user_id = $2;', [userA.id, userB.id]);
    await deleteUserById(userA.id);
    await deleteUserById(userB.id);
    console.log(`Cleaned up ephemeral users ${userA.id} and ${userB.id}`);
  }

  // -------------------------------------------------------------
  // Phase 10: Final Production Data Preservation Check
  // -------------------------------------------------------------
  console.log('\n--- Phase 10: Final Production Data Preservation Verification ---');
  for (const u of prodUsers) {
    const txs = await getAllTransactions(u.id, 5000, 0);
    assert(
      txs.length === u.expectedCount,
      `Production user ${u.id} must STILL have exactly ${u.expectedCount} transactions (got ${txs.length})`
    );
  }

  console.log('\n================================================================');
  console.log('🎉 ALL TRANSACTION MANAGEMENT & ISOLATION TESTS PASSED!');
  console.log('================================================================\n');
}

runAuditTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });

