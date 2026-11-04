-- Migration 009: Create recurring_transactions and enhance bills and transactions tables
-- Description: Supports recurring income/expense schedules, payment-to-transaction linking, and in-app reminder preferences

-- 1. Recurring Transactions Table
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  next_due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  auto_create BOOLEAN NOT NULL DEFAULT FALSE,
  last_generated_date TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurring_txs_user ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_txs_status ON recurring_transactions(status);

-- 2. Enhance Bills Table for Transaction Linking and Reminder Preferences
ALTER TABLE bills ADD COLUMN IF NOT EXISTS transaction_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS reminder_days INTEGER NOT NULL DEFAULT 3;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurring_frequency TEXT NOT NULL DEFAULT 'monthly';

-- 3. Enhance Transactions Table for Bi-Directional Linking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_id TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_id TEXT NOT NULL DEFAULT '';

