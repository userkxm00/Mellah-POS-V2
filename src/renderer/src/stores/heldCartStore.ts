import { create } from 'zustand'
import type { CartItem } from './cartStore'

export interface HeldCart {
  id: string
  heldAt: string
  customerName?: string
  items: CartItem[]
  subtotalDzd: number
}

interface HeldCartState {
  heldCarts: HeldCart[]
  holdCart: (items: CartItem[], customerName?: string) => void
  restoreCart: (id: string) => CartItem[] | null
  deleteCart: (id: string) => void
}

const STORAGE_KEY = 'mellah_held_carts'

function loadSavedHeldCarts(): HeldCart[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (err) {// eslint-disable-next-line no-console
      console.error("[heldCartStore]", err); return []
  }
}

function saveHeldCarts(carts: HeldCart[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(carts))
  } catch (err) {// eslint-disable-next-line no-console
      console.error("[heldCartStore]", err); /* ignore */ }
}

export const useHeldCartStore = create<HeldCartState>((set, get) => ({
  heldCarts: loadSavedHeldCarts(),

  holdCart: (items, customerName) => {
    if (items.length === 0) return
    const id = Date.now().toString()
    const subtotalDzd = items.reduce((acc, i) => acc + i.unit_price_dzd * i.quantity, 0)
    const newCart: HeldCart = {
      id,
      heldAt: new Date().toISOString(),
      customerName,
      items: [...items],
      subtotalDzd,
    }
    const updated = [newCart, ...get().heldCarts]
    saveHeldCarts(updated)
    set({ heldCarts: updated })
  },

  restoreCart: (id) => {
    const found = get().heldCarts.find((c) => c.id === id)
    if (!found) return null
    const updated = get().heldCarts.filter((c) => c.id !== id)
    saveHeldCarts(updated)
    set({ heldCarts: updated })
    return found.items
  },

  deleteCart: (id) => {
    const updated = get().heldCarts.filter((c) => c.id !== id)
    saveHeldCarts(updated)
    set({ heldCarts: updated })
  },
}))
