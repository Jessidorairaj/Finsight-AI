/**
 * FinSight AI — Grounded Financial Chatbot Automated Audit & Test Suite
 *
 * Verifies:
 * 1. Production ledger baseline integrity
 * 2. Database financial context construction
 * 3. Multi-tenant isolation (User A vs. User B)
 * 4. Factual grounding & arithmetic accuracy (no hallucinated figures)
 * 5. Spending summaries, category breakdowns, affordability calculations
 * 6. Budgets, savings goals, and upcoming bills reflection
 * 7. Empty state handling for new users
 * 8. Input validation and edge-case resilience
 * 9. Production baseline preservation & zero data mutation
 */

import { getDbPool } from './db.js';
import {
  createUser,
  deleteUserById,
} from './repositories/userRepository.js';
import { hashPassword } from './services/authService.js';
import {
  insertTransaction,
  deleteTransactionById,
} from './repositories/transactionRepository.js';
import {
  insertBudget,
  insertGoal,
  insertBill,
  deleteBudgetById,
  deleteGoalById,
  deleteBillById,
} from './repositories/financialEntitiesRepository.js';
import {
  buildUserFinancialContext,
  processChatMessage,
  generateGroundedFallbackResponse,
  detectQueryTimePeriod,
  setTestGeminiClient,
  calculateAffordability,
  extractAffordabilityParams,
} from './services/chatbotService.js';

const PROD_USERS = {
  USER_1: { id: 'usr_1793218238197_wlal7w', expectedTxs: 448 },
  USER_2: { id: 'usr_1793694459965_qsmsix', expectedTxs: 395 },
  USER_3: { id: 'usr_1793776914179_cribje', expectedTxs: 395 },
};

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function verifyBaseline(pool: any, label: string) {
  console.log(`\n--- Integrity Check (${label}) ---`);
  const r1 = await pool.query('SELECT COUNT(*) as c FROM transactions WHERE user_id = $1;', [PROD_USERS.USER_1.id]);
  assert(parseInt(r1.rows[0].c, 10) === PROD_USERS.USER_1.expectedTxs, `User 1 tx count = ${PROD_USERS.USER_1.expectedTxs} (got ${r1.rows[0].c})`);

  const r2 = await pool.query('SELECT COUNT(*) as c FROM transactions WHERE user_id = $1;', [PROD_USERS.USER_2.id]);
  assert(parseInt(r2.rows[0].c, 10) === PROD_USERS.USER_2.expectedTxs, `User 2 tx count = ${PROD_USERS.USER_2.expectedTxs} (got ${r2.rows[0].c})`);

  const r3 = await pool.query('SELECT COUNT(*) as c FROM transactions WHERE user_id = $1;', [PROD_USERS.USER_3.id]);
  assert(parseInt(r3.rows[0].c, 10) === PROD_USERS.USER_3.expectedTxs, `User 3 tx count = ${PROD_USERS.USER_3.expectedTxs} (got ${r3.rows[0].c})`);
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('FinSight AI — AI Financial Chatbot End-to-End Audit & Test');
  console.log('================================================================');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool could not be initialized.');

  // Phase 1: Baseline check
  await verifyBaseline(pool, 'Initial Baseline');

  // Phase 2: Create Ephemeral Test Users
  console.log('\n--- Phase 2: Create Ephemeral Users (User A & User B) ---');
  const timestamp = Date.now();
  const dummyHash = await hashPassword('TestChatbotPass#2026');

  const userA = await createUser({
    email: `test_chat_a_${timestamp}@finsight.local`,
    passwordHash: dummyHash,
    displayName: 'Chatbot Tester A',
    monthlyIncome: 60000,
  });
  const userB = await createUser({
    email: `test_chat_b_${timestamp}@finsight.local`,
    passwordHash: dummyHash,
    displayName: 'Chatbot Tester B',
    monthlyIncome: 45000,
  });
  console.log(`Created User A: ${userA.id} and User B: ${userB.id}`);

  const createdTxIds: string[] = [];
  let budgetId = '';
  let goalId = '';
  let billId = '';

  try {
    // Phase 3: Populate Controlled Ledger for User A
    console.log('\n--- Phase 3: Populate Controlled Data for User A ---');
    // Prior Month (October 2026) Transactions
    const txOctInc = await insertTransaction({
      name: 'Freelance Design Retainer',
      amount: 50000.00,
      category: 'Income',
      date: '2026-10-05',
      type: 'income',
    }, userA.id);
    createdTxIds.push(txOctInc.id);

    const txOctExp = await insertTransaction({
      name: 'Electronics & Audio Studio',
      amount: 12000.00,
      category: 'Electronics & Gadgets',
      date: '2026-10-20',
      type: 'expense',
    }, userA.id);
    createdTxIds.push(txOctExp.id);

    // Current Month (November 2026) Transactions
    // Income: ₹60,000 on 01 Nov 2026
    const txInc = await insertTransaction({
      name: 'Salary Credit TechCorp',
      amount: 60000.00,
      category: 'Income',
      date: '2026-11-01',
      type: 'income',
    }, userA.id);
    createdTxIds.push(txInc.id);

    // Food & Dining: ₹4,500 on 02 Nov 2026
    const txFood = await insertTransaction({
      name: 'Swiggy Gourmet Dinner',
      amount: 4500.00,
      category: 'Food & Dining',
      date: '2026-11-02',
      type: 'expense',
    }, userA.id);
    createdTxIds.push(txFood.id);

    // Shopping: ₹8,000 on 03 Nov 2026
    const txShop = await insertTransaction({
      name: 'Zara Winter Collection',
      amount: 8000.00,
      category: 'Shopping',
      date: '2026-11-03',
      type: 'expense',
    }, userA.id);
    createdTxIds.push(txShop.id);

    // Budget: Food & Dining ₹5,000 for Nov 2026
    const budget = await insertBudget({
      category: 'Food & Dining',
      allocated: 5000.00,
      month: 'Nov 2026',
      color: '#00E5BE',
    }, userA.id);
    budgetId = budget.id;

    // Goal: Emergency Fund ₹1,00,000 (Saved ₹25,000)
    const goal = await insertGoal({
      title: 'Emergency Reserve Fund',
      targetAmount: 100000.00,
      currentAmount: 25000.00,
      targetDate: '31 Dec 2026',
    }, userA.id);
    goalId = goal.id;

    // Bill: ACT Fibernet ₹1,199 due in 4 days
    const bill = await insertBill({
      name: 'ACT Fibernet Gigabit',
      amount: 1199.00,
      category: 'Bills & Utilities',
      dueDate: '08 Nov 2026',
      dueInDays: 4,
      status: 'unpaid',
      iconType: 'wifi',
    }, userA.id);
    billId = bill.id;

    console.log('✓ Successfully populated User A test records (across Oct 2026 and Nov 2026).');

    // Phase 4: Verify Grounded Context Construction
    console.log('\n--- Phase 4: Context Aggregation Accuracy ---');
    const ctxA = await buildUserFinancialContext(userA.id);
    assert(ctxA.aggregates.totalIncome === 110000, `User A totalIncome matches ₹110,000 (got ${ctxA.aggregates.totalIncome})`);
    assert(ctxA.aggregates.totalExpenses === 24500, `User A totalExpenses matches ₹24,500 (got ${ctxA.aggregates.totalExpenses})`);
    assert(ctxA.aggregates.netSavings === 85500, `User A netSavings matches ₹85,500 (got ${ctxA.aggregates.netSavings})`);
    assert(ctxA.aggregates.savingsRate === 77.7, `User A savingsRate matches 77.7% (got ${ctxA.aggregates.savingsRate})`);
    assert(ctxA.aggregates.categoryTotals['Food & Dining'] === 4500, 'Food & Dining total matches ₹4,500');
    assert(ctxA.aggregates.categoryTotals['Shopping'] === 8000, 'Shopping total matches ₹8,000');
    assert(ctxA.aggregates.categoryTotals['Electronics & Gadgets'] === 12000, 'Electronics & Gadgets total matches ₹12,000');

    // Budget status
    const foodB = ctxA.aggregates.budgetStatus.find(b => b.category === 'Food & Dining');
    assert(Boolean(foodB), 'Found Food & Dining budget status');
    assert(foodB?.spent === 4500, `Budget spent matches actual expense ₹4,500 (got ${foodB?.spent})`);
    assert(foodB?.remaining === 500, `Budget remaining matches ₹500 (got ${foodB?.remaining})`);
    assert(foodB?.percentage === 90, `Budget percentage matches 90% (got ${foodB?.percentage})`);
    assert(foodB?.isNearLimit === true, 'Budget correctly flagged as near limit (>=80%)');

    // Goals progress
    const goalA = ctxA.aggregates.goalsProgress.find(g => g.title === 'Emergency Reserve Fund');
    assert(Boolean(goalA), 'Found Emergency Reserve Fund goal');
    assert(goalA?.remaining === 75000, `Goal remaining matches ₹75,000 (got ${goalA?.remaining})`);
    assert(goalA?.percentage === 25, `Goal percentage matches 25% (got ${goalA?.percentage})`);

    // Bills
    assert(ctxA.aggregates.upcomingBills.length === 1, 'Found 1 upcoming bill');
    assert(ctxA.aggregates.upcomingBills[0].name === 'ACT Fibernet Gigabit', 'Upcoming bill name matches');

    // Phase 5: Tenant Isolation Check (User B)
    console.log('\n--- Phase 5: Multi-Tenant Data Isolation ---');
    const ctxB = await buildUserFinancialContext(userB.id);
    assert(ctxB.aggregates.transactionCount === 0, 'User B has 0 transactions');
    assert(ctxB.aggregates.totalIncome === 0, 'User B has ₹0 income');
    assert(ctxB.aggregates.totalExpenses === 0, 'User B has ₹0 expenses');
    assert(ctxB.budgets.length === 0, 'User B has 0 budgets');
    assert(ctxB.goals.length === 0, 'User B has 0 goals');
    assert(ctxB.bills.length === 0, 'User B has 0 bills');

    const chatResB = await processChatMessage(userB.id, 'What are my total expenses?');
    assert(chatResB.grounded === true, 'Chat response is grounded');
    assert(chatResB.reply.toLowerCase().includes('0 recorded') || chatResB.reply.toLowerCase().includes('empty'), 'User B receives empty state guidance without leaking User A figures');

    // Phase 6: Financial Question Answering Accuracy for User A
    console.log('\n--- Phase 6: Financial Accuracy for User A Queries ---');

    // Q1: Spending on Food & Dining
    const q1Res = await processChatMessage(userA.id, 'How much did I spend on Food & Dining?');
    assert(q1Res.reply.includes('4,500'), 'Q1 response mentions exact ₹4,500 Food & Dining expenditure');

    // Q2: Affordability Calculation (₹15,000 gadget)
    const q2Res = await processChatMessage(userA.id, 'Can I afford an unplanned ₹15,000 gadget this month?');
    assert(q2Res.reply.includes('85,500') || q2Res.reply.includes('70,500'), 'Q2 affordability response calculates impact on current net savings (₹85,500 -> ₹70,500)');

    // Q3: Budget Status
    const q3Res = await processChatMessage(userA.id, 'What is my budget status?');
    assert(q3Res.reply.toLowerCase().includes('food & dining') && (q3Res.reply.includes('4,500') || q3Res.reply.includes('5,000') || q3Res.reply.includes('90%')), 'Q3 response reflects active Food & Dining budget status');

    // Q4: Savings Goals
    const q4Res = await processChatMessage(userA.id, 'What are my savings goals?');
    assert(q4Res.reply.includes('Emergency Reserve Fund') && q4Res.reply.includes('25,000'), 'Q4 response includes Emergency Reserve Fund with ₹25,000 saved');

    // Q5: Upcoming Bills
    const q5Res = await processChatMessage(userA.id, 'Show my upcoming bills');
    assert(q5Res.reply.includes('ACT Fibernet Gigabit') && q5Res.reply.includes('1,199'), 'Q5 response includes ACT Fibernet with ₹1,199 amount');

    // Phase 6.5: Time-Specific Financial Question Answering Accuracy
    console.log('\n--- Phase 6.5: Time-Specific Financial Query Handling ---');
    const fixedRefDate = new Date('2026-11-04T12:00:00.000Z');

    // Unit detection check
    const detectedPeriod = detectQueryTimePeriod(
      'How much is left till today after all the expenses in last month?',
      ctxA.transactions,
      fixedRefDate
    );
    assert(detectedPeriod !== null, 'Detected time period for last month question');
    assert(detectedPeriod?.periodKey === 'last_month', `Period key is 'last_month' (got ${detectedPeriod?.periodKey})`);
    assert(detectedPeriod?.expenses === 12000, `Last month expenses match ₹12,000 (got ${detectedPeriod?.expenses})`);
    assert(detectedPeriod?.income === 50000, `Last month income matches ₹50,000 (got ${detectedPeriod?.income})`);
    assert(detectedPeriod?.net === 38000, `Last month net cash flow matches ₹38,000 (got ${detectedPeriod?.net})`);

    // Chatbot query: "How much is left till today after all the expenses in last month?"
    const qTimeRes = await processChatMessage(
      userA.id,
      'How much is left till today after all the expenses in last month?',
      [],
      fixedRefDate
    );
    assert(qTimeRes.reply.includes('12,000'), 'Time query reports exact ₹12,000 expenses in last month');
    assert(qTimeRes.reply.includes('38,000'), 'Time query reports exact ₹38,000 net cash flow from last month');
    assert(qTimeRes.reply.includes('85,500'), 'Time query reports exact ₹85,500 cumulative tracked net savings');
    assert(
      qTimeRes.reply.toLowerCase().includes('last month') || qTimeRes.reply.toLowerCase().includes('oct'),
      'Time query clearly labels Last Month / October period'
    );
    assert(
      qTimeRes.reply.toLowerCase().includes('cannot be determined') || qTimeRes.reply.toLowerCase().includes('opening bank balance'),
      'Time query explains that actual live bank balance cannot be determined from ledger totals alone'
    );
    assert(
      !qTimeRes.reply.includes('Total Expenses: ₹24,500') || qTimeRes.reply.includes('Period Financial Breakdown'),
      'Time query does NOT substitute generic all-time summary without period breakdown'
    );

    // Missing balance data query: "What is my current bank account balance?"
    const qBalanceRes = await processChatMessage(
      userA.id,
      'What is my current bank account balance?',
      [],
      fixedRefDate
    );
    assert(
      qBalanceRes.reply.toLowerCase().includes('cannot be determined') &&
      (qBalanceRes.reply.toLowerCase().includes('opening bank balance') ||
        qBalanceRes.reply.toLowerCase().includes('opening balance') ||
        qBalanceRes.reply.toLowerCase().includes('ledger totals alone')),
      'Balance query truthfully explains ledger limitation regarding untracked opening balance'
    );

    // Chatbot query: "What were my total expenses this month?"
    const qThisMonthRes = await processChatMessage(
      userA.id,
      'What were my total expenses this month?',
      [],
      fixedRefDate
    );
    assert(qThisMonthRes.reply.includes('12,500'), 'This month query reports ₹12,500 expenses (₹4,500 + ₹8,000)');
    assert(
      qThisMonthRes.reply.toLowerCase().includes('this month') || qThisMonthRes.reply.toLowerCase().includes('nov'),
      'This month query clearly labels This Month / November'
    );

    // Chatbot query: "What are my all-time totals?"
    const qAllTimeRes = await processChatMessage(
      userA.id,
      'What is my total spending overall across all time?',
      [],
      fixedRefDate
    );
    assert(qAllTimeRes.reply.includes('24,500'), 'All-time query reports cumulative ₹24,500 expenses');
    assert(qAllTimeRes.reply.includes('85,500'), 'All-time query reports cumulative ₹85,500 net savings');

    // Tenant isolation on time-specific queries
    const qTimeResB = await processChatMessage(
      userB.id,
      'How much is left till today after all the expenses in last month?',
      [],
      fixedRefDate
    );
    assert(
      !qTimeResB.reply.includes('12,000') && !qTimeResB.reply.includes('85,500'),
      'User B does NOT see User A time-period figures'
    );

    // Phase 6.8: Intent-Driven Focused Question Answering (6 Target Questions)
    console.log('\n--- Phase 6.8: Intent-Driven Focused Question Answering (6 Target Questions) ---');

    // Target Q1: "What were my total expenses this month?"
    const tq1 = await processChatMessage(userA.id, 'What were my total expenses this month?', [], fixedRefDate, 'engine');
    assert(tq1.reply.includes('12,500'), 'TQ1 reports exact ₹12,500 expenses for this month');
    assert(tq1.reply.includes('This Month') || tq1.reply.includes('Nov 2026'), 'TQ1 labels This Month');
    assert(!tq1.reply.includes('### FinSight AI Ledger Summary:'), 'TQ1 does not append generic all-time summary');

    // Target Q2: "How much did I earn last month?"
    const tq2 = await processChatMessage(userA.id, 'How much did I earn last month?', [], fixedRefDate, 'engine');
    assert(tq2.reply.includes('50,000'), 'TQ2 reports exact ₹50,000 income for last month');
    assert(tq2.reply.includes('Last Month') || tq2.reply.includes('Oct 2026'), 'TQ2 labels Last Month');
    assert(!tq2.reply.includes('### FinSight AI Ledger Summary:'), 'TQ2 does not append generic all-time summary');

    // Target Q3: "How much is left after last month's expenses?"
    const tq3 = await processChatMessage(userA.id, "How much is left after last month's expenses?", [], fixedRefDate, 'engine');
    assert(tq3.reply.includes('38,000'), 'TQ3 reports exact ₹38,000 net remaining cash flow from last month');
    assert(tq3.reply.includes('85,500'), 'TQ3 reports ₹85,500 cumulative tracked net savings');
    assert(tq3.reply.toLowerCase().includes('cannot be determined') || tq3.reply.toLowerCase().includes('opening bank balance'), 'TQ3 includes balance limitation notice');
    assert(!tq3.reply.includes('### FinSight AI Ledger Summary:'), 'TQ3 does not append generic all-time summary');

    // Target Q4: "How much did I spend on food this month?"
    const tq4 = await processChatMessage(userA.id, 'How much did I spend on food this month?', [], fixedRefDate, 'engine');
    assert(tq4.reply.includes('4,500'), 'TQ4 reports exact ₹4,500 spent on Food & Dining this month');
    assert(tq4.reply.includes('Food & Dining'), 'TQ4 references Food & Dining category');
    assert(tq4.reply.includes('500'), 'TQ4 includes ₹500 budget remaining for food');
    assert(!tq4.reply.includes('### FinSight AI Ledger Summary:'), 'TQ4 does not append generic all-time summary');

    // Target Q5: "Am I over budget?"
    const tq5 = await processChatMessage(userA.id, 'Am I over budget?', [], fixedRefDate, 'engine');
    assert(tq5.reply.toLowerCase().includes('not over budget'), 'TQ5 answers direct verdict: not over budget');
    assert(tq5.reply.includes('Food & Dining') && tq5.reply.includes('4,500'), 'TQ5 provides details of Food & Dining budget (₹4,500 spent)');
    assert(!tq5.reply.includes('### FinSight AI Ledger Summary:'), 'TQ5 does not append generic all-time summary');

    // Target Q6: "Can I afford a ₹15,000 gadget this month?"
    const tq6 = await processChatMessage(userA.id, 'Can I afford a ₹15,000 gadget this month?', [], fixedRefDate, 'engine');
    assert(tq6.reply.includes('15,000'), 'TQ6 evaluates ₹15,000 item amount');
    assert(tq6.reply.includes('85,500'), 'TQ6 evaluates available cash ₹85,500');
    assert(tq6.reply.includes('70,500'), 'TQ6 computes projected remaining liquid cash of ₹70,500');
    assert(tq6.reply.includes('Affordable with Prudence'), 'TQ6 provides cautious recommendation');
    assert(!tq6.reply.includes('### FinSight AI Ledger Summary:'), 'TQ6 does not append generic all-time summary');

    // Distinct answers check: verify distinct questions do NOT get the same answer
    assert(tq1.reply !== tq2.reply, 'TQ1 (expenses) produces distinct answer from TQ2 (income)');
    assert(tq1.reply !== tq4.reply, 'TQ1 (total expenses) produces distinct answer from TQ4 (food spending)');
    assert(tq2.reply !== tq3.reply, 'TQ2 (income) produces distinct answer from TQ3 (remaining cash flow)');
    assert(tq4.reply !== tq5.reply, 'TQ4 (food spending) produces distinct answer from TQ5 (budget status)');

    // Ambiguous query test: should ask concise clarification, NOT dump ledger summary
    const ambiguousRes = await processChatMessage(userA.id, 'help check money', [], fixedRefDate, 'engine');
    assert(ambiguousRes.reply.includes('Would you like to check:'), 'Ambiguous query returns polite clarification prompt');
    assert(!ambiguousRes.reply.includes('### FinSight AI Ledger Summary:'), 'Ambiguous query does NOT dump full financial ledger');

    // Phase 7: Edge Cases & Validation
    console.log('\n--- Phase 7: Deterministic Fallback Resilience ---');
    const fallbackAns = generateGroundedFallbackResponse('How much did I spend on Food & Dining?', ctxA, fixedRefDate);
    assert(fallbackAns.includes('4,500'), 'Fallback engine accurately reports ₹4,500 food spending');
    assert(fallbackAns.includes('5,000'), 'Fallback engine reports ₹5,000 budget allocation');

    const fallbackAfford = generateGroundedFallbackResponse('Can I afford a ₹15,000 gadget?', ctxA, fixedRefDate);
    assert(fallbackAfford.includes('70,500'), 'Fallback engine computes adjusted surplus of ₹70,500 (85,500 - 15,000)');

    const fallbackTime = generateGroundedFallbackResponse(
      'How much is left till today after all the expenses in last month?',
      ctxA,
      fixedRefDate
    );
    assert(fallbackTime.includes('12,000'), 'Fallback engine reports ₹12,000 last month expenses');
    assert(fallbackTime.includes('38,000'), 'Fallback engine reports ₹38,000 net cash flow from last month');
    assert(fallbackTime.includes('85,500'), 'Fallback engine reports ₹85,500 cumulative tracked net savings');
    assert(fallbackTime.includes('Oct 2026'), 'Fallback engine includes explicit date boundary');
    assert(
      fallbackTime.toLowerCase().includes('cannot be determined') || fallbackTime.toLowerCase().includes('opening bank balance'),
      'Fallback engine clarifies actual balance cannot be determined from ledger totals alone'
    );

    // Phase 7.5: Gemini 2.5 Flash Response Generation & Graceful Fallback (Mocked)
    console.log('\n--- Phase 7.5: Gemini 2.5 Flash Integration & Failure Fallback ---');

    // Test 1: Successful Gemini response
    const expectedModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    setTestGeminiClient({
      models: {
        generateContent: async ({ model, contents, config }) => {
          assert(model === expectedModel, `Gemini model is '${expectedModel}' (got ${model})`);
          assert(Boolean(config?.systemInstruction), 'System instruction provided in Gemini config');
          return {
            text: 'Based on your authentic database records, your cumulative liquid net savings stand at ₹85,500 with a 77.7% savings rate.',
          };
        },
      },
    });

    const geminiSuccessRes = await processChatMessage(userA.id, 'What are my net savings?', [], fixedRefDate);
    assert(geminiSuccessRes.engineUsed === 'gemini', `Engine used is 'gemini' (got ${geminiSuccessRes.engineUsed})`);
    assert(geminiSuccessRes.grounded === true, 'Grounded flag is true');
    assert(geminiSuccessRes.reply.includes('85,500'), 'Gemini response mentions authenticated net savings ₹85,500');

    // Test 2: Gemini Rate-Limit (429) Fallback
    setTestGeminiClient({
      models: {
        generateContent: async () => {
          throw new Error('429 Too Many Requests: Resource has been exhausted (rate limit)');
        },
      },
    });

    const geminiRateLimitRes = await processChatMessage(userA.id, 'How much did I spend on Food & Dining?', [], fixedRefDate);
    assert(
      geminiRateLimitRes.engineUsed === 'grounded-engine',
      `Falls back to 'grounded-engine' on 429 rate limit (got ${geminiRateLimitRes.engineUsed})`
    );
    assert(geminiRateLimitRes.reply.includes('4,500'), 'Fallback reply accurately answers with ₹4,500 food spending');

    // Test 3: Gemini Network Error Fallback
    setTestGeminiClient({
      models: {
        generateContent: async () => {
          throw new Error('FetchError: request to https://generativelanguage.googleapis.com failed');
        },
      },
    });

    const geminiNetErrRes = await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate);
    assert(
      geminiNetErrRes.engineUsed === 'grounded-engine',
      `Falls back to 'grounded-engine' on network error (got ${geminiNetErrRes.engineUsed})`
    );
    assert(geminiNetErrRes.reply.toLowerCase().includes('food & dining'), 'Fallback reply includes Food & Dining budget');

    // Test 4: Missing or Unconfigured API Key Fallback
    setTestGeminiClient(null);
    const originalApiKey = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      const noKeyRes = await processChatMessage(userA.id, 'Show my upcoming bills', [], fixedRefDate);
      assert(
        noKeyRes.engineUsed === 'grounded-engine',
        `Falls back to 'grounded-engine' when API key is missing (got ${noKeyRes.engineUsed})`
      );
      assert(noKeyRes.reply.includes('ACT Fibernet Gigabit'), 'Fallback reply includes upcoming bill');
    } finally {
      process.env.GEMINI_API_KEY = originalApiKey;
    }

    // Phase 7.6: Backend Affordability Calculations & Cautious Recommendations
    console.log('\n--- Phase 7.6: Backend Affordability Calculations & Cautious Guidance ---');

    // Scenario A: Affordable within monthly surplus and available cash
    const affordA = calculateAffordability('Can I afford an unplanned ₹15,000 gadget this month?', ctxA, fixedRefDate);
    assert(affordA !== null, 'Affordability calculation returned for Scenario A');
    assert(affordA?.availableCash === 85500, `Available cash is ₹85,500 (got ${affordA?.availableCash})`);
    assert(affordA?.monthlySurplus === 47500, `Monthly surplus is ₹47,500 (got ${affordA?.monthlySurplus})`);
    assert(affordA?.upcomingBillsTotal === 1199, `Upcoming bills total ₹1,199 (got ${affordA?.upcomingBillsTotal})`);
    assert(affordA?.uncommittedCash === 84301, `Uncommitted buffer is ₹84,301 (got ${affordA?.uncommittedCash})`);
    assert(affordA?.projectedRemainingCash === 70500, `Projected cash is ₹70,500 (got ${affordA?.projectedRemainingCash})`);
    assert(affordA?.verdict === 'affordable', `Verdict is 'affordable' (got ${affordA?.verdict})`);

    // Scenario B: Exceeds monthly surplus but fits in liquid reserves (Draws from Prior Savings)
    const affordB = calculateAffordability('Can I buy a ₹50,000 studio monitor?', ctxA, fixedRefDate);
    assert(affordB !== null, 'Affordability calculation returned for Scenario B');
    assert(affordB?.itemAmount === 50000, 'Item amount matches 50,000');
    assert(affordB?.verdict === 'manageable_with_caution', `Verdict is 'manageable_with_caution' (got ${affordB?.verdict})`);
    assert(affordB?.projectedRemainingCash === 35500, `Projected cash is ₹35,500 (got ${affordB?.projectedRemainingCash})`);

    // Scenario C: Stretch purchase risking upcoming bills
    // Available cash: 85,500; Bills: 1,199 -> Uncommitted: 84,301. Item: 85,000 > 84,301
    const affordC = calculateAffordability('Can I buy luxury watch for ₹85,000?', ctxA, fixedRefDate);
    assert(affordC !== null, 'Affordability calculation returned for Scenario C');
    assert(affordC?.verdict === 'stretch', `Verdict is 'stretch' (got ${affordC?.verdict})`);

    // Scenario D: Deficit purchase exceeding all available savings
    const affordD = calculateAffordability('Can I afford a ₹1,50,000 vehicle?', ctxA, fixedRefDate);
    assert(affordD !== null, 'Affordability calculation returned for Scenario D');
    assert(affordD?.verdict === 'not_recommended', `Verdict is 'not_recommended' (got ${affordD?.verdict})`);
    assert(affordD?.projectedRemainingCash === -64500, `Projected cash shows deficit of -64,500 (got ${affordD?.projectedRemainingCash})`);

    // Phase 7.7: Multi-Tenant Isolation for Affordability
    console.log('\n--- Phase 7.7: Account Isolation for Affordability Queries ---');
    const affordUserB = calculateAffordability('Can I afford a ₹15,000 gadget?', ctxB, fixedRefDate);
    assert(affordUserB !== null, 'Affordability calculated for User B');
    assert(affordUserB?.availableCash === 0, `User B available cash is ₹0 (got ${affordUserB?.availableCash})`);
    assert(affordUserB?.verdict === 'not_recommended', 'User B receives not_recommended due to ₹0 balance');

    // Phase 7.8: Chatbot Mode Selector Verification (auto, gemini, engine)
    console.log('\n--- Phase 7.8: Chatbot Mode Selector Verification ---');

    // 1. Engine mode: Bypasses Gemini completely
    const modeEngineRes = await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate, 'engine');
    assert(modeEngineRes.engineUsed === 'grounded-engine', `Engine mode uses 'grounded-engine' (got ${modeEngineRes.engineUsed})`);
    assert(modeEngineRes.reply.toLowerCase().includes('food & dining'), 'Engine mode returns factual grounded budget status');

    // 2. Gemini mode (mocked success)
    let lastCapturedInstruction = '';
    setTestGeminiClient({
      models: {
        generateContent: async ({ config }) => {
          lastCapturedInstruction = config?.systemInstruction || '';
          return {
            text: 'Gemini Response: Grounded focused answer.',
          };
        },
      },
    });

    const modeGeminiRes = await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate, 'gemini');
    assert(modeGeminiRes.engineUsed === 'gemini', `Gemini mode uses 'gemini' (got ${modeGeminiRes.engineUsed})`);
    assert(modeGeminiRes.reply.includes('Gemini Response'), 'Gemini mode delivers Gemini response');

    // Verify Gemini grounding receives specific detected intent and target metrics for all 6 target questions:
    await processChatMessage(userA.id, 'What were my total expenses this month?', [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "expense_total"'), 'Gemini received expense_total intent');
    assert(lastCapturedInstruction.includes('12,500'), 'Gemini received target metric ₹12,500 expenses for this month');

    await processChatMessage(userA.id, 'How much did I earn last month?', [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "income_total"'), 'Gemini received income_total intent');
    assert(lastCapturedInstruction.includes('50,000'), 'Gemini received target metric ₹50,000 income for last month');

    await processChatMessage(userA.id, "How much is left after last month's expenses?", [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "remaining_balance"'), 'Gemini received remaining_balance intent');
    assert(lastCapturedInstruction.includes('38,000'), 'Gemini received target metric ₹38,000 net cash flow');

    await processChatMessage(userA.id, 'How much did I spend on food this month?', [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "category_spending"'), 'Gemini received category_spending intent');
    assert(lastCapturedInstruction.includes('4,500'), 'Gemini received target metric ₹4,500 food spending');

    await processChatMessage(userA.id, 'Am I over budget?', [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "budget_status"'), 'Gemini received budget_status intent');

    await processChatMessage(userA.id, 'Can I afford a ₹15,000 gadget this month?', [], fixedRefDate, 'gemini');
    assert(lastCapturedInstruction.includes('USER INTENT DETECTED: "affordability"'), 'Gemini received affordability intent');
    assert(lastCapturedInstruction.includes('Affordable with Prudence'), 'Gemini received pre-calculated verdict in instruction');

    // 3. Gemini mode error handling (must NOT silently switch to engine!)
    setTestGeminiClient({
      models: {
        generateContent: async () => {
          throw new Error('429 Too Many Requests: Rate limit exceeded');
        },
      },
    });

    let geminiModeThrew = false;
    try {
      await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate, 'gemini');
    } catch (e: any) {
      geminiModeThrew = true;
      assert(
        e.message.includes('failed to generate response'),
        `Gemini mode throws descriptive error instead of silently falling back (got: ${e.message})`
      );
    }
    assert(geminiModeThrew, 'Gemini mode threw clear error when Gemini failed instead of silently switching');

    // 4. Gemini mode with missing API key (must NOT silently switch)
    setTestGeminiClient(null);
    const savedKey = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      let noKeyThrew = false;
      try {
        await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate, 'gemini');
      } catch (e: any) {
        noKeyThrew = true;
        assert(e.message.includes('GEMINI_API_KEY is not configured'), 'Gemini mode reports missing API key error');
      }
      assert(noKeyThrew, 'Gemini mode throws when API key is missing');
    } finally {
      process.env.GEMINI_API_KEY = savedKey;
    }

    // 5. Auto mode with Gemini failure: gracefully falls back to grounded-engine
    setTestGeminiClient({
      models: {
        generateContent: async () => {
          throw new Error('Network timeout contacting Gemini');
        },
      },
    });
    const modeAutoFallbackRes = await processChatMessage(userA.id, 'What is my budget status?', [], fixedRefDate, 'auto');
    assert(
      modeAutoFallbackRes.engineUsed === 'grounded-engine',
      `Auto mode falls back to 'grounded-engine' on failure (got ${modeAutoFallbackRes.engineUsed})`
    );
    assert(modeAutoFallbackRes.reply.toLowerCase().includes('food & dining'), 'Auto mode fallback answers with grounded ledger data');

    console.log('✓ All financial conversational queries, Gemini mock states, and affordability evaluations verified.');
  } finally {
    setTestGeminiClient(null);
    // Phase 8: Clean Up Ephemeral Records
    console.log('\n--- Phase 8: Clean Up Ephemeral Test Records ---');
    for (const txId of createdTxIds) {
      await deleteTransactionById(txId, userA.id);
    }
    if (budgetId) await deleteBudgetById(budgetId, userA.id);
    if (goalId) await deleteGoalById(goalId, userA.id);
    if (billId) await deleteBillById(billId, userA.id);

    await deleteUserById(userA.id);
    await deleteUserById(userB.id);
    console.log('Cleaned up ephemeral users and test records.');
  }

  // Phase 9: Final baseline check
  await verifyBaseline(pool, 'Final Production Baseline');

  console.log('\n================================================================');
  console.log('🎉 ALL AI FINANCIAL CHATBOT AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nChatbot Audit Failed with Error:', err);
    process.exit(1);
  });

