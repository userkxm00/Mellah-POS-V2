-- ============================================================
-- MELLAH POS — Supabase Cloud Database Initial Setup
-- PostgreSQL Migration & Row-Level Security (RLS) Policies
-- ============================================================

-- 1. DROP TABLES IF THEY ALREADY EXIST (Clean Slate)
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
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','mixed')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund')),
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
  store_name TEXT NOT NULL,
  store_address TEXT,
  store_phone TEXT,
  logo_url TEXT,
  receipt_footer_text TEXT,
  default_language TEXT DEFAULT 'ar',
  session_timeout_minutes INTEGER DEFAULT 5,
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

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
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

-- 4. CREATE RLS POLICIES FOR POS SYNC (Allows authenticated clients full access)
CREATE POLICY "Allow authenticated full read" ON branches FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON branches FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON users FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON users FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON categories FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON categories FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON products FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON products FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON product_variants FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON stock_movements FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON stock_movements FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON shifts FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON shifts FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON customers FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON customers FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON sales FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON sales FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON sale_items FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON sale_items FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON returns FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full write" ON returns FOR ALL USING (true);

CREATE POLICY "Allow authenticated full read" ON store_settings FOR SELECT USING (true);
CREATE POLICY "Allow POLICY" ON store_settings FOR ALL USING (true);

-- 5. SEED INITIAL STORE DATA

INSERT INTO branches (id, name, address) VALUES 
('b1111111-1111-4111-8111-111111111111', 'فرع الجزائر العاصمة', 'شارع ديدوش مراد، الجزائر');

INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES 
('e1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'أحمد المدير', 'admin', '1234'),
('e2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'محمد الكاشير', 'cashier', '0000');

INSERT INTO store_settings (branch_id, store_name, receipt_footer_text, default_language) VALUES 
('b1111111-1111-4111-8111-111111111111', 'بوتيك الملاح للملابس', 'شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام', 'ar');

INSERT INTO categories (id, branch_id, name) VALUES 
('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'ملابس رجالية'),
('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'ملابس نسائية'),
('c3333333-3333-4333-8333-333333333333', 'b1111111-1111-4111-8111-111111111111', 'أحذية'),
('c4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'إكسسوارات');