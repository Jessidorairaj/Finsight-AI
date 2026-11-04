-- Migration 005: Add storage and detailed OCR fields to documents table
-- Adds storage_path, mime_type, currency, tax_amount, invoice_number, line_items, and transaction_id

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS invoice_number TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS line_items JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transaction_id TEXT;

-- Safely expand ocr_status constraint to support Failed status
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_ocr_status_check;
  ALTER TABLE documents ADD CONSTRAINT documents_ocr_status_check 
    CHECK (ocr_status IN ('Extracted', 'Processing', 'Pending Review', 'Failed'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents (transaction_id);

