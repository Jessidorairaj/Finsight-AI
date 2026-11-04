-- Migration 002: Create budgets, goals, bills, and documents tables
-- Description: Non-destructive creation of secondary financial entity tables for FinSight AI

-- 1. Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  allocated NUMERIC(12, 2) NOT NULL CHECK (allocated >= 0),
  color TEXT NOT NULL DEFAULT '#00E5BE',
  suggested_by_ai NUMERIC(12, 2),
  user_id TEXT NOT NULL DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets (user_id);

-- 2. Goals Table
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (current_amount >= 0),
  target_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  monthly_contribution NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (monthly_contribution >= 0),
  user_id TEXT NOT NULL DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id);

-- 3. Recurring Bills Table
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date TEXT NOT NULL,
  due_in_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'scheduled')),
  icon_type TEXT NOT NULL DEFAULT 'electricity' CHECK (icon_type IN ('wifi', 'electricity', 'streaming', 'water', 'rent')),
  user_id TEXT NOT NULL DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bills_user ON bills (user_id);

-- 4. Document Metadata Table (No binary storage in PostgreSQL)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  upload_date TEXT NOT NULL,
  file_size TEXT NOT NULL,
  ocr_status TEXT NOT NULL DEFAULT 'Processing' CHECK (ocr_status IN ('Extracted', 'Processing', 'Pending Review')),
  detected_merchant TEXT NOT NULL DEFAULT '',
  detected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  detected_date TEXT NOT NULL DEFAULT '',
  confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id);
