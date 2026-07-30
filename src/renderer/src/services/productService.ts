import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID } from '@/stores/shiftStore'

export interface VariantInput {
  size: string | null
  color: string | null
  barcode: string
  sku: string | null
  price_dzd: number | null // null = use base price
  initial_stock: number
}

export interface CreateProductInput {
  name: string
  category_id: string | null
  description: string | null
  price_dzd: number
  cost_dzd: number | null
  image_url?: string | null
  variants: VariantInput[]
}

function validateCreateProductInput(input: CreateProductInput): void {
  if (!input.name.trim()) {
    throw new Error('يرجى إدخال اسم المنتج')
  }
  if (input.variants.length === 0) {
    throw new Error('يرجى إضافة خيار (Variant) واحد على الأقل للمنتج')
  }
  const barcodes = input.variants.map((v) => v.barcode.trim())
  if (barcodes.length !== new Set(barcodes).size) {
    throw new Error('يوجد مكرر في الباركود المدخل ضمن الخيارات')
  }
}

export async function createProductWithVariants(
  input: CreateProductInput
): Promise<string> {
  validateCreateProductInput(input)

  const productId = generateUUID()
  const now = new Date().toISOString()
  const operations: Array<{ sql: string; params: unknown[] }> = []

  // 1. Insert Product
  operations.push({
    sql: `INSERT INTO products 
          (id, branch_id, category_id, name, description, image_url, price_dzd, cost_dzd, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      productId,
      DEFAULT_BRANCH_ID,
      input.category_id,
      input.name.trim(),
      input.description ? input.description.trim() : null,
      input.image_url || null,
      input.price_dzd,
      input.cost_dzd,
      now,
      now,
    ],
  })

  // 2. Insert Variants & Initial Stock Movements Ledger entries
  for (const v of input.variants) {
    const variantId = generateUUID()
    const movementId = generateUUID()

    operations.push({
      sql: `INSERT INTO product_variants 
            (id, product_id, branch_id, size, color, barcode, sku, price_dzd, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        variantId,
        productId,
        DEFAULT_BRANCH_ID,
        v.size ? v.size.trim() : null,
        v.color ? v.color.trim() : null,
        v.barcode.trim(),
        v.sku ? v.sku.trim() : null,
        v.price_dzd,
        now,
        now,
      ],
    })

    // If starting stock > 0, insert restock movement
    if (v.initial_stock > 0) {
      operations.push({
        sql: `INSERT INTO stock_movements 
              (id, branch_id, variant_id, type, quantity_change, note, created_by, created_at) 
              VALUES (?, ?, ?, 'restock', ?, 'مخزون أولي عند إضافة المنتج', ?, ?)`,
        params: [
          movementId,
          DEFAULT_BRANCH_ID,
          variantId,
          v.initial_stock,
          DEFAULT_CASHIER_ID,
          now,
        ],
      })
    }
  }

  try {
    await window.electron.db.transaction(operations)
    logger.info('Product created with variants', { productId, variantCount: input.variants.length })
    return productId
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل إضافة المنتج'
    logger.error('Failed to create product', err)
    throw new Error(`تعذر حفظ المنتج: ${msg}`)
  }
}

export async function addStockMovement(
  variantId: string,
  type: 'restock' | 'adjustment',
  quantityChange: number,
  note: string
): Promise<void> {
  if (quantityChange === 0) {
    throw new Error('يرجى تحديد كمية التعديل')
  }

  const id = generateUUID()
  const now = new Date().toISOString()

  try {
    await window.electron.db.execute(
      `INSERT INTO stock_movements 
       (id, branch_id, variant_id, type, quantity_change, note, created_by, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        DEFAULT_BRANCH_ID,
        variantId,
        type,
        quantityChange,
        note.trim() || 'تعديل مخزون يدوياً',
        DEFAULT_CASHIER_ID,
        now,
      ]
    )
    logger.info('Stock movement added', { variantId, type, quantityChange })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل تعديل المخزون'
    logger.error('Add stock movement failed', err)
    throw new Error(msg)
  }
}

export interface LowStockVariant {
  variant_id: string
  product_id: string
  product_name: string
  category_name: string | null
  size: string | null
  color: string | null
  barcode: string | null
  price_dzd: number
  cost_dzd: number | null
  current_stock: number
  min_stock_level: number
  suggested_reorder_qty: number
}

export async function fetchLowStockVariants(): Promise<LowStockVariant[]> {
  try {
    const rows = await window.electron.db.query<LowStockVariant>(`
      SELECT 
        v.id as variant_id,
        p.id as product_id,
        p.name as product_name,
        c.name as category_name,
        v.size,
        v.color,
        v.barcode,
        COALESCE(v.price_dzd, p.price_dzd) as price_dzd,
        p.cost_dzd,
        COALESCE(SUM(sm.quantity_change), 0) as current_stock,
        COALESCE(v.min_stock_level, 5) as min_stock_level,
        CASE 
          WHEN COALESCE(SUM(sm.quantity_change), 0) < COALESCE(v.min_stock_level, 5)
          THEN (COALESCE(v.min_stock_level, 5) * 2) - COALESCE(SUM(sm.quantity_change), 0)
          ELSE 0
        END as suggested_reorder_qty
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_movements sm ON sm.variant_id = v.id
      WHERE p.deleted_at IS NULL AND v.deleted_at IS NULL
      GROUP BY v.id
      HAVING current_stock <= min_stock_level
      ORDER BY current_stock ASC
    `)
    return rows
  } catch (err) {
    logger.error('Failed to fetch low stock variants', err)
    return []
  }
}

