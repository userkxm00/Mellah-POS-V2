-- Migration 0005: Fix sales payment_method CHECK constraint and customer_payments shift_id

PRAGMA foreign_keys = OFF;

-- 1. Recreate sales table with updated CHECK constraint allowing 'credit'
CREATE TABLE sales_new (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  shift_id TEXT REFERENCES shifts(id),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT REFERENCES customers(id),
  subtotal_dzd REAL NOT NULL DEFAULT 0,
  discount_dzd REAL NOT NULL DEFAULT 0,
  total_dzd REAL NOT NULL,
  cash_amount_dzd REAL DEFAULT 0,
  card_amount_dzd REAL DEFAULT 0,
  paid_amount_dzd REAL DEFAULT 0,
  remaining_debt_dzd REAL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','mixed','credit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 2. Copy existing data from sales to sales_new
INSERT INTO sales_new (
  id, branch_id, shift_id, cashier_id, customer_id, 
  subtotal_dzd, discount_dzd, total_dzd, cash_amount_dzd, card_amount_dzd, 
  paid_amount_dzd, remaining_debt_dzd, payment_method, status, 
  created_at, updated_at, deleted_at
)
SELECT 
  id, branch_id, shift_id, cashier_id, customer_id, 
  COALESCE(subtotal_dzd, total_dzd), COALESCE(discount_dzd, 0), total_dzd, COALESCE(cash_amount_dzd, 0), COALESCE(card_amount_dzd, 0), 
  COALESCE(paid_amount_dzd, 0), COALESCE(remaining_debt_dzd, 0), payment_method, status, 
  created_at, updated_at, deleted_at
FROM sales;

-- 3. Drop old sales table and rename sales_new to sales
DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

-- 4. Recreate indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

-- 5. Add shift_id column to customer_payments table
ALTER TABLE customer_payments ADD COLUMN shift_id TEXT REFERENCES shifts(id);

PRAGMA foreign_keys = ON;
