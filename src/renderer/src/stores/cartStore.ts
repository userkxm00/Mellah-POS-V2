import { create } from 'zustand'
import type { PaymentMethod, ProductVariantWithStock } from '@/types/database'

export interface CartItem {
  variant_id: string
  product_id: string
  product_name: string
  variant_size: string | null
  variant_color: string | null
  barcode: string | null
  unit_price_dzd: number
  quantity: number
  available_stock: number
}

interface CartState {
  items: CartItem[]
  paymentMethod: PaymentMethod
  cashAmountDzd: number | null
  cardAmountDzd: number | null
  discountPercent: number
  discountDzd: number
  addItem: (variant: ProductVariantWithStock, productName: string, defaultPrice: number) => void
  updateQuantity: (variant_id: string, quantity: number) => void
  removeItem: (variant_id: string) => void
  clearCart: () => void
  setPaymentMethod: (method: PaymentMethod) => void
  setMixedAmounts: (cash: number | null, card: number | null) => void
  setDiscount: (percent: number, dzd: number) => void
  getSubtotal: () => number
  getTotal: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  paymentMethod: 'cash',
  cashAmountDzd: null,
  cardAmountDzd: null,
  discountPercent: 0,
  discountDzd: 0,

  addItem: (variant, productName, defaultPrice) => {
    const price = variant.price_dzd ?? defaultPrice
    const existing = get().items.find((item) => item.variant_id === variant.id)

    if (existing) {
      if (existing.quantity >= variant.current_stock) {
        throw new Error(`لا تملك مخزوناً كافياً (المتوفّر: ${variant.current_stock})`)
      }
      set((state) => ({
        items: state.items.map((item) =>
          item.variant_id === variant.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ),
      }))
    } else {
      if (variant.current_stock <= 0) {
        throw new Error('المنتج غير متوفر في المخزون')
      }
      const newItem: CartItem = {
        variant_id: variant.id,
        product_id: variant.product_id,
        product_name: productName,
        variant_size: variant.size,
        variant_color: variant.color,
        barcode: variant.barcode,
        unit_price_dzd: price,
        quantity: 1,
        available_stock: variant.current_stock,
      }
      set((state) => ({ items: [...state.items, newItem] }))
    }
  },

  updateQuantity: (variant_id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(variant_id)
      return
    }

    const item = get().items.find((i) => i.variant_id === variant_id)
    if (item && quantity > item.available_stock) {
      throw new Error(`لا تملك مخزوناً كافياً (المتوفّر: ${item.available_stock})`)
    }

    set((state) => ({
      items: state.items.map((i) =>
        i.variant_id === variant_id ? { ...i, quantity } : i
      ),
    }))
  },

  removeItem: (variant_id) => {
    set((state) => ({
      items: state.items.filter((i) => i.variant_id !== variant_id),
    }))
  },

  clearCart: () => {
    set({
      items: [],
      paymentMethod: 'cash',
      cashAmountDzd: null,
      cardAmountDzd: null,
      discountPercent: 0,
      discountDzd: 0,
    })
  },

  setPaymentMethod: (paymentMethod) => {
    set({ paymentMethod })
  },

  setMixedAmounts: (cashAmountDzd, cardAmountDzd) => {
    set({ cashAmountDzd, cardAmountDzd })
  },

  setDiscount: (discountPercent, discountDzd) => {
    set({ discountPercent, discountDzd })
  },

  getSubtotal: () => {
    return get().items.reduce(
      (acc, item) => acc + item.unit_price_dzd * item.quantity,
      0
    )
  },

  getTotal: () => {
    const subtotal = get().getSubtotal()
    return Math.max(0, subtotal - get().discountDzd)
  },
}))
