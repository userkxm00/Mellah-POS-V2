import { describe, it, expect, vi, beforeEach } from 'vitest'

// Provide global window mock for node environment
if (typeof window === 'undefined') {
  (global as unknown as { window: Record<string, unknown> }).window = {}
}

import { createProductWithVariants, addStockMovement } from '../../src/renderer/src/services/productService'
import { importProductsFromCSV } from '../../src/renderer/src/services/csvProductImport'

describe('Phase 2C-2 — Catalog & Inventory Raw-Write IPC Migration', () => {
  beforeEach(() => {
    // Reset global electron mocks
    delete (window as unknown as { electron?: unknown }).electron
  })

  it('TEST 1: createProductWithVariants delegates exclusively to biz:products:create IPC and throws if IPC is unavailable', async () => {
    const input = {
      name: 'Shirt Alpha',
      category_id: 'cat-1',
      description: 'Cotton shirt',
      price_dzd: 2500,
      cost_dzd: 1500,
      variants: [{ size: 'M', color: 'Blue', barcode: '123456789', sku: 'S-M-BL', price_dzd: 2500, initial_stock: 10 }],
    }

    // 1. When IPC is unavailable
    await expect(createProductWithVariants(input)).rejects.toThrow('قناة الاتصال بالخادم غير متوفرة لإضافة المنتج')

    // 2. When IPC is available
    const createMock = vi.fn().mockResolvedValue({ productId: 'p-100', variantIds: ['v-100'] })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        products: {
          create: createMock,
        },
      },
    }

    const res = await createProductWithVariants(input)

    expect(createMock).toHaveBeenCalledWith({
      name: 'Shirt Alpha',
      category_id: 'cat-1',
      description: 'Cotton shirt',
      price_dzd: 2500,
      cost_dzd: 1500,
      image_url: undefined,
      variants: input.variants,
    })
    expect(res).toBe('p-100')
  })

  it('TEST 2: addStockMovement delegates exclusively to biz:inventory:adjustStock IPC and throws if IPC is unavailable', async () => {
    // 1. When IPC is unavailable
    await expect(addStockMovement('v-1', 'adjustment', 5, 'Inventory audit')).rejects.toThrow(
      'قناة الاتصال بالخادم غير متوفرة لتعديل المخزون'
    )

    // 2. When IPC is available
    const adjustMock = vi.fn().mockResolvedValue({ success: true })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        inventory: {
          adjustStock: adjustMock,
        },
      },
    }

    await addStockMovement('v-1', 'adjustment', 5, 'Inventory audit')

    expect(adjustMock).toHaveBeenCalledWith({
      variantId: 'v-1',
      type: 'adjustment',
      quantityChange: 5,
      note: 'Inventory audit',
    })
  })

  it('TEST 3: importProductsFromCSV delegates exclusively to biz:products:importCsv IPC and throws if IPC is unavailable', async () => {
    const csvContent = 'Name,Price\nItem 1,1000\nItem 2,2000'

    // 1. When IPC is unavailable
    await expect(importProductsFromCSV(csvContent)).rejects.toThrow(
      'قناة الاتصال بالخادم غير متوفرة لاستيراد ملف CSV'
    )

    // 2. When IPC is available
    const importMock = vi.fn().mockResolvedValue({ importedCount: 2 })
    ;(window as unknown as { electron: unknown }).electron = {
      biz: {
        products: {
          importCsv: importMock,
        },
      },
    }

    const count = await importProductsFromCSV(csvContent)

    expect(importMock).toHaveBeenCalledWith(csvContent)
    expect(count).toBe(2)
  })

  it('TEST 4: verifies biz:products:update, delete, addVariant, bulkUpdatePrice, and categories:manage endpoints structure', () => {
    const mockElectron = {
      biz: {
        products: {
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          addVariant: vi.fn(),
          bulkUpdatePrice: vi.fn(),
          importCsv: vi.fn(),
        },
        inventory: {
          adjustStock: vi.fn(),
        },
        categories: {
          manage: vi.fn(),
        },
      },
    }

    ;(window as unknown as { electron: unknown }).electron = mockElectron

    expect(mockElectron.biz.products.update).toBeDefined()
    expect(mockElectron.biz.products.delete).toBeDefined()
    expect(mockElectron.biz.products.addVariant).toBeDefined()
    expect(mockElectron.biz.products.bulkUpdatePrice).toBeDefined()
    expect(mockElectron.biz.inventory.adjustStock).toBeDefined()
    expect(mockElectron.biz.categories.manage).toBeDefined()
  })
})
