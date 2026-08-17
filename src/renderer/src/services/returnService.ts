import { logger } from '@/lib/logger'
import type { PaymentMethod } from '@/types/database'

export interface SaleReturnLookupItem {
  sale_item_id?: string
  variant_id: string
  product_name: string
  size: string | null
  color: string | null
  barcode: string | null
  unit_price_dzd: number
  quantity_purchased: number
  quantity_returned_so_far: number
  max_returnable: number
  variant_max_returnable?: number
}

export interface SaleReturnLookupResult {
  sale_id: string
  created_at: string
  cashier_name: string
  total_dzd: number
  payment_method: PaymentMethod
  items: SaleReturnLookupItem[]
}

export interface ReturnItemInput {
  sale_item_id?: string
  variant_id: string
  quantity: number
  unit_price_dzd: number
}

export async function lookupSaleForReturn(saleId: string): Promise<SaleReturnLookupResult> {
  const cleanId = saleId.trim()
  if (!cleanId) {
    throw new Error('يرجى إدخال رقم الوصل')
  }

  // 1. Fetch Sale
  const sales = await window.electron.db.query<{
    id: string
    created_at: string
    cashier_name: string
    total_dzd: number
    payment_method: PaymentMethod
  }>(
    `SELECT s.id, s.created_at, s.total_dzd, s.payment_method, u.full_name as cashier_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.cashier_id
     WHERE s.id = ? AND s.status != 'voided'`,
    [cleanId]
  )

  if (sales.length === 0) {
    throw new Error('لم يتم العثور على وصل بيع بهاد الرقم')
  }

  const sale = sales[0]

  // 2. Fetch Sale Items & Returns
  const items = await window.electron.db.query<{
    sale_item_id: string
    variant_id: string
    product_name: string
    size: string | null
    color: string | null
    barcode: string | null
    unit_price_dzd: number
    quantity_purchased: number
  }>(
    `SELECT 
       si.id as sale_item_id, si.variant_id, p.name as product_name, v.size, v.color, v.barcode,
       si.unit_price_dzd, si.quantity as quantity_purchased
     FROM sale_items si
     JOIN product_variants v ON v.id = si.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE si.sale_id = ?`,
    [cleanId]
  )

  const rawReturns = await window.electron.db.query<{
    sale_item_id: string | null
    variant_id: string
    quantity: number
  }>(
    `SELECT sale_item_id, variant_id, quantity FROM returns WHERE original_sale_id = ?`,
    [cleanId]
  )

  const explicitReturnedByLine = new Map<string, number>()
  const totalReturnedByVariant = new Map<string, number>()
  for (const r of rawReturns) {
    if (r.sale_item_id) {
      explicitReturnedByLine.set(r.sale_item_id, (explicitReturnedByLine.get(r.sale_item_id) ?? 0) + r.quantity)
    }
    totalReturnedByVariant.set(r.variant_id, (totalReturnedByVariant.get(r.variant_id) ?? 0) + r.quantity)
  }

  const totalPurchasedByVariant = new Map<string, number>()
  for (const i of items) {
    totalPurchasedByVariant.set(i.variant_id, (totalPurchasedByVariant.get(i.variant_id) ?? 0) + i.quantity_purchased)
  }

  const mappedItems: SaleReturnLookupItem[] = items.map((i) => {
    const explicitReturned = explicitReturnedByLine.get(i.sale_item_id) ?? 0
    const lineMax = i.quantity_purchased - explicitReturned

    const totalPurchasedVar = totalPurchasedByVariant.get(i.variant_id) ?? i.quantity_purchased
    const totalReturnedVar = totalReturnedByVariant.get(i.variant_id) ?? 0
    const variantMax = totalPurchasedVar - totalReturnedVar

    const maxReturnable = Math.max(0, Math.min(lineMax, variantMax))

    return {
      ...i,
      quantity_returned_so_far: explicitReturned,
      max_returnable: maxReturnable,
      variant_max_returnable: Math.max(0, variantMax),
    }
  })

  return {
    sale_id: sale.id,
    created_at: sale.created_at,
    cashier_name: sale.cashier_name,
    total_dzd: sale.total_dzd,
    payment_method: sale.payment_method,
    items: mappedItems,
  }
}

export async function processReturn(
  saleId: string,
  returnItems: ReturnItemInput[],
  refundMethod: 'cash' | 'store_credit' | 'exchange',
  reason: string
): Promise<string> {
  const activeItems = returnItems.filter((i) => i.quantity > 0)
  if (activeItems.length === 0) {
    throw new Error('لم يتم تحديد أي عنصر للإرجاع')
  }

  if (window.electron?.biz?.returns?.process) {
    const res = await window.electron.biz.returns.process({
      originalSaleId: saleId,
      items: activeItems.map((i) => ({
        variantId: i.variant_id,
        quantity: i.quantity,
        saleItemId: i.sale_item_id,
      })),
      refundMethod,
      reason,
    })
    logger.info('Atomic return processed via Main process IPC', { saleId, returnId: (res as { returnId: string })?.returnId })
    return (res as { returnId: string })?.returnId ?? ''
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لمعالجة المرتجع')
}
