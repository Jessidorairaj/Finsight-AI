import { getDbPool } from '../db.js';
import { parseTransactionDate, formatStandardDate } from '../../src/utils/dateUtils.js';
import { insertTransaction, FrontendTransaction } from './transactionRepository.js';

export interface FrontendRecurringTransaction {
  id: string;
  name: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  status: 'active' | 'paused';
  autoCreate: boolean;
  lastGeneratedDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapRowToRecurringTransaction(row: any): FrontendRecurringTransaction {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    amount: parseFloat(row.amount),
    type: row.type,
    category: row.category,
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    nextDueDate: row.next_due_date,
    status: row.status,
    autoCreate: Boolean(row.auto_create),
    lastGeneratedDate: row.last_generated_date || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export function computeNextDueDate(currentDueDateStr: string, frequency: 'weekly' | 'monthly' | 'yearly'): string {
  const d = parseTransactionDate(currentDueDateStr) || new Date();
  const next = new Date(d);
  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // monthly: preserve day of month
    const targetDay = d.getDate();
    next.setMonth(next.getMonth() + 1);
    // Handle month-end rollover (e.g. 31 Jan -> Feb)
    if (next.getDate() !== targetDay) {
      next.setDate(0); // last day of previous month
    }
  }
  return formatStandardDate(next);
}

export function isDateAfter(dateStrA: string, dateStrB: string): boolean {
  const a = parseTransactionDate(dateStrA);
  const b = parseTransactionDate(dateStrB);
  if (!a || !b) return false;
  return a.getTime() > b.getTime();
}

export async function getAllRecurringTransactions(userId: string): Promise<FrontendRecurringTransaction[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query(
    'SELECT * FROM recurring_transactions WHERE user_id = $1 ORDER BY created_at ASC;',
    [userId]
  );
  return res.rows.map(mapRowToRecurringTransaction);
}

export async function getRecurringTransactionById(id: string, userId: string): Promise<FrontendRecurringTransaction | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query(
    'SELECT * FROM recurring_transactions WHERE id = $1 AND user_id = $2 LIMIT 1;',
    [id, userId]
  );
  return res.rows.length > 0 ? mapRowToRecurringTransaction(res.rows[0]) : null;
}

export async function insertRecurringTransaction(
  item: {
    id?: string;
    name: string;
    description?: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    frequency: 'weekly' | 'monthly' | 'yearly';
    startDate: string;
    endDate?: string;
    nextDueDate?: string;
    status?: 'active' | 'paused';
    autoCreate?: boolean;
  },
  userId: string
): Promise<FrontendRecurringTransaction> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const id = item.id && item.id.trim() !== '' ? item.id.trim() : `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nextDueDate = item.nextDueDate && item.nextDueDate.trim() !== '' ? item.nextDueDate.trim() : item.startDate.trim();

  const query = `
    INSERT INTO recurring_transactions (
      id, name, description, amount, type, category, frequency,
      start_date, end_date, next_due_date, status, auto_create, user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *;
  `;

  const res = await pool.query(query, [
    id,
    item.name.trim(),
    (item.description || '').trim(),
    item.amount,
    item.type,
    item.category.trim(),
    item.frequency,
    item.startDate.trim(),
    (item.endDate || '').trim(),
    nextDueDate,
    item.status || 'active',
    Boolean(item.autoCreate),
    userId,
  ]);

  return mapRowToRecurringTransaction(res.rows[0]);
}

export async function updateRecurringTransaction(
  id: string,
  userId: string,
  updates: Partial<FrontendRecurringTransaction>
): Promise<FrontendRecurringTransaction | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const existing = await getRecurringTransactionById(id, userId);
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const description = updates.description !== undefined ? updates.description.trim() : existing.description;
  const amount = updates.amount !== undefined ? updates.amount : existing.amount;
  const type = updates.type !== undefined ? updates.type : existing.type;
  const category = updates.category !== undefined ? updates.category.trim() : existing.category;
  const frequency = updates.frequency !== undefined ? updates.frequency : existing.frequency;
  const startDate = updates.startDate !== undefined ? updates.startDate.trim() : existing.startDate;
  const endDate = updates.endDate !== undefined ? updates.endDate.trim() : (existing.endDate || '');
  const nextDueDate = updates.nextDueDate !== undefined ? updates.nextDueDate.trim() : existing.nextDueDate;
  const status = updates.status !== undefined ? updates.status : existing.status;
  const autoCreate = updates.autoCreate !== undefined ? Boolean(updates.autoCreate) : existing.autoCreate;
  const lastGeneratedDate = updates.lastGeneratedDate !== undefined ? updates.lastGeneratedDate.trim() : (existing.lastGeneratedDate || '');

  const query = `
    UPDATE recurring_transactions
    SET name = $3, description = $4, amount = $5, type = $6, category = $7, frequency = $8,
        start_date = $9, end_date = $10, next_due_date = $11, status = $12, auto_create = $13,
        last_generated_date = $14, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;

  const res = await pool.query(query, [
    id,
    userId,
    name,
    description,
    amount,
    type,
    category,
    frequency,
    startDate,
    endDate,
    nextDueDate,
    status,
    autoCreate,
    lastGeneratedDate,
  ]);

  return res.rows.length > 0 ? mapRowToRecurringTransaction(res.rows[0]) : null;
}

export async function deleteRecurringTransactionById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
  const res = await pool.query(
    'DELETE FROM recurring_transactions WHERE id = $1 AND user_id = $2 RETURNING id;',
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Process a due recurring entry:
 * - Checks whether user approval is required or granted.
 * - Prevents duplicate transaction generation if already processed for next_due_date.
 * - Inserts the transaction and advances next_due_date.
 */
export async function processRecurringTransaction(
  id: string,
  userId: string,
  options?: { confirmCreate?: boolean }
): Promise<{
  recurring: FrontendRecurringTransaction;
  createdTransaction: FrontendTransaction | null;
  alreadyGenerated: boolean;
  requiresConfirmation: boolean;
  message: string;
}> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const item = await getRecurringTransactionById(id, userId);
  if (!item) {
    throw new Error(`Recurring transaction "${id}" not found.`);
  }

  if (item.status === 'paused') {
    return {
      recurring: item,
      createdTransaction: null,
      alreadyGenerated: false,
      requiresConfirmation: false,
      message: `Recurring transaction "${item.name}" is paused. Resume it to generate transactions.`,
    };
  }

  // Duplicate prevention check: if already generated for current next_due_date
  if (item.lastGeneratedDate && item.lastGeneratedDate.trim() === item.nextDueDate.trim()) {
    return {
      recurring: item,
      createdTransaction: null,
      alreadyGenerated: true,
      requiresConfirmation: false,
      message: `Transaction for "${item.name}" on ${item.nextDueDate} has already been generated.`,
    };
  }

  // User-controlled setting: do not auto create without explicit confirmation or autoCreate = true
  if (!item.autoCreate && !options?.confirmCreate) {
    return {
      recurring: item,
      createdTransaction: null,
      alreadyGenerated: false,
      requiresConfirmation: true,
      message: `User confirmation required to generate transaction of ₹${item.amount} for "${item.name}".`,
    };
  }

  // Create transaction in database
  const createdTx = await insertTransaction(
    {
      name: item.name,
      amount: item.amount,
      category: item.category,
      date: item.nextDueDate,
      type: item.type,
      paymentMethod: item.type === 'income' ? 'Bank Transfer' : 'Auto-Debit',
      status: 'Completed',
      notes: `${item.description ? item.description + ' ' : ''}[Recurring ${item.frequency}]`,
      recurring_id: item.id,
    },
    userId
  );

  // Advance next_due_date
  const nextDueDate = computeNextDueDate(item.nextDueDate, item.frequency);
  let nextStatus: 'active' | 'paused' = item.status;

  // If next due date exceeds end date, pause the recurring schedule
  if (item.endDate && isDateAfter(nextDueDate, item.endDate)) {
    nextStatus = 'paused';
  }

  const updatedItem = await updateRecurringTransaction(id, userId, {
    lastGeneratedDate: item.nextDueDate,
    nextDueDate,
    status: nextStatus,
  });

  return {
    recurring: updatedItem || item,
    createdTransaction: createdTx,
    alreadyGenerated: false,
    requiresConfirmation: false,
    message: `Successfully generated transaction for "${item.name}" (₹${item.amount}) on ${item.nextDueDate}. Next due: ${nextDueDate}.`,
  };
}
