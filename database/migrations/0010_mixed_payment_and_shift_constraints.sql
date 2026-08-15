-- Migration 0010: Mixed payment backfill & Unique open shift per cashier/branch constraint

-- 1. Backfill existing sales cash_amount_dzd / card_amount_dzd if unpopulated or 0
UPDATE sales 
SET cash_amount_dzd = total_dzd, card_amount_dzd = 0 
WHERE payment_method = 'cash' AND (cash_amount_dzd IS NULL OR cash_amount_dzd = 0) AND total_dzd > 0;

UPDATE sales 
SET cash_amount_dzd = 0, card_amount_dzd = total_dzd 
WHERE payment_method = 'card' AND (card_amount_dzd IS NULL OR card_amount_dzd = 0) AND total_dzd > 0;

-- 2. Close duplicate historic open shifts (keeping only the latest open shift per cashier/branch)
UPDATE shifts
SET status = 'closed', closed_at = datetime('now')
WHERE status = 'open' AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY branch_id, cashier_id ORDER BY opened_at DESC) as rn
    FROM shifts WHERE status = 'open'
  ) WHERE rn = 1
);

-- 3. Database-level partial unique index to enforce max 1 open shift per cashier per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_shift_per_cashier_branch 
ON shifts(branch_id, cashier_id) WHERE status = 'open';
