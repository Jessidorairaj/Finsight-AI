/**
 * FinSight AI — Test Suite: Recurring Transactions & Bill Reminders Management,
 * Schedule Dates, Duplicate Prevention, Payment Linking & Multi-Tenant Isolation
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDbPool } from './db.js';
import {
  getAllRecurringTransactions,
  getRecurringTransactionById,
  insertRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransactionById,
  processRecurringTransaction,
  computeNextDueDate,
  FrontendRecurringTransaction,
} from './repositories/recurringTransactionsRepository.js';
import {
  getAllBills,
  getBillById,
  insertBill,
  updateBill,
  deleteBillById,
  payBillAndLinkTransaction,
  FrontendBill,
} from './repositories/financialEntitiesRepository.js';
import {
  getAllTransactions,
  getTransactionById,
  deleteTransactionById,
  FrontendTransaction,
} from './repositories/transactionRepository.js';
import { createUser, deleteUserById } from './repositories/userRepository.js';

function assert(condition: boolean, message: string, details?: any) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`, details || '');
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runAuditTests() {
  console.log('\n================================================================');
  console.log('FinSight AI — Recurring Transactions & Bills End-to-End Audit');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not available');
  }

  // -------------------------------------------------------------
  // Phase 1: Production Baseline Integrity Check
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
  // Phase 2: Create Ephemeral Test Users (User A & User B)
  // -------------------------------------------------------------
  console.log('\n--- Phase 2: Create Ephemeral Test Users ---');
  const stamp = Date.now();
  const userA = await createUser({
    email: `test_recurring_a_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Scheduler A',
    monthlyIncome: 80000,
  });
  console.log(`Created User A: ${userA.id} (${userA.email})`);

  const userB = await createUser({
    email: `test_recurring_b_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Scheduler B',
    monthlyIncome: 60000,
  });
  console.log(`Created User B: ${userB.id} (${userB.email})`);

  try {
    // -------------------------------------------------------------
    // Phase 3: Recurring Transactions CRUD & Schedules
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Recurring Transactions CRUD & Schedules ---');

    // 3.1 Create Weekly Expense
    const recWeekly = await insertRecurringTransaction(
      {
        name: 'Weekly Gym Training',
        description: 'Personal fitness session fee',
        amount: 850,
        type: 'expense',
        category: 'Healthcare',
        frequency: 'weekly',
        startDate: '01 Nov 2026',
        nextDueDate: '01 Nov 2026',
        autoCreate: false,
        status: 'active',
      },
      userA.id
    );
    assert(recWeekly.name === 'Weekly Gym Training', 'Weekly schedule created');
    assert(recWeekly.frequency === 'weekly', 'Frequency is weekly');
    assert(recWeekly.amount === 850, 'Amount is ₹850');
    assert(recWeekly.autoCreate === false, 'Default autoCreate is false (user confirmation required)');

    // 3.2 Create Monthly Income
    const recMonthlyIncome = await insertRecurringTransaction(
      {
        name: 'Monthly Consulting Retainer',
        amount: 45000,
        type: 'income',
        category: 'Income',
        frequency: 'monthly',
        startDate: '05 Nov 2026',
        nextDueDate: '05 Nov 2026',
        autoCreate: true,
      },
      userA.id
    );
    assert(recMonthlyIncome.name === 'Monthly Consulting Retainer', 'Monthly income schedule created');
    assert(recMonthlyIncome.type === 'income', 'Type is income');
    assert(recMonthlyIncome.amount === 45000, 'Amount is ₹45,000');

    // 3.3 Create Yearly Expense with Optional End Date
    const recYearly = await insertRecurringTransaction(
      {
        name: 'Cloud Hosting Annual Plan',
        amount: 12000,
        type: 'expense',
        category: 'Bills & Utilities',
        frequency: 'yearly',
        startDate: '10 Nov 2026',
        endDate: '10 Nov 2028',
        nextDueDate: '10 Nov 2026',
      },
      userA.id
    );
    assert(recYearly.frequency === 'yearly', 'Frequency is yearly');
    assert(recYearly.endDate === '10 Nov 2028', 'Optional end date is persisted');

    // 3.4 Read: User A should have 3 recurring entries
    const userARecList = await getAllRecurringTransactions(userA.id);
    assert(userARecList.length === 3, `User A has exactly 3 recurring entries (got ${userARecList.length})`);

    // 3.5 Edit recurring schedule
    const updatedWeekly = await updateRecurringTransaction(recWeekly.id, userA.id, {
      amount: 950,
      description: 'Updated trainer fee',
    });
    assert(updatedWeekly !== null && updatedWeekly.amount === 950, 'Amount updated to ₹950');
    assert(updatedWeekly?.description === 'Updated trainer fee', 'Description updated');

    // 3.6 Pause and Resume
    const paused = await updateRecurringTransaction(recWeekly.id, userA.id, { status: 'paused' });
    assert(paused?.status === 'paused', 'Schedule paused successfully');

    const resumed = await updateRecurringTransaction(recWeekly.id, userA.id, { status: 'active' });
    assert(resumed?.status === 'active', 'Schedule resumed successfully');

    // -------------------------------------------------------------
    // Phase 4: Schedule Processing & Duplicate Prevention
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: Recurring Entry Processing & Duplicate Prevention ---');

    // 4.1 Process without user confirmation when autoCreate is false (Requirement 5)
    const unconfirmedProcess = await processRecurringTransaction(recWeekly.id, userA.id, { confirmCreate: false });
    assert(unconfirmedProcess.requiresConfirmation === true, 'Refuses auto-creation without explicit user confirmation');
    assert(unconfirmedProcess.createdTransaction === null, 'No transaction created without confirmation');

    // 4.2 Process with confirmation
    const confirmedProcess = await processRecurringTransaction(recWeekly.id, userA.id, { confirmCreate: true });
    assert(confirmedProcess.requiresConfirmation === false, 'Process succeeded with confirmation');
    assert(confirmedProcess.createdTransaction !== null, 'Created transaction in database');
    assert(confirmedProcess.createdTransaction?.amount === 950, 'Created transaction amount matches ₹950');
    assert(confirmedProcess.createdTransaction?.type === 'expense', 'Created transaction type is expense');

    // Verify next due date was advanced by exactly 7 days (weekly)
    const expectedWeeklyNext = computeNextDueDate('01 Nov 2026', 'weekly');
    assert(
      confirmedProcess.recurring.nextDueDate === expectedWeeklyNext,
      `Weekly next due date advanced to ${expectedWeeklyNext} (got ${confirmedProcess.recurring.nextDueDate})`
    );

    // 4.3 Duplicate Prevention: attempt to re-process for the same period
    // The entry's lastGeneratedDate is '01 Nov 2026'. If nextDueDate were somehow '01 Nov 2026':
    await updateRecurringTransaction(recWeekly.id, userA.id, { nextDueDate: '01 Nov 2026' });
    const duplicateProcess = await processRecurringTransaction(recWeekly.id, userA.id, { confirmCreate: true });
    assert(duplicateProcess.alreadyGenerated === true, 'Duplicate processing prevented for same period');
    assert(duplicateProcess.createdTransaction === null, 'Duplicate transaction was NOT generated');

    // 4.4 Process Monthly Schedule: verify +1 month advancement
    const monthlyProcess = await processRecurringTransaction(recMonthlyIncome.id, userA.id, { confirmCreate: true });
    assert(monthlyProcess.createdTransaction !== null, 'Created income transaction for monthly schedule');
    assert(monthlyProcess.createdTransaction?.type === 'income', 'Type is income');
    const expectedMonthlyNext = computeNextDueDate('05 Nov 2026', 'monthly');
    assert(
      monthlyProcess.recurring.nextDueDate === expectedMonthlyNext,
      `Monthly next due date advanced to ${expectedMonthlyNext} (got ${monthlyProcess.recurring.nextDueDate})`
    );

    // -------------------------------------------------------------
    // Phase 5: Bill Reminders & Payment Linking
    // -------------------------------------------------------------
    console.log('\n--- Phase 5: Bill Reminders & Payment Linking ---');

    // 5.1 Create Bill
    const bill1 = await insertBill(
      {
        name: 'Airtel Xstream Fiber',
        category: 'Bills & Utilities',
        amount: 1199,
        dueDate: '08 Nov 2026',
        dueInDays: 4,
        status: 'unpaid',
        iconType: 'wifi',
        reminderDays: 5,
        isRecurring: true,
        recurringFrequency: 'monthly',
      },
      userA.id
    );
    assert(bill1.name === 'Airtel Xstream Fiber', 'Bill created with name');
    assert(bill1.amount === 1199, 'Bill amount matches ₹1,199');
    assert(bill1.status === 'unpaid', 'Bill status is initially unpaid');
    assert(bill1.reminderDays === 5, 'Reminder days is 5');
    assert(bill1.isRecurring === true, 'Recurring flag is true');

    // 5.2 Pay Bill & Link Transaction
    const payResult = await payBillAndLinkTransaction(bill1.id, userA.id, {
      paymentMethod: 'UPI',
    });
    assert(payResult.alreadyPaid === false, 'First payment succeeds');
    assert(payResult.bill.status === 'paid', 'Bill status updated to paid');
    assert(Boolean(payResult.bill.transactionId), 'Bill now links to created transaction ID');
    assert(payResult.transaction.amount === 1199, 'Created expense transaction has ₹1,199 amount');
    assert(payResult.transaction.type === 'expense', 'Created transaction is an expense');

    // Verify transaction exists in transactions table
    const verifyTx = await getTransactionById(payResult.bill.transactionId!, userA.id);
    assert(verifyTx !== null, 'Linked transaction exists in PostgreSQL transactions table');

    // 5.3 Duplicate Prevention on Bill Payment
    const duplicatePay = await payBillAndLinkTransaction(bill1.id, userA.id);
    assert(duplicatePay.alreadyPaid === true, 'Subsequent payment detected as already paid');
    assert(
      duplicatePay.transaction.id === payResult.transaction.id,
      'Reuses existing transaction ID instead of creating duplicate'
    );

    // Verify transaction count for User A: exactly 3 transactions (1 gym expense + 1 monthly retainer income + 1 bill payment)
    const userATxs = await getAllTransactions(userA.id, 100, 0);
    assert(userATxs.length === 3, `User A has exactly 3 transactions (got ${userATxs.length})`);

    // -------------------------------------------------------------
    // Phase 6: Multi-Tenant Isolation (User B vs User A)
    // -------------------------------------------------------------
    console.log('\n--- Phase 6: Multi-Tenant Isolation ---');

    // User B attempts to read User A's recurring entries
    const userBRecs = await getAllRecurringTransactions(userB.id);
    assert(userBRecs.length === 0, 'User B sees 0 recurring transactions');

    const unauthorizedRecGet = await getRecurringTransactionById(recWeekly.id, userB.id);
    assert(unauthorizedRecGet === null, 'User B cannot get User A recurring entry by ID');

    const unauthorizedRecUpdate = await updateRecurringTransaction(recWeekly.id, userB.id, { amount: 1 });
    assert(unauthorizedRecUpdate === null, 'User B cannot update User A recurring entry');

    let unauthorizedProcessCaught = false;
    try {
      await processRecurringTransaction(recWeekly.id, userB.id, { confirmCreate: true });
    } catch {
      unauthorizedProcessCaught = true;
    }
    assert(unauthorizedProcessCaught, 'User B cannot process User A recurring entry');

    const unauthorizedRecDelete = await deleteRecurringTransactionById(recWeekly.id, userB.id);
    assert(unauthorizedRecDelete === false, 'User B cannot delete User A recurring entry');

    // User B attempts to access User A's bills
    const userBBills = await getAllBills(userB.id);
    assert(userBBills.length === 0, 'User B sees 0 bills');

    const unauthorizedBillGet = await getBillById(bill1.id, userB.id);
    assert(unauthorizedBillGet === null, 'User B cannot get User A bill by ID');

    let unauthorizedBillPayCaught = false;
    try {
      await payBillAndLinkTransaction(bill1.id, userB.id);
    } catch {
      unauthorizedBillPayCaught = true;
    }
    assert(unauthorizedBillPayCaught, 'User B cannot pay or manipulate User A bill');

    const unauthorizedBillDelete = await deleteBillById(bill1.id, userB.id);
    assert(unauthorizedBillDelete === false, 'User B cannot delete User A bill');

    // -------------------------------------------------------------
    // Phase 7: Clean Up Ephemeral Records
    // -------------------------------------------------------------
    console.log('\n--- Phase 7: Clean Up Ephemeral Records ---');

    // Delete User A recurring entries
    await deleteRecurringTransactionById(recWeekly.id, userA.id);
    await deleteRecurringTransactionById(recMonthlyIncome.id, userA.id);
    await deleteRecurringTransactionById(recYearly.id, userA.id);
    const recLeft = await getAllRecurringTransactions(userA.id);
    assert(recLeft.length === 0, 'All ephemeral recurring entries deleted');

    // Delete User A bills
    await deleteBillById(bill1.id, userA.id);
    const billsLeft = await getAllBills(userA.id);
    assert(billsLeft.length === 0, 'All ephemeral bills deleted');

    // Delete User A transactions
    for (const t of userATxs) {
      await deleteTransactionById(t.id, userA.id);
    }
    const txsLeft = await getAllTransactions(userA.id, 100, 0);
    assert(txsLeft.length === 0, 'All ephemeral transactions deleted');

    console.log('✓ Ephemeral test records cleanly deleted.');
  } finally {
    // Delete test users
    console.log('\n--- Phase 8: Clean Up Ephemeral Users ---');
    await deleteUserById(userA.id);
    await deleteUserById(userB.id);
    console.log(`Cleaned up ephemeral users ${userA.id} and ${userB.id}`);
  }

  // -------------------------------------------------------------
  // Phase 9: Final Production Data Baseline Integrity Check
  // -------------------------------------------------------------
  console.log('\n--- Phase 9: Final Production Data Baseline Integrity Check ---');
  for (const u of prodUsers) {
    const txs = await getAllTransactions(u.id, 5000, 0);
    assert(
      txs.length === u.expectedCount,
      `User ${u.id} preserved exactly ${u.expectedCount} transactions (got ${txs.length})`
    );
  }

  console.log('\n================================================================');
  console.log('🎉 ALL RECURRING & BILLS AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runAuditTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ AUDIT SUITE FAILED:', err);
    process.exit(1);
  });

