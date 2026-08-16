-- Migration 0011: Add shift_id, sale_item_id, unit_price_dzd to returns table & repair pending sales sync_queue payloads

-- 1. Add missing columns to returns table
ALTER TABLE returns ADD COLUMN shift_id TEXT REFERENCES shifts(id);
ALTER TABLE returns ADD COLUMN sale_item_id TEXT REFERENCES sale_items(id);
ALTER TABLE returns ADD COLUMN unit_price_dzd REAL;

-- Backfill sale_item_id ONLY when there is EXACTLY ONE matching sale_items row for (original_sale_id, variant_id)
UPDATE returns
SET sale_item_id = (
  SELECT si.id
  FROM sale_items si
  WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
)
WHERE sale_item_id IS NULL
  AND (
    SELECT COUNT(*)
    FROM sale_items si
    WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
  ) = 1;

-- Backfill unit_price_dzd from sale_items when deterministic:
-- Case A: sale_item_id was backfilled deterministically
UPDATE returns
SET unit_price_dzd = (
  SELECT si.unit_price_dzd
  FROM sale_items si
  WHERE si.id = returns.sale_item_id
)
WHERE unit_price_dzd IS NULL AND sale_item_id IS NOT NULL;

-- Case B: sale_item_id is NULL, but ALL matching sale_items rows have the EXACT SAME unit_price_dzd
UPDATE returns
SET unit_price_dzd = (
  SELECT MIN(si.unit_price_dzd)
  FROM sale_items si
  WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
)
WHERE unit_price_dzd IS NULL
  AND (
    SELECT COUNT(DISTINCT si.unit_price_dzd)
    FROM sale_items si
    WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
  ) = 1;

-- Backfill shift_id for existing returns from original sales
UPDATE returns
SET shift_id = (
  SELECT s.shift_id
  FROM sales s
  WHERE s.id = returns.original_sale_id
)
WHERE shift_id IS NULL;

-- 2. Repair pending sales sync_queue payloads missing cash_amount_dzd / card_amount_dzd
UPDATE sync_queue
SET payload = json_set(
  payload,
  '$.cash_amount_dzd',
  COALESCE(
    (SELECT s.cash_amount_dzd FROM sales s WHERE s.id = json_extract(sync_queue.payload, '$.id')),
    CASE WHEN json_extract(payload, '$.payment_method') = 'card' THEN 0 ELSE json_extract(payload, '$.total_dzd') END
  ),
  '$.card_amount_dzd',
  COALESCE(
    (SELECT s.card_amount_dzd FROM sales s WHERE s.id = json_extract(sync_queue.payload, '$.id')),
    CASE WHEN json_extract(payload, '$.payment_method') = 'card' THEN json_extract(payload, '$.total_dzd') ELSE 0 END
  )
)
WHERE table_name = 'sales'
  AND synced_at IS NULL
  AND (json_extract(payload, '$.cash_amount_dzd') IS NULL OR json_extract(payload, '$.card_amount_dzd') IS NULL);
