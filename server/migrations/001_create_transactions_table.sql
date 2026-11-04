-- Migration 001: Create transactions table
-- Description: Non-destructive idempotent creation of core transactions table for FinSight AI

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Others',
  amount NUMERIC(12, 2) NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  payment_method TEXT DEFAULT 'Card',
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Pending')),
  notes TEXT,
  merchant_icon TEXT,
  user_id TEXT DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);

-- Index for category / type aggregations
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
