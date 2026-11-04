import { getDbPool } from '../db.js';

export interface DbUserRecord {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'user' | 'admin';
  monthly_income: number;
  created_at: string;
  updated_at: string;
}

export interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatarInitials: string;
  monthlyIncome: number;
  createdAt?: string;
}

function computeInitials(name: string): string {
  if (!name || name.trim() === '') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function sanitizeUser(row: DbUserRecord): SanitizedUser {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    avatarInitials: computeInitials(row.display_name),
    monthlyIncome: parseFloat(String(row.monthly_income)),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

/**
 * Finds a user by normalized lowercase email.
 */
export async function getUserByEmail(email: string): Promise<DbUserRecord | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const normalized = email.trim().toLowerCase();
  const query = 'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1;';
  const result = await pool.query(query, [normalized]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Finds a user by primary key ID.
 */
export async function getUserById(id: string): Promise<DbUserRecord | null> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = 'SELECT * FROM users WHERE id = $1 LIMIT 1;';
  try {
    const result = await pool.query(query, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err: any) {
    if (err?.code === 'ECONNRESET' || err?.message?.includes('ECONNRESET') || err?.message?.includes('Connection terminated')) {
      const retryResult = await pool.query(query, [id]);
      return retryResult.rows.length > 0 ? retryResult.rows[0] : null;
    }
    throw err;
  }
}

/**
 * Creates a new user record.
 * STRICT ENFORCEMENT: Public registration ALWAYS assigns role = 'user'.
 * Admin roles can never be created through this registration method.
 */
export async function createUser(params: {
  email: string;
  passwordHash: string;
  displayName: string;
  monthlyIncome?: number;
}): Promise<SanitizedUser> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const normalizedEmail = params.email.trim().toLowerCase();

  const query = `
    INSERT INTO users (id, email, password_hash, display_name, role, monthly_income)
    VALUES ($1, $2, $3, $4, 'user', $5)
    RETURNING *;
  `;

  const values = [
    id,
    normalizedEmail,
    params.passwordHash,
    params.displayName.trim(),
    params.monthlyIncome !== undefined ? params.monthlyIncome : 48500.00,
  ];

  const result = await pool.query(query, values);
  return sanitizeUser(result.rows[0]);
}

/**
 * Deletes a user record by ID (for automated test cleanup).
 */
export async function deleteUserById(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');

  const query = 'DELETE FROM users WHERE id = $1 RETURNING id;';
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}
