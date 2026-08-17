import { describe, it, expect } from 'vitest'
import {
  calculateDynamicLineMax,
  buildReturnItemsPayload,
  getLineKey,
  type AllocationItem,
} from '../../src/renderer/src/services/returnAllocation'
import { processReturnItemValidation, type SaleItemRecord } from '../../src/main/returnValidation'

describe('UI Return Allocation & Line Identity (PR #11 Edge Case)', () => {
  it('TEST 1: two sale_items share variant_id (purchased A=2, B=3; total=5) -> selects A=2, B=3 is valid', () => {
    const items: AllocationItem[] = [
      {
        sale_item_id: 'si-line-A',
        variant_id: 'v-shared-1',
        quantity_purchased: 2,
        quantity_returned_so_far: 0,
        max_returnable: 2,
        variant_max_returnable: 5,
        unit_price_dzd: 1500,
      },
      {
        sale_item_id: 'si-line-B',
        variant_id: 'v-shared-1',
        quantity_purchased: 3,
        quantity_returned_so_far: 0,
        max_returnable: 3,
        variant_max_returnable: 5,
        unit_price_dzd: 1500,
      },
    ]

    const qtyMap: Record<string, number> = {
      'si-line-A': 2,
      'si-line-B': 3,
    }

    const maxA = calculateDynamicLineMax(items[0], items, qtyMap)
    const maxB = calculateDynamicLineMax(items[1], items, qtyMap)

    expect(maxA).toBe(2)
    expect(maxB).toBe(3)

    const payload = buildReturnItemsPayload(items, qtyMap)
    expect(payload).toHaveLength(2)
    expect(payload[0]).toEqual({
      sale_item_id: 'si-line-A',
      variant_id: 'v-shared-1',
      quantity: 2,
      unit_price_dzd: 1500,
    })
    expect(payload[1]).toEqual({
      sale_item_id: 'si-line-B',
      variant_id: 'v-shared-1',
      quantity: 3,
      unit_price_dzd: 1500,
    })
  })

  it('TEST 2: legacy NULL sale_item_id return (qty=2) leaves variant remaining=3 -> UI caps total selection so A=2, B=2 (total 4 > 3) is rejected', () => {
    const items: AllocationItem[] = [
      {
        sale_item_id: 'si-line-A',
        variant_id: 'v-shared-1',
        quantity_purchased: 2,
        quantity_returned_so_far: 0,
        max_returnable: 2,
        variant_max_returnable: 3, // 5 total purchased - 2 legacy returned
        unit_price_dzd: 1500,
      },
      {
        sale_item_id: 'si-line-B',
        variant_id: 'v-shared-1',
        quantity_purchased: 3,
        quantity_returned_so_far: 0,
        max_returnable: 3,
        variant_max_returnable: 3,
        unit_price_dzd: 1500,
      },
    ]

    // User selects 2 on Line A
    const qtyMap: Record<string, number> = {
      'si-line-A': 2,
      'si-line-B': 0,
    }

    // Dynamic max for Line B MUST be capped at 1 (3 variant pool - 2 on Line A = 1)
    const maxB = calculateDynamicLineMax(items[1], items, qtyMap)
    expect(maxB).toBe(1)

    // Attempting to select 2 on Line B would exceed maxB (1)
    const userSelectedB = 2
    const validB = Math.min(userSelectedB, maxB)
    expect(validB).toBe(1) // UI clamps user selection to 1!
  })

  it('TEST 3: A=2, B=1 is valid when variant remaining=3', () => {
    const items: AllocationItem[] = [
      {
        sale_item_id: 'si-line-A',
        variant_id: 'v-shared-1',
        quantity_purchased: 2,
        quantity_returned_so_far: 0,
        max_returnable: 2,
        variant_max_returnable: 3,
        unit_price_dzd: 1500,
      },
      {
        sale_item_id: 'si-line-B',
        variant_id: 'v-shared-1',
        quantity_purchased: 3,
        quantity_returned_so_far: 0,
        max_returnable: 3,
        variant_max_returnable: 3,
        unit_price_dzd: 1500,
      },
    ]

    const qtyMap: Record<string, number> = {
      'si-line-A': 2,
      'si-line-B': 1,
    }

    const maxA = calculateDynamicLineMax(items[0], items, qtyMap)
    const maxB = calculateDynamicLineMax(items[1], items, qtyMap)

    // Dynamic max for Line A with Line B at 1: min(2, 3-1=2) = 2
    expect(maxA).toBe(2)
    // Dynamic max for Line B with Line A at 2: min(3, 3-2=1) = 1
    expect(maxB).toBe(1)

    const payload = buildReturnItemsPayload(items, qtyMap)
    const totalQty = payload.reduce((sum, item) => sum + item.quantity, 0)
    expect(totalQty).toBe(3)
  })

  it('TEST 4: line-specific cap (Line A purchased=2, explicit returned=1 -> lineRemaining=1) is enforced even if variant pool has 5 remaining', () => {
    const items: AllocationItem[] = [
      {
        sale_item_id: 'si-line-A',
        variant_id: 'v-shared-1',
        quantity_purchased: 2,
        quantity_returned_so_far: 1, // 1 already returned for this line
        max_returnable: 1,
        variant_max_returnable: 5,
        unit_price_dzd: 1500,
      },
      {
        sale_item_id: 'si-line-B',
        variant_id: 'v-shared-1',
        quantity_purchased: 3,
        quantity_returned_so_far: 0,
        max_returnable: 3,
        variant_max_returnable: 5,
        unit_price_dzd: 1500,
      },
    ]

    const qtyMap: Record<string, number> = {
      'si-line-A': 0,
      'si-line-B': 0,
    }

    const maxA = calculateDynamicLineMax(items[0], items, qtyMap)
    expect(maxA).toBe(1) // Line A can NEVER accept more than 1!
  })

  it('TEST 5: shared variant lines with different prices (Line A=2000 DZD, Line B=3000 DZD) preserves Line B price in payload', () => {
    const items: AllocationItem[] = [
      {
        sale_item_id: 'si-line-A',
        variant_id: 'v-shared-1',
        quantity_purchased: 2,
        quantity_returned_so_far: 0,
        max_returnable: 2,
        variant_max_returnable: 5,
        unit_price_dzd: 2000,
      },
      {
        sale_item_id: 'si-line-B',
        variant_id: 'v-shared-1',
        quantity_purchased: 3,
        quantity_returned_so_far: 0,
        max_returnable: 3,
        variant_max_returnable: 5,
        unit_price_dzd: 3000,
      },
    ]

    const qtyMap: Record<string, number> = {
      'si-line-B': 2,
    }

    const payload = buildReturnItemsPayload(items, qtyMap)
    expect(payload).toHaveLength(1)
    expect(payload[0]).toEqual({
      sale_item_id: 'si-line-B',
      variant_id: 'v-shared-1',
      quantity: 2,
      unit_price_dzd: 3000, // Preserves Line B unit price exactly!
    })
  })

  it('TEST 6: React/UI identity — getLineKey produces unique keys for shared variant lines', () => {
    const lineA = { sale_item_id: 'si-line-A', variant_id: 'v-shared-1' }
    const lineB = { sale_item_id: 'si-line-B', variant_id: 'v-shared-1' }

    const keyA = getLineKey(lineA)
    const keyB = getLineKey(lineB)

    expect(keyA).toBe('si-line-A')
    expect(keyB).toBe('si-line-B')
    expect(keyA).not.toBe(keyB)
  })

  it('TEST 7: regression against production server validation helper (processReturnItemValidation)', () => {
    const origSaleItems: SaleItemRecord[] = [
      { id: 'si-line-A', variant_id: 'v-shared-1', quantity: 2, unit_price_dzd: 2000 },
      { id: 'si-line-B', variant_id: 'v-shared-1', quantity: 3, unit_price_dzd: 3000 },
    ]

    const explicitReturnedByLine = new Map<string, number>()
    const totalReturnedByVariant = new Map<string, number>([['v-shared-1', 2]]) // 2 legacy returned
    const totalPurchasedByVariant = new Map<string, number>([['v-shared-1', 5]])

    // Server-side validation for 2 units on Line A
    const validatedA = processReturnItemValidation(
      { variantId: 'v-shared-1', quantity: 2, saleItemId: 'si-line-A' },
      origSaleItems,
      explicitReturnedByLine,
      totalReturnedByVariant,
      totalPurchasedByVariant
    )
    expect(validatedA.id).toBe('si-line-A')

    // Simulate batch loop state update: total returned for variant becomes 2 + 2 = 4
    totalReturnedByVariant.set('v-shared-1', 4)

    // Server-side validation MUST reject returning 2 units on Line B because remaining pool is 5 - 4 = 1
    expect(() => {
      processReturnItemValidation(
        { variantId: 'v-shared-1', quantity: 2, saleItemId: 'si-line-B' },
        origSaleItems,
        explicitReturnedByLine,
        totalReturnedByVariant,
        totalPurchasedByVariant
      )
    }).toThrow('الكمية المطلوبة للإرجاع (2) تتجاوز الكمية المتبقية القابلة للإرجاع (1)')
  })
})
