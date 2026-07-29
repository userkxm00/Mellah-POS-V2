-- Migration 0006: Restore missing voided_at and void_reason columns on sales table
-- Fixes "no such column: s.void_reason" error when loading Sales History on databases migrated via 0005

PRAGMA foreign_keys = OFF;

-- Recreate sales table ensuring voided_at, void_reason, and status 'voided' constraint exist
CREATE TABLE IF NOT EXISTS sales_v6 (
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
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund','voided')),
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

INSERT INTO sales_v6 (
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

DROP TABLE sales;
ALTER TABLE sales_v6 RENAME TO sales;

CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_voided ON sales(voided_at);

PRAGMA foreign_keys = ON;
