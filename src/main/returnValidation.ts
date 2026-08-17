export interface SaleItemRecord {
  id: string
  variant_id: string
  quantity: number
  unit_price_dzd: number
}

export function processReturnItemValidation(
  item: { variantId: string; quantity: number; saleItemId?: string },
  origSaleItems: SaleItemRecord[],
  explicitReturnedByLine: Map<string, number>,
  totalReturnedByVariant: Map<string, number>,
  totalPurchasedByVariant: Map<string, number>
): SaleItemRecord {
  const dbItem = item.saleItemId
    ? origSaleItems.find((si) => si.id === item.saleItemId)
    : origSaleItems.find((si) => si.variant_id === item.variantId)

  if (!dbItem) {
    throw new Error(`عفواً! المنتج المطلوب إرجاعه (ID: ${item.variantId}) غير موجود في الفاتورة الأصلية`)
  }

  const explicitReturnedForLine = explicitReturnedByLine.get(dbItem.id) ?? 0
  const lineMaxReturnable = dbItem.quantity - explicitReturnedForLine

  const totalPurchasedVariant = totalPurchasedByVariant.get(dbItem.variant_id) ?? dbItem.quantity
  const totalReturnedVariant = totalReturnedByVariant.get(dbItem.variant_id) ?? 0
  const variantMaxReturnable = totalPurchasedVariant - totalReturnedVariant

  const remainingReturnable = Math.max(0, Math.min(lineMaxReturnable, variantMaxReturnable))

  if (item.quantity <= 0) {
    throw new Error('الكمية المطلوبة للإرجاع يجب أن تكون أكبر من 0')
  }

  if (item.quantity > remainingReturnable) {
    throw new Error(`الكمية المطلوبة للإرجاع (${item.quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remainingReturnable})`)
  }

  return dbItem
}
