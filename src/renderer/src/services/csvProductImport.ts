import { generateUUID } from '@/lib/uuid'
import { useAuthStore } from '@/stores/authStore'
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
  stock?: number
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

function getActiveBranchId(): string {
  const branch = useAuthStore.getState().currentBranch
  if (!branch) {
    throw new Error('لا يمكن الاستيراد بدون جلسة فرع نشطة. يرجى تسجيل الدخول أولاً')
  }
  return branch.id
}

export async function processCSVProductRow(
  row: CSVProductRow,
  categoriesMap: Map<string, string>,
  existingProductsMap: Map<string, string>,
  operations: Array<{ sql: string; params: unknown[] }>
): Promise<boolean> {
  const branchId = getActiveBranchId()
  const productName = row.product_name?.trim()
  if (!productName) return false

  const priceDzd = Number(row.price_dzd) || 0
  const costDzd = Number(row.cost_dzd) || 0
  const size = row.size?.trim() || null
  const color = row.color?.trim() || null
  const barcode = row.barcode?.trim() || null
  const stock = Number(row.stock) || 0

  let categoryId: string | null = null
  if (row.category_name?.trim()) {
    const catNameLower = row.category_name.trim().toLowerCase()
    if (categoriesMap.has(catNameLower)) {
      categoryId = categoriesMap.get(catNameLower)!
    } else {
      categoryId = generateUUID()
      const now = new Date().toISOString()
      operations.push({
        sql: `INSERT INTO categories (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        params: [categoryId, branchId, row.category_name.trim(), now, now],
      })
      categoriesMap.set(catNameLower, categoryId)
    }
  }

  const prodKey = `${productName.toLowerCase()}_${categoryId ?? ''}`
  let productId: string
  const now = new Date().toISOString()

  if (existingProductsMap.has(prodKey)) {
    productId = existingProductsMap.get(prodKey)!
  } else {
    productId = generateUUID()
    existingProductsMap.set(prodKey, productId)
    operations.push({
      sql: `INSERT INTO products (id, branch_id, category_id, name, price_dzd, cost_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [productId, branchId, categoryId, productName, priceDzd, costDzd, now, now],
    })
  }

  const variantId = generateUUID()
  operations.push({
    sql: `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [variantId, productId, branchId, size || null, color || null, barcode || null, priceDzd, now, now],
  })

  if (stock > 0) {
    operations.push({
      sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_at) VALUES (?, ?, ?, 'restock', ?, ?, ?)`,
      params: [generateUUID(), branchId, variantId, stock, 'استيراد أولي من ملف CSV', now],
    })
  }

  return true
}

export async function importProductsFromCSV(csvContent: string): Promise<number> {
  const branchId = getActiveBranchId()
  const lines = csvContent.split('\n').filter((l) => l.trim())
  if (lines.length <= 1) {
    throw new Error('ملف CSV فارغ أو لا يحتوي على بيانات')
  }

  const indices = parseCSVHeader(lines[0])
  const now = new Date().toISOString()
  const operations: Array<{ sql: string; params: unknown[] }> = []

  const catRows = await window.electron.db.query<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE branch_id = ? AND deleted_at IS NULL',
    [branchId]
  )
  const categoryMap = new Map<string, string>()
  for (const c of catRows) {
    categoryMap.set(c.name.toLowerCase(), c.id)
  }

  const prodRows = await window.electron.db.query<{ id: string; name: string; category_id: string | null }>(
    'SELECT id, name, category_id FROM products WHERE branch_id = ? AND deleted_at IS NULL',
    [branchId]
  )
  const productMap = new Map<string, string>()
  for (const p of prodRows) {
    productMap.set(`${p.name.toLowerCase()}_${p.category_id ?? ''}`, p.id)
  }

  let importedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const productName = cols[indices.nameIdx]?.trim()
    const priceDzd = Number.parseFloat(cols[indices.priceIdx]) || 0
    if (!productName || priceDzd <= 0) continue

    const rowInput: CSVProductRow = {
      product_name: productName,
      category_name: indices.categoryIdx !== -1 ? cols[indices.categoryIdx]?.trim() : undefined,
      price_dzd: priceDzd,
      cost_dzd: indices.costIdx !== -1 ? Number.parseFloat(cols[indices.costIdx]) || 0 : undefined,
      size: indices.sizeIdx !== -1 ? cols[indices.sizeIdx]?.trim() : undefined,
      color: indices.colorIdx !== -1 ? cols[indices.colorIdx]?.trim() : undefined,
      barcode: indices.barcodeIdx !== -1 ? cols[indices.barcodeIdx]?.trim() : undefined,
      stock: indices.stockIdx !== -1 ? Number.parseInt(cols[indices.stockIdx], 10) || 0 : undefined,
    }

    const success = await processCSVProductRow(rowInput, categoryMap, productMap, operations)
    if (success) importedCount++
  }

  if (operations.length > 0) {
    await window.electron.db.transaction(operations)
    recordAuditLog('csv_imported', 'products', `استيراد ${importedCount} منتجات من ملف CSV`, now).catch(() => {})
    logger.info('CSV import executed successfully', { importedCount, opCount: operations.length })
  }

  return importedCount
}
