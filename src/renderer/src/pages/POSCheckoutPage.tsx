import React, { useState, useEffect, useCallback } from 'react'
import { Button, Card, Input, ToastContainer } from '@/components/ui'
import { useShiftStore } from '@/stores/shiftStore'
import { useCartStore } from '@/stores/cartStore'
import { useToastStore } from '@/stores/toastStore'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { processSale } from '@/services/saleService'
import { formatCurrency } from '@/lib/format'
import { OpenShiftModal } from '@/components/shift/OpenShiftModal'
import { CloseShiftModal } from '@/components/shift/CloseShiftModal'
import type { PaymentMethod, ProductVariantWithStock } from '@/types/database'

interface ProductVariantItem extends ProductVariantWithStock {
  product_name: string
  category_id: string | null
  category_name: string | null
  default_price: number
}

interface CategoryItem {
  id: string
  name: string
}

export function POSCheckoutPage(): React.JSX.Element {
  const activeShift = useShiftStore((s) => s.activeShift)
  const fetchActiveShift = useShiftStore((s) => s.fetchActiveShift)
  const isShiftLoading = useShiftStore((s) => s.isLoading)

  const cartItems = useCartStore((s) => s.items)
  const paymentMethod = useCartStore((s) => s.paymentMethod)
  const addItem = useCartStore((s) => s.addItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const clearCart = useCartStore((s) => s.clearCart)
  const setPaymentMethod = useCartStore((s) => s.setPaymentMethod)
  const getCartTotal = useCartStore((s) => s.getTotal)

  const addToast = useToastStore((s) => s.addToast)

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [variants, setVariants] = useState<ProductVariantItem[]>([])
  const [isLoadingVariants, setIsLoadingVariants] = useState<boolean>(false)
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false)
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false)

  // Fetch active shift on mount
  useEffect(() => {
    fetchActiveShift()
  }, [fetchActiveShift])

  // Load Categories & Variants from SQLite
  const loadData = useCallback(async () => {
    setIsLoadingVariants(true)
    try {
      // 1. Fetch categories
      const catRows = await window.electron.db.query<CategoryItem>(
        `SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name`
      )
      setCategories(catRows)

      // 2. Fetch variants with computed stock from stock_movements ledger
      const variantRows = await window.electron.db.query<ProductVariantItem>(
        `SELECT 
           v.id, v.product_id, v.branch_id, v.size, v.color, v.barcode, v.sku, v.price_dzd, v.created_at, v.updated_at, v.deleted_at,
           p.name as product_name, p.category_id, p.price_dzd as default_price,
           c.name as category_name,
           COALESCE(SUM(sm.quantity_change), 0) as current_stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id
         WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY p.name, v.size, v.color`
      )
      setVariants(variantRows)
    } catch (err) {
      addToast({ message: 'فشل تحميل قائمة المنتجات', variant: 'error' })
    } finally {
      setIsLoadingVariants(false)
    }
  }, [addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle Barcode Scanner input
  const handleBarcodeScan = useCallback(
    (scannedBarcode: string) => {
      const match = variants.find(
        (v) => v.barcode === scannedBarcode || v.sku === scannedBarcode
      )

      if (match) {
        try {
          addItem(match, match.product_name, match.default_price)
          addToast({
            message: `تم إضافة ${match.product_name} (${match.size ?? ''} ${match.color ?? ''})`,
            variant: 'success',
            duration: 2000,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'عفواً تعذر إضافة المنتج'
          addToast({ message: msg, variant: 'error' })
        }
      } else {
        addToast({
          message: `الباركود [${scannedBarcode}] غير موجود في القاعدة`,
          variant: 'warning',
        })
      }
    },
    [variants, addItem, addToast]
  )

  useBarcodeScanner({ onScan: handleBarcodeScan })

  // Filtered variants display
  const filteredVariants = variants.filter((v) => {
    const matchesCategory = selectedCategoryId ? v.category_id === selectedCategoryId : true
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      q === '' ||
      v.product_name.toLowerCase().includes(q) ||
      (v.barcode && v.barcode.includes(q)) ||
      (v.size && v.size.toLowerCase().includes(q)) ||
      (v.color && v.color.toLowerCase().includes(q))

    return matchesCategory && matchesSearch
  })

  // Handle Complete Sale
  const handleCompleteSale = async (): Promise<void> => {
    if (!activeShift) {
      addToast({ message: 'لا توجد وردية مفتوحة لإتمام البيع', variant: 'error' })
      return
    }

    if (cartItems.length === 0) {
      addToast({ message: 'السلة فارغة، أضف منتجات أولاً', variant: 'error' })
      return
    }

    setIsProcessingSale(true)
    try {
      const res = await processSale(cartItems, paymentMethod, activeShift.id)
      addToast({
        message: `تم إتمام عملية البيع بنجاح! الإجمالي: ${formatCurrency(res.totalDzd)}`,
        variant: 'success',
        duration: 4000,
      })
      clearCart()
      // Reload inventory counts after sale
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل عملية البيع'
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsProcessingSale(false)
    }
  }

  const cartTotal = getCartTotal()

  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden select-none">
      {/* Top Header */}
      <header className="glass border-b border-border-light px-6 py-3.5 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-accent tracking-tight">MELLAH POS</h1>
          <span className="text-sm font-medium text-text-secondary border-r border-border-light pr-4">
            بوتيك الملاح للملابس — نقطة البيع
          </span>
        </div>

        <div className="flex items-center gap-4">
          {activeShift ? (
            <div className="flex items-center gap-3 bg-success-light px-3.5 py-1.5 rounded-full border border-success/20">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-semibold text-success">
                وردية مفتوحة (كاش البداية: {formatCurrency(activeShift.opening_cash_dzd)})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-danger-light px-3.5 py-1.5 rounded-full border border-danger/20">
              <span className="w-2.5 h-2.5 rounded-full bg-danger" />
              <span className="text-xs font-semibold text-danger">لا توجد وردية مفتوحة</span>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCloseShiftOpen(true)}
            disabled={!activeShift}
          >
            🔒 قفل الصندوق
          </Button>
        </div>
      </header>

      {/* Main Body (Catalog Right, Cart Left) */}
      <div className="flex flex-1 overflow-hidden p-5 gap-5">
        {/* RIGHT PANEL: Product Search & Grid (Flex 1) */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Search Bar & Category Filters */}
          <Card padding="compact" className="flex flex-col gap-3">
            <Input
              placeholder="ابحث باسم المنتج، اللون، المقاس، أو امسح الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-50/80"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              }
            />

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 btn-press whitespace-nowrap ${
                  selectedCategoryId === null
                    ? 'bg-accent text-white shadow-ambient-sm'
                    : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                }`}
                onClick={() => setSelectedCategoryId(null)}
              >
                جميع الفئات ({variants.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 btn-press whitespace-nowrap ${
                    selectedCategoryId === cat.id
                      ? 'bg-accent text-white shadow-ambient-sm'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                  }`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </Card>

          {/* Variants Cards Grid */}
          <div className="flex-1 overflow-auto">
            {isLoadingVariants ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 bg-white rounded-card shadow-ambient animate-pulse p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                    <div className="h-5 bg-gray-200 rounded w-1/3 pt-2" />
                  </div>
                ))}
              </div>
            ) : filteredVariants.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-card border border-dashed border-border">
                <span className="text-4xl mb-2">📦</span>
                <p className="text-base font-semibold text-text-primary">لم يتم العثور على منتجات</p>
                <p className="text-xs text-text-tertiary mt-1">جرّب تغيير كلمة البحث أو اختيار فئة أخرى</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 pb-2">
                {filteredVariants.map((item) => {
                  const price = item.price_dzd ?? item.default_price
                  const isOutOfStock = item.current_stock <= 0

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-card p-4 shadow-ambient border border-border-light flex flex-col justify-between transition-all duration-200 ${
                        isOutOfStock
                          ? 'opacity-60 bg-gray-50 cursor-not-allowed'
                          : 'hover:shadow-ambient-lg hover:-translate-y-0.5 cursor-pointer btn-press'
                      }`}
                      onClick={() => {
                        if (isOutOfStock) {
                          addToast({ message: 'المنتج غير متوفر في المخزون', variant: 'error' })
                          return
                        }
                        try {
                          addItem(item, item.product_name, item.default_price)
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'خطأ في الإضافة'
                          addToast({ message: msg, variant: 'error' })
                        }
                      }}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">
                            {item.product_name}
                          </h3>
                          <span
                            className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ${
                              isOutOfStock
                                ? 'bg-danger-light text-danger'
                                : item.current_stock < 5
                                  ? 'bg-warning-light text-warning'
                                  : 'bg-success-light text-success'
                            }`}
                          >
                            {item.current_stock}
                          </span>
                        </div>

                        {/* Size & Color badges */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {item.size && (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-text-secondary text-[11px] font-medium">
                              المقاس: {item.size}
                            </span>
                          )}
                          {item.color && (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-text-secondary text-[11px] font-medium">
                              اللون: {item.color}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-border-light flex items-center justify-between">
                        <span className="currency font-bold text-accent text-base">
                          {formatCurrency(price)}
                        </span>
                        <span className="text-[10px] text-text-tertiary font-mono">
                          {item.barcode}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* LEFT PANEL: Cart Summary & Checkout (Width: 400px) */}
        <div className="w-[420px] flex flex-col bg-white rounded-card shadow-ambient border border-border-light overflow-hidden">
          {/* Cart Header */}
          <div className="px-5 py-4 border-b border-border-light flex items-center justify-between bg-bg-base/30">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛒</span>
              <h2 className="text-base font-semibold text-text-primary">سلة المبيعات</h2>
              <span className="px-2 py-0.5 rounded-full bg-accent-light text-accent text-xs font-bold">
                {cartItems.reduce((a, b) => a + b.quantity, 0)} عنصر
              </span>
            </div>
            {cartItems.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-medium text-danger hover:underline"
              >
                تفرغ السلة
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-auto p-4 divide-y divide-border-light">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-tertiary">
                <span className="text-5xl mb-3 opacity-40">🛍️</span>
                <p className="text-sm font-medium text-text-secondary">السلة فارغة الان</p>
                <p className="text-xs mt-1">انقر على أي منتج من القائمة أو امسح الباركود لإضافته</p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.variant_id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.product_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
                      <span>{item.variant_size ? `مقاس: ${item.variant_size}` : ''}</span>
                      <span>{item.variant_color ? `لون: ${item.variant_color}` : ''}</span>
                      <span className="currency font-semibold text-text-secondary">
                        {formatCurrency(item.unit_price_dzd)}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Counter */}
                  <div className="flex items-center gap-1.5">
                    <button
                      className="w-7 h-7 rounded-lg bg-gray-100 text-text-primary font-bold flex items-center justify-center hover:bg-gray-200 btn-press"
                      onClick={() => {
                        try {
                          updateQuantity(item.variant_id, item.quantity - 1)
                        } catch (err) {
                          addToast({ message: (err as Error).message, variant: 'error' })
                        }
                      }}
                    >
                      -
                    </button>

                    <span className="w-8 text-center text-sm font-bold tabular-nums">
                      {item.quantity}
                    </span>

                    <button
                      className="w-7 h-7 rounded-lg bg-gray-100 text-text-primary font-bold flex items-center justify-center hover:bg-gray-200 btn-press"
                      onClick={() => {
                        try {
                          updateQuantity(item.variant_id, item.quantity + 1)
                        } catch (err) {
                          addToast({ message: (err as Error).message, variant: 'error' })
                        }
                      }}
                    >
                      +
                    </button>

                    <button
                      className="p-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-light transition-colors mr-1"
                      onClick={() => removeItem(item.variant_id)}
                      title="حذف"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method & Complete Sale Footer */}
          <div className="p-5 border-t border-border-light bg-bg-base/20 space-y-4">
            {/* Payment Method Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">طريقة الدفع:</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((method) => {
                  const labels: Record<PaymentMethod, string> = {
                    cash: '💵 نقداً',
                    card: '💳 بطاقة CIB',
                    mixed: '🔀 مزدوج',
                  }

                  return (
                    <button
                      key={method}
                      type="button"
                      className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all duration-200 btn-press border ${
                        paymentMethod === method
                          ? 'bg-accent text-white border-accent shadow-ambient-sm'
                          : 'bg-white text-text-secondary border-border hover:bg-gray-50'
                      }`}
                      onClick={() => setPaymentMethod(method)}
                    >
                      {labels[method]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Total display */}
            <div className="flex items-center justify-between pt-2 border-t border-border-light">
              <span className="text-sm font-bold text-text-secondary">المبلغ الإجمالي:</span>
              <span className="currency-lg text-accent text-2xl">
                {formatCurrency(cartTotal)}
              </span>
            </div>

            {/* Complete Sale Primary Button */}
            <Button
              variant="primary"
              size="lg"
              className="w-full py-3.5 text-base font-bold shadow-ambient"
              disabled={cartItems.length === 0 || !activeShift}
              loading={isProcessingSale}
              onClick={handleCompleteSale}
            >
              ✓ إتمام البيع ({formatCurrency(cartTotal)})
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <OpenShiftModal isOpen={!isShiftLoading && activeShift === null} />
      <CloseShiftModal
        isOpen={isCloseShiftOpen}
        onClose={() => setIsCloseShiftOpen(false)}
      />

      <ToastContainer />
    </div>
  )
}
