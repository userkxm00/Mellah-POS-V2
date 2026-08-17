export interface AllocationItem {
  sale_item_id?: string
  variant_id: string
  quantity_purchased: number
  quantity_returned_so_far: number
  max_returnable: number
  variant_max_returnable?: number
  unit_price_dzd: number
}

/**
 * Obtains the unique UI identity key for a sale item line.
 * Uses sale_item_id as the primary stable identifier, falling back to variant_id.
 */
export function getLineKey(item: { sale_item_id?: string; variant_id: string }): string {
  return item.sale_item_id || item.variant_id
}

/**
 * Calculates the dynamic maximum returnable quantity for a specific line,
 * taking into account line capacity and remaining shared variant pool capacity
 * minus quantities already entered on OTHER lines of the same variant.
 */
export function calculateDynamicLineMax(
  line: AllocationItem,
  allItems: AllocationItem[],
  currentQtyMap: Record<string, number>
): number {
  const lineKey = getLineKey(line)
  const lineRemaining = Math.max(0, line.quantity_purchased - line.quantity_returned_so_far)

  // Determine variant-wide remaining pool capacity (including legacy NULL returns)
  const variantMax = line.variant_max_returnable ?? line.max_returnable

  // Sum quantities selected on OTHER lines sharing this variant_id
  let otherSelectedForVariant = 0
  for (const other of allItems) {
    const otherKey = getLineKey(other)
    if (otherKey !== lineKey && other.variant_id === line.variant_id) {
      otherSelectedForVariant += currentQtyMap[otherKey] || 0
    }
  }

  const variantAvailable = Math.max(0, variantMax - otherSelectedForVariant)

  return Math.max(0, Math.min(lineRemaining, variantAvailable))
}

/**
 * Builds submission return items payload from user quantity map, matching items by stable line key.
 */
export function buildReturnItemsPayload(
  items: AllocationItem[],
  qtyMap: Record<string, number>
): Array<{
  sale_item_id?: string
  variant_id: string
  quantity: number
  unit_price_dzd: number
}> {
  return Object.entries(qtyMap)
    .filter(([, quantity]) => quantity > 0)
    .map(([key, quantity]) => {
      const matched = items.find((i) => getLineKey(i) === key)
      if (!matched) {
        throw new Error(`تعذر العثور على عنصر البيع المطابق للمعرف: ${key}`)
      }
      return {
        sale_item_id: matched.sale_item_id,
        variant_id: matched.variant_id,
        quantity,
        unit_price_dzd: matched.unit_price_dzd,
      }
    })
}
