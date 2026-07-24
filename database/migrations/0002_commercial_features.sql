-- Migration 0002: Add min_stock_level to product_variants
ALTER TABLE product_variants ADD COLUMN min_stock_level INTEGER DEFAULT 5;
