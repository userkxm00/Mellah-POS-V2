import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { recordAuditLog } from '@/services/auditLogService'
import { logger } from '@/lib/logger'

export interface CSVProductRow {
  product_name: string
  category_name?: string
  price_dzd: number
  cost_dzd?: number
  size?: string
  color?: string
  barcode?: string
  initial_stock?: number
}

interface CSVHeaderIndices {
  nameIdx: number
  priceIdx: number
  costIdx: number
  categoryIdx: number
  sizeIdx: number
  colorIdx: number
  barcodeIdx: number
  stockIdx: number
}

function parseCSVHeader(headerLine: string): CSVHeaderIndices {
  const header = headerLine.toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('اسم') || h.includes('منتج'))
  const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('سعر'))
  if (nameIdx === -1 || priceIdx === -1) {
    throw new Error('يجب أن يحتوي ملف CSV على عمود اسم المنتج (Name) وسعر البيع (Price)')
  }
  return {
    nameIdx,
    priceIdx,
    costIdx: header.findIndex((h) => h.includes('cost') || h.includes('تكلفة')),
    categoryIdx: header.findIndex((h) => h.includes('category') || h.includes('فئة')),
    sizeIdx: header.findIndex((h) => h.includes('size') || h.includes('مقاس')),
    colorIdx: header.findIndex((h) => h.includes('color') || h.includes('لون')),
    barcodeIdx: header.findIndex((h) => h.includes('barcode') || h.includes('باركود')),
    stockIdx: header.findIndex((h) => h.includes('stock') || h.includes('مخزون') || h.includes('كمية')),
  }
}

function processCSVLine(
  cols: string[],
  indices: CSVHeaderIndices,
  categoryMap: Map<string, string>,
  productMap: Map<string, string>,
  now: string,
  operations: Array<{ sql: string; params: unknown[] }>
): boolean {
  const productName = cols[indices.nameIdx]?.trim()
  const priceDzd = parseFloat(cols[indices.priceIdx]) || 0
  if (!productName || priceDzd <= 0) return false

  const categoryName = indices.categoryIdx !== -1 ? cols[indices.categoryIdx]?.trim() : ''
  const costDzd = indices.costIdx !== -1 ? parseFloat(cols[indices.costIdx]) || 0 : 0
  const size = indices.sizeIdx !== -1 ? cols[indices.sizeIdx]?.trim() : null
  const color = indices.colorIdx !== -1 ? cols[indices.colorIdx]?.trim() : null
  const barcode = indices.barcodeIdx !== -1 ? cols[indices.barcodeIdx]?.trim() : null
  const stock = indices.stockIdx !== -1 ? parseInt(cols[indices.stockIdx]) || 0 : 0

  let categoryId: string | null = null
  if (categoryName) {
    const catKey = categoryName.toLowerCase()
    if (categoryMap.has(catKey)) {
      categoryId = categoryMap.get(catKey)!
    } else {
      categoryId = generateUUID()
      categoryMap.set(catKey, categoryId)
      operations.push({
        sql: 'INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        params: [categoryId, categoryName, now, now],
      })
    }
  }

  const prodKey = `${productName.toLowerCase()}_${categoryId ?? ''}`
  let productId: string
  if (productMap.has(prodKey)) {
    productId = productMap.get(prodKey)!
  } else {
    productId = generateUUID()
    productMap.set(prodKey, productId)
    operations.push({
      sql: `INSERT INTO products (id, category_id, name, price_dzd, cost_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [productId, categoryId, productName, priceDzd, costDzd, now, now],
    })
  }

  const variantId = generateUUID()
  operations.push({
    sql: `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [variantId, productId, DEFAULT_BRANCH_ID, size || null, color || null, barcode || null, priceDzd, now, now],
  })

  if (stock > 0) {
    operations.push({
      sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_at) VALUES (?, ?, ?, 'restock', ?, ?, ?)`,
      params: [generateUUID(), DEFAULT_BRANCH_ID, variantId, stock, 'استيراد أولي من ملف CSV', now],
    })
  }

  return true
}

export async function importProductsFromCSV(csvContent: string): Promise<number> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length <= 1) {
    throw new Error('ملف CSV فارغ أو لا يحتوي على صفوف بيانات')
  }

  const indices = parseCSVHeader(lines[0])
  const now = new Date().toISOString()
  const operations: Array<{ sql: string; params: unknown[] }> = []

  // Pre-fetch categories
  const categories = await window.electron.db.query<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE deleted_at IS NULL'
  )
  const categoryMap = new Map<string, string>()
  categories.forEach((c) => categoryMap.set(c.name.trim().toLowerCase(), c.id))

  // Track created products to group variants
  const productMap = new Map<string, string>()
  let importedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const imported = processCSVLine(cols, indices, categoryMap, productMap, now, operations)
    if (imported) importedCount++
  }

  if (operations.length === 0) {
    throw new Error('لم يتم العثور على سلع صالحة للاستيراد في الملف')
  }

  try {
    await window.electron.db.transaction(operations)
    recordAuditLog('products_imported', 'products', `استيراد ${importedCount} منتج من ملف CSV`).catch(() => {})
    logger.info('Products imported via CSV', { importedCount })
    return importedCount
  } catch (err) {
    logger.error('Failed to import products from CSV', err)
    throw new Error('فشل استيراد المنتجات من ملف CSV')
  }
}
