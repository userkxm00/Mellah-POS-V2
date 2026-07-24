-- ============================================
-- Migration 0003: Add missing columns to sales + store_credit to customers
-- Fixes: cash_amount_dzd / card_amount_dzd used in code but missing in 0001_init
-- ============================================

-- Sales: payment split amounts (used by saleService.ts and CloseShiftModal)
ALTER TABLE sales ADD COLUMN cash_amount_dzd REAL DEFAULT 0;
ALTER TABLE sales ADD COLUMN card_amount_dzd REAL DEFAULT 0;

-- Sales: discount tracking (currently applied but never persisted)
ALTER TABLE sales ADD COLUMN discount_dzd REAL DEFAULT 0;
ALTER TABLE sales ADD COLUMN subtotal_dzd REAL DEFAULT 0;

-- Sales: voided status support
-- Already has CHECK constraint for status IN ('completed','refunded','partial_refund')
-- SQLite doesn't support ALTER CHECK, so we handle 'voided' via application logic
ALTER TABLE sales ADD COLUMN voided_at TEXT;
ALTER TABLE sales ADD COLUMN void_reason TEXT;

-- Customers: store credit balance for returns
ALTER TABLE customers ADD COLUMN store_credit_balance REAL DEFAULT 0;

-- Store settings: additional fields
ALTER TABLE store_settings ADD COLUMN store_address TEXT;
ALTER TABLE store_settings ADD COLUMN store_phone TEXT;
ALTER TABLE store_settings ADD COLUMN session_timeout_minutes INTEGER DEFAULT 5;

-- Audit logs table (was created dynamically, now part of migrations)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_voided ON sales(voided_at);
