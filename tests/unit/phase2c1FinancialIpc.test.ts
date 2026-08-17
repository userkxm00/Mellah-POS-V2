import { describe, it, expect, vi, beforeEach } from 'vitest'

// Provide global window mock for node environment
if (typeof window === 'undefined') {
  ;(global as unknown as { window: Record<string, unknown> }).window = {}
}

import { processSale } from '../../src/renderer/src/services/saleService'
import { processReturn } from '../../src/renderer/src/services/returnService'
import { voidSale } from '../../src/renderer/src/services/voidSaleService'
import { useShiftStore } from '../../src/renderer/src/stores/shiftStore'

describe('Phase 2C-1 — Financial Raw-Write IPC Migration', () => {
  beforeEach(() => {
    // Reset global electron mocks
    delete (window as unknown as { electron?: unknown }).electron
    useShiftStore.setState({ activeShift: null, isLoading: false, error: null })
  })

  it('TEST 1: processSale delegates exclusively to biz:sales:process IPC and throws if IPC is unavailable', async () => {
    // 1. When IPC is unavailable
    await expect(
      processSale(
        [{ variant_id: 'v-1', product_name: 'Item 1', quantity: 1, unit_price_dzd: 1000 }],
        'cash',
        'shift-1'
      )
    ).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لإتمام عملية البيع')

    // 2. When IPC is available
    const processMock = vi.fn().mockResolvedValue({ saleId: 'sale-100', totalDzd: 1000, itemCount: 1 })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        sales: {
          process: processMock,
        },
      },
    }

    const res = await processSale(
      [{ variant_id: 'v-1', product_name: 'Item 1', quantity: 1, unit_price_dzd: 1000 }],
      'cash',
      'shift-1'
    )

    expect(processMock).toHaveBeenCalledWith({
      items: [{ variant_id: 'v-1', product_name: 'Item 1', quantity: 1, unit_price_dzd: 1000 }],
      paymentMethod: 'cash',
      shiftId: 'shift-1',
      customerId: undefined,
      mixedCashDzd: undefined,
      mixedCardDzd: undefined,
      discountDzd: undefined,
      creditDepositDzd: undefined,
      redeemedPointsDzd: undefined,
      storeCreditUsedDzd: undefined,
    })
    expect(res).toEqual({ saleId: 'sale-100', totalDzd: 1000, itemCount: 1 })
  })

  it('TEST 2: processReturn delegates exclusively to biz:returns:process IPC and throws if IPC is unavailable', async () => {
    // 1. When IPC is unavailable
    await expect(
      processReturn('sale-1', [{ variant_id: 'v-1', quantity: 1, unit_price_dzd: 500 }], 'cash', 'Defective')
    ).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لمعالجة المرتجع')

    // 2. When IPC is available
    const returnMock = vi.fn().mockResolvedValue({ returnId: 'ret-100' })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        returns: {
          process: returnMock,
        },
      },
    }

    const returnId = await processReturn('sale-1', [{ variant_id: 'v-1', quantity: 1, unit_price_dzd: 500 }], 'cash', 'Defective')

    expect(returnMock).toHaveBeenCalledWith({
      originalSaleId: 'sale-1',
      items: [{ variantId: 'v-1', quantity: 1, saleItemId: undefined }],
      refundMethod: 'cash',
      reason: 'Defective',
    })
    expect(returnId).toBe('ret-100')
  })

  it('TEST 3: voidSale delegates exclusively to biz:sales:void IPC and throws if IPC is unavailable', async () => {
    // 1. When IPC is unavailable
    await expect(
      voidSale('sale-1', 'Customer cancelled', [{ variant_id: 'v-1', quantity: 1, product_name: 'P1' }])
    ).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لإلغاء الفاتورة')

    // 2. When IPC is available
    const voidMock = vi.fn().mockResolvedValue({ success: true })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        sales: {
          void: voidMock,
        },
      },
    }

    await voidSale('sale-1', 'Customer cancelled', [{ variant_id: 'v-1', quantity: 1, product_name: 'P1' }])

    expect(voidMock).toHaveBeenCalledWith('sale-1', 'Customer cancelled', [
      { variant_id: 'v-1', quantity: 1, product_name: 'P1' },
    ])
  })

  it('TEST 4: openShift delegates exclusively to biz:shifts:open IPC and throws if IPC is unavailable', async () => {
    // 1. When IPC is unavailable
    await expect(useShiftStore.getState().openShift(5000)).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لفتح الوردية')

    // 2. When IPC is available
    const mockShift = { id: 's-new', opening_cash_dzd: 5000, status: 'open' }
    const openMock = vi.fn().mockResolvedValue(mockShift)
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        shifts: {
          open: openMock,
        },
      },
    }

    const shift = await useShiftStore.getState().openShift(5000)

    expect(openMock).toHaveBeenCalledWith(5000)
    expect(shift).toEqual(mockShift)
    expect(useShiftStore.getState().activeShift).toEqual(mockShift)
  })

  it('TEST 5: closeShift delegates exclusively to biz:shifts:close IPC and throws if IPC is unavailable', async () => {
    useShiftStore.setState({
      activeShift: {
        id: 's-open-1',
        branch_id: 'b-1',
        cashier_id: 'u-1',
        opening_cash_dzd: 5000,
        status: 'open',
        opened_at: '2026-08-17T00:00:00Z',
        closed_at: null,
        expected_cash_dzd: null,
        closing_cash_dzd: null,
        difference_dzd: null,
      },
    })

    // 1. When IPC is unavailable
    await expect(useShiftStore.getState().closeShift(6000)).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لإغلاق الوردية')

    // 2. When IPC is available
    const closeMock = vi.fn().mockResolvedValue({ expectedCash: 5500, difference: 500 })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        shifts: {
          close: closeMock,
        },
      },
    }

    const res = await useShiftStore.getState().closeShift(6000)

    expect(closeMock).toHaveBeenCalledWith('s-open-1', 6000)
    expect(res.expectedCash).toBe(5500)
    expect(res.difference).toBe(500)
    expect(useShiftStore.getState().activeShift).toBeNull()
  })
})
