-- Migration 0004: Customer & Supplier Debt Ledger

-- Add debt tracking columns to sales table
ALTER TABLE sales ADD COLUMN paid_amount_dzd REAL DEFAULT 0;
ALTER TABLE sales ADD COLUMN remaining_debt_dzd REAL DEFAULT 0;

-- Customer payments (repayments of outstanding debts)
CREATE TABLE IF NOT EXISTS customer_payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  amount_dzd REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- Suppliers catalog
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  address TEXT,
  total_debt_dzd REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Supplier purchase invoices
CREATE TABLE IF NOT EXISTS supplier_purchases (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  invoice_number TEXT,
  total_amount_dzd REAL NOT NULL,
  paid_amount_dzd REAL NOT NULL DEFAULT 0,
  remaining_debt_dzd REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Supplier repayments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  purchase_id TEXT,
  amount_dzd REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (purchase_id) REFERENCES supplier_purchases(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_supplier ON supplier_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
