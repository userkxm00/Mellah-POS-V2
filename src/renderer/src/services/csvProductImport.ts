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

export async function importProductsFromCSV(csvContent: string): Promise<number> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length <= 1) {
    throw new Error('ملف CSV فارغ أو لا يحتوي على صفوف بيانات')
  }

  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('اسم') || h.includes('منتج'))
  const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('سعر'))
  const costIdx = header.findIndex((h) => h.includes('cost') || h.includes('تكلفة'))
  const categoryIdx = header.findIndex((h) => h.includes('category') || h.includes('فئة'))
  const sizeIdx = header.findIndex((h) => h.includes('size') || h.includes('مقاس'))
  const colorIdx = header.findIndex((h) => h.includes('color') || h.includes('لون'))
  const barcodeIdx = header.findIndex((h) => h.includes('barcode') || h.includes('باركود'))
  const stockIdx = header.findIndex((h) => h.includes('stock') || h.includes('مخزون') || h.includes('كمية'))

  if (nameIdx === -1 || priceIdx === -1) {
    throw new Error('يجب أن يحتوي ملف CSV على عمود اسم المنتج (Name) وسعر البيع (Price)')
  }

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
    const productName = cols[nameIdx]?.trim()
    const priceDzd = parseFloat(cols[priceIdx]) || 0
    if (!productName || priceDzd <= 0) continue

    const categoryName = categoryIdx !== -1 ? cols[categoryIdx]?.trim() : ''
    const costDzd = costIdx !== -1 ? parseFloat(cols[costIdx]) || 0 : 0
    const size = sizeIdx !== -1 ? cols[sizeIdx]?.trim() : null
    const color = colorIdx !== -1 ? cols[colorIdx]?.trim() : null
    const barcode = barcodeIdx !== -1 ? cols[barcodeIdx]?.trim() : null
    const stock = stockIdx !== -1 ? parseInt(cols[stockIdx]) || 0 : 0

    // Resolve Category ID
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

    // Resolve Product ID
    let productId: string
    const prodKey = `${productName.toLowerCase()}_${categoryId ?? ''}`
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

    // Insert Product Variant
    const variantId = generateUUID()
    operations.push({
      sql: `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [variantId, productId, DEFAULT_BRANCH_ID, size || null, color || null, barcode || null, priceDzd, now, now],
    })

    // Insert initial stock movement if stock > 0
    if (stock > 0) {
      const movementId = generateUUID()
      operations.push({
        sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_at) VALUES (?, ?, ?, 'restock', ?, ?, ?)`,
        params: [movementId, DEFAULT_BRANCH_ID, variantId, stock, 'استيراد أولي من ملف CSV', now],
      })
    }

    importedCount++
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
