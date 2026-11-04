-- Migration 008: Add month column and duplicate prevention to budgets; make goals target_date optional
-- Description: Supports monthly budgets per category, prevents duplicates, and allows goals without target_date

-- 1. Add month column to budgets (default 'All' for existing budgets)
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month TEXT NOT NULL DEFAULT 'All';

-- 2. Prevent duplicate budgets for the same user, month, and category
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_user_month_category 
ON budgets (user_id, LOWER(TRIM(month)), LOWER(TRIM(category)));

-- 3. Query index for fast user+month budget lookups
CREATE INDEX IF NOT EXISTS idx_budgets_user_month 
ON budgets (user_id, LOWER(TRIM(month)));

-- 4. Make goals target_date optional
ALTER TABLE goals ALTER COLUMN target_date DROP NOT NULL;
ALTER TABLE goals ALTER COLUMN target_date SET DEFAULT '';

