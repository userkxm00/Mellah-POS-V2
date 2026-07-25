import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  UserPlus,
  Lock,
  Store,
  Tag,
  Gift,
  Home,
  Pause,
  RotateCcw,
  Wallet
} from 'lucide-react'
import { Card, Input, Modal, Button, ToastContainer } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useHeldCartStore } from '@/stores/heldCartStore'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { processSale } from '@/services/saleService'
import { printThermalReceipt } from '@/services/receiptService'
import { useShiftStore, DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { generateUUID } from '@/lib/uuid'
import { OpenShiftModal } from '@/components/shift/OpenShiftModal'
import { CloseShiftModal } from '@/components/shift/CloseShiftModal'
import { SessionLockModal } from '@/components/auth/SessionLockModal'
import type { PaymentMethod } from '@/types/database'

interface ProductVariantItem {
  id: string
  product_id: string
  branch_id: string
  size: string | null
  color: string | null
  barcode: string | null
  sku: string | null
  price_dzd: number | null
  cost_dzd: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  product_name: string
  category_id: string | null
  default_price: number
  category_name: string | null
  current_stock: number
}

interface CategoryItem {
  id: string
  name: string
}

interface CustomerOption {
  id: string
  full_name: string
  phone: string | null
  loyalty_points: number
  store_credit_balance?: number
}

import { AnimatedBrandLogo } from '@/components/brand/AnimatedBrandLogo'

export function POSCheckoutPage({
  onNavigateToHome,
}: {
  onNavigateToHome?: () => void
}): React.JSX.Element {
  const {
    items: cartItems,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    paymentMethod,
    setPaymentMethod,
    discountDzd,
    setDiscount,
    cashAmountDzd,
    cardAmountDzd,
    setMixedAmounts,
    getSubtotal,
    getTotal,
  } = useCartStore()

  const t = useLanguageStore((s) => s.t)

  const activeShift = useShiftStore((s) => s.activeShift)
  const fetchActiveShift = useShiftStore((s) => s.fetchActiveShift)
  const isShiftLoading = useShiftStore((s) => s.isLoading)

  const heldCarts = useHeldCartStore((s) => s.heldCarts)
  const holdCart = useHeldCartStore((s) => s.holdCart)
  const restoreCart = useHeldCartStore((s) => s.restoreCart)
  const deleteCart = useHeldCartStore((s) => s.deleteCart)

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [variants, setVariants] = useState<ProductVariantItem[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isLoadingVariants, setIsLoadingVariants] = useState<boolean>(true)

  // Modals & UI States
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false)
  const [isLocked, setIsLocked] = useState<boolean>(false)
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState<boolean>(false)
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false)

  // Mixed payment inputs
  const [isMixedModalOpen, setIsMixedModalOpen] = useState<boolean>(false)
  const [mixedCashInput, setMixedCashInput] = useState<string>('')
  const [mixedCardInput, setMixedCardInput] = useState<string>('')

  // Change Calculator (Amount Tendered)
  const [tenderedCashInput, setTenderedCashInput] = useState<string>('')

  // Held Carts Modal
  const [isHeldModalOpen, setIsHeldModalOpen] = useState<boolean>(false)

  // Manager PIN Approval for High Discount
  const [isManagerPinOpen, setIsManagerPinOpen] = useState<boolean>(false)
  const [managerPin, setManagerPin] = useState<string>('')
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false)

  // Quick Customer Inputs
  const [newCustName, setNewCustName] = useState<string>('')
  const [newCustPhone, setNewCustPhone] = useState<string>('')

  const addToast = useToastStore((s) => s.addToast)

  // Fetch active shift on mount
  useEffect(() => {
    fetchActiveShift()
  }, [fetchActiveShift])

  // Load Categories, Variants & Customers from SQLite
  const loadData = useCallback(async () => {
    setIsLoadingVariants(true)
    try {
      const catRows = await window.electron.db.query<CategoryItem>(
        `SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name`
      )
      setCategories(catRows)

      const custRows = await window.electron.db.query<CustomerOption>(
        `SELECT id, full_name, phone, loyalty_points, COALESCE(store_credit_balance, 0) as store_credit_balance FROM customers WHERE deleted_at IS NULL ORDER BY full_name`
      )
      setCustomers(custRows)

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
    } catch {
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

  // Selected customer object & credit
  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId)

  // Hold current cart
  const handleHoldCart = useCallback((): void => {
    if (cartItems.length === 0) {
      addToast({ message: 'السلة فارغة، لا يمكن تعليقها', variant: 'error' })
      return
    }
    holdCart(cartItems, selectedCustomerObj?.full_name)
    clearCart()
    setSelectedCustomerId(null)
    addToast({ message: 'تم تعليق السلة الحالية بنجاح (F2) ⏸️', variant: 'info' })
  }, [cartItems, addToast, holdCart, clearCart, selectedCustomerObj?.full_name])

  // Keyboard Shortcuts (F2 hold, F4 reprint, Enter checkout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'F2') {
        e.preventDefault()
        handleHoldCart()
      } else if (e.key === 'F4') {
        e.preventDefault()
        addToast({ message: 'إعادة طباعة أحدث فاتورة...', variant: 'info' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cartItems, addToast, handleHoldCart])
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

  // Restore held cart
  const handleRestoreCart = (id: string): void => {
    const items = restoreCart(id)
    if (items) {
      clearCart()
      items.forEach((item) =>
        addItem(
          {
            id: item.variant_id,
            product_id: item.product_id,
            branch_id: DEFAULT_BRANCH_ID,
            size: item.variant_size,
            color: item.variant_color,
            barcode: item.barcode,
            sku: null,
            price_dzd: item.unit_price_dzd,
            created_at: '',
            updated_at: '',
            deleted_at: null,
            current_stock: item.available_stock,
          },
          item.product_name,
          item.unit_price_dzd
        )
      )
      setIsHeldModalOpen(false)
      addToast({ message: 'تم استرجاع السلة المعلقة بنجاح! 🛒', variant: 'success' })
    }
  }

  // Redeem Loyalty Points (100 points = 100 DZD discount)
  const handleRedeemPoints = (): void => {
    if (!selectedCustomerObj || selectedCustomerObj.loyalty_points < 100) return
    const pointsToUse = Math.floor(selectedCustomerObj.loyalty_points / 100) * 100
    const discountVal = pointsToUse // 1 point = 1 DZD
    setDiscount(0, discountVal)
    addToast({ message: `تم خصم ${discountVal} دج مقابل ${pointsToUse} نقطة ولاء 🎁`, variant: 'success' })
  }

  // Apply Store Credit
  const handleApplyStoreCredit = (): void => {
    if (!selectedCustomerObj || !selectedCustomerObj.store_credit_balance) return
    const credit = selectedCustomerObj.store_credit_balance
    const sub = getSubtotal()
    const discountVal = Math.min(credit, sub)
    setDiscount(0, discountVal)
    addToast({ message: `تم تطبيق خصم من رصيد المتجر: ${formatCurrency(discountVal)} 💳`, variant: 'success' })
  }

  // Quick Add Customer Handler
  const handleQuickAddCustomer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newCustName.trim()) {
      addToast({ message: 'يرجى كتابة اسم الزبون', variant: 'error' })
      return
    }

    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO customers (id, branch_id, full_name, phone, loyalty_points, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        [id, DEFAULT_BRANCH_ID, newCustName.trim(), newCustPhone.trim() || null, now, now]
      )

      addToast({ message: 'تم إضافة الزبون بنجاح!', variant: 'success' })
      setIsQuickAddCustomerOpen(false)
      setNewCustName('')
      setNewCustPhone('')
      await loadData()
      setSelectedCustomerId(id)
    } catch {
      addToast({ message: 'فشل إضافة الزبون', variant: 'error' })
    }
  }

  // Open Cash Drawer Trigger
  const handleOpenDrawer = (): void => {
    addToast({ message: 'تم إرسال أمر فتح درج النقد (Cash Drawer)! 💵', variant: 'info' })
  }

  // Manager PIN Verification for high discount (> 10% or > 5000 DZD)
  const handleVerifyManagerPin = async (): Promise<void> => {
    setIsVerifyingPin(true)
    try {
      const managers = await window.electron.db.query<{ pin_hash: string }>(
        `SELECT pin_hash FROM users WHERE role IN ('admin', 'manager') AND deleted_at IS NULL`
      )
      let matched = false
      for (const m of managers) {
        if (await window.electron.verifyPin(managerPin, m.pin_hash)) {
          matched = true
          break
        }
      }

      if (matched) {
        setIsManagerPinOpen(false)
        setManagerPin('')
        addToast({ message: 'تمت موافقة المدير بنجاح ✅', variant: 'success' })
        executeSaleProcessing()
      } else {
        addToast({ message: 'رمز PIN الخاص بالمدير غير صحيح', variant: 'error' })
      }
    } catch {
      addToast({ message: 'فشل التحقق من رمز المدير', variant: 'error' })
    } finally {
      setIsVerifyingPin(false)
    }
  }

  // Complete Sale Initiator
  const handleCompleteSale = async (): Promise<void> => {
    if (!activeShift) {
      addToast({ message: 'لا توجد وردية مفتوحة لإتمام البيع', variant: 'error' })
      return
    }

    if (cartItems.length === 0) {
      addToast({ message: 'السلة فارغة، أضف منتجات أولاً', variant: 'error' })
      return
    }

    const sub = getSubtotal()
    const isHighDiscount = discountDzd > sub * 0.1 || discountDzd > 5000
    const currentUser = useAuthStore.getState().currentUser

    if (isHighDiscount && currentUser?.role === 'cashier') {
      setIsManagerPinOpen(true)
      return
    }

    executeSaleProcessing()
  }

  const executeSaleProcessing = async (): Promise<void> => {
    if (!activeShift) return
    setIsProcessingSale(true)
    try {
      const custObj = customers.find((c) => c.id === selectedCustomerId)
      const res = await processSale(
        cartItems,
        paymentMethod,
        activeShift.id,
        selectedCustomerId,
        cashAmountDzd,
        cardAmountDzd,
        discountDzd
      )

      // Deduct used store credit if applied
      if (custObj && custObj.store_credit_balance && discountDzd > 0) {
        const usedCredit = Math.min(custObj.store_credit_balance, discountDzd)
        await window.electron.db.execute(
          `UPDATE customers SET store_credit_balance = store_credit_balance - ?, updated_at = ? WHERE id = ?`,
          [usedCredit, new Date().toISOString(), custObj.id]
        )
      }

      const loyaltyMsg = custObj ? ` • تم منح نقاط الولاء للزبون (${custObj.full_name})` : ''

      addToast({
        message: `تم إتمام عملية البيع بنجاح! الإجمالي: ${formatCurrency(res.totalDzd)}${loyaltyMsg}`,
        variant: 'success',
        duration: 4000,
      })

      // Auto-Thermal Printing
      const autoPrintEnabled = localStorage.getItem('mellah_auto_print') !== 'false'
      const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
      const paperWidth = (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'

      if (autoPrintEnabled) {
        const currentUser = useAuthStore.getState().currentUser
        printThermalReceipt(
          {
            storeName: useStoreSettingsStore.getState().settings.store_name,
            receiptId: res.saleId,
            date: new Date().toISOString(),
            cashierName: currentUser?.full_name ?? 'كاشير الفرع',
            customerName: custObj?.full_name,
            items: cartItems.map((ci) => ({
              product_name: ci.product_name,
              size: ci.variant_size,
              color: ci.variant_color,
              quantity: ci.quantity,
              unit_price: ci.unit_price_dzd,
            })),
            subtotalDzd: getSubtotal(),
            discountDzd: discountDzd > 0 ? discountDzd : undefined,
            totalDzd: res.totalDzd,
            paymentMethod,
          },
          { printerName, paperWidth }
        ).catch(() => {
          addToast({
            message: t('تعذرت الطباعة — تحقق من اتصال الطابعة (يمكنك إعادة الطباعة من سجل المبيعات)'),
            variant: 'warning',
            duration: 6000,
          })
        })
      }

      clearCart()
      setSelectedCustomerId(null)
      setTenderedCashInput('')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل عملية البيع'
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsProcessingSale(false)
    }
  }

  const cartSubtotal = getSubtotal()
  const cartTotal = getTotal()
  const tenderedCashNum = parseFloat(tenderedCashInput) || 0
  const changeDzd = Math.max(0, tenderedCashNum - cartTotal)

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7] overflow-hidden select-none">
      {/* Top Header */}
      <header className="glass-header border-b border-gray-200/80 px-6 py-3 flex items-center justify-between z-10 shadow-layered-sm">
        <div className="flex items-center gap-3">
          {onNavigateToHome && (
            <button
              onClick={onNavigateToHome}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient hover:bg-accent-hover transition-all btn-press shrink-0"
            >
              <Home className="w-4 h-4 text-white" />
              <span>{t('الرئيسية')}</span>
            </button>
          )}
          <AnimatedBrandLogo
            size="sm"
            subtitle={useStoreSettingsStore.getState().settings.store_name || t('شاشة نقطة البيع (POS)')}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Held Carts Badge & Button */}
          <button
            onClick={() => setIsHeldModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold hover:bg-amber-200 transition-all btn-press"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>{t('السلال المعلقة')} ({heldCarts.length})</span>
          </button>

          {/* Open Drawer */}
          <button
            onClick={handleOpenDrawer}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-text-secondary text-xs font-bold transition-all btn-press"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{t('فتح الدرج')}</span>
          </button>

          {activeShift ? (
            <div className="flex items-center gap-2 bg-success/10 px-3.5 py-1 rounded-full border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-bold text-success">{t('وردية نشطة')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-danger/10 px-3.5 py-1 rounded-full border border-danger/20">
              <span className="w-2 h-2 rounded-full bg-danger" />
              <span className="text-xs font-bold text-danger">{t('مغلقة')}</span>
            </div>
          )}

          <button
            onClick={() => setIsLocked(true)}
            className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-all"
          >
            <Lock className="w-4 h-4 text-amber-600" />
          </button>

          <button
            onClick={() => setIsCloseShiftOpen(true)}
            disabled={!activeShift}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-text-primary text-xs font-bold shadow-ambient-sm hover:bg-gray-100 disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5 text-text-secondary" />
            <span>{t('إغلاق الوردية')}</span>
          </button>
        </div>
      </header>

      {/* Main Body (Catalog Right, Cart Left) */}
      <div className="flex flex-1 overflow-hidden p-5 gap-5">
        {/* RIGHT PANEL: Product Search & Grid */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Search Bar & Category Filters */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-ambient-sm flex flex-col gap-3">
            <Input
              placeholder={t('ابحث باسم المنتج، اللون، المقاس، أو امسح الباركود...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-50/80 border-gray-200 text-sm focus:bg-white"
              icon={<Search className="w-4 h-4 text-text-tertiary" />}
            />

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 btn-press whitespace-nowrap ${
                  selectedCategoryId === null
                    ? 'bg-accent text-white shadow-ambient-sm'
                    : 'bg-gray-100 text-text-secondary hover:bg-gray-200/80 hover:text-text-primary'
                }`}
                onClick={() => setSelectedCategoryId(null)}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{t('جميع الفئات')} ({variants.length})</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 btn-press whitespace-nowrap ${
                    selectedCategoryId === cat.id
                      ? 'bg-accent text-white shadow-ambient-sm'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200/80 hover:text-text-primary'
                  }`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {t(cat.name)}
                </button>
              ))}
            </div>
          </div>

          {/* Variants Product Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoadingVariants ? (
              <div className="grid grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton h-32 rounded-2xl" />
                ))}
              </div>
            ) : filteredVariants.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-200/80 p-8 text-center">
                <Store className="w-12 h-12 text-text-tertiary mb-3 opacity-40" />
                <p className="text-sm font-bold text-text-secondary">{t('لا توجد منتجات تطابق البحث')}</p>
                <p className="text-xs text-text-tertiary mt-1">{t('تأكد من اختيار الفئة أو كلمة البحث')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredVariants.map((v) => {
                  const itemPrice = v.price_dzd ?? v.default_price
                  const isOutOfStock = v.current_stock <= 0

                  return (
                    <Card
                      key={v.id}
                      onClick={() => {
                        if (!isOutOfStock) {
                          addItem(v, v.product_name, itemPrice)
                          addToast({
                            message: `تم إضافة ${v.product_name}`,
                            variant: 'success',
                            duration: 1500,
                          })
                        }
                      }}
                      className={`p-4 border border-gray-200/80 transition-all flex flex-col justify-between h-36 ${
                        isOutOfStock ? 'opacity-50 grayscale bg-gray-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <h3 className="font-extrabold text-sm text-text-primary line-clamp-1">
                            {v.product_name}
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                            {t(v.category_name ?? 'عام')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-text-secondary font-semibold">
                          {v.size && <span className="bg-gray-100 px-2 py-0.5 rounded-md">{t('مقاس:')} {v.size}</span>}
                          {v.color && <span className="bg-gray-100 px-2 py-0.5 rounded-md">{t('لون:')} {t(v.color)}</span>}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="currency font-black text-accent text-sm">
                          {formatCurrency(itemPrice)}
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isOutOfStock
                              ? 'bg-danger-light text-danger'
                              : v.current_stock <= 5
                                ? 'bg-warning-light text-warning'
                                : 'bg-success-light text-success'
                          }`}
                        >
                          {isOutOfStock ? t('نفد') : `${v.current_stock} ${t('قطعة')}`}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* LEFT PANEL: Cart & Payment Checkout */}
        <div className="w-96 flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-ambient-md overflow-hidden">
          {/* Cart Header */}
          <div className="p-4 border-b border-gray-200/80 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-accent" />
              <h2 className="font-extrabold text-base text-text-primary">{t('سلة البيع الحالية')}</h2>
              <span className="bg-accent text-white text-xs font-black px-2 py-0.5 rounded-full">
                {cartItems.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleHoldCart}
                disabled={cartItems.length === 0}
                className="p-1.5 rounded-xl bg-amber-100 text-amber-900 hover:bg-amber-200 transition-all text-xs font-bold disabled:opacity-40"
                title={t('تعليق الفاتورة (F2)')}
              >
                <Pause className="w-4 h-4" />
              </button>
              <button
                onClick={clearCart}
                disabled={cartItems.length === 0}
                className="p-1.5 rounded-xl text-danger hover:bg-danger-light transition-all text-xs font-bold disabled:opacity-40"
                title={t('تفريغ السلة')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Customer Selection Bar & Loyalty */}
          <div className="p-3 border-b border-gray-200/80 bg-gray-50/30 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={selectedCustomerId ?? ''}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">— {t('اختر زبون لجمع نقاط الولاء')} —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.loyalty_points} نقطة) {c.store_credit_balance ? `• رصيد: ${c.store_credit_balance} دج` : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setIsQuickAddCustomerOpen(true)}
                className="p-2 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient hover:bg-accent-hover transition-all btn-press"
                title="إضافة زبون جديد"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Redeem Points & Store Credit Quick Buttons */}
            {selectedCustomerObj && (
              <div className="flex gap-2 pt-1">
                {selectedCustomerObj.loyalty_points >= 100 && (
                  <button
                    onClick={handleRedeemPoints}
                    className="flex-1 py-1 px-2 rounded-lg bg-warning/10 text-warning border border-warning/20 text-[10px] font-black flex items-center justify-center gap-1 btn-press"
                  >
                    <Gift className="w-3 h-3" />
                    <span>استبدال {Math.floor(selectedCustomerObj.loyalty_points / 100) * 100} نقطة</span>
                  </button>
                )}
                {selectedCustomerObj.store_credit_balance && selectedCustomerObj.store_credit_balance > 0 ? (
                  <button
                    onClick={handleApplyStoreCredit}
                    className="flex-1 py-1 px-2 rounded-lg bg-success/10 text-success border border-success/20 text-[10px] font-black flex items-center justify-center gap-1 btn-press"
                  >
                    <Wallet className="w-3 h-3" />
                    <span>تطبيق رصيد المتجر ({selectedCustomerObj.store_credit_balance} دج)</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-gray-100">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-text-tertiary">
                <ShoppingCart className="w-12 h-12 opacity-30 mb-2" />
                <p className="text-xs font-bold">{t('السلة فارغة حالياً')}</p>
                <p className="text-[11px] mt-0.5">{t('انقر على أي منتج لإضافته للطلب')}</p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.variant_id} className="pt-2 first:pt-0 flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-extrabold text-xs text-text-primary">{item.product_name}</h4>
                    <p className="text-[10px] font-medium text-text-tertiary">
                      {item.variant_size ? `${t('مقاس:')} ${item.variant_size}` : ''}{' '}
                      {item.variant_color ? `${t('لون:')} ${t(item.variant_color)}` : ''}
                    </p>
                    <span className="currency font-bold text-accent text-xs">
                      {formatCurrency(item.unit_price_dzd)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
                      <button
                        onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                        className="p-1 text-text-secondary hover:bg-gray-200"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-xs font-black text-text-primary">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                        className="p-1 text-text-secondary hover:bg-gray-200"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.variant_id)}
                      className="text-gray-400 hover:text-danger p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment & Checkout Options Area */}
          <div className="p-4 border-t border-gray-200/80 bg-gray-50/50 space-y-3">
            {/* Payment Method Tabs */}
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((pm) => (
                <button
                  key={pm}
                  onClick={() => {
                    setPaymentMethod(pm)
                    if (pm === 'mixed') setIsMixedModalOpen(true)
                  }}
                  className={`py-2 rounded-xl text-xs font-extrabold transition-all btn-press ${
                    paymentMethod === pm
                      ? 'bg-accent text-white shadow-ambient-sm'
                      : 'bg-white border border-gray-200 text-text-secondary hover:bg-gray-100'
                  }`}
                >
                  {t(pm === 'cash' ? '💵 نقد' : pm === 'card' ? '💳 CIB' : '🔀 مزدوج')}
                </button>
              ))}
            </div>

            {/* Change Calculator Input (for Cash payment) */}
            {paymentMethod === 'cash' && cartItems.length > 0 && (
              <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                  <span>{t('المبلغ النقدي المقدم من الزبون:')}</span>
                  <input
                    type="number"
                    placeholder="مثلاً: 5000"
                    value={tenderedCashInput}
                    onChange={(e) => setTenderedCashInput(e.target.value)}
                    className="w-28 px-2 py-1 text-left font-black text-accent bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                {tenderedCashNum > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-success/10 border border-success/20 text-xs font-black text-success">
                    <span>{t('الباقي للزبون (Change):')}</span>
                    <span className="text-sm font-extrabold">{formatCurrency(changeDzd)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Discount Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-text-secondary">{t('الخصم (دج):')}</span>
              <input
                type="number"
                min={0}
                placeholder="0 دج"
                value={discountDzd || ''}
                onChange={(e) => setDiscount(0, parseFloat(e.target.value) || 0)}
                className="w-28 px-2 py-1 text-left font-bold text-xs bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Totals Summary Display */}
            <div className="p-3 rounded-xl bg-accent/5 border border-accent/20 space-y-1">
              <div className="flex justify-between text-xs text-text-tertiary">
                <span>{t('المجموع الفرعي:')}</span>
                <span className="font-bold">{formatCurrency(cartSubtotal)}</span>
              </div>
              {discountDzd > 0 && (
                <div className="flex justify-between text-xs text-danger font-bold">
                  <span>{t('الخصم المطبق:')}</span>
                  <span>-{formatCurrency(discountDzd)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-accent pt-1 border-t border-accent/10">
                <span>{t('المبلغ النهائي المستحق:')}</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            {/* Complete Sale Primary Button */}
            <button
              onClick={handleCompleteSale}
              disabled={cartItems.length === 0 || !activeShift || isProcessingSale}
              className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-sm font-extrabold shadow-ambient transition-all duration-200 flex items-center justify-center gap-2 btn-press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingSale ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t('إتمام عملية البيع')} ({formatCurrency(cartTotal)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Held Carts Modal */}
      <Modal isOpen={isHeldModalOpen} onClose={() => setIsHeldModalOpen(false)} title="📜 السلات المعلقة والمؤقتة (Hold Carts)" size="md">
        <div className="space-y-4">
          {heldCarts.length === 0 ? (
            <p className="text-xs text-center py-6 text-text-tertiary font-bold">لا توجد سلات معلقة حالياً.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {heldCarts.map((hc) => (
                <div key={hc.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-xs text-text-primary block">
                      {hc.customerName ? `الزبون: ${hc.customerName}` : `سلة معلقة #${hc.id.slice(-4)}`}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono block">
                      {new Date(hc.heldAt).toLocaleTimeString('ar-DZ')} • {hc.items.length} منتجات
                    </span>
                    <span className="currency text-accent font-black text-xs block mt-0.5">
                      {formatCurrency(hc.subtotalDzd)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestoreCart(hc.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold shadow-ambient flex items-center gap-1 btn-press"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استرجاع</span>
                    </button>
                    <button
                      onClick={() => deleteCart(hc.id)}
                      className="p-1.5 rounded-lg text-danger hover:bg-danger-light"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Manager PIN Modal */}
      <Modal isOpen={isManagerPinOpen} onClose={() => setIsManagerPinOpen(false)} title="🔐 موافقة المدير على الخصم الكبير" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-amber-900 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200">
            الخصم المطبق كبير ({formatCurrency(discountDzd)}). يرجى إدخال PIN المدير للموافقة وإتمام البيع.
          </p>

          <Input
            type="password"
            maxLength={6}
            placeholder="****"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            autoFocus
          />

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleVerifyManagerPin}
              disabled={isVerifyingPin || managerPin.length < 4}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient btn-press disabled:opacity-50"
            >
              موافقة وإتمام البيع
            </button>
            <button
              onClick={() => setIsManagerPinOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      {/* Modals */}
      <OpenShiftModal isOpen={!isShiftLoading && activeShift === null} />
      <CloseShiftModal isOpen={isCloseShiftOpen} onClose={() => setIsCloseShiftOpen(false)} />

      {/* Quick Add Customer Modal */}
      <Modal isOpen={isQuickAddCustomerOpen} onClose={() => setIsQuickAddCustomerOpen(false)} title="إضافة زبون جديد فوراً">
        <form onSubmit={handleQuickAddCustomer} className="space-y-4">
          <Input placeholder="مثلاً: محمد الأمين" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
          <Input placeholder="06XXXXXXXX" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsQuickAddCustomerOpen(false)}>إلغاء</Button>
            <Button type="submit" variant="primary">حفظ واختيار الزبون</Button>
          </div>
        </form>
      </Modal>

      {/* Mixed Payment Modal */}
      <Modal isOpen={isMixedModalOpen} onClose={() => setIsMixedModalOpen(false)} title="حاسبة التقسيم للدفع المختلط (نقداً + CIB)">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold text-text-secondary flex justify-between">
            <span>إجمالي الفاتورة المستحق:</span>
            <span className="text-accent font-black text-sm">{formatCurrency(cartTotal)}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">المبلغ المدفوع كاش (نقداً):</label>
            <Input
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCashInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCashInput(val)
                const cashNum = parseFloat(val) || 0
                const cardNum = Math.max(0, cartTotal - cashNum)
                setMixedCardInput(cardNum > 0 ? String(cardNum) : '')
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">المبلغ المدفوع بالبطاقة (CIB):</label>
            <Input
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCardInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCardInput(val)
                const cardNum = parseFloat(val) || 0
                const cashNum = Math.max(0, cardNum > 0 ? cartTotal - cardNum : 0)
                setMixedCashInput(cashNum > 0 ? String(cashNum) : '')
              }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsMixedModalOpen(false)}>إلغاء</Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                const cash = parseFloat(mixedCashInput) || 0
                const card = parseFloat(mixedCardInput) || 0
                setMixedAmounts(cash, card)
                setIsMixedModalOpen(false)
                addToast({ message: 'تم حفظ تقسيم الدفع المختلط بنجاح!', variant: 'success' })
              }}
            >
              اعتماد التقسيم
            </Button>
          </div>
        </div>
      </Modal>

      <SessionLockModal isOpen={isLocked} onUnlock={() => setIsLocked(false)} />
      <ToastContainer />
    </div>
  )
}
