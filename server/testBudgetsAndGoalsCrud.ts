/**
 * FinSight AI — Test Suite: Budgets & Savings Goals Management, Calculations & Tenant Isolation
 * 
 * Verifies:
 * 1. Budgets CRUD (Create, Read, Update, Delete) with category, limit, month, and color.
 * 2. Duplicate budget prevention for same user, month, and category (case-insensitive).
 * 3. Actual spending calculation from completed expenses in selected month.
 * 4. Warning thresholds: Healthy (< 85%), Near Limit (>= 85%), Over Budget (> 100%).
 * 5. Exclusion of pending expenses and non-expense transactions from actual spending.
 * 6. Savings Goals CRUD with optional target date.
 * 7. Savings Goal contributions, progress calculation, and remaining balance.
 * 8. Multi-tenant isolation: User B cannot read, edit, contribute to, or delete User A's budgets or goals.
 * 9. Production data integrity baseline verification.
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDbPool } from './db.js';
import {
  getAllBudgets,
  getBudgetById,
  getBudgetByUserMonthCategory,
  insertBudget,
  updateBudget,
  deleteBudgetById,
  getAllGoals,
  getGoalById,
  insertGoal,
  updateGoal,
  contributeToGoal,
  deleteGoalById,
  FrontendBudget,
  FrontendGoal,
} from './repositories/financialEntitiesRepository.js';
import {
  getAllTransactions,
  insertTransaction,
  deleteTransactionById,
  DbTransactionInput,
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

/**
 * Mirror the frontend FinancialContext budget calculation logic for testing
 */
function calculateBudgetWithSpent(
  budgets: FrontendBudget[],
  transactions: FrontendTransaction[],
  selectedMonth: string
) {
  const categorySpentMap: Record<string, number> = {};
  transactions
    .filter(t => t.type === 'expense' && (t.status === 'Completed' || !t.status))
    .forEach(t => {
      categorySpentMap[t.category] = Number(((categorySpentMap[t.category] || 0) + Number(t.amount || 0)).toFixed(2));
    });

  const categoryBudgetMap = new Map<string, FrontendBudget>();

  // 1. General 'All'
  budgets.forEach(b => {
    const bMonth = (b.month || 'All').toLowerCase();
    if (bMonth === 'all' || bMonth === 'all time') {
      categoryBudgetMap.set(b.category.toLowerCase(), b);
    }
  });

  // 2. Specific month overrides
  if (selectedMonth && selectedMonth.toLowerCase() !== 'all time') {
    budgets.forEach(b => {
      const bMonth = (b.month || '').toLowerCase();
      if (bMonth === selectedMonth.toLowerCase()) {
        categoryBudgetMap.set(b.category.toLowerCase(), b);
      }
    });
  }

  const resolvedBudgets = Array.from(categoryBudgetMap.values());

  return resolvedBudgets.map(b => {
    const spent = categorySpentMap[b.category] || 0;
    const pct = b.allocated > 0 ? Math.round((spent / b.allocated) * 100) : 0;
    return {
      ...b,
      spent,
      percentageUsed: pct,
      isOverBudget: spent > b.allocated,
      isNearLimit: spent >= b.allocated * 0.85 && spent <= b.allocated,
      remaining: Math.max(Number((b.allocated - spent).toFixed(2)), 0),
    };
  });
}

async function runAuditTests() {
  console.log('\n================================================================');
  console.log('FinSight AI — Budgets & Savings Goals End-to-End Audit & Test');
  console.log('================================================================\n');

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool not available');
  }

  // -------------------------------------------------------------
  // Phase 1: Baseline Check: Existing Production Users Integrity
  // -------------------------------------------------------------
  console.log('--- Phase 1: Production Baseline Integrity Check ---');
  const prodUserId = 'usr_1793218238197_wlal7w';
  const baselineTxs = await getAllTransactions(prodUserId, 5000, 0);
  assert(baselineTxs.length === 448, `User ${prodUserId} must have 448 transactions (got ${baselineTxs.length})`);

  const baselineBudgets = await getAllBudgets(prodUserId);
  assert(baselineBudgets.length === 6, `User ${prodUserId} must have 6 baseline budgets (got ${baselineBudgets.length})`);

  const baselineGoals = await getAllGoals(prodUserId);
  assert(baselineGoals.length === 4, `User ${prodUserId} must have 4 baseline goals (got ${baselineGoals.length})`);

  // -------------------------------------------------------------
  // Phase 2: Create Ephemeral Test Users (User A & User B)
  // -------------------------------------------------------------
  console.log('\n--- Phase 2: Create Ephemeral Test Users ---');
  const stamp = Date.now();
  const userA = await createUser({
    email: `test_budget_a_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Budgeter A',
    monthlyIncome: 75000,
  });
  console.log(`Created User A: ${userA.id} (${userA.email})`);

  const userB = await createUser({
    email: `test_budget_b_${stamp}@finsight.local`,
    passwordHash: 'argon2_dummy_hash_test',
    displayName: 'Test Budgeter B',
    monthlyIncome: 55000,
  });
  console.log(`Created User B: ${userB.id} (${userB.email})`);

  try {
    // -------------------------------------------------------------
    // Phase 3: Budgets CRUD Operations
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Budgets CRUD Operations ---');

    // 3.1 Create Budget for November 2026
    const budgetA1 = await insertBudget(
      {
        category: 'Food & Dining',
        allocated: 5000,
        month: 'November 2026',
        color: '#10B981',
      },
      userA.id
    );
    assert(budgetA1.category === 'Food & Dining', 'Budget category matches');
    assert(budgetA1.allocated === 5000, 'Budget allocated amount matches 5000');
    assert(budgetA1.month === 'November 2026', 'Budget month matches November 2026');
    assert(budgetA1.color === '#10B981', 'Budget color matches');

    // 3.2 Duplicate Prevention: Same user, category, and month
    let duplicateCaught = false;
    try {
      await insertBudget(
        {
          category: 'food & dining', // case-insensitive test
          allocated: 6000,
          month: 'November 2026',
        },
        userA.id
      );
    } catch (err: any) {
      duplicateCaught = true;
      assert(err.message.includes('DUPLICATE_BUDGET'), 'Duplicate budget rejected with DUPLICATE_BUDGET error');
    }
    assert(duplicateCaught, 'Prevented creating duplicate budget for same category and month');

    // 3.3 Create Budget for Different Month (Allowed)
    const budgetA2 = await insertBudget(
      {
        category: 'Food & Dining',
        allocated: 6000,
        month: 'October 2026',
        color: '#10B981',
      },
      userA.id
    );
    assert(budgetA2.month === 'October 2026', 'Different month for same category is allowed');

    // 3.4 Read Budgets: User A should have 2 budgets
    const userABudgets = await getAllBudgets(userA.id);
    assert(userABudgets.length === 2, `User A has exactly 2 budgets (got ${userABudgets.length})`);

    // 3.5 Read with Month Filter: 'November 2026'
    const novBudgets = await getAllBudgets(userA.id, 'November 2026');
    assert(novBudgets.length === 1 && novBudgets[0].id === budgetA1.id, 'Month filter returns only matching budget');

    // 3.6 Update Budget Limit: Update budgetA1 from 5000 to 7500
    const updatedA1 = await updateBudget(budgetA1.id, userA.id, { allocated: 7500 });
    assert(updatedA1 !== null && updatedA1.allocated === 7500, 'Budget limit updated to 7500');

    // 3.7 Update Conflict Prevention: Try renaming October budget's month to November 2026
    let updateConflictCaught = false;
    try {
      await updateBudget(budgetA2.id, userA.id, { month: 'November 2026' });
    } catch (err: any) {
      updateConflictCaught = true;
      assert(err.message.includes('DUPLICATE_BUDGET'), 'Update conflict correctly rejected');
    }
    assert(updateConflictCaught, 'Prevented updating month to cause duplicate conflict');

    // -------------------------------------------------------------
    // Phase 4: Spending Calculations & Warning Thresholds
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: Budget Spending Calculations & Warning Thresholds ---');

    // Budget limit is 7,500
    // Test 4.1: Initial State (No transactions)
    let state = calculateBudgetWithSpent([updatedA1!], [], 'November 2026');
    assert(state.length === 1, 'Resolved 1 active budget for November 2026');
    assert(state[0].spent === 0, 'Initial spent is 0');
    assert(state[0].remaining === 7500, 'Initial remaining is 7500');
    assert(state[0].percentageUsed === 0, 'Initial percentage is 0%');
    assert(!state[0].isNearLimit, 'Initial state is not near limit');
    assert(!state[0].isOverBudget, 'Initial state is not over budget');

    // Test 4.2: Healthy Spending (₹4,500 / ₹7,500 = 60%)
    const tx1 = await insertTransaction(
      {
        name: 'Weekly Groceries',
        category: 'Food & Dining',
        amount: 4500,
        date: '10 Nov 2026',
        type: 'expense',
        paymentMethod: 'Credit Card',
        status: 'Completed',
      },
      userA.id
    );
    let allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 4500, `Spent is ₹4,500 (got ${state[0].spent})`);
    assert(state[0].remaining === 3000, `Remaining is ₹3,000 (got ${state[0].remaining})`);
    assert(state[0].percentageUsed === 60, `Percentage used is 60% (got ${state[0].percentageUsed}%)`);
    assert(!state[0].isNearLimit, '60% is healthy, not near limit');
    assert(!state[0].isOverBudget, '60% is not over budget');

    // Test 4.3: Near Limit Warning >= 85% (Add ₹2,000 -> Total ₹6,500 / ₹7,500 = 86.67% -> 87%)
    const tx2 = await insertTransaction(
      {
        name: 'Team Dinner',
        category: 'Food & Dining',
        amount: 2000,
        date: '15 Nov 2026',
        type: 'expense',
        paymentMethod: 'UPI',
        status: 'Completed',
      },
      userA.id
    );
    allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 6500, `Spent is ₹6,500 (got ${state[0].spent})`);
    assert(state[0].remaining === 1000, `Remaining is ₹1,000 (got ${state[0].remaining})`);
    assert(state[0].percentageUsed === 87, `Percentage used is 87% (got ${state[0].percentageUsed}%)`);
    assert(state[0].isNearLimit === true, '87% triggers isNearLimit warning');
    assert(!state[0].isOverBudget, '87% is not over budget');

    // Test 4.4: Over Budget Warning > 100% (Add ₹1,500 -> Total ₹8,000 / ₹7,500 = 106.67% -> 107%)
    const tx3 = await insertTransaction(
      {
        name: 'Weekend Brunch',
        category: 'Food & Dining',
        amount: 1500,
        date: '20 Nov 2026',
        type: 'expense',
        paymentMethod: 'Credit Card',
        status: 'Completed',
      },
      userA.id
    );
    allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 8000, `Spent is ₹8,000 (got ${state[0].spent})`);
    assert(state[0].remaining === 0, `Remaining is clamped to 0 (got ${state[0].remaining})`);
    assert(state[0].percentageUsed === 107, `Percentage used is 107% (got ${state[0].percentageUsed}%)`);
    assert(!state[0].isNearLimit, 'Over budget overrides isNearLimit');
    assert(state[0].isOverBudget === true, '107% triggers isOverBudget warning');

    // Test 4.5: Exclusion of Pending Transactions
    const txPending = await insertTransaction(
      {
        name: 'Pending Food Delivery',
        category: 'Food & Dining',
        amount: 600,
        date: '22 Nov 2026',
        type: 'expense',
        paymentMethod: 'UPI',
        status: 'Pending',
      },
      userA.id
    );
    allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 8000, 'Pending transactions are excluded from actual spending');

    // Test 4.6: Exclusion of Income Transactions
    const txIncome = await insertTransaction(
      {
        name: 'Food Cash Back Refund',
        category: 'Food & Dining',
        amount: 500,
        date: '23 Nov 2026',
        type: 'income',
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
      },
      userA.id
    );
    allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 8000, 'Income transactions are excluded from expense budget calculations');

    // Test 4.7: Exclusion of Other Category Transactions
    const txOther = await insertTransaction(
      {
        name: 'Cinema Tickets',
        category: 'Entertainment',
        amount: 1200,
        date: '24 Nov 2026',
        type: 'expense',
        paymentMethod: 'UPI',
        status: 'Completed',
      },
      userA.id
    );
    allUserATxs = await getAllTransactions(userA.id, 100, 0);
    state = calculateBudgetWithSpent([updatedA1!], allUserATxs, 'November 2026');
    assert(state[0].spent === 8000, 'Different category expenses are excluded');

    // -------------------------------------------------------------
    // Phase 5: Savings Goals CRUD & Contributions
    // -------------------------------------------------------------
    console.log('\n--- Phase 5: Savings Goals CRUD & Contributions ---');

    // 5.1 Create Goal with Optional Target Date omitted
    const goalA1 = await insertGoal(
      {
        title: 'Emergency Rainy Day Fund',
        targetAmount: 50000,
        currentAmount: 10000,
        category: 'Savings',
        // targetDate omitted
      },
      userA.id
    );
    assert(goalA1.title === 'Emergency Rainy Day Fund', 'Goal title matches');
    assert(goalA1.targetAmount === 50000, 'Target amount is 50,000');
    assert(goalA1.currentAmount === 10000, 'Current saved amount is 10,000');
    assert(!goalA1.targetDate, 'Target date is optional/empty');

    // 5.2 Create Goal with Target Date and Monthly Contribution
    const goalA2 = await insertGoal(
      {
        title: 'European Vacation',
        targetAmount: 120000,
        currentAmount: 20000,
        targetDate: '31 Dec 2026',
        category: 'Travel',
        monthlyContribution: 10000,
      },
      userA.id
    );
    assert(goalA2.title === 'European Vacation', 'Goal 2 title matches');
    assert(goalA2.targetDate === '31 Dec 2026', 'Target date is saved');
    assert(goalA2.monthlyContribution === 10000, 'Monthly contribution is saved');

    // 5.3 Read Goals: User A has 2 goals
    const userAGoals = await getAllGoals(userA.id);
    assert(userAGoals.length === 2, `User A has exactly 2 goals (got ${userAGoals.length})`);

    // 5.4 Update Goal: Change target amount from 120,000 to 150,000
    const updatedGoalA2 = await updateGoal(goalA2.id, userA.id, {
      targetAmount: 150000,
      title: 'European Tour 2027',
    });
    assert(updatedGoalA2 !== null && updatedGoalA2.targetAmount === 150000, 'Goal target amount updated');
    assert(updatedGoalA2?.title === 'European Tour 2027', 'Goal title updated');

    // 5.5 Contribute to Goal: Add ₹10,000 deposit
    const afterDeposit = await contributeToGoal(goalA2.id, userA.id, 10000);
    assert(afterDeposit !== null && afterDeposit.currentAmount === 30000, 'Current amount increased from 20,000 to 30,000');
    const completionPct = Math.round((afterDeposit!.currentAmount / afterDeposit!.targetAmount) * 100);
    const remainingGoal = afterDeposit!.targetAmount - afterDeposit!.currentAmount;
    assert(completionPct === 20, `Completion percentage is 20% (got ${completionPct}%)`);
    assert(remainingGoal === 120000, `Remaining goal is ₹120,000 (got ${remainingGoal})`);

    // -------------------------------------------------------------
    // Phase 6: Multi-Tenant Isolation Tests
    // -------------------------------------------------------------
    console.log('\n--- Phase 6: Multi-Tenant Isolation (User B vs. User A) ---');

    // 6.1 Budgets Isolation
    const userBBudgets = await getAllBudgets(userB.id);
    assert(userBBudgets.length === 0, 'User B sees 0 budgets');

    const unauthorizedBudgetRead = await getBudgetById(budgetA1.id, userB.id);
    assert(unauthorizedBudgetRead === null, 'User B cannot read User A budget by ID');

    const unauthorizedBudgetUpdate = await updateBudget(budgetA1.id, userB.id, { allocated: 99999 });
    assert(unauthorizedBudgetUpdate === null, 'User B cannot update User A budget');

    const unauthorizedBudgetDelete = await deleteBudgetById(budgetA1.id, userB.id);
    assert(unauthorizedBudgetDelete === false, 'User B cannot delete User A budget');

    // Verify User A budget is untouched
    const verifyBudgetA = await getBudgetById(budgetA1.id, userA.id);
    assert(verifyBudgetA?.allocated === 7500, 'User A budget remained untouched at 7,500');

    // 6.2 Goals Isolation
    const userBGoals = await getAllGoals(userB.id);
    assert(userBGoals.length === 0, 'User B sees 0 goals');

    const unauthorizedGoalRead = await getGoalById(goalA1.id, userB.id);
    assert(unauthorizedGoalRead === null, 'User B cannot read User A goal by ID');

    const unauthorizedGoalUpdate = await updateGoal(goalA1.id, userB.id, { targetAmount: 999999 });
    assert(unauthorizedGoalUpdate === null, 'User B cannot update User A goal');

    const unauthorizedGoalContribute = await contributeToGoal(goalA1.id, userB.id, 50000);
    assert(unauthorizedGoalContribute === null, 'User B cannot contribute to User A goal');

    const unauthorizedGoalDelete = await deleteGoalById(goalA1.id, userB.id);
    assert(unauthorizedGoalDelete === false, 'User B cannot delete User A goal');

    // Verify User A goal is untouched
    const verifyGoalA = await getGoalById(goalA1.id, userA.id);
    assert(verifyGoalA?.currentAmount === 10000, 'User A goal remained untouched at 10,000');

    // -------------------------------------------------------------
    // Phase 7: Deletion & Cleanup of Ephemeral Data
    // -------------------------------------------------------------
    console.log('\n--- Phase 7: Deletion & Cleanup of Ephemeral Data ---');

    // Delete Budgets
    const delB1 = await deleteBudgetById(budgetA1.id, userA.id);
    assert(delB1 === true, 'User A deleted budget 1');
    const delB2 = await deleteBudgetById(budgetA2.id, userA.id);
    assert(delB2 === true, 'User A deleted budget 2');

    const remainingBudgets = await getAllBudgets(userA.id);
    assert(remainingBudgets.length === 0, 'User A has 0 budgets left after deletion');

    // Delete Goals
    const delG1 = await deleteGoalById(goalA1.id, userA.id);
    assert(delG1 === true, 'User A deleted goal 1');
    const delG2 = await deleteGoalById(goalA2.id, userA.id);
    assert(delG2 === true, 'User A deleted goal 2');

    const remainingGoals = await getAllGoals(userA.id);
    assert(remainingGoals.length === 0, 'User A has 0 goals left after deletion');

    // Delete Transactions
    for (const t of [tx1, tx2, tx3, txPending, txIncome, txOther]) {
      await deleteTransactionById(t.id, userA.id);
    }
    const remainingTxs = await getAllTransactions(userA.id, 100, 0);
    assert(remainingTxs.length === 0, 'User A has 0 transactions left after cleanup');

    console.log('✓ All ephemeral entity records successfully cleaned up.');
  } finally {
    // Always cleanup ephemeral test users
    console.log('\n--- Ephemeral User Cleanup ---');
    await deleteUserById(userA.id);
    await deleteUserById(userB.id);
    console.log(`Cleaned up ephemeral users ${userA.id} and ${userB.id}`);
  }

  // -------------------------------------------------------------
  // Phase 8: Final Baseline Integrity Verification
  // -------------------------------------------------------------
  console.log('\n--- Phase 8: Final Production Data Baseline Integrity Check ---');
  const finalBaselineTxs = await getAllTransactions(prodUserId, 5000, 0);
  assert(finalBaselineTxs.length === 448, `User ${prodUserId} preserved all 448 transactions`);

  const finalBaselineBudgets = await getAllBudgets(prodUserId);
  assert(finalBaselineBudgets.length === 6, `User ${prodUserId} preserved all 6 budgets`);

  const finalBaselineGoals = await getAllGoals(prodUserId);
  assert(finalBaselineGoals.length === 4, `User ${prodUserId} preserved all 4 goals`);

  const prodUsers = [
    { id: 'usr_1793694459965_qsmsix', expectedCount: 395 },
    { id: 'usr_1793776914179_cribje', expectedCount: 395 },
  ];
  for (const u of prodUsers) {
    const txs = await getAllTransactions(u.id, 5000, 0);
    assert(txs.length === u.expectedCount, `User ${u.id} preserved all ${u.expectedCount} transactions`);
  }

  console.log('\n================================================================');
  console.log('🎉 ALL AUDIT & INTEGRITY TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runAuditTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ AUDIT SUITE FAILED:', err);
    process.exit(1);
  });

