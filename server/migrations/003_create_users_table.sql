-- Migration 003: Create users table
-- Description: Non-destructive creation of server-side users authentication table for FinSight AI

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  monthly_income NUMERIC(12, 2) NOT NULL DEFAULT 48500.00 CHECK (monthly_income >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for normalized email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
