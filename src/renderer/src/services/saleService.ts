import type { CartItem } from '@/stores/cartStore'
import type { PaymentMethod } from '@/types/database'
import { useAuthStore } from '@/stores/authStore'

export const CUSTOM_GENERIC_PRODUCT_ID = 'p-custom-generic-0000'
export const CUSTOM_GENERIC_VARIANT_ID = 'v-custom-generic-0000'

export async function ensureCustomGenericVariantExists(): Promise<void> {
  try {
    const activeBranch = useAuthStore.getState().currentBranch
    if (!activeBranch) return
    const rows = await window.electron.db.query<{ id: string }>(
      'SELECT id FROM product_variants WHERE id = ?',
      [CUSTOM_GENERIC_VARIANT_ID]
    )
    if (rows.length === 0) {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        `INSERT INTO products (id, category_id, name, price_dzd, created_at, updated_at) VALUES (?, NULL, 'سلعة غير مسجلة', 0, ?, ?)`,
        [CUSTOM_GENERIC_PRODUCT_ID, now, now]
      )
      await window.electron.db.execute(
        `INSERT INTO product_variants (id, product_id, branch_id, price_dzd, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
        [CUSTOM_GENERIC_VARIANT_ID, CUSTOM_GENERIC_PRODUCT_ID, activeBranch.id, now, now]
      )
    }
  } catch {
    // Non-critical if already present
  }
}

export interface CreateSaleResult {
  saleId: string
  totalDzd: number
  itemCount: number
}

export async function processSale(
  items: CartItem[],
  paymentMethod: PaymentMethod,
  shiftId: string,
  customerId?: string | null,
  mixedCashDzd?: number | null,
  mixedCardDzd?: number | null,
  discountDzd?: number,
  creditDepositDzd?: number | null,
  redeemedPointsDzd?: number,
  storeCreditUsedDzd?: number | null
): Promise<CreateSaleResult> {
  if (items.length === 0) {
    throw new Error('السلة فارغة')
  }

  if (paymentMethod === 'credit' && !customerId) {
    throw new Error('يجب تحديد الزبون عند البيع بالتقسيط / الكريدي')
  }

  if (window.electron?.biz?.sales?.process) {
    return window.electron.biz.sales.process({
      items,
      paymentMethod,
      shiftId,
      customerId,
      mixedCashDzd,
      mixedCardDzd,
      discountDzd,
      creditDepositDzd,
      redeemedPointsDzd,
      storeCreditUsedDzd,
    })
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لإتمام عملية البيع')
}
