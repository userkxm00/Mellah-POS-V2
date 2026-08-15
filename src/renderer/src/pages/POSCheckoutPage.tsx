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
  Wallet,
  Printer,
  Banknote,
  CreditCard,
  Shuffle,
  BookOpen,
  Package,
  AlertTriangle
} from 'lucide-react'
import { fetchLowStockVariants } from '@/services/productService'
import { Card, Input, Modal, Button, ToastContainer } from '@/components/ui'
import { CountUpNumber } from '@/components/ui/CountUpNumber'
import { AnimatedBrandLogo } from '@/components/brand/AnimatedBrandLogo'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfettiBurst } from '@/components/ui/ConfettiBurst'
import { soundService } from '@/services/soundService'
import { formatCurrency } from '@/lib/format'
import { sendSaleCompletedTelegramNotification } from '@/services/telegramService'
import { generateCustomerBarcode } from '@/lib/customerUtils'
import { CustomerBarcodeModal } from '@/components/customers/CustomerBarcodeModal'
import { useCartStore, type CartItem } from '@/stores/cartStore'
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
import { POSCheckoutModals } from '@/components/pos/POSCheckoutModals'
import { POSDebtRepaymentModal } from '@/components/pos/POSDebtRepaymentModal'
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
  min_stock_level: number
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
  barcode?: string | null
  loyalty_points: number
  store_credit_balance?: number
  total_debt_dzd?: number
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

function getStockPillBadge(isOut: boolean, stock: number, t: (k: string) => string): React.ReactNode {
  if (isOut) {
    return (
      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
        <span>{t('نفد')}</span>
      </span>
    )
  }
  if (stock <= 5) {
    return (
      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span>{stock} {t('قطعة')}</span>
      </span>
    )
  }
  return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span>{stock} {t('قطعة')}</span>
    </span>
  )
}
async function fetchPOSBranchData(branchId: string): Promise<{
  categories: CategoryItem[]
  customers: CustomerOption[]
  variants: ProductVariantItem[]
}> {
  const catRows = await window.electron.db.query<CategoryItem>(
    `SELECT id, name FROM categories WHERE branch_id = ? AND deleted_at IS NULL ORDER BY name`,
    [branchId]
  )
  const custRows = await window.electron.db.query<CustomerOption>(
    `SELECT 
       c.id, c.full_name, c.phone, c.barcode, c.loyalty_points, 
       COALESCE(c.store_credit_balance, 0) as store_credit_balance,
       MAX(0, COALESCE((
         SELECT SUM(s.total_dzd - COALESCE(s.paid_amount_dzd, 0))
         FROM sales s
         WHERE s.customer_id = c.id AND s.deleted_at IS NULL
       ), 0) - COALESCE((
         SELECT SUM(cp.amount_dzd)
         FROM customer_payments cp
         WHERE cp.customer_id = c.id
       ), 0)) as total_debt_dzd
     FROM customers c 
     WHERE c.branch_id = ? AND c.deleted_at IS NULL 
     ORDER BY c.full_name`,
    [branchId]
  )
  const variantRows = await window.electron.db.query<ProductVariantItem>(
    `SELECT 
       v.id, v.product_id, v.branch_id, v.size, v.color, v.barcode, v.sku, v.price_dzd, COALESCE(v.min_stock_level, 5) as min_stock_level, v.created_at, v.updated_at, v.deleted_at,
       p.name as product_name, p.category_id, p.price_dzd as default_price, p.cost_dzd, p.image_url,
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
  return { categories: catRows, customers: custRows, variants: variantRows }
}

async function quickAddCustomerToDb(name: string, phone: string): Promise<{ id: string; barcode: string }> {
  const id = generateUUID()
  const barcode = generateCustomerBarcode(Date.now())
  const now = new Date().toISOString()
  await window.electron.db.execute(
    'INSERT INTO customers (id, branch_id, full_name, phone, barcode, loyalty_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
    [id, DEFAULT_BRANCH_ID, name.trim(), phone.trim() || null, barcode, now, now]
  )
  return { id, barcode }
}

async function verifyManagerPinHash(pinInput: string): Promise<boolean> {
  const managers = await window.electron.db.query<{ id: string; pin_hash: string }>(
    `SELECT id, pin_hash FROM users WHERE role IN ('admin', 'manager') AND deleted_at IS NULL`
  )
  for (const m of managers) {
    if (await window.electron.verifyPin(pinInput, m.id)) {
      return true
    }
  }
  return false
}

function buildReceiptPayload(
  saleId: string,
  cartItems: Array<{
    product_name: string
    variant_size: string | null
    variant_color: string | null
    quantity: number
    unit_price_dzd: number
  }>,
  subtotal: number,
  discountDzd: number,
  totalDzd: number,
  paymentMethod: string,
  cashierName?: string,
  customerName?: string,
  storeName?: string
) {
  return {
    storeName: storeName || 'بوتيك الملاح',
    receiptId: saleId,
    date: new Date().toISOString(),
    cashierName: cashierName || 'كاشير الفرع',
    customerName,
    items: cartItems.map((ci) => ({
      product_name: ci.product_name,
      size: ci.variant_size,
      color: ci.variant_color,
      quantity: ci.quantity,
      unit_price: ci.unit_price_dzd,
    })),
    subtotalDzd: subtotal,
    discountDzd: discountDzd > 0 ? discountDzd : undefined,
    totalDzd,
    paymentMethod,
  }
}

function executeBarcodeScan(
  scannedBarcode: string,
  variants: ProductVariantItem[],
  customers: CustomerOption[],
  setSelectedCustomerId: (id: string | null) => void,
  addItem: (variant: ProductVariantItem, name: string, price: number) => void,
  addToast: (toast: { message: string; variant: 'success' | 'warning' | 'error' | 'info'; duration?: number }) => void,
  t: (key: string) => string,
  isLoyaltyEnabled?: boolean
): void {
  const cleanCode = (scannedBarcode || '').trim()

  // 1. Customer Barcode Card Scan (starts with CUST-)
  if (cleanCode.toUpperCase().startsWith('CUST-')) {
    const custMatch = customers.find(
      (c) => c.barcode && c.barcode.toUpperCase() === cleanCode.toUpperCase()
    )

    if (custMatch) {
      setSelectedCustomerId(custMatch.id)
      soundService.playScan()
      addToast({
        message: isLoyaltyEnabled
          ? `${t('تم تحديد الزبون تلقائياً:')} ${custMatch.full_name} (${custMatch.loyalty_points} ${t('نقطة')})`
          : `${t('تم تحديد الزبون تلقائياً:')} ${custMatch.full_name}`,
        variant: 'success',
        duration: 3000,
      })
    } else {
      soundService.playError()
      addToast({
        message: `${t('بطاقة زبون غير مسجلة في القاعدة')} [${cleanCode}]`,
        variant: 'warning',
      })
    }
    return
  }

  // 2. Product Barcode Scan
  const match = variants.find((v) => v.barcode === cleanCode || v.sku === cleanCode)
  if (!match) {
    soundService.playError()
    addToast({
      message: `${t('الباركود')} [${cleanCode}] ${t('غير موجود في القاعدة')}`,
      variant: 'warning',
    })
    return
  }

  const res = processBarcodeMatch(match, addItem, t)
  if (res.success) {
    soundService.playScan()
    addToast({ message: res.message, variant: 'success', duration: 2000 })
  } else {
    soundService.playError()
    addToast({ message: res.message, variant: 'error' })
  }
}

function handleGlobalPOSKeyDown(
  e: KeyboardEvent,
  opts: {
    focusSearch: () => void
    openDrawer: () => void
    clearCart: () => void
    completeSale: () => void
    openAddCustomer?: () => void
    applyQuickDiscount?: () => void
    holdCart?: () => void
    openHeldCarts?: () => void
    openShift?: () => void
    hasCartItems: boolean
    isProcessingSale: boolean
    hasActiveModals: boolean
  }
): void {
  if (e.key === 'F1') {
    e.preventDefault()
    opts.focusSearch()
  } else if (e.key === 'F2') {
    e.preventDefault()
    if (opts.hasCartItems) {
      opts.holdCart?.()
    }
  } else if (e.key === 'F4') {
    e.preventDefault()
    opts.openDrawer()
  } else if (e.key === 'F10') {
    e.preventDefault()
    opts.openHeldCarts?.()
  } else if (e.key === 'Escape') {
    if (!opts.hasActiveModals && opts.hasCartItems) {
      opts.clearCart()
    }
  } else if (e.key === 'F12') {
    e.preventDefault()
    if (opts.hasCartItems && !opts.isProcessingSale) {
      opts.completeSale()
    }
  } else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault()
    opts.openAddCustomer?.()
  } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault()
    opts.applyQuickDiscount?.()
  } else if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault()
    opts.holdCart?.()
  } else if (e.key === 'F8') {
    e.preventDefault()
    opts.openShift?.()
  }
}

function processBarcodeMatch(
  match: ProductVariantItem,
  addItem: (variant: ProductVariantItem, name: string, price: number) => void,
  t: (key: string) => string
): { success: boolean; message: string; variant: 'success' | 'error' } {
  try {
    addItem(match, match.product_name, match.default_price)
    return {
      success: true,
      message: `${t('تم إضافة')} ${match.product_name} (${match.size ?? ''} ${match.color ?? ''})`,
      variant: 'success',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('عفواً تعذر إضافة المنتج')
    return { success: false, message: msg, variant: 'error' }
  }
}

function restoreHeldCartItems(
  items: Array<{
    variant_id: string
    product_id: string
    variant_size: string | null
    variant_color: string | null
    barcode: string | null
    unit_price_dzd: number
    available_stock: number
    product_name: string
  }>,
  addItem: (variant: ProductVariantItem, name: string, price: number) => void
): void {
  items.forEach((item) =>
    addItem(
      {
        id: item.variant_id,
        product_id: item.product_id,
        branch_id: DEFAULT_BRANCH_ID,
        size: item.variant_size,
        color: item.variant_color,
        barcode: item.barcode ?? '',
        sku: null,
        price_dzd: item.unit_price_dzd,
        cost_dzd: null,
        min_stock_level: 5,
        product_name: item.product_name,
        category_id: null,
        default_price: item.unit_price_dzd,
        category_name: null,
        created_at: '',
        updated_at: '',
        deleted_at: null,
        current_stock: item.available_stock,
      },
      item.product_name,
      item.unit_price_dzd
    )
  )
}

function checkSaleEligibility(
  activeShift: unknown,
  cartLength: number,
  subtotal: number,
  discountDzd: number,
  userRole?: string,
  t?: (key: string) => string
): { eligible: boolean; requiresPin: boolean; errorMsg?: string } {
  if (!activeShift) return { eligible: false, requiresPin: false, errorMsg: t?.('لا توجد وردية مفتوحة لإتمام البيع') }
  if (cartLength === 0) return { eligible: false, requiresPin: false, errorMsg: t?.('السلة فارغة، أضف منتجات أولاً') }
  const isHighDiscount = discountDzd > subtotal * 0.1 || discountDzd > 5000
  if (isHighDiscount && userRole === 'cashier') return { eligible: true, requiresPin: true }
  return { eligible: true, requiresPin: false }
}

async function dispatchSaleNotifications(
  res: { saleId: string; totalDzd: number },
  cartItems: CartItem[],
  variants: ProductVariantItem[],
  custObj: CustomerOption | undefined,
  paymentMethod: string,
  cashAmountDzd: number,
  subtotalDzd: number,
  discountDzd: number,
  autoPrintReceipt: boolean,
  autoOpenDrawer: boolean,
  t: (key: string) => string,
  addToast: (toast: { message: string; variant: 'success' | 'warning' | 'error' | 'info'; duration?: number }) => void,
  storeName: string
): Promise<void> {
  const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
  if (autoOpenDrawer) {
    window.electron.openCashDrawer(printerName).catch(() => {})
  }

  const paperWidth = (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
  const receiptLanguage = (localStorage.getItem('mellah_receipt_language') as 'ar' | 'fr' | 'en') ?? 'ar'

  if (autoPrintReceipt) {
    const currentUser = useAuthStore.getState().currentUser
    const payload = buildReceiptPayload(
      res.saleId,
      cartItems,
      subtotalDzd,
      discountDzd,
      res.totalDzd,
      paymentMethod,
      currentUser?.full_name,
      custObj?.full_name,
      storeName
    )
    printThermalReceipt(payload, { printerName, paperWidth, language: receiptLanguage }).catch(() => {
      addToast({
        message: t('تعذرت الطباعة — تحقق من اتصال الطابعة (يمكنك إعادة الطباعة من سجل المبيعات)'),
        variant: 'warning',
        duration: 6000,
      })
    })
  }

  const currentUser = useAuthStore.getState().currentUser
  const currentBranch = useAuthStore.getState().currentBranch
  sendSaleCompletedTelegramNotification({
    invoiceNumber: res.saleId.slice(0, 8).toUpperCase(),
    branchName: currentBranch?.name || 'الفرع الرئيسي',
    cashierName: currentUser?.full_name || 'الكاشير',
    customerName: custObj?.full_name || null,
    paymentMethod,
    subtotalDzd,
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
  })
}

export function POSCheckoutPage({
  onNavigateToHome,
  onNavigateToProducts,
}: {
  readonly onNavigateToHome?: () => void
  readonly onNavigateToProducts?: () => void
}): React.JSX.Element {
  const {
    items: cartItems,
    addItem,
    addCustomItem,
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
  useLanguageStore((s) => s.version)

  const activeShift = useShiftStore((s) => s.activeShift)
  const fetchActiveShift = useShiftStore((s) => s.fetchActiveShift)
  const isShiftLoading = useShiftStore((s) => s.isLoading)

  const heldCarts = useHeldCartStore((s) => s.heldCarts)
  const holdCart = useHeldCartStore((s) => s.holdCart)
  const restoreCart = useHeldCartStore((s) => s.restoreCart)
  const deleteCart = useHeldCartStore((s) => s.deleteCart)

  const storeSettings = useStoreSettingsStore((s) => s.settings)

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [variants, setVariants] = useState<ProductVariantItem[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isLoadingVariants, setIsLoadingVariants] = useState<boolean>(true)
  const [lowStockCount, setLowStockCount] = useState<number>(0)

  // Modals & UI States
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState<boolean>(false)
  const [isLocked, setIsLocked] = useState<boolean>(false)
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState<boolean>(false)
  const [isPOSDebtModalOpen, setIsPOSDebtModalOpen] = useState<boolean>(false)
  const [selectedPosBarcodeCustomer, setSelectedPosBarcodeCustomer] = useState<{ id: string; full_name: string; phone?: string | null; barcode?: string | null; loyalty_points?: number } | null>(null)
  const [isProcessingSale, setIsProcessingSale] = useState<boolean>(false)
  const [showConfetti, setShowConfetti] = useState<boolean>(false)
  const [isReceiptFlying, setIsReceiptFlying] = useState<boolean>(false)

  // Quick Custom Item Modal States (سلعة عامة بدون باركود)
  const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState<boolean>(false)
  const [customItemName, setCustomItemName] = useState<string>('')
  const [customItemPriceInput, setCustomItemPriceInput] = useState<string>('')
  const [customItemQtyInput, setCustomItemQtyInput] = useState<string>('1')

  // Discount source tracking
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0)
  const [appliedDiscountSource, setAppliedDiscountSource] = useState<'none' | 'loyalty' | 'store_credit' | 'manual'>('none')
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
      const data = await fetchPOSBranchData(branchId)
      setCategories(data.categories)
      setCustomers(data.customers)
      setVariants(data.variants)
      const lowStockRows = await fetchLowStockVariants().catch(() => [])
      setLowStockCount(lowStockRows.length)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POSCheckoutPage]', err)
      addToast({ message: t('فشل تحميل قائمة المنتجات والزبائن للفرع الحالي'), variant: 'error' })
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
      executeBarcodeScan(
        scannedBarcode,
        variants,
        customers,
        setSelectedCustomerId,
        addItem,
        addToast,
        t
      )
    },
    [variants, customers, setSelectedCustomerId, addItem, addToast, t]
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
    addToast({ message: t('F2: تم تعليق السلة الحالية بنجاح'), variant: 'info' })
  }, [cartItems, addToast, holdCart, clearCart, selectedCustomerObj?.full_name, t])

  const filteredVariants = filterVariantsList(variants, selectedCategoryId, searchQuery)

  // Restore held cart with real-time stock verification
  const handleRestoreCart = async (id: string): Promise<void> => {
    const items = restoreCart(id)
    if (items) {
      const activeBranch = useAuthStore.getState().currentBranch
      const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID
      clearCart()
      for (const item of items) {
        const stockRows = await window.electron.db.query<{ current_stock: number }>(
          `SELECT COALESCE(SUM(quantity_change), 0) as current_stock 
           FROM stock_movements 
           WHERE variant_id = ? AND branch_id = ?`,
          [item.variant_id, branchId]
        )
        const realStock = stockRows[0]?.current_stock ?? 0
        restoreHeldCartItems([{ ...item, available_stock: realStock }], addItem)
      }
      setIsHeldModalOpen(false)
      addToast({ message: t('تم استرجاع السلة المعلقة بنجاح!'), variant: 'success' })
    }
  }

  // Redeem Loyalty Points (100 points = 100 DZD discount)
  const handleRedeemPoints = (): void => {
    if (!selectedCustomerObj || selectedCustomerObj.loyalty_points < 100) return
    const pointsToUse = Math.floor(selectedCustomerObj.loyalty_points / 100) * 100
    const discountVal = pointsToUse // 1 point = 1 DZD
    setDiscount(0, discountVal)
    setRedeemedPoints(pointsToUse)
    setAppliedDiscountSource('loyalty')
    addToast({ message: `${t('تم خصم')} ${discountVal} ${t('دج مقابل')} ${pointsToUse} ${t('نقطة ولاء')}`, variant: 'success' })
  }

  // Apply Store Credit
  const handleApplyStoreCredit = (): void => {
    if (!selectedCustomerObj?.store_credit_balance) return
    const credit = selectedCustomerObj.store_credit_balance
    const sub = getSubtotal()
    const discountVal = Math.min(credit, sub)
    setDiscount(0, discountVal)
    setAppliedDiscountSource('store_credit')
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
      const { id } = await quickAddCustomerToDb(newCustName, newCustPhone)
      addToast({ message: t('تم إضافة الزبون بنجاح!'), variant: 'success' })
      setIsQuickAddCustomerOpen(false)
      setNewCustName('')
      setNewCustPhone('')
      await loadData()
      setSelectedCustomerId(id)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POSCheckoutPage]', err)
      addToast({ message: t('فشل إضافة الزبون'), variant: 'error' })
    }
  }

  // Quick Custom Item Handler (سلعة عامة / غير مسجلة بدون باركود)
  const handleAddCustomItem = (e: React.FormEvent): void => {
    e.preventDefault()
    const price = Math.max(0, Number.parseFloat(customItemPriceInput) || 0)
    if (price <= 0) {
      addToast({ message: t('يرجى كتابة مبلغ صحيح للسلعة'), variant: 'error' })
      return
    }
    const qty = Math.max(1, Number.parseInt(customItemQtyInput, 10) || 1)
    const name = customItemName.trim() || t('سلعة غير مسجلة')

    addCustomItem(name, price, qty)
    soundService.playScan()
    addToast({
      message: `${t('تم إضافة')} "${name}" (${price.toLocaleString()} DA) ${t('إلى السلة')}`,
      variant: 'success',
      duration: 2500,
    })

    setIsQuickItemModalOpen(false)
    setCustomItemName('')
    setCustomItemPriceInput('')
    setCustomItemQtyInput('1')
  }

  // Open Cash Drawer Trigger (Supports ESC/POS Pulse Kick)
  const handleOpenDrawer = async (): Promise<void> => {
    const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
    const ok = await window.electron.openCashDrawer(printerName)
    if (ok) {
      addToast({ message: t('تم إرسال أمر فتح درج النقود بنجاح!'), variant: 'success' })
    } else {
      addToast({ message: t('تم فتح الدرج (أو إرسال التنبيه المحلي للطابعة)'), variant: 'info' })
    }
  }

  // Manager PIN Verification for high discount (> 10% or > 5000 DZD)
  const handleVerifyManagerPin = async (): Promise<void> => {
    setIsVerifyingPin(true)
    try {
      const matched = await verifyManagerPinHash(managerPin)
      if (matched) {
        setIsManagerPinOpen(false)
        setManagerPin('')
        addToast({ message: t('تمت موافقة المدير بنجاح!'), variant: 'success' })
        executeSaleProcessing()
      } else {
        addToast({ message: t('رمز PIN الخاص بالمدير غير صحيح'), variant: 'error' })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POSCheckoutPage]', err)
      addToast({ message: t('فشل التحقق من رمز المدير'), variant: 'error' })
    } finally {
      setIsVerifyingPin(false)
    }
  }

  // Complete Sale Initiator
  const handleCompleteSale = async (): Promise<void> => {
    const sub = getSubtotal()
    const currentUser = useAuthStore.getState().currentUser
    const status = checkSaleEligibility(activeShift, cartItems.length, sub, discountDzd, currentUser?.role, t)

    if (!status.eligible) {
      if (status.errorMsg) addToast({ message: status.errorMsg, variant: 'error' })
      return
    }

    if (status.requiresPin) {
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
        creditDepositVal,
        appliedDiscountSource === 'loyalty' ? redeemedPoints : 0,
        // Store credit deduction now atomic inside processSale (fixes race condition - Bug #4)
        appliedDiscountSource === 'store_credit' ? discountDzd : null
      )

      const loyaltyMsg = custObj ? ` • تم منح نقاط الولاء للزبون (${custObj.full_name})` : ''
      soundService.playSuccess()
      addToast({
        message: `تم إتمام عملية البيع بنجاح! الإجمالي: ${formatCurrency(res.totalDzd)}${loyaltyMsg}`,
        variant: 'success',
        duration: 4000,
      })

      await dispatchSaleNotifications(
        res,
        cartItems,
        variants,
        custObj,
        paymentMethod,
        cashAmountDzd ?? 0,
        getSubtotal(),
        discountDzd,
        autoPrintReceipt,
        autoOpenDrawer,
        t,
        addToast,
        storeSettings.store_name
      )

      // 5 Signature Delight Moments Trigger
      setShowConfetti(true)
      setIsReceiptFlying(true)
      setTimeout(() => setIsReceiptFlying(false), 800)

      clearCart()
      setSelectedCustomerId(null)
      setTenderedCashInput('')
      setCreditDepositInput('')
      setRedeemedPoints(0)
      setAppliedDiscountSource('none')
      await loadData()
    } catch (err) {
      soundService.playError()
      const msg = err instanceof Error ? err.message : t('حدث خطأ أثناء معالجة عملية البيع')
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsProcessingSale(false)
    }
  }

  // Keyboard Shortcuts (F1: Search Focus, F2: Suspend Cart, F4: Cash Drawer, F10: Held Carts, F12: Finish Sale, ESC: Clear Cart)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      handleGlobalPOSKeyDown(e, {
        focusSearch: () => {
          searchInputRef.current?.focus()
          addToast({ message: t('F1: تم التوجيه لبحث المنتجات والباركود'), variant: 'info', duration: 1500 })
        },
        openDrawer: () => {
          const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
          window.electron?.openCashDrawer(printerName).then(() => {
            addToast({ message: t('F4: تم إرسال أمر فتح درج النقود'), variant: 'success', duration: 1500 })
          }).catch((err) => {
            addToast({ message: t('تعذر فتح درج النقود: ') + ((err as Error)?.message || t('تأكد من توصيل الطابعة/الدرج')), variant: 'warning', duration: 3000 })
          })
        },
        clearCart: () => {
          clearCart()
          addToast({ message: t('ESC: تم تفريغ السلة'), variant: 'info', duration: 1500 })
        },
        completeSale: handleCompleteSale,
        openAddCustomer: () => setIsQuickAddCustomerOpen(true),
        applyQuickDiscount: () => setDiscount(0, Math.round(getSubtotal() * 0.1)),
        holdCart: handleHoldCart,
        openHeldCarts: () => setIsHeldModalOpen(true),
        openShift: () => setIsCloseShiftOpen(true),
        hasCartItems: cartItems.length > 0,
        isProcessingSale,
        hasActiveModals: isMixedModalOpen || isHeldModalOpen || isManagerPinOpen,
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, isProcessingSale, isMixedModalOpen, isHeldModalOpen, isManagerPinOpen, addToast, clearCart, t, handleHoldCart])

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
          <span>{t('جاري ترحيل الفاتورة للطابعة...')}</span>
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
            subtitle={storeSettings.store_name || t('شاشة نقطة البيع (POS)')}
          />
        </div>

        <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 border border-gray-200/80 dark:border-white/10 backdrop-blur-md p-1.5 rounded-2xl shadow-layered-sm">
          {/* Held Carts Badge & Button */}
          <button
            onClick={() => setIsHeldModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-extrabold hover:bg-amber-500/20 transition-all btn-press"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>{t('السلال المعلقة')} ({heldCarts.length})</span>
          </button>

          {/* Quick Toggle: Auto Print */}
          <button
            onClick={toggleAutoPrint}
            title={autoPrintReceipt ? t('الطباعة التلقائية مفعّلة') : t('الطباعة التلقائية معطّلة')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all btn-press border ${
              autoPrintReceipt
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 line-through opacity-75'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('طباعة الفاتورة')}</span>
            <span className={`w-2 h-2 rounded-full ${autoPrintReceipt ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'}`} />
          </button>

          {/* Quick Toggle: Auto Cash Drawer */}
          <button
            onClick={toggleAutoDrawer}
            title={autoOpenDrawer ? t('فتح درج النقود مفعّل') : t('فتح درج النقود معطّل')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all btn-press border ${
              autoOpenDrawer
                ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/20'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 line-through opacity-75'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{t('فتح لاكاس')}</span>
            <span className={`w-2 h-2 rounded-full ${autoOpenDrawer ? 'bg-sky-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-600'}`} />
          </button>

          {/* Manual Open Drawer */}
          <button
            onClick={handleOpenDrawer}
            title={t('تجربة فتح درج النقود يدويًا (ESC/POS)')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-[#1C2B3A] dark:text-slate-200 text-xs font-extrabold transition-all btn-press"
          >
            <Wallet className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('اختبار لاكاس')}</span>
          </button>

          {activeShift ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{t('وردية نشطة')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-500/10 px-3 py-1 rounded-xl border border-rose-500/20">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-xs font-black text-rose-600 dark:text-rose-400">{t('مغلقة')}</span>
            </div>
          )}

          <button
            onClick={() => setIsLocked(true)}
            className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all btn-press"
            title={t('قفل الشاشة')}
          >
            <Lock className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsCloseShiftOpen(true)}
            disabled={!activeShift}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-xs font-extrabold hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 btn-press"
          >
            <Lock className="w-3.5 h-3.5 text-[#6B7A8D] dark:text-slate-400" />
            <span>{t('إغلاق الوردية')}</span>
          </button>
        </div>
      </header>

      {/* Proactive Low Stock Alert Banner */}
      {lowStockCount > 0 && (
        <div className="bg-amber-500/15 dark:bg-amber-950/40 border-b border-amber-500/30 px-6 py-2 flex items-center justify-between z-10 animate-fade-in">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {t('تنبيه المخزون:')} {lowStockCount} {t('منتج وصل الحد الأدنى أو على وشك النفاد!')}
            </span>
          </div>
          {onNavigateToProducts && (
            <button
              onClick={onNavigateToProducts}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-sm transition-all btn-press cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{t('طلب تزود سريع (PO)')}</span>
            </button>
          )}
        </div>
      )}

      {/* Main Body (Catalog Right, Cart Left) */}
      <div className="flex flex-1 overflow-hidden p-5 gap-5">
        {/* RIGHT PANEL: Product Search & Grid */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Search Bar & Category Filters */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm flex flex-col gap-3">
            <Input
              ref={searchInputRef}
              placeholder={t('ابحث باسم المنتج، اللون، المقاس، أو امسح الباركود... (F1)')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-50/80 border-gray-200 text-sm focus:bg-white"
              icon={<Search className="w-4 h-4 text-text-tertiary" />}
            />

            {/* Category Filter Pills & Quick Custom Item Button */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setIsQuickItemModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 transition-all btn-press whitespace-nowrap shrink-0 shadow-sm"
                title={t('إضافة سلعة غير مسجلة بدون باركود (مبلغ مباشر)')}
              >
                <Tag className="w-3.5 h-3.5 text-amber-500" />
                <span>{t('سلعة سريعة (بدون باركود)')}</span>
              </button>

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
                              message: `${t('تم إضافة')} ${v.product_name}`,
                              variant: 'success',
                              duration: 1500,
                            })
                          } else {
                            soundService.playError()
                          }
                        }}
                        className={`p-3.5 border backdrop-blur-md transition-all duration-300 flex flex-col justify-between h-40 rounded-2xl will-change-transform ${
                          isOutOfStock
                            ? 'opacity-50 grayscale bg-gray-50/60 dark:bg-slate-900/30 border-gray-200/60 dark:border-slate-800 cursor-not-allowed'
                            : 'bg-white/70 dark:bg-slate-900/50 border-gray-200/80 dark:border-white/10 cursor-pointer hover:border-accent/50 hover:scale-[1.02] hover:shadow-layered-md'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {v.image_url ? (
                                <img
                                  src={v.image_url}
                                  alt={v.product_name}
                                  className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-slate-700 shadow-sm"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center shrink-0 border border-accent/20">
                                  <Package className="w-4 h-4 text-accent" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-extrabold text-sm text-[#1C2B3A] dark:text-slate-100 line-clamp-1">
                                  {v.product_name}
                                </h3>
                                <span className="text-[10px] font-bold text-[#6B7A8D] dark:text-slate-400 block truncate">
                                  {v.category_name ? t(v.category_name) : t('عام')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-[#6B7A8D] dark:text-slate-400 font-semibold mt-1">
                            {v.size && <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-gray-200/60 dark:border-slate-700">{t('مقاس:')} {v.size}</span>}
                            {v.color && <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-gray-200/60 dark:border-slate-700">{t('لون:')} {t(v.color)}</span>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 dark:border-slate-800">
                          <span className="currency font-black text-accent text-sm">
                            {formatCurrency(itemPrice)}
                          </span>
                          {getStockPillBadge(isOutOfStock, v.current_stock, t)}
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
        <div className="w-96 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800 shadow-ambient-md overflow-hidden">
          {/* Cart Header */}
          <div className="p-4 border-b border-gray-200/80 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between">
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
          <div className="p-3 border-b border-gray-200/80 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={selectedCustomerId ?? ''}
                onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 dark:text-slate-100 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">— {storeSettings.loyalty_enabled ? t('اختر زبون لجمع نقاط الولاء') : t('اختر زبون')} —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} {storeSettings.loyalty_enabled ? `(${c.loyalty_points} نقطة)` : ''} {c.store_credit_balance ? `• رصيد: ${c.store_credit_balance} دج` : ''} {c.total_debt_dzd && c.total_debt_dzd > 0 ? `• دين: ${c.total_debt_dzd.toLocaleString('ar-DZ')} دج` : ''}
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

            {/* Redeem Points, Store Credit & Debt Repayment Quick Buttons */}
            {selectedCustomerObj && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {storeSettings.loyalty_enabled && selectedCustomerObj.loyalty_points >= 100 && (
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
                {selectedCustomerObj.total_debt_dzd && selectedCustomerObj.total_debt_dzd > 0 ? (
                  <button
                    onClick={() => setIsPOSDebtModalOpen(true)}
                    className="flex-1 py-1 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/25 text-[10px] font-black flex items-center justify-center gap-1 btn-press shadow-sm"
                    title={t('تسديد دين هذا الزبون مباشرة')}
                  >
                    <Wallet className="w-3 h-3 text-amber-500" />
                    <span>تسديد الدين ({selectedCustomerObj.total_debt_dzd.toLocaleString('ar-DZ')} دج)</span>
                  </button>
                ) : null}

                <button
                  onClick={() => setSelectedPosBarcodeCustomer(selectedCustomerObj)}
                  className="py-1 px-2.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/25 text-[10px] font-black flex items-center justify-center gap-1 btn-press shadow-sm"
                  title={t('معاينة وطباعة ملصق الباركود لبطاقة الزبون')}
                >
                  <Printer className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t('طبع كارت')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {cartItems.length === 0 ? (
              <EmptyState
                variant="cart"
                title={t('السلة فارغة حالياً')}
                description={t('اختر السلع من القائمة أو امسح الباركود للبدء')}
                className="my-auto shadow-none border-none bg-transparent"
              />
            ) : (
              cartItems.map((item) => {
                const matchedVariant = variants.find((v) => v.id === item.variant_id)
                const imageUrl = matchedVariant?.image_url
                return (
                  <div
                    key={item.variant_id}
                    className="bg-white/70 dark:bg-slate-800/70 border border-gray-200/80 dark:border-white/10 backdrop-blur-md rounded-2xl p-3 shadow-sm hover:shadow-layered-sm transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.product_name}
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-slate-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center shrink-0 border border-accent/20">
                          <Package className="w-5 h-5 text-accent" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold text-xs text-[#1C2B3A] dark:text-slate-100 truncate">{item.product_name}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#6B7A8D] dark:text-slate-300 mt-0.5">
                          {item.variant_size && <span className="bg-gray-100 dark:bg-slate-700/90 text-[#1C2B3A] dark:text-slate-200 border border-gray-200/80 dark:border-slate-600/60 px-1.5 py-0.5 rounded-lg">{t('مقاس:')} {item.variant_size}</span>}
                          {item.variant_color && <span className="bg-gray-100 dark:bg-slate-700/90 text-[#1C2B3A] dark:text-slate-200 border border-gray-200/80 dark:border-slate-600/60 px-1.5 py-0.5 rounded-lg">{t('لون:')} {t(item.variant_color)}</span>}
                        </div>
                        <span className="currency font-black text-accent text-xs block mt-0.5">
                          {formatCurrency(item.unit_price_dzd)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-gray-100/80 dark:bg-slate-700/60 border border-gray-200/80 dark:border-slate-600/60 rounded-xl p-0.5 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                          className="p-1 rounded-lg text-[#6B7A8D] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 hover:text-accent transition-all"
                          title={t('نقصان الكمية')}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-black text-[#1C2B3A] dark:text-slate-100">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                          className="p-1 rounded-lg text-[#6B7A8D] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 hover:text-accent transition-all"
                          title={t('زيادة الكمية')}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.variant_id)}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                        title={t('حذف من السلة')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Payment & Checkout Options Area */}
          <div className="p-4 border-t border-gray-200/80 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 space-y-3">
            {/* Tactile Payment Method Tabs */}
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  {
                    id: 'cash',
                    label: t('نقداً'),
                    icon: <Banknote className="w-4 h-4" />,
                    activeClass: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 shadow-layered-sm ring-1 ring-emerald-500/20',
                    hoverClass: 'hover:border-emerald-500/30 hover:text-emerald-600',
                  },
                  {
                    id: 'card',
                    label: 'CIB',
                    icon: <CreditCard className="w-4 h-4" />,
                    activeClass: 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300 shadow-layered-sm ring-1 ring-sky-500/20',
                    hoverClass: 'hover:border-sky-500/30 hover:text-sky-600',
                  },
                  {
                    id: 'mixed',
                    label: t('مزدوج'),
                    icon: <Shuffle className="w-4 h-4" />,
                    activeClass: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 shadow-layered-sm ring-1 ring-amber-500/20',
                    hoverClass: 'hover:border-amber-500/30 hover:text-amber-600',
                  },
                  {
                    id: 'credit',
                    label: t('كريدي'),
                    icon: <BookOpen className="w-4 h-4" />,
                    activeClass: 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 shadow-layered-sm ring-1 ring-rose-500/20',
                    hoverClass: 'hover:border-rose-500/30 hover:text-rose-600',
                  },
                ] as const
              ).map((tab) => {
                const isActive = paymentMethod === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(tab.id as PaymentMethod)
                      if (tab.id === 'mixed') setIsMixedModalOpen(true)
                    }}
                    className={`py-2.5 px-1 rounded-xl text-xs font-black border transition-all duration-200 btn-press flex items-center justify-center gap-1.5 ${
                      isActive
                        ? tab.activeClass
                        : `bg-white/80 dark:bg-slate-800/80 border-gray-200/80 dark:border-slate-700/80 text-[#6B7A8D] dark:text-slate-400 ${tab.hoverClass}`
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Change Calculator Input (for Cash payment) */}
            {paymentMethod === 'cash' && cartItems.length > 0 && (
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
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
                    تذكير: يجب اختيار أو إضافة زبون لتسجيل الدين في حسابه!
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

      {/* Quick Custom Item Modal (سلعة عامة / غير مسجلة بدون باركود) */}
      <Modal
        isOpen={isQuickItemModalOpen}
        onClose={() => setIsQuickItemModalOpen(false)}
        title={t('إضافة سلعة سريعة بدون باركود (Quick Custom Item)')}
        size="md"
      >
        <form onSubmit={handleAddCustomItem} className="space-y-4 select-none">
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 font-black text-lg">
              <Tag className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-900 dark:text-amber-200">
                {t('إدخال سريع لسلعة غير مسجلة بالباركود')}
              </h4>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                {t('يمكنك تخصيص اسم السلعة (مثلاً: تقاشير، سليب، حزام) لتظهر باسمها الدقيق في الفاتورة والسجل')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              label={t('اسم السلعة (اختر اسم محدد أو اتركه سلعة غير مسجلة)')}
              placeholder={t('مثال: تقاشير / سليب / ملابس داخلية')}
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              autoFocus
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200 mb-1 block">
                  {t('المبلغ / السعر (DA)')} *
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    step="10"
                    required
                    placeholder="200"
                    value={customItemPriceInput}
                    onChange={(e) => setCustomItemPriceInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-black bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-accent text-[#1C2B3A] dark:text-slate-100"
                  />
                  <span className="absolute left-3 text-xs font-black text-text-tertiary">DA</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200 mb-1 block">
                  {t('الكمية (Quantity)')} *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={customItemQtyInput}
                  onChange={(e) => setCustomItemQtyInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-black bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-accent text-[#1C2B3A] dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsQuickItemModalOpen(false)}
              className="flex-1"
            >
              {t('إلغاء')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1 flex items-center justify-center gap-2 font-black"
            >
              <Plus className="w-4 h-4" />
              <span>{t('إضافة للسلة')}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* POS Modals Sub-Component */}
      <POSCheckoutModals
        isHeldModalOpen={isHeldModalOpen}
        setIsHeldModalOpen={setIsHeldModalOpen}
        heldCarts={heldCarts}
        handleRestoreCart={handleRestoreCart}
        deleteCart={deleteCart}
        isManagerPinOpen={isManagerPinOpen}
        setIsManagerPinOpen={setIsManagerPinOpen}
        discountDzd={discountDzd}
        managerPin={managerPin}
        setManagerPin={setManagerPin}
        handleVerifyManagerPin={handleVerifyManagerPin}
        isVerifyingPin={isVerifyingPin}
        isShiftLoading={isShiftLoading}
        activeShift={activeShift}
        isCloseShiftOpen={isCloseShiftOpen}
        setIsCloseShiftOpen={setIsCloseShiftOpen}
        isQuickAddCustomerOpen={isQuickAddCustomerOpen}
        setIsQuickAddCustomerOpen={setIsQuickAddCustomerOpen}
        handleQuickAddCustomer={handleQuickAddCustomer}
        newCustName={newCustName}
        setNewCustName={setNewCustName}
        newCustPhone={newCustPhone}
        setNewCustPhone={setNewCustPhone}
        isMixedModalOpen={isMixedModalOpen}
        setIsMixedModalOpen={setIsMixedModalOpen}
        cartTotal={cartTotal}
        mixedCashInput={mixedCashInput}
        setMixedCashInput={setMixedCashInput}
        mixedCardInput={mixedCardInput}
        setMixedCardInput={setMixedCardInput}
        setMixedAmounts={setMixedAmounts}
        isLocked={isLocked}
        setIsLocked={setIsLocked}
        t={t}
        addToast={addToast}
      />
      {/* Sleek Bottom Keyboard Shortcuts Bar */}
      <footer className="glass-header border-t border-gray-200/80 dark:border-white/10 px-6 py-2 flex items-center justify-center gap-6 text-[11px] font-extrabold text-[#6B7A8D] dark:text-slate-400 select-none z-10 shadow-layered-sm shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">F1</kbd>
          <span>{t('التركيز على البحث')}</span>
        </div>
        <span className="text-gray-300 dark:text-slate-700">•</span>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">F2</kbd>
          <span>{t('تعليق السلة')}</span>
        </div>
        <span className="text-gray-300 dark:text-slate-700">•</span>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">F4</kbd>
          <span>{t('فتح درج النقود')}</span>
        </div>
        <span className="text-gray-300 dark:text-slate-700">•</span>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">F10</kbd>
          <span>{t('السلال المعلقة')}</span>
        </div>
        <span className="text-gray-300 dark:text-slate-700">•</span>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">F12</kbd>
          <span>{t('إتمام البيع والدفع')}</span>
        </div>
        <span className="text-gray-300 dark:text-slate-700">•</span>
        <div className="flex items-center gap-1.5">
          <kbd className="px-2 py-0.5 rounded-lg bg-gray-200/80 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-[10px] font-mono shadow-sm">ESC</kbd>
          <span>{t('تفريغ السلة')}</span>
        </div>
      </footer>

      <POSDebtRepaymentModal
        isOpen={isPOSDebtModalOpen}
        onClose={() => setIsPOSDebtModalOpen(false)}
        customer={selectedCustomerObj ?? null}
        onPaymentSuccess={() => loadData()}
      />

      {/* Customer Barcode Sticker Thermal Modal */}
      <CustomerBarcodeModal
        isOpen={selectedPosBarcodeCustomer !== null}
        onClose={() => setSelectedPosBarcodeCustomer(null)}
        customer={selectedPosBarcodeCustomer}
      />

      <ToastContainer />
    </div>
  )
}
