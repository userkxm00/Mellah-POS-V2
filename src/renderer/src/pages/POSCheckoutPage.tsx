import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  UserPlus,
  Lock,
  Tag,
  Gift,
  Home,
  Pause,
  RotateCcw,
  Wallet,
  Printer
} from 'lucide-react'
import { Card, Input, Modal, Button, ToastContainer } from '@/components/ui'
import { CountUpNumber } from '@/components/ui/CountUpNumber'
import { AnimatedBrandLogo } from '@/components/brand/AnimatedBrandLogo'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfettiBurst } from '@/components/ui/ConfettiBurst'
import { soundService } from '@/services/soundService'
import { formatCurrency } from '@/lib/format'
import { sendSaleCompletedTelegramNotification } from '@/services/telegramService'
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
  image_url?: string | null
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

function filterVariantsList(
  variants: ProductVariantItem[],
  selectedCategoryId: string | null,
  searchQuery: string
): ProductVariantItem[] {
  const q = searchQuery.trim().toLowerCase()
  return variants.filter((v) => {
    const matchesCategory = selectedCategoryId ? v.category_id === selectedCategoryId : true
    const matchesSearch =
      q === '' ||
      v.product_name.toLowerCase().includes(q) ||
      v.barcode?.includes(q) ||
      v.size?.toLowerCase().includes(q) ||
      v.color?.toLowerCase().includes(q)

    return matchesCategory && matchesSearch
  })
}

const SKELETON_KEYS = ['skel-var-1', 'skel-var-2', 'skel-var-3', 'skel-var-4', 'skel-var-5', 'skel-var-6']

function getStockPillStyle(isOut: boolean, stock: number): string {
  if (isOut) return 'bg-danger-light text-danger'
  if (stock <= 5) return 'bg-warning-light text-warning'
  return 'bg-success-light text-success'
}

function getPaymentMethodLabel(pm: PaymentMethod, t: (k: string) => string): string {
  switch (pm) {
    case 'cash':
      return t('نقد')
    case 'card':
      return 'CIB'
    case 'mixed':
      return t('مزدوج')
    case 'credit':
      return t('كريدي')
    default:
      return pm
  }
}

export function POSCheckoutPage({
  onNavigateToHome,
}: {
  readonly onNavigateToHome?: () => void
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
  const [showConfetti, setShowConfetti] = useState<boolean>(false)
  const [isReceiptFlying, setIsReceiptFlying] = useState<boolean>(false)

  // Mixed payment inputs
  const [isMixedModalOpen, setIsMixedModalOpen] = useState<boolean>(false)
  const [mixedCashInput, setMixedCashInput] = useState<string>('')
  const [mixedCardInput, setMixedCardInput] = useState<string>('')

  // Change Calculator (Amount Tendered)
  const [tenderedCashInput, setTenderedCashInput] = useState<string>('')
  const [creditDepositInput, setCreditDepositInput] = useState<string>('')

  // Held Carts Modal
  const [isHeldModalOpen, setIsHeldModalOpen] = useState<boolean>(false)

  // Manager PIN Approval for High Discount
  const [isManagerPinOpen, setIsManagerPinOpen] = useState<boolean>(false)
  const [managerPin, setManagerPin] = useState<string>('')
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false)

  // Quick Customer Inputs
  const [newCustName, setNewCustName] = useState<string>('')
  const [newCustPhone, setNewCustPhone] = useState<string>('')

  // POS Operational Toggles (Persisted in localStorage)
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(
    () => localStorage.getItem('mellah_auto_print') !== 'false'
  )
  const [autoOpenDrawer, setAutoOpenDrawer] = useState<boolean>(
    () => localStorage.getItem('mellah_auto_drawer') !== 'false'
  )

  const addToast = useToastStore((s) => s.addToast)

  const toggleAutoPrint = (): void => {
    const next = !autoPrintReceipt
    setAutoPrintReceipt(next)
    localStorage.setItem('mellah_auto_print', String(next))
    addToast({
      message: next ? t('تم تفعيل الطباعة التلقائية للفواتير') : t('تم إيقاف الطباعة التلقائية (يمكنك الطباعة يدوياً عند الحاجة)'),
      variant: 'info',
    })
  }

  const toggleAutoDrawer = (): void => {
    const next = !autoOpenDrawer
    setAutoOpenDrawer(next)
    localStorage.setItem('mellah_auto_drawer', String(next))
    addToast({
      message: next ? t('تم تفعيل فتح درج النقود تلقائياً بعد البيع') : t('تم إيقاف فتح الدرج التلقائي (يمكن الفتح يدوياً)'),
      variant: 'info',
    })
  }

  // Fetch active shift on mount
  useEffect(() => {
    fetchActiveShift()
  }, [fetchActiveShift])

  // Load Categories, Variants & Customers from SQLite (Branch-Scoped)
  const loadData = useCallback(async () => {
    setIsLoadingVariants(true)
    try {
      const activeBranch = useAuthStore.getState().currentBranch
      const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

      const catRows = await window.electron.db.query<CategoryItem>(
        `SELECT id, name FROM categories WHERE branch_id = ? AND deleted_at IS NULL ORDER BY name`,
        [branchId]
      )
      setCategories(catRows)

      const custRows = await window.electron.db.query<CustomerOption>(
        `SELECT id, full_name, phone, loyalty_points, COALESCE(store_credit_balance, 0) as store_credit_balance FROM customers WHERE branch_id = ? AND deleted_at IS NULL ORDER BY full_name`,
        [branchId]
      )
      setCustomers(custRows)

      const variantRows = await window.electron.db.query<ProductVariantItem>(
        `SELECT 
           v.id, v.product_id, v.branch_id, v.size, v.color, v.barcode, v.sku, v.price_dzd, v.created_at, v.updated_at, v.deleted_at,
           p.name as product_name, p.category_id, p.price_dzd as default_price, p.image_url,
           c.name as category_name,
           COALESCE(SUM(sm.quantity_change), 0) as current_stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id AND sm.branch_id = ?
         WHERE v.branch_id = ? AND v.deleted_at IS NULL AND p.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY p.name, v.size, v.color`,
        [branchId, branchId]
      )
      setVariants(variantRows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[POSCheckoutPage]", err); addToast({ message: t('فشل تحميل قائمة المنتجات والزبائن للفرع الحالي'), variant: 'error' })
    } finally {
      setIsLoadingVariants(false)
    }
  }, [addToast, t])

  const searchInputRef = useRef<HTMLInputElement>(null)

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
          soundService.playScan()
          addToast({
            message: `${t('تم إضافة')} ${match.product_name} (${match.size ?? ''} ${match.color ?? ''})`,
            variant: 'success',
            duration: 2000,
          })
        } catch (err) {
          soundService.playError()
          const msg = err instanceof Error ? err.message : t('عفواً تعذر إضافة المنتج')
          addToast({ message: msg, variant: 'error' })
        }
      } else {
        soundService.playError()
        addToast({
          message: `${t('الباركود')} [${scannedBarcode}] ${t('غير موجود في القاعدة')}`,
          variant: 'warning',
        })
      }
    },
    [variants, addItem, addToast, t]
  )

  useBarcodeScanner({ onScan: handleBarcodeScan })

  // Selected customer object & credit
  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId)

  // Hold current cart
  const handleHoldCart = useCallback((): void => {
    if (cartItems.length === 0) {
      addToast({ message: t('السلة فارغة، لا يمكن تعليقها'), variant: 'error' })
      return
    }
    holdCart(cartItems, selectedCustomerObj?.full_name)
    clearCart()
    setSelectedCustomerId(null)
    addToast({ message: t('تم تعليق السلة الحالية بنجاح (F2) ⏸️'), variant: 'info' })
  }, [cartItems, addToast, holdCart, clearCart, selectedCustomerObj?.full_name, t])

  const filteredVariants = filterVariantsList(variants, selectedCategoryId, searchQuery)

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
      addToast({ message: t('تم استرجاع السلة المعلقة بنجاح! 🛒'), variant: 'success' })
    }
  }

  // Redeem Loyalty Points (100 points = 100 DZD discount)
  const handleRedeemPoints = (): void => {
    if (!selectedCustomerObj || selectedCustomerObj.loyalty_points < 100) return
    const pointsToUse = Math.floor(selectedCustomerObj.loyalty_points / 100) * 100
    const discountVal = pointsToUse // 1 point = 1 DZD
    setDiscount(0, discountVal)
    addToast({ message: `${t('تم خصم')} ${discountVal} ${t('دج مقابل')} ${pointsToUse} ${t('نقطة ولاء')}`, variant: 'success' })
  }

  // Apply Store Credit
  const handleApplyStoreCredit = (): void => {
    if (!selectedCustomerObj?.store_credit_balance) return
    const credit = selectedCustomerObj.store_credit_balance
    const sub = getSubtotal()
    const discountVal = Math.min(credit, sub)
    setDiscount(0, discountVal)
    addToast({ message: `${t('تم تطبيق خصم من رصيد المتجر:')} ${formatCurrency(discountVal)}`, variant: 'success' })
  }

  // Quick Add Customer Handler
  const handleQuickAddCustomer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newCustName.trim()) {
      addToast({ message: t('يرجى كتابة اسم الزبون'), variant: 'error' })
      return
    }

    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO customers (id, branch_id, full_name, phone, loyalty_points, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        [id, DEFAULT_BRANCH_ID, newCustName.trim(), newCustPhone.trim() || null, now, now]
      )

      addToast({ message: t('تم إضافة الزبون بنجاح!'), variant: 'success' })
      setIsQuickAddCustomerOpen(false)
      setNewCustName('')
      setNewCustPhone('')
      await loadData()
      setSelectedCustomerId(id)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[POSCheckoutPage]", err); addToast({ message: t('فشل إضافة الزبون'), variant: 'error' })
    }
  }

  // Open Cash Drawer Trigger (Supports ESC/POS Pulse Kick)
  const handleOpenDrawer = async (): Promise<void> => {
    const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
    const ok = await window.electron.openCashDrawer(printerName)
    if (ok) {
      addToast({ message: t('تم إرسال أمر فتح درج النقود بنجاح! 💵'), variant: 'success' })
    } else {
      addToast({ message: t('تم فتح الدرج (أو إرسال التنبيه المحلي للطابعة)'), variant: 'info' })
    }
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
        addToast({ message: t('تمت موافقة المدير بنجاح ✅'), variant: 'success' })
        executeSaleProcessing()
      } else {
        addToast({ message: t('رمز PIN الخاص بالمدير غير صحيح'), variant: 'error' })
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[POSCheckoutPage]", err); addToast({ message: t('فشل التحقق من رمز المدير'), variant: 'error' })
    } finally {
      setIsVerifyingPin(false)
    }
  }

  // Complete Sale Initiator
  const handleCompleteSale = async (): Promise<void> => {
    if (!activeShift) {
      addToast({ message: t('لا توجد وردية مفتوحة لإتمام البيع'), variant: 'error' })
      return
    }

    if (cartItems.length === 0) {
      addToast({ message: t('السلة فارغة، أضف منتجات أولاً'), variant: 'error' })
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
      const creditDepositVal = Number.parseFloat(creditDepositInput) || 0

      const res = await processSale(
        cartItems,
        paymentMethod,
        activeShift.id,
        selectedCustomerId,
        cashAmountDzd,
        cardAmountDzd,
        discountDzd,
        creditDepositVal
      )

      // Deduct used store credit if applied
      if (custObj?.store_credit_balance && discountDzd > 0) {
        const usedCredit = Math.min(custObj.store_credit_balance, discountDzd)
        await window.electron.db.execute(
          `UPDATE customers SET store_credit_balance = store_credit_balance - ?, updated_at = ? WHERE id = ?`,
          [usedCredit, new Date().toISOString(), custObj.id]
        )
      }

      const loyaltyMsg = custObj ? ` • تم منح نقاط الولاء للزبون (${custObj.full_name})` : ''

      soundService.playSuccess()
      addToast({
        message: `تم إتمام عملية البيع بنجاح! الإجمالي: ${formatCurrency(res.totalDzd)}${loyaltyMsg}`,
        variant: 'success',
        duration: 4000,
      })

      // Auto Cash Drawer Kick
      const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
      if (autoOpenDrawer) {
        window.electron.openCashDrawer(printerName).catch(() => {})
      }

      // Auto-Thermal Printing
      const paperWidth = (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
      const receiptLanguage = (localStorage.getItem('mellah_receipt_language') as 'ar' | 'fr' | 'en') ?? 'ar'

      if (autoPrintReceipt) {
        const currentUser = useAuthStore.getState().currentUser
        printThermalReceipt(
          {
            storeName: useStoreSettingsStore.getState().settings.store_name,
            receiptId: res.saleId,
            date: new Date().toISOString(),
            cashierName: currentUser?.full_name ?? t('كاشير الفرع'),
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
          { printerName, paperWidth, language: receiptLanguage }
        ).catch(() => {
          addToast({
            message: t('تعذرت الطباعة — تحقق من اتصال الطابعة (يمكنك إعادة الطباعة من سجل المبيعات)'),
            variant: 'warning',
            duration: 6000,
          })
        })
      }

      // Automated Telegram Sale Completed Notification with Items & Images
      const currentUser = useAuthStore.getState().currentUser
      const currentBranch = useAuthStore.getState().currentBranch
      sendSaleCompletedTelegramNotification({
        invoiceNumber: res.saleId.slice(0, 8).toUpperCase(),
        branchName: currentBranch?.name || 'الفرع الرئيسي',
        cashierName: currentUser?.full_name || 'الكاشير',
        customerName: custObj?.full_name || null,
        paymentMethod,
        subtotalDzd: getSubtotal(),
        discountDzd,
        totalDzd: res.totalDzd,
        paidAmountDzd: paymentMethod === 'cash' ? (cashAmountDzd ?? res.totalDzd) : res.totalDzd,
        remainingChangeDzd: paymentMethod === 'cash' ? Math.max(0, (cashAmountDzd ?? 0) - res.totalDzd) : 0,
        items: cartItems.map((ci) => {
          const matchedVariant = variants.find((v) => v.id === ci.variant_id)
          const variantText = [ci.variant_size, ci.variant_color].filter(Boolean).join(' / ')
          return {
            name: ci.product_name,
            variantName: variantText || undefined,
            quantity: ci.quantity,
            unitPriceDzd: ci.unit_price_dzd,
            totalPriceDzd: ci.unit_price_dzd * ci.quantity,
            imageUrl: matchedVariant?.image_url || null,
          }
        }),
        createdAt: new Date().toISOString(),
      }).catch(() => {})

      // 5 Signature Delight Moments Trigger
      setShowConfetti(true)
      setIsReceiptFlying(true)
      setTimeout(() => setIsReceiptFlying(false), 800)

      // Milestone Toast Check
      try {
        const todayStr = new Date().toISOString().split('T')[0]
        const [{ count }] = await window.electron.db.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM sales WHERE DATE(created_at) = ? AND deleted_at IS NULL`,
          [todayStr]
        )
        const milestoneTargets = [5, 10, 25, 50, 100]
        if (milestoneTargets.includes(count)) {
          addToast({
            message: `🎉 مبروك! تم تحقيق ${count} مبيعات لهذا اليوم! استمر في الإنجاز!`,
            variant: 'success',
            duration: 5000,
          })
        }
      } catch (err) {// eslint-disable-next-line no-console
      console.error("[POSCheckoutPage]", err); // non-blocking
      }

      clearCart()
      setSelectedCustomerId(null)
      setTenderedCashInput('')
      setCreditDepositInput('')
      await loadData()
    } finally {
      setIsProcessingSale(false)
    }
  }

  // Keyboard Shortcuts (F2: Search Focus, F4: Cash Drawer, F12: Finish Sale, ESC: Clear Cart)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchInputRef.current?.focus()
        addToast({ message: t('F2: تم التوجيه لبحث المنتجات والباركود'), variant: 'info', duration: 1500 })
      } else if (e.key === 'F4') {
        e.preventDefault()
        const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
        window.electron?.openCashDrawer(printerName).then(() => {
          addToast({ message: t('F4: تم إرسال أمر فتح درج النقود'), variant: 'success', duration: 1500 })
        }).catch((err) => {
          addToast({ message: t('تعذر فتح درج النقود: ') + ((err as Error)?.message || t('تأكد من توصيل الطابعة/الدرج')), variant: 'warning', duration: 3000 })
        })
      } else if (e.key === 'Escape') {
        if (!isMixedModalOpen && !isHeldModalOpen && !isManagerPinOpen) {
          if (cartItems.length > 0) {
            clearCart()
            addToast({ message: t('ESC: تم تفريغ السلة'), variant: 'info', duration: 1500 })
          }
        }
      } else if (e.key === 'F12') {
        e.preventDefault()
        if (cartItems.length > 0 && !isProcessingSale) {
          handleCompleteSale()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, isProcessingSale, isMixedModalOpen, isHeldModalOpen, isManagerPinOpen, addToast, clearCart, t])

  const cartSubtotal = getSubtotal()
  const cartTotal = getTotal()
  const tenderedCashNum = Number.parseFloat(tenderedCashInput) || 0
  const changeDzd = Math.max(0, tenderedCashNum - cartTotal)

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7] dark:bg-slate-950 overflow-hidden select-none relative animate-fade-in">
      {/* 5 Signature Delight Moments: Confetti Burst */}
      {showConfetti && <ConfettiBurst onComplete={() => setShowConfetti(false)} />}
      {/* Flying Receipt Badge animation */}
      {isReceiptFlying && (
        <div className="fixed bottom-24 right-24 z-70 bg-accent text-white px-4 py-2 rounded-2xl shadow-layered-deep text-xs font-black flex items-center gap-2 animate-bounce transition-all duration-700 transform -translate-y-96 opacity-90 pointer-events-none">
          <Printer className="w-4 h-4 animate-spin" />
          <span>{t('🧾 جاري ترحيل الفاتورة للطابعة...')}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="glass-header border-b border-gray-200/80 dark:border-slate-800 px-6 py-3 flex items-center justify-between z-10 shadow-layered-sm">
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

          {/* Quick Toggle: Auto Print */}
          <button
            onClick={toggleAutoPrint}
            title={autoPrintReceipt ? t('الطباعة التلقائية مفعّلة') : t('الطباعة التلقائية معطّلة')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all btn-press border ${
              autoPrintReceipt
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-400 border-gray-200 line-through opacity-75 hover:bg-gray-200'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('طباعة الفاتورة')}</span>
            <span className={`w-2 h-2 rounded-full ${autoPrintReceipt ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          </button>

          {/* Quick Toggle: Auto Cash Drawer */}
          <button
            onClick={toggleAutoDrawer}
            title={autoOpenDrawer ? t('فتح درج النقود مفعّل') : t('فتح درج النقود معطّل')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all btn-press border ${
              autoOpenDrawer
                ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                : 'bg-gray-100 text-gray-400 border-gray-200 line-through opacity-75 hover:bg-gray-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{t('فتح لاكاس')}</span>
            <span className={`w-2 h-2 rounded-full ${autoOpenDrawer ? 'bg-blue-500' : 'bg-gray-300'}`} />
          </button>

          {/* Manual Open Drawer */}
          <button
            onClick={handleOpenDrawer}
            title={t('تجربة فتح درج النقود يدويًا (ESC/POS)')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-text-secondary text-xs font-bold transition-all btn-press"
          >
            <Wallet className="w-3.5 h-3.5 text-amber-600" />
            <span>{t('اختبار لاكاس')}</span>
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
              ref={searchInputRef}
              placeholder={t('ابحث باسم المنتج، اللون، المقاس، أو امسح الباركود... (F2)')}
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
                {SKELETON_KEYS.map((sKey) => (
                  <div key={sKey} className="skeleton h-32 rounded-2xl" />
                ))}
              </div>
            ) : filteredVariants.length === 0 ? (
              <EmptyState
                variant="search"
                title={t('لا توجد منتجات تطابق البحث')}
                description={t('تأكد من اختيار الفئة أو كلمة البحث بشكل صحيح')}
                className="my-8"
              />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredVariants.map((v, idx) => {
                  const itemPrice = v.price_dzd ?? v.default_price
                  const isOutOfStock = v.current_stock <= 0

                  return (
                    <div
                      key={v.id}
                      className="stagger-item"
                      style={{ '--stagger-index': Math.min(idx, 12) } as React.CSSProperties}
                    >
                      <Card
                        onClick={() => {
                          if (!isOutOfStock) {
                            addItem(v, v.product_name, itemPrice)
                            soundService.playScan()
                            addToast({
                              message: `تم إضافة ${v.product_name}`,
                              variant: 'success',
                              duration: 1500,
                            })
                          } else {
                            soundService.playError()
                          }
                        }}
                        className={`p-4 border border-gray-200/80 dark:border-slate-700/80 transition-all flex flex-col justify-between h-36 ${
                          isOutOfStock ? 'opacity-50 grayscale bg-gray-50 dark:bg-slate-800/40 cursor-not-allowed' : 'cursor-pointer hover:border-accent'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <h3 className="font-extrabold text-sm text-[#1C2B3A] dark:text-slate-100 line-clamp-1">
                              {v.product_name}
                            </h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                              {v.category_name ? t(v.category_name) : t('عام')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-[#6B7A8D] dark:text-slate-400 font-semibold">
                            {v.size && <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">{t('مقاس:')} {v.size}</span>}
                            {v.color && <span className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">{t('لون:')} {t(v.color)}</span>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-700/60">
                          <span className="currency font-black text-accent text-sm">
                            {formatCurrency(itemPrice)}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${getStockPillStyle(
                              isOutOfStock,
                              v.current_stock
                            )}`}
                          >
                            {isOutOfStock ? t('نفد') : `${v.current_stock} ${t('قطعة')}`}
                          </span>
                        </div>
                      </Card>
                    </div>
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
                title={t('إضافة زبون جديد')}
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
              <EmptyState
                variant="cart"
                title={t('السلة فارغة حالياً')}
                description={t('اختر السلع من القائمة أو امسح الباركود للبدء')}
                className="my-auto shadow-none border-none bg-transparent"
              />
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
            <div className="grid grid-cols-4 gap-1.5">
              {(['cash', 'card', 'mixed', 'credit'] as PaymentMethod[]).map((pm) => (
                <button
                  key={pm}
                  onClick={() => {
                    setPaymentMethod(pm)
                    if (pm === 'mixed') setIsMixedModalOpen(true)
                  }}
                  className={`py-2 px-1 rounded-xl text-[11px] font-extrabold transition-all btn-press ${
                    paymentMethod === pm
                      ? 'bg-accent text-white shadow-ambient-sm'
                      : 'bg-white border border-gray-200 text-text-secondary hover:bg-gray-100'
                  }`}
                >
                  {getPaymentMethodLabel(pm, t)}
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
                    placeholder={t('مثلاً: 5000')}
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

            {/* Credit Payment Input (Initial Deposit & Remaining Debt) */}
            {paymentMethod === 'credit' && cartItems.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2 select-none">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span>المدفوع حاصلاً (تسقيع / عربون):</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="0 دج"
                    value={creditDepositInput}
                    onChange={(e) => setCreditDepositInput(e.target.value)}
                    className="w-24 px-2 py-1 text-left font-black text-amber-900 bg-white border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-100/80 border border-amber-300 text-xs font-black text-amber-900">
                  <span>المبلغ المتبقي كدين (Dette):</span>
                  <span className="text-sm font-extrabold text-red-600">
                    {formatCurrency(Math.max(0, cartTotal - (Number.parseFloat(creditDepositInput) || 0)))}
                  </span>
                </div>
                {!selectedCustomerId && (
                  <p className="text-[10px] font-bold text-red-600 animate-pulse">
                    ⚠️ تذكير: يجب اختيار أو إضافة زبون لتسجيل الدين في حسابه!
                  </p>
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
                onChange={(e) => setDiscount(0, Number.parseFloat(e.target.value) || 0)}
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
                <CountUpNumber value={cartTotal} formatter={(v) => formatCurrency(v)} className="font-extrabold text-base" />
              </div>
            </div>

            {/* Complete Sale Primary Button */}
            <button
              onClick={handleCompleteSale}
              disabled={cartItems.length === 0 || !activeShift || isProcessingSale}
              className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-sm font-extrabold shadow-hero-glow hover:shadow-layered-lg transition-all duration-150 flex items-center justify-center gap-2 btn-press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingSale ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t('إتمام عملية البيع')} (<CountUpNumber value={cartTotal} formatter={(v) => formatCurrency(v)} />)</span>
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
      <Modal isOpen={isQuickAddCustomerOpen} onClose={() => setIsQuickAddCustomerOpen(false)} title={t('إضافة زبون جديد فوراً')}>
        <form onSubmit={handleQuickAddCustomer} className="space-y-4">
          <Input label={t('اسم الزبون الكامل')} placeholder={t('مثلاً: محمد الأمين')} value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
          <Input label={t('رقم الهاتف')} placeholder="06XXXXXXXX" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsQuickAddCustomerOpen(false)}>{t('إلغاء')}</Button>
            <Button type="submit" variant="primary">{t('حفظ واختيار الزبون')}</Button>
          </div>
        </form>
      </Modal>

      {/* Mixed Payment Modal */}
      <Modal isOpen={isMixedModalOpen} onClose={() => setIsMixedModalOpen(false)} title={t('حاسبة التقسيم للدفع المختلط (نقداً + CIB)')}>
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold text-text-secondary flex justify-between">
            <span>إجمالي الفاتورة المستحق:</span>
            <span className="text-accent font-black text-sm">{formatCurrency(cartTotal)}</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mixed-cash-input" className="text-xs font-bold text-text-primary">المبلغ المدفوع كاش (نقداً):</label>
            <Input
              id="mixed-cash-input"
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCashInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCashInput(val)
                const cashNum = Number.parseFloat(val) || 0
                const cardNum = Math.max(0, cartTotal - cashNum)
                setMixedCardInput(cardNum > 0 ? String(cardNum) : '')
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mixedCardInput" className="text-xs font-bold text-text-primary">المبلغ المدفوع بالبطاقة (CIB):</label>
            <Input
              id="mixedCardInput"
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCardInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCardInput(val)
                const cardNum = Number.parseFloat(val) || 0
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
                const cash = Number.parseFloat(mixedCashInput) || 0
                const card = Number.parseFloat(mixedCardInput) || 0
                setMixedAmounts(cash, card)
                setIsMixedModalOpen(false)
                addToast({ message: t('تم حفظ تقسيم الدفع المختلط بنجاح!'), variant: 'success' })
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
