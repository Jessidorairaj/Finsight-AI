-- Migration 007: Add receipt fingerprint for cross-document duplicate detection
-- Description: Adds receipt_fingerprint column and atomic unique constraint per user

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_fingerprint TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS receipt_fingerprint TEXT;

-- Atomic uniqueness enforcement: prevents duplicate receipt ingestion per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_receipt_fingerprint 
ON transactions (user_id, receipt_fingerprint) 
WHERE receipt_fingerprint IS NOT NULL;

-- Query optimization index for cross-document duplicate lookups
CREATE INDEX IF NOT EXISTS idx_documents_receipt_fingerprint 
ON documents (user_id, receipt_fingerprint) 
WHERE receipt_fingerprint IS NOT NULL;

