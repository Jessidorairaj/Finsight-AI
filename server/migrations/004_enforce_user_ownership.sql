-- Migration 004: Enforce user ownership and relational constraints
-- Description: Adds foreign key constraints with ON DELETE RESTRICT from financial entities to users(id)

DO $$
BEGIN
  -- Transactions foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_transactions_user'
  ) THEN
    ALTER TABLE transactions 
    ADD CONSTRAINT fk_transactions_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  -- Budgets foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_budgets_user'
  ) THEN
    ALTER TABLE budgets 
    ADD CONSTRAINT fk_budgets_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  -- Goals foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_goals_user'
  ) THEN
    ALTER TABLE goals 
    ADD CONSTRAINT fk_goals_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  -- Bills foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_bills_user'
  ) THEN
    ALTER TABLE bills 
    ADD CONSTRAINT fk_bills_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  -- Documents foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_documents_user'
  ) THEN
    ALTER TABLE documents 
    ADD CONSTRAINT fk_documents_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END $$;
