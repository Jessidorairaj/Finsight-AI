import { getDbPool } from '../db.js';

export interface FrontendTransaction {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  type: 'income' | 'expense';
  merchantIcon?: string;
  paymentMethod?: string;
  notes?: string;
  status: 'Completed' | 'Pending';
  receiptFingerprint?: string;
  createdAt?: string;
}

export interface DbTransactionInput {
  id?: string;
  name: string;
  category?: string;
  amount: number;
  date: string;
  type: 'income' | 'expense';
  merchantIcon?: string;
  paymentMethod?: string;
  notes?: string;
  status?: 'Completed' | 'Pending';
  receiptFingerprint?: string;
  recurring_id?: string;
  bill_id?: string;
}

/**
 * Maps PostgreSQL snake_case row to frontend camelCase Transaction.
 */
export function mapRowToTransaction(row: any): FrontendTransaction {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: parseFloat(row.amount),
    date: row.date,
    type: row.type,
    paymentMethod: row.payment_method || 'Card',
    status: row.status || 'Completed',
    notes: row.notes || undefined,
    merchantIcon: row.merchant_icon || undefined,
    receiptFingerprint: row.receipt_fingerprint || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

function generateFallbackId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Retrieves all transactions for the authenticated user sorted by date descending.
 */
export async function getAllTransactions(userId: string, limit: number = 5000, offset: number = 0): Promise<FrontendTransaction[]> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = `
    SELECT id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, created_at
    FROM transactions
    WHERE user_id = $1
    ORDER BY date DESC, created_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await pool.query(query, [userId, limit, offset]);
  return result.rows.map(mapRowToTransaction);
}

/**
 * Retrieves a single transaction strictly matching both transaction ID and authenticated user ID.
 */
export async function getTransactionById(id: string, userId: string): Promise<FrontendTransaction | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = `
    SELECT id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, created_at
    FROM transactions
    WHERE id = $1 AND user_id = $2
    LIMIT 1;
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToTransaction(result.rows[0]);
}

/**
 * Inserts a single transaction owned by the authenticated user.
 */
export async function insertTransaction(input: DbTransactionInput, userId: string): Promise<FrontendTransaction> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  let id = input.id && input.id.trim() !== '' ? input.id.trim() : generateFallbackId();
  const existingCheck = await pool.query('SELECT user_id FROM transactions WHERE id = $1 LIMIT 1;', [id]);
  if (existingCheck.rows.length > 0 && existingCheck.rows[0].user_id !== userId) {
    const userPrefix = `tx_${userId.replace(/[^a-zA-Z0-9]/g, '_')}_`;
    id = id.startsWith(userPrefix) ? id : `${userPrefix}${id.replace(/^tx_/, '')}`;
  }

  const query = `
    INSERT INTO transactions (
      id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, user_id, receipt_fingerprint, recurring_id, bill_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, receipt_fingerprint, created_at;
  `;

  const values = [
    id,
    input.name,
    input.category || 'Others',
    input.amount,
    input.date,
    input.type,
    input.paymentMethod || 'Card',
    input.status || 'Completed',
    input.notes || null,
    input.merchantIcon || null,
    userId, // Enforce authenticated owner
    input.receiptFingerprint || null,
    input.recurring_id || '',
    input.bill_id || '',
  ];

  const result = await pool.query(query, values);
  return mapRowToTransaction(result.rows[0]);
}

/**
 * Finds an existing transaction by user ID and receipt fingerprint.
 */
export async function findTransactionByReceiptFingerprint(
  userId: string,
  fingerprint: string
): Promise<FrontendTransaction | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = `
    SELECT id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, receipt_fingerprint, created_at
    FROM transactions
    WHERE user_id = $1 AND receipt_fingerprint = $2
    LIMIT 1;
  `;

  const result = await pool.query(query, [userId, fingerprint]);
  if (result.rows.length === 0) return null;
  return mapRowToTransaction(result.rows[0]);
}

/**
 * Updates an existing transaction strictly scoped to the authenticated owner.
 */
export async function updateTransaction(
  id: string,
  userId: string,
  updates: Partial<DbTransactionInput>
): Promise<FrontendTransaction | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const existing = await getTransactionById(id, userId);
  if (!existing) {
    return null;
  }

  const updatedName = updates.name !== undefined ? updates.name : existing.name;
  const updatedCategory = updates.category !== undefined ? updates.category : existing.category;
  const updatedAmount = updates.amount !== undefined ? updates.amount : existing.amount;
  const updatedDate = updates.date !== undefined ? updates.date : existing.date;
  const updatedType = updates.type !== undefined ? updates.type : existing.type;
  const updatedPaymentMethod = updates.paymentMethod !== undefined ? updates.paymentMethod : existing.paymentMethod;
  const updatedStatus = updates.status !== undefined ? updates.status : existing.status;
  const updatedNotes = updates.notes !== undefined ? updates.notes : (existing.notes || null);
  const updatedMerchantIcon = updates.merchantIcon !== undefined ? updates.merchantIcon : (existing.merchantIcon || null);

  const query = `
    UPDATE transactions
    SET
      name = $3,
      category = $4,
      amount = $5,
      date = $6,
      type = $7,
      payment_method = $8,
      status = $9,
      notes = $10,
      merchant_icon = $11
    WHERE id = $1 AND user_id = $2
    RETURNING id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, created_at;
  `;

  const values = [
    id,
    userId,
    updatedName,
    updatedCategory,
    updatedAmount,
    updatedDate,
    updatedType,
    updatedPaymentMethod,
    updatedStatus,
    updatedNotes,
    updatedMerchantIcon,
  ];

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToTransaction(result.rows[0]);
}

/**
 * Deletes a transaction strictly scoped to the authenticated owner.
 */
export async function deleteTransactionById(id: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = 'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id;';
  const result = await pool.query(query, [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Atomically inserts multiple transactions owned by the authenticated user.
 */
export async function bulkInsertTransactions(
  transactions: DbTransactionInput[],
  userId: string,
  onConflict: 'skip' | 'error' = 'skip'
): Promise<{ inserted: FrontendTransaction[]; skippedCount: number }> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const client = await pool.connect();
  const inserted: FrontendTransaction[] = [];
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    for (const tx of transactions) {
      let id = tx.id && tx.id.trim() !== '' ? tx.id.trim() : generateFallbackId();

      // Multi-tenant conflict isolation:
      // If the client-provided ID exists and belongs to a DIFFERENT user, namespace the ID to the current userId
      // so the current user's transaction is never silently dropped due to another user's matching ID.
      const existingCheck = await client.query('SELECT user_id FROM transactions WHERE id = $1 LIMIT 1;', [id]);
      if (existingCheck.rows.length > 0) {
        if (existingCheck.rows[0].user_id !== userId) {
          const userPrefix = `tx_${userId.replace(/[^a-zA-Z0-9]/g, '_')}_`;
          id = id.startsWith(userPrefix) ? id : `${userPrefix}${id.replace(/^tx_/, '')}`;
          const scopedCheck = await client.query('SELECT user_id FROM transactions WHERE id = $1 LIMIT 1;', [id]);
          if (scopedCheck.rows.length > 0) {
            if (onConflict === 'error') {
              throw new Error(`DUPLICATE_ID_CONFLICT: Transaction ID "${id}" already exists.`);
            }
            skippedCount++;
            continue;
          }
        } else {
          // Belongs to the current authenticated user: handle duplicate or skip
          if (onConflict === 'error') {
            throw new Error(`DUPLICATE_ID_CONFLICT: Transaction ID "${id}" already exists.`);
          }
          skippedCount++;
          continue;
        }
      }

      const conflictClause = onConflict === 'skip' ? 'ON CONFLICT (id) DO NOTHING' : '';

      const insertSql = `
        INSERT INTO transactions (
          id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, user_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        ${conflictClause}
        RETURNING id, name, category, amount, date, type, payment_method, status, notes, merchant_icon, created_at;
      `;

      const values = [
        id,
        tx.name,
        tx.category || 'Others',
        tx.amount,
        tx.date,
        tx.type,
        tx.paymentMethod || 'Card',
        tx.status || 'Completed',
        tx.notes || null,
        tx.merchantIcon || null,
        userId,
      ];

      const res = await client.query(insertSql, values);
      if (res.rows.length > 0) {
        inserted.push(mapRowToTransaction(res.rows[0]));
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
