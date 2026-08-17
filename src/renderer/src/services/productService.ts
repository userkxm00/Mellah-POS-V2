import { logger } from '@/lib/logger'

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
  for (const v of input.variants) {
    const cleanBarcode = v.barcode.trim()
    if (!cleanBarcode) {
      throw new Error('يرجى إدخال رمز الباركود لكل خيار')
    }
    if (cleanBarcode.length > 256) {
      throw new Error('رمز الباركود طويل جداً (الحد الأقصى 256 حرف)')
    }
  }
}

export async function createProductWithVariants(
  input: CreateProductInput
): Promise<string> {
  validateCreateProductInput(input)

  if (window.electron?.biz?.products?.create) {
    const res = await window.electron.biz.products.create({
      name: input.name,
      category_id: input.category_id,
      description: input.description,
      price_dzd: input.price_dzd,
      cost_dzd: input.cost_dzd,
      image_url: input.image_url,
      variants: input.variants,
    })
    logger.info('Product created with variants via Main IPC', { productId: res.productId, variantCount: input.variants.length })
    return res.productId
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لإضافة المنتج')
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

  if (window.electron?.biz?.inventory?.adjustStock) {
    await window.electron.biz.inventory.adjustStock({
      variantId,
      type,
      quantityChange,
      note,
    })
    logger.info('Stock movement added via Main IPC', { variantId, type, quantityChange })
    return
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لتعديل المخزون')
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

