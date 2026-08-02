-- Migration 0008: Add customer card barcode and loyalty program settings

ALTER TABLE customers ADD COLUMN barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_barcode ON customers(barcode);

ALTER TABLE store_settings ADD COLUMN loyalty_enabled INTEGER DEFAULT 0;
ALTER TABLE store_settings ADD COLUMN loyalty_spend_per_point_dzd REAL DEFAULT 1000;
ALTER TABLE store_settings ADD COLUMN loyalty_point_value_dzd REAL DEFAULT 1;
ALTER TABLE store_settings ADD COLUMN loyalty_expiry_months INTEGER DEFAULT 0;

ALTER TABLE store_settings ADD COLUMN receipt_printer_name TEXT DEFAULT '';
ALTER TABLE store_settings ADD COLUMN label_printer_name TEXT DEFAULT '';
ALTER TABLE store_settings ADD COLUMN barcode_label_language TEXT DEFAULT 'ar';
