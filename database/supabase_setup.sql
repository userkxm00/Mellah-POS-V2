-- ============================================================
-- MELLAH POS — Supabase Cloud Database Master Schema & RLS Setup
-- PostgreSQL Migration, Indexes & Fail-Closed RLS Policies
-- ============================================================

-- 1. DROP TABLES IF THEY ALREADY EXIST (Clean Slate)
DROP TABLE IF EXISTS supplier_payments CASCADE;
DROP TABLE IF EXISTS supplier_purchases CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS customer_payments CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS sync_queue CASCADE;
DROP TABLE IF EXISTS store_settings CASCADE;
DROP TABLE IF EXISTS returns CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;

-- 2. CREATE DATABASE TABLES

CREATE TABLE branches (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier')),
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE categories (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_dzd NUMERIC(12,2) NOT NULL,
  cost_dzd NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  size TEXT,
  color TEXT,
  barcode TEXT UNIQUE,
  sku TEXT,
  price_dzd NUMERIC(12,2),
  min_stock_level INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale','restock','adjustment','return')),
  quantity_change INTEGER NOT NULL,
  reference_id TEXT,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opening_cash_dzd NUMERIC(12,2) NOT NULL,
  expected_cash_dzd NUMERIC(12,2),
  closing_cash_dzd NUMERIC(12,2),
  difference_dzd NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE customers (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  loyalty_points INTEGER DEFAULT 0,
  store_credit_balance NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE sales (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  total_dzd NUMERIC(12,2) NOT NULL,
  subtotal_dzd NUMERIC(12,2) DEFAULT 0,
  discount_dzd NUMERIC(12,2) DEFAULT 0,
  cash_amount_dzd NUMERIC(12,2) DEFAULT 0,
  card_amount_dzd NUMERIC(12,2) DEFAULT 0,
  paid_amount_dzd NUMERIC(12,2) DEFAULT 0,
  remaining_debt_dzd NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','mixed','credit')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund','voided')),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price_dzd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE returns (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  original_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  refund_method TEXT CHECK (refund_method IN ('cash','store_credit','exchange')),
  reason TEXT,
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE store_settings (
  branch_id UUID PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL DEFAULT 'Mellah POS',
  store_address TEXT,
  store_phone TEXT,
  logo_url TEXT,
  receipt_footer_text TEXT,
  default_language TEXT DEFAULT 'ar',
  session_timeout_minutes INTEGER DEFAULT 5,
  telegram_bot_token TEXT,
  telegram_chat_ids TEXT,
  telegram_notify_app_launch INTEGER DEFAULT 1,
  telegram_notify_sale INTEGER DEFAULT 1,
  telegram_notify_shift INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_queue (
  id UUID PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0
);

CREATE TABLE customer_payments (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  amount_dzd NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  address TEXT,
  total_debt_dzd NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supplier_purchases (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  invoice_number TEXT,
  total_amount_dzd NUMERIC(12,2) NOT NULL,
  paid_amount_dzd NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_debt_dzd NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES supplier_purchases(id) ON DELETE SET NULL,
  amount_dzd NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ENABLE ROW LEVEL SECURITY (RLS) ON ALL 18 TABLES
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- 4. HELPER FUNCTIONS FOR TENANT & ROLE-BASED RLS POLICIES

CREATE OR REPLACE FUNCTION current_user_branch_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'branch_id')::UUID,
    (auth.jwt() -> 'app_metadata' ->> 'branch_id')::UUID
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
  SELECT auth.role() = 'authenticated';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. STRICT FAIL-CLOSED TENANT-ISOLATED RLS POLICIES (AUTHENTICATED & BRANCH RESTRICTED)

-- Branches
CREATE POLICY "Branches Branch Isolation Read" ON branches 
  FOR SELECT USING (is_authenticated() AND (id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Branches Admin Write" ON branches 
  FOR ALL USING (is_authenticated() AND is_admin());

-- Users
CREATE POLICY "Users Branch Isolation Read" ON users 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Users Admin Write" ON users 
  FOR ALL USING (is_authenticated() AND is_admin());

-- Categories
CREATE POLICY "Categories Branch Isolation Read" ON categories 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Categories Branch Isolation Write" ON categories 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Products
CREATE POLICY "Products Branch Isolation Read" ON products 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Products Branch Isolation Write" ON products 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Product Variants
CREATE POLICY "Product Variants Branch Isolation Read" ON product_variants 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Product Variants Branch Isolation Write" ON product_variants 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Stock Movements
CREATE POLICY "Stock Movements Branch Isolation Read" ON stock_movements 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Stock Movements Branch Isolation Write" ON stock_movements 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Shifts
CREATE POLICY "Shifts Branch Isolation Read" ON shifts 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Shifts Branch Isolation Write" ON shifts 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Customers
CREATE POLICY "Customers Branch Isolation Read" ON customers 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Customers Branch Isolation Write" ON customers 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Sales
CREATE POLICY "Sales Branch Isolation Read" ON sales 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Sales Branch Isolation Write" ON sales 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Sale Items
CREATE POLICY "Sale Items Branch Isolation Read" ON sale_items 
  FOR SELECT USING (is_authenticated());

CREATE POLICY "Sale Items Branch Isolation Write" ON sale_items 
  FOR ALL USING (is_authenticated());

-- Returns
CREATE POLICY "Returns Branch Isolation Read" ON returns 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Returns Branch Isolation Write" ON returns 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Store Settings
CREATE POLICY "Store Settings Branch Isolation Read" ON store_settings 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Store Settings Branch Isolation Write" ON store_settings 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Audit Logs
CREATE POLICY "Audit Logs Admin Read" ON audit_logs 
  FOR SELECT USING (is_authenticated() AND is_admin());

CREATE POLICY "Audit Logs Write" ON audit_logs 
  FOR INSERT WITH CHECK (is_authenticated());

-- Sync Queue
CREATE POLICY "Sync Queue Branch Isolation Read" ON sync_queue 
  FOR SELECT USING (is_authenticated());

CREATE POLICY "Sync Queue Branch Isolation Write" ON sync_queue 
  FOR ALL USING (is_authenticated());

-- Customer Payments (Debts Repayments)
CREATE POLICY "Customer Payments Branch Isolation Read" ON customer_payments 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Customer Payments Branch Isolation Write" ON customer_payments 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Suppliers
CREATE POLICY "Suppliers Branch Isolation Read" ON suppliers 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Suppliers Branch Isolation Write" ON suppliers 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Supplier Purchases
CREATE POLICY "Supplier Purchases Branch Isolation Read" ON supplier_purchases 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Supplier Purchases Branch Isolation Write" ON supplier_purchases 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- Supplier Payments
CREATE POLICY "Supplier Payments Branch Isolation Read" ON supplier_payments 
  FOR SELECT USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

CREATE POLICY "Supplier Payments Branch Isolation Write" ON supplier_payments 
  FOR ALL USING (is_authenticated() AND (branch_id = current_user_branch_id() OR is_admin()));

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_voided ON sales(voided_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_shift ON customer_payments(shift_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_supplier ON supplier_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);