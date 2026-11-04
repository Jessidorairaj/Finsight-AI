import { getDbPool } from '../db.js';
import { insertTransaction, getTransactionById, FrontendTransaction } from './transactionRepository.js';
import { formatStandardDate } from '../../src/utils/dateUtils.js';

// ==========================================
// 1. Budget Category Types & Repository
// ==========================================

export interface FrontendBudget {
  id: string;
  category: string;
  allocated: number;
  color: string;
  month: string;
  suggestedByAI?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function mapRowToBudget(row: any): FrontendBudget {
  return {
    id: row.id,
    category: row.category,
    allocated: parseFloat(row.allocated),
    color: row.color || '#00E5BE',
    month: row.month || 'All',
    suggestedByAI: row.suggested_by_ai !== null && row.suggested_by_ai !== undefined ? parseFloat(row.suggested_by_ai) : undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export async function getAllBudgets(userId: string, month?: string): Promise<FrontendBudget[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  if (month && month.trim() !== '' && month.toLowerCase() !== 'all' && month.toLowerCase() !== 'all time') {
    const res = await pool.query(
      `SELECT * FROM budgets 
       WHERE user_id = $1 AND (LOWER(TRIM(month)) = LOWER(TRIM($2)) OR LOWER(TRIM(month)) = 'all') 
       ORDER BY category ASC;`,
      [userId, month.trim()]
    );
    return res.rows.map(mapRowToBudget);
  }
  const res = await pool.query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY category ASC;', [userId]);
  return res.rows.map(mapRowToBudget);
}

export async function getBudgetById(id: string, userId: string): Promise<FrontendBudget | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('SELECT * FROM budgets WHERE id = $1 AND user_id = $2 LIMIT 1;', [id, userId]);
  return res.rows.length > 0 ? mapRowToBudget(res.rows[0]) : null;
}

export async function getBudgetByUserMonthCategory(
  userId: string,
  month: string,
  category: string
): Promise<FrontendBudget | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const normMonth = month && month.trim() !== '' ? month.trim() : 'All';
  const res = await pool.query(
    'SELECT * FROM budgets WHERE user_id = $1 AND LOWER(TRIM(month)) = LOWER(TRIM($2)) AND LOWER(TRIM(category)) = LOWER(TRIM($3)) LIMIT 1;',
    [userId, normMonth, category.trim()]
  );
  return res.rows.length > 0 ? mapRowToBudget(res.rows[0]) : null;
}

export async function insertBudget(
  b: { id?: string; category: string; allocated: number; color?: string; month?: string; suggestedByAI?: number },
  userId: string
): Promise<FrontendBudget> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const id = b.id && b.id.trim() !== '' ? b.id.trim() : `b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const month = b.month && b.month.trim() !== '' ? b.month.trim() : 'All';
  const category = b.category.trim();

  // Enforce duplicate prevention per user, month, and category
  const existing = await getBudgetByUserMonthCategory(userId, month, category);
  if (existing) {
    throw new Error(`DUPLICATE_BUDGET: A budget for category "${category}" already exists for ${month}.`);
  }

  const query = `
    INSERT INTO budgets (id, category, allocated, color, month, suggested_by_ai, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const res = await pool.query(query, [id, category, b.allocated, b.color || '#00E5BE', month, b.suggestedByAI ?? null, userId]);
  return mapRowToBudget(res.rows[0]);
}

export async function updateBudget(
  id: string,
  userId: string,
  updates: Partial<{ category: string; allocated: number; color: string; month: string; suggestedByAI: number }>
): Promise<FrontendBudget | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const existing = await getBudgetById(id, userId);
  if (!existing) return null;

  const category = updates.category !== undefined ? updates.category.trim() : existing.category;
  const month = updates.month !== undefined ? updates.month.trim() : (existing.month || 'All');
  const allocated = updates.allocated !== undefined ? updates.allocated : existing.allocated;
  const color = updates.color !== undefined ? updates.color : existing.color;
  const suggestedByAI = updates.suggestedByAI !== undefined ? updates.suggestedByAI : (existing.suggestedByAI ?? null);

  // If category or month changed, prevent conflict with another existing budget envelope
  if (category.toLowerCase() !== existing.category.toLowerCase() || month.toLowerCase() !== (existing.month || 'all').toLowerCase()) {
    const conflict = await getBudgetByUserMonthCategory(userId, month, category);
    if (conflict && conflict.id !== id) {
      throw new Error(`DUPLICATE_BUDGET: A budget for category "${category}" already exists for ${month}.`);
    }
  }

  const query = `
    UPDATE budgets
    SET category = $3, allocated = $4, color = $5, month = $6, suggested_by_ai = $7, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await pool.query(query, [id, userId, category, allocated, color, month, suggestedByAI]);
  return res.rows.length > 0 ? mapRowToBudget(res.rows[0]) : null;
}

export async function deleteBudgetById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

export async function bulkInsertBudgets(
  budgets: Array<{ id?: string; category: string; allocated: number; color?: string; month?: string; suggestedByAI?: number }>,
  userId: string,
  onConflict: 'skip' | 'error' = 'skip'
): Promise<{ inserted: FrontendBudget[]; skippedCount: number }> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const client = await pool.connect();
  const inserted: FrontendBudget[] = [];
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    for (const b of budgets) {
      const id = b.id && b.id.trim() !== '' ? b.id.trim() : `b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const category = String(b.category).trim();
      const allocated = Number(b.allocated);
      const color = b.color ? String(b.color).trim() : '#00E5BE';
      const month = b.month && b.month.trim() !== '' ? b.month.trim() : 'All';
      const suggestedByAI = b.suggestedByAI !== undefined ? Number(b.suggestedByAI) : null;

      const existingRes = await client.query(
        'SELECT id FROM budgets WHERE user_id = $1 AND (id = $2 OR (LOWER(TRIM(month)) = LOWER(TRIM($3)) AND LOWER(TRIM(category)) = LOWER(TRIM($4)))) LIMIT 1;',
        [userId, id, month, category]
      );

      if (existingRes.rows.length > 0) {
        if (onConflict === 'error') {
          throw new Error(`DUPLICATE_BUDGET_CONFLICT: Budget category "${category}" already exists for ${month}.`);
        }
        skippedCount++;
        continue;
      }

      const insertSql = `
        INSERT INTO budgets (id, category, allocated, color, month, suggested_by_ai, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const res = await client.query(insertSql, [id, category, allocated, color, month, suggestedByAI, userId]);
      if (res.rows.length > 0) {
        inserted.push(mapRowToBudget(res.rows[0]));
      } else {
        skippedCount++;
      }
    }

    await client.query('COMMIT');
    return { inserted, skippedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// 2. Financial Goal Types & Repository
// ==========================================

export interface FrontendGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  category: string;
  monthlyContribution: number;
  createdAt?: string;
  updatedAt?: string;
}

export function mapRowToGoal(row: any): FrontendGoal {
  return {
    id: row.id,
    title: row.title,
    targetAmount: parseFloat(row.target_amount),
    currentAmount: parseFloat(row.current_amount),
    targetDate: row.target_date || undefined,
    category: row.category,
    monthlyContribution: parseFloat(row.monthly_contribution),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export async function getAllGoals(userId: string): Promise<FrontendGoal[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at ASC;', [userId]);
  return res.rows.map(mapRowToGoal);
}

export async function getGoalById(id: string, userId: string): Promise<FrontendGoal | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('SELECT * FROM goals WHERE id = $1 AND user_id = $2 LIMIT 1;', [id, userId]);
  return res.rows.length > 0 ? mapRowToGoal(res.rows[0]) : null;
}

export async function insertGoal(
  g: { id?: string; title: string; targetAmount: number; currentAmount?: number; targetDate?: string; category?: string; monthlyContribution?: number },
  userId: string
): Promise<FrontendGoal> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const id = g.id && g.id.trim() !== '' ? g.id.trim() : `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const query = `
    INSERT INTO goals (id, title, target_amount, current_amount, target_date, category, monthly_contribution, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const res = await pool.query(query, [
    id,
    g.title.trim(),
    g.targetAmount,
    g.currentAmount ?? 0,
    g.targetDate ? g.targetDate.trim() : '',
    g.category ? g.category.trim() : 'General',
    g.monthlyContribution ?? 0,
    userId,
  ]);
  return mapRowToGoal(res.rows[0]);
}

export async function updateGoal(
  id: string,
  userId: string,
  updates: Partial<{ title: string; targetAmount: number; currentAmount: number; targetDate: string; category: string; monthlyContribution: number }>
): Promise<FrontendGoal | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const existing = await getGoalById(id, userId);
  if (!existing) return null;

  const title = updates.title !== undefined ? updates.title.trim() : existing.title;
  const targetAmount = updates.targetAmount !== undefined ? updates.targetAmount : existing.targetAmount;
  const currentAmount = updates.currentAmount !== undefined ? updates.currentAmount : existing.currentAmount;
  const targetDate = updates.targetDate !== undefined ? updates.targetDate.trim() : (existing.targetDate || '');
  const category = updates.category !== undefined ? updates.category.trim() : existing.category;
  const monthlyContribution = updates.monthlyContribution !== undefined ? updates.monthlyContribution : existing.monthlyContribution;

  const query = `
    UPDATE goals
    SET title = $3, target_amount = $4, current_amount = $5, target_date = $6, category = $7, monthly_contribution = $8, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await pool.query(query, [id, userId, title, targetAmount, currentAmount, targetDate, category, monthlyContribution]);
  return res.rows.length > 0 ? mapRowToGoal(res.rows[0]) : null;
}

export async function contributeToGoal(id: string, userId: string, amount: number): Promise<FrontendGoal | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const query = `
    UPDATE goals
    SET current_amount = current_amount + $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await pool.query(query, [id, userId, amount]);
  return res.rows.length > 0 ? mapRowToGoal(res.rows[0]) : null;
}

export async function deleteGoalById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

export async function bulkInsertGoals(
  goals: Array<{ id?: string; title: string; targetAmount: number; currentAmount?: number; targetDate: string; category?: string; monthlyContribution?: number }>,
  userId: string,
  onConflict: 'skip' | 'error' = 'skip'
): Promise<{ inserted: FrontendGoal[]; skippedCount: number }> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const client = await pool.connect();
  const inserted: FrontendGoal[] = [];
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    for (const g of goals) {
      const id = g.id && g.id.trim() !== '' ? g.id.trim() : `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const title = String(g.title).trim();
      const targetAmount = Number(g.targetAmount);
      const currentAmount = g.currentAmount !== undefined ? Number(g.currentAmount) : 0;
      const targetDate = String(g.targetDate).trim();
      const category = g.category ? String(g.category).trim() : 'General';
      const monthlyContribution = g.monthlyContribution !== undefined ? Number(g.monthlyContribution) : 0;

      const existingRes = await client.query(
        'SELECT id FROM goals WHERE user_id = $1 AND (id = $2 OR (LOWER(TRIM(title)) = LOWER(TRIM($3)) AND LOWER(TRIM(category)) = LOWER(TRIM($4)))) LIMIT 1;',
        [userId, id, title, category]
      );

      if (existingRes.rows.length > 0) {
        if (onConflict === 'error') {
          throw new Error(`DUPLICATE_GOAL_CONFLICT: Goal "${title}" or ID "${id}" already exists.`);
        }
        skippedCount++;
        continue;
      }

      const insertSql = `
        INSERT INTO goals (id, title, target_amount, current_amount, target_date, category, monthly_contribution, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const res = await client.query(insertSql, [id, title, targetAmount, currentAmount, targetDate, category, monthlyContribution, userId]);
      if (res.rows.length > 0) {
        inserted.push(mapRowToGoal(res.rows[0]));
      } else {
        skippedCount++;
      }
    }

    await client.query('COMMIT');
    return { inserted, skippedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// 3. Recurring Bill Types & Repository
// ==========================================

export interface FrontendBill {
  id: string;
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  dueInDays: number;
  status: 'unpaid' | 'paid' | 'scheduled';
  iconType: 'wifi' | 'electricity' | 'streaming' | 'water' | 'rent';
  transactionId?: string;
  reminderDays?: number;
  isRecurring?: boolean;
  recurringFrequency?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapRowToBill(row: any): FrontendBill {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: parseFloat(row.amount),
    dueDate: row.due_date,
    dueInDays: row.due_in_days,
    status: row.status,
    iconType: row.icon_type,
    transactionId: row.transaction_id || undefined,
    reminderDays: row.reminder_days !== undefined && row.reminder_days !== null ? parseInt(row.reminder_days, 10) : 3,
    isRecurring: Boolean(row.is_recurring),
    recurringFrequency: row.recurring_frequency || 'monthly',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export async function getAllBills(userId: string): Promise<FrontendBill[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('SELECT * FROM bills WHERE user_id = $1 ORDER BY due_in_days ASC;', [userId]);
  return res.rows.map(mapRowToBill);
}

export async function getBillById(id: string, userId: string): Promise<FrontendBill | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('SELECT * FROM bills WHERE id = $1 AND user_id = $2 LIMIT 1;', [id, userId]);
  return res.rows.length > 0 ? mapRowToBill(res.rows[0]) : null;
}

export async function insertBill(
  b: {
    id?: string;
    name: string;
    category: string;
    amount: number;
    dueDate: string;
    dueInDays?: number;
    status?: 'unpaid' | 'paid' | 'scheduled';
    iconType?: string;
    transactionId?: string;
    reminderDays?: number;
    isRecurring?: boolean;
    recurringFrequency?: string;
  },
  userId: string
): Promise<FrontendBill> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const id = b.id && b.id.trim() !== '' ? b.id.trim() : `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const query = `
    INSERT INTO bills (
      id, name, category, amount, due_date, due_in_days, status, icon_type,
      transaction_id, reminder_days, is_recurring, recurring_frequency, user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *;
  `;
  const res = await pool.query(query, [
    id,
    b.name,
    b.category,
    b.amount,
    b.dueDate,
    b.dueInDays ?? 0,
    b.status || 'unpaid',
    b.iconType || 'electricity',
    b.transactionId || '',
    b.reminderDays !== undefined ? b.reminderDays : 3,
    Boolean(b.isRecurring),
    b.recurringFrequency || 'monthly',
    userId,
  ]);
  return mapRowToBill(res.rows[0]);
}

export async function updateBill(
  id: string,
  userId: string,
  updates: Partial<{
    name: string;
    category: string;
    amount: number;
    dueDate: string;
    dueInDays: number;
    status: 'unpaid' | 'paid' | 'scheduled';
    iconType: string;
    transactionId: string;
    reminderDays: number;
    isRecurring: boolean;
    recurringFrequency: string;
  }>
): Promise<FrontendBill | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const existing = await getBillById(id, userId);
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name : existing.name;
  const category = updates.category !== undefined ? updates.category : existing.category;
  const amount = updates.amount !== undefined ? updates.amount : existing.amount;
  const dueDate = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;
  const dueInDays = updates.dueInDays !== undefined ? updates.dueInDays : existing.dueInDays;
  const status = updates.status !== undefined ? updates.status : existing.status;
  const iconType = updates.iconType !== undefined ? updates.iconType : existing.iconType;
  const transactionId = updates.transactionId !== undefined ? updates.transactionId : (existing.transactionId || '');
  const reminderDays = updates.reminderDays !== undefined ? updates.reminderDays : (existing.reminderDays ?? 3);
  const isRecurring = updates.isRecurring !== undefined ? updates.isRecurring : Boolean(existing.isRecurring);
  const recurringFrequency = updates.recurringFrequency !== undefined ? updates.recurringFrequency : (existing.recurringFrequency || 'monthly');

  const query = `
    UPDATE bills
    SET name = $3, category = $4, amount = $5, due_date = $6, due_in_days = $7, status = $8,
        icon_type = $9, transaction_id = $10, reminder_days = $11, is_recurring = $12,
        recurring_frequency = $13, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await pool.query(query, [
    id,
    userId,
    name,
    category,
    amount,
    dueDate,
    dueInDays,
    status,
    iconType,
    transactionId,
    reminderDays,
    isRecurring,
    recurringFrequency,
  ]);
  return res.rows.length > 0 ? mapRowToBill(res.rows[0]) : null;
}

export async function deleteBillById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('DELETE FROM bills WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Marks a bill as paid and links/creates a corresponding transaction without duplication.
 */
export async function payBillAndLinkTransaction(
  id: string,
  userId: string,
  overrides?: { paymentMethod?: string; date?: string }
): Promise<{ bill: FrontendBill; transaction: FrontendTransaction; alreadyPaid: boolean }> {
  const bill = await getBillById(id, userId);
  if (!bill) {
    throw new Error(`Bill "${id}" not found.`);
  }

  // Prevent duplicate transaction generation if already paid and linked
  if (bill.status === 'paid' && bill.transactionId) {
    const existingTx = await getTransactionById(bill.transactionId, userId);
    if (existingTx) {
      return { bill, transaction: existingTx, alreadyPaid: true };
    }
  }

  // Create linked expense transaction
  const tx = await insertTransaction(
    {
      name: bill.name,
      category: bill.category || 'Bills & Utilities',
      amount: bill.amount,
      date: overrides?.date || formatStandardDate(new Date()),
      type: 'expense',
      paymentMethod: overrides?.paymentMethod || 'UPI',
      status: 'Completed',
      notes: `Bill payment: ${bill.name} (Due: ${bill.dueDate})`,
      bill_id: bill.id,
    },
    userId
  );

  const updatedBill = await updateBill(id, userId, {
    status: 'paid',
    transactionId: tx.id,
  });

  return { bill: updatedBill || bill, transaction: tx, alreadyPaid: false };
}

export async function bulkInsertBills(
  bills: Array<{
    id?: string;
    name: string;
    category: string;
    amount: number;
    dueDate: string;
    dueInDays?: number;
    status?: 'unpaid' | 'paid' | 'scheduled';
    iconType?: 'wifi' | 'electricity' | 'streaming' | 'water' | 'rent';
  }>,
  userId: string,
  onConflict: 'skip' | 'error' = 'skip'
): Promise<{ inserted: FrontendBill[]; skippedCount: number }> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const client = await pool.connect();
  const inserted: FrontendBill[] = [];
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    for (const b of bills) {
      const id = b.id && b.id.trim() !== '' ? b.id.trim() : `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const name = String(b.name).trim();
      const category = String(b.category).trim();
      const amount = Number(b.amount);
      const dueDate = String(b.dueDate).trim();
      const dueInDays = b.dueInDays !== undefined ? Number(b.dueInDays) : 0;
      const status = b.status || 'unpaid';
      const iconType = (b.iconType as any) || 'electricity';

      const existingRes = await client.query(
        'SELECT id FROM bills WHERE user_id = $1 AND (id = $2 OR (LOWER(TRIM(name)) = LOWER(TRIM($3)) AND LOWER(TRIM(due_date)) = LOWER(TRIM($4)))) LIMIT 1;',
        [userId, id, name, dueDate]
      );

      if (existingRes.rows.length > 0) {
        if (onConflict === 'error') {
          throw new Error(`DUPLICATE_BILL_CONFLICT: Bill "${name}" for date "${dueDate}" or ID "${id}" already exists.`);
        }
        skippedCount++;
        continue;
      }

      const insertSql = `
        INSERT INTO bills (id, name, category, amount, due_date, due_in_days, status, icon_type, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const res = await client.query(insertSql, [id, name, category, amount, dueDate, dueInDays, status, iconType, userId]);
      if (res.rows.length > 0) {
        inserted.push(mapRowToBill(res.rows[0]));
      } else {
        skippedCount++;
      }
    }

    await client.query('COMMIT');
    return { inserted, skippedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// 4. Document Metadata Types & Repository
// ==========================================

export interface FrontendDocument {
  id: string;
  filename: string;
  uploadDate: string;
  fileSize: string;
  ocrStatus: 'Extracted' | 'Processing' | 'Pending Review' | 'Failed';
  detectedMerchant: string;
  detectedAmount: number;
  detectedDate: string;
  confidenceScore: number;
  storagePath?: string;
  mimeType?: string;
  currency?: string;
  taxAmount?: number;
  invoiceNumber?: string;
  lineItems?: Array<{ description: string; quantity?: number; price?: number }>;
  transactionId?: string;
  category?: string;
  receiptFingerprint?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapRowToDocument(row: any): FrontendDocument {
  let lineItemsParsed: Array<{ description: string; quantity?: number; price?: number }> | undefined = undefined;
  if (row.line_items) {
    try {
      lineItemsParsed = typeof row.line_items === 'string' ? JSON.parse(row.line_items) : row.line_items;
    } catch {
      lineItemsParsed = undefined;
    }
  }

  return {
    id: row.id,
    filename: row.filename,
    uploadDate: row.upload_date,
    fileSize: row.file_size,
    ocrStatus: row.ocr_status,
    detectedMerchant: row.detected_merchant,
    detectedAmount: parseFloat(row.detected_amount),
    detectedDate: row.detected_date,
    confidenceScore: parseFloat(row.confidence_score),
    storagePath: row.storage_path || undefined,
    mimeType: row.mime_type || undefined,
    currency: row.currency || 'INR',
    taxAmount: row.tax_amount !== null && row.tax_amount !== undefined ? parseFloat(row.tax_amount) : 0,
    invoiceNumber: row.invoice_number || '',
    lineItems: lineItemsParsed,
    transactionId: row.transaction_id || undefined,
    category: row.category || 'Others',
    receiptFingerprint: row.receipt_fingerprint || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export async function getAllDocuments(userId: string): Promise<FrontendDocument[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const query = `
    SELECT 
      d.id,
      d.filename,
      d.upload_date,
      d.file_size,
      d.ocr_status,
      COALESCE(NULLIF(t.name, ''), d.detected_merchant) AS detected_merchant,
      COALESCE(t.amount, d.detected_amount) AS detected_amount,
      COALESCE(NULLIF(t.date, ''), d.detected_date) AS detected_date,
      d.confidence_score,
      d.storage_path,
      d.mime_type,
      d.currency,
      d.tax_amount,
      d.invoice_number,
      d.line_items,
      d.transaction_id,
      COALESCE(NULLIF(t.category, ''), d.category) AS category,
      d.receipt_fingerprint,
      d.created_at,
      d.updated_at
    FROM documents d
    LEFT JOIN transactions t ON d.transaction_id = t.id AND d.user_id = t.user_id
    WHERE d.user_id = $1 
    ORDER BY d.created_at DESC;
  `;
  const res = await pool.query(query, [userId]);
  return res.rows.map(mapRowToDocument);
}

export async function getDocumentById(id: string, userId: string): Promise<FrontendDocument | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const query = `
    SELECT 
      d.id,
      d.filename,
      d.upload_date,
      d.file_size,
      d.ocr_status,
      COALESCE(NULLIF(t.name, ''), d.detected_merchant) AS detected_merchant,
      COALESCE(t.amount, d.detected_amount) AS detected_amount,
      COALESCE(NULLIF(t.date, ''), d.detected_date) AS detected_date,
      d.confidence_score,
      d.storage_path,
      d.mime_type,
      d.currency,
      d.tax_amount,
      d.invoice_number,
      d.line_items,
      d.transaction_id,
      COALESCE(NULLIF(t.category, ''), d.category) AS category,
      d.receipt_fingerprint,
      d.created_at,
      d.updated_at
    FROM documents d
    LEFT JOIN transactions t ON d.transaction_id = t.id AND d.user_id = t.user_id
    WHERE d.id = $1 AND d.user_id = $2 
    LIMIT 1;
  `;
  const res = await pool.query(query, [id, userId]);
  return res.rows.length > 0 ? mapRowToDocument(res.rows[0]) : null;
}

export async function insertDocument(
  d: {
    id?: string;
    filename: string;
    uploadDate?: string;
    fileSize?: string;
    ocrStatus?: 'Extracted' | 'Processing' | 'Pending Review' | 'Failed';
    detectedMerchant?: string;
    detectedAmount?: number;
    detectedDate?: string;
    confidenceScore?: number;
    storagePath?: string;
    mimeType?: string;
    currency?: string;
    taxAmount?: number;
    invoiceNumber?: string;
    lineItems?: Array<{ description: string; quantity?: number; price?: number }>;
    transactionId?: string;
    category?: string;
    receiptFingerprint?: string;
  },
  userId: string
): Promise<FrontendDocument> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const id = d.id && d.id.trim() !== '' ? d.id.trim() : `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const query = `
    INSERT INTO documents (
      id, filename, upload_date, file_size, ocr_status, detected_merchant,
      detected_amount, detected_date, confidence_score, user_id,
      storage_path, mime_type, currency, tax_amount, invoice_number, line_items, transaction_id, category, receipt_fingerprint
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *;
  `;
  const res = await pool.query(query, [
    id,
    d.filename,
    d.uploadDate || 'Just now',
    d.fileSize || '0 KB',
    d.ocrStatus || 'Processing',
    d.detectedMerchant || '',
    d.detectedAmount ?? 0,
    d.detectedDate || '',
    d.confidenceScore ?? 0,
    userId,
    d.storagePath || null,
    d.mimeType || null,
    d.currency || 'INR',
    d.taxAmount ?? 0,
    d.invoiceNumber || '',
    d.lineItems ? JSON.stringify(d.lineItems) : null,
    d.transactionId || null,
    d.category || 'Others',
    d.receiptFingerprint || null,
  ]);
  return mapRowToDocument(res.rows[0]);
}

export async function updateDocument(
  id: string,
  userId: string,
  updates: Partial<{
    filename: string;
    ocrStatus: 'Extracted' | 'Processing' | 'Pending Review' | 'Failed';
    detectedMerchant: string;
    detectedAmount: number;
    detectedDate: string;
    confidenceScore: number;
    storagePath: string;
    mimeType: string;
    currency: string;
    taxAmount: number;
    invoiceNumber: string;
    lineItems: Array<{ description: string; quantity?: number; price?: number }>;
    transactionId: string;
    category: string;
    receiptFingerprint: string;
  }>
): Promise<FrontendDocument | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const existing = await getDocumentById(id, userId);
  if (!existing) return null;

  const filename = updates.filename !== undefined ? updates.filename : existing.filename;
  const ocrStatus = updates.ocrStatus !== undefined ? updates.ocrStatus : existing.ocrStatus;
  const detectedMerchant = updates.detectedMerchant !== undefined ? updates.detectedMerchant : existing.detectedMerchant;
  const detectedAmount = updates.detectedAmount !== undefined ? updates.detectedAmount : existing.detectedAmount;
  const detectedDate = updates.detectedDate !== undefined ? updates.detectedDate : existing.detectedDate;
  const confidenceScore = updates.confidenceScore !== undefined ? updates.confidenceScore : existing.confidenceScore;
  const storagePath = updates.storagePath !== undefined ? updates.storagePath : existing.storagePath || null;
  const mimeType = updates.mimeType !== undefined ? updates.mimeType : existing.mimeType || null;
  const currency = updates.currency !== undefined ? updates.currency : existing.currency || 'INR';
  const taxAmount = updates.taxAmount !== undefined ? updates.taxAmount : existing.taxAmount || 0;
  const invoiceNumber = updates.invoiceNumber !== undefined ? updates.invoiceNumber : existing.invoiceNumber || '';
  const lineItems = updates.lineItems !== undefined ? JSON.stringify(updates.lineItems) : (existing.lineItems ? JSON.stringify(existing.lineItems) : null);
  const transactionId = updates.transactionId !== undefined ? updates.transactionId : existing.transactionId || null;
  const category = updates.category !== undefined ? updates.category : existing.category || 'Others';
  const receiptFingerprint = updates.receiptFingerprint !== undefined ? updates.receiptFingerprint : existing.receiptFingerprint || null;

  const query = `
    UPDATE documents
    SET filename = $3,
        ocr_status = $4,
        detected_merchant = $5,
        detected_amount = $6,
        detected_date = $7,
        confidence_score = $8,
        storage_path = $9,
        mime_type = $10,
        currency = $11,
        tax_amount = $12,
        invoice_number = $13,
        line_items = $14,
        transaction_id = $15,
        category = $16,
        receipt_fingerprint = $17,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const res = await pool.query(query, [
    id,
    userId,
    filename,
    ocrStatus,
    detectedMerchant,
    detectedAmount,
    detectedDate,
    confidenceScore,
    storagePath,
    mimeType,
    currency,
    taxAmount,
    invoiceNumber,
    lineItems,
    transactionId,
    category,
    receiptFingerprint,
  ]);
  return res.rows.length > 0 ? mapRowToDocument(res.rows[0]) : null;
}

export async function findDocumentByReceiptFingerprint(
  userId: string,
  fingerprint: string,
  excludeDocId?: string
): Promise<FrontendDocument | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  let query = `
    SELECT 
      d.id,
      d.filename,
      d.upload_date,
      d.file_size,
      d.ocr_status,
      COALESCE(NULLIF(t.name, ''), d.detected_merchant) AS detected_merchant,
      COALESCE(t.amount, d.detected_amount) AS detected_amount,
      COALESCE(NULLIF(t.date, ''), d.detected_date) AS detected_date,
      d.confidence_score,
      d.storage_path,
      d.mime_type,
      d.currency,
      d.tax_amount,
      d.invoice_number,
      d.line_items,
      d.transaction_id,
      COALESCE(NULLIF(t.category, ''), d.category) AS category,
      d.receipt_fingerprint,
      d.created_at,
      d.updated_at
    FROM documents d
    LEFT JOIN transactions t ON d.transaction_id = t.id AND d.user_id = t.user_id
    WHERE d.user_id = $1 AND d.receipt_fingerprint = $2
  `;
  const params: any[] = [userId, fingerprint];
  if (excludeDocId) {
    query += ' AND d.id <> $3';
    params.push(excludeDocId);
  }
  query += ' ORDER BY d.created_at ASC LIMIT 1;';
  const res = await pool.query(query, params);
  return res.rows.length > 0 ? mapRowToDocument(res.rows[0]) : null;
}

export async function deleteDocumentById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query('DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

export async function bulkInsertDocuments(
  documents: Array<{
    id?: string;
    filename: string;
    uploadDate?: string;
    fileSize?: string;
    ocrStatus?: 'Extracted' | 'Processing' | 'Pending Review' | 'Failed';
    detectedMerchant?: string;
    detectedAmount?: number;
    detectedDate?: string;
    confidenceScore?: number;
    storagePath?: string;
    mimeType?: string;
    currency?: string;
    taxAmount?: number;
    invoiceNumber?: string;
    lineItems?: Array<{ description: string; quantity?: number; price?: number }>;
    transactionId?: string;
    category?: string;
  }>,
  userId: string,
  onConflict: 'skip' | 'error' = 'skip'
): Promise<{ inserted: FrontendDocument[]; skippedCount: number }> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const client = await pool.connect();
  const inserted: FrontendDocument[] = [];
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    for (const d of documents) {
      const id = d.id && d.id.trim() !== '' ? d.id.trim() : `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const filename = String(d.filename).trim();
      const uploadDate = d.uploadDate ? String(d.uploadDate).trim() : 'Just now';
      const fileSize = d.fileSize ? String(d.fileSize).trim() : '0 KB';
      const ocrStatus = d.ocrStatus || 'Processing';
      const detectedMerchant = d.detectedMerchant ? String(d.detectedMerchant).trim() : '';
      const detectedAmount = d.detectedAmount !== undefined ? Number(d.detectedAmount) : 0;
      const detectedDate = d.detectedDate ? String(d.detectedDate).trim() : '';
      const confidenceScore = d.confidenceScore !== undefined ? Number(d.confidenceScore) : 0;
      const storagePath = d.storagePath || null;
      const mimeType = d.mimeType || null;
      const currency = d.currency || 'INR';
      const taxAmount = d.taxAmount !== undefined ? Number(d.taxAmount) : 0;
      const invoiceNumber = d.invoiceNumber || '';
      const lineItems = d.lineItems ? JSON.stringify(d.lineItems) : null;
      const transactionId = d.transactionId || null;
      const category = d.category || 'Others';

      const existingRes = await client.query(
        'SELECT id FROM documents WHERE user_id = $1 AND (id = $2 OR (LOWER(TRIM(filename)) = LOWER(TRIM($3)) AND LOWER(TRIM(upload_date)) = LOWER(TRIM($4)))) LIMIT 1;',
        [userId, id, filename, uploadDate]
      );

      if (existingRes.rows.length > 0) {
        if (onConflict === 'error') {
          throw new Error(`DUPLICATE_DOCUMENT_CONFLICT: Document "${filename}" or ID "${id}" already exists.`);
        }
        skippedCount++;
        continue;
      }

      const insertSql = `
        INSERT INTO documents (
          id, filename, upload_date, file_size, ocr_status, detected_merchant,
          detected_amount, detected_date, confidence_score, user_id,
          storage_path, mime_type, currency, tax_amount, invoice_number, line_items, transaction_id, category
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const res = await client.query(insertSql, [
        id,
        filename,
        uploadDate,
        fileSize,
        ocrStatus,
        detectedMerchant,
        detectedAmount,
        detectedDate,
        confidenceScore,
        userId,
        storagePath,
        mimeType,
        currency,
        taxAmount,
        invoiceNumber,
        lineItems,
        transactionId,
        category,
      ]);
      if (res.rows.length > 0) {
        inserted.push(mapRowToDocument(res.rows[0]));
      } else {
        skippedCount++;
      }
    }

    await client.query('COMMIT');
    return { inserted, skippedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
