import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowRight,
  ExternalLink,
  Printer,
  Tag,
  Search,
  Layers,
  Award,
  Eye,
  CheckCircle2
} from 'lucide-react'
import { Card, Input, Button } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { generateBarcodeSvg, printCustomerCardLabel } from '@/services/receiptService'
import { CustomerBarcodeModal } from '@/components/customers/CustomerBarcodeModal'
import { generateCustomerBarcode } from '@/lib/customerUtils'

interface ProductVariantItem {
  id: string
  product_id: string
  product_name: string
  category_id: string | null
  category_name: string | null
  size: string | null
  color: string | null
  barcode: string | null
  sku: string | null
  price_dzd: number
  current_stock: number
}

interface ProductGroup {
  product_id: string
  product_name: string
  category_name: string | null
  variants: ProductVariantItem[]
}

interface CategoryItem {
  id: string
  name: string
}

interface CustomerPrintItem {
  id: string
  full_name: string
  phone: string | null
  barcode: string | null
  loyalty_points: number
}

export function LabelPrinterPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const storeSettings = useStoreSettingsStore((s) => s.settings)

  const [printTab, setPrintTab] = useState<'products' | 'customers'>('products')
  const [customers, setCustomers] = useState<CustomerPrintItem[]>([])
  const [products, setProducts] = useState<ProductGroup[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Customer barcode modal preview state
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<CustomerPrintItem | null>(null)

  // Map of variant_id -> print_quantity
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Label dimensions state (presets: 50x25mm, 40x30mm, 38x25mm)
  const [labelSize, setLabelSize] = useState<'50x25' | '40x30' | '38x25'>(
    storeSettings.barcode_label_size || '50x25'
  )

  const addToast = useToastStore((s) => s.addToast)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // 1. Fetch categories
      const catRows = await window.electron.db.query<CategoryItem>(
        'SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name'
      )
      setCategories(catRows)

      // 2. Fetch variants with stock ledger calculation
      const variantRows = await window.electron.db.query<ProductVariantItem>(
        `SELECT 
           v.id, v.product_id, v.size, v.color, v.barcode, v.sku,
           COALESCE(v.price_dzd, p.price_dzd) as price_dzd,
           p.name as product_name, p.category_id,
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

      // Group variants by product
      const groupMap = new Map<string, ProductGroup>()
      const initialQtyMap: Record<string, number> = {}

      for (const row of variantRows) {
        const qty = row.current_stock > 0 ? row.current_stock : 1
        initialQtyMap[row.id] = qty

        if (!groupMap.has(row.product_id)) {
          groupMap.set(row.product_id, {
            product_id: row.product_id,
            product_name: row.product_name,
            category_name: row.category_name,
            variants: [],
          })
        }
        groupMap.get(row.product_id)!.variants.push(row)
      }

      const groupedList = Array.from(groupMap.values())
      setProducts(groupedList)
      setPrintQuantities(initialQtyMap)

      if (groupedList.length > 0) {
        setSelectedProductId(groupedList[0].product_id)
        if (groupedList[0].variants.length > 0) {
          setSelectedVariantId(groupedList[0].variants[0].id)
        }
      }

      // 3. Fetch customers with barcodes for customer card printing
      const custRows = await window.electron.db
        .query<{ id: string; full_name: string; phone: string | null; barcode: string | null; loyalty_points: number }>(
          'SELECT id, full_name, phone, barcode, loyalty_points FROM customers WHERE deleted_at IS NULL ORDER BY full_name'
        )
        .catch(() => [])
      setCustomers(custRows)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LabelPrinterPage]', err)
      addToast({ message: t('فشل تحميل المنتجات للطباعة'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  const handlePrintCustomerCard = async (customer: CustomerPrintItem): Promise<void> => {
    try {
      let custBarcode = customer.barcode
      if (!custBarcode) {
        custBarcode = generateCustomerBarcode(customer.id)
        const now = new Date().toISOString()
        await window.electron.db.execute(
          'UPDATE customers SET barcode = ?, updated_at = ? WHERE id = ?',
          [custBarcode, now, customer.id]
        )
        customer.barcode = custBarcode
      }

      const printed = await printCustomerCardLabel(
        {
          customerName: customer.full_name,
          customerPhone: customer.phone,
          barcode: custBarcode,
          loyaltyPoints: customer.loyalty_points,
        },
        storeSettings,
        storeSettings.label_printer_name || undefined
      )

      if (printed) {
        addToast({ message: `${t('تم إرسال بطاقة الزبون')} (${customer.full_name}) ${t('إلى الطابعة بنجاح!')}`, variant: 'success' })
      } else {
        addToast({ message: t('تعذر إرسال بطاقة الزبون إلى طابعة الملصقات'), variant: 'warning' })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LabelPrinterPage] Print card error:', err)
      addToast({ message: t('فشل طباعة بطاقة الزبون'), variant: 'error' })
    }
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const firstVar = p.variants[0]
    const matchesCategory = selectedCategoryId ? firstVar?.category_id === selectedCategoryId : true
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      q === '' ||
      p.product_name.toLowerCase().includes(q) ||
      p.variants.some(
        (v) =>
          (v.barcode && v.barcode.includes(q)) ||
          (v.size && v.size.toLowerCase().includes(q)) ||
          (v.color && v.color.toLowerCase().includes(q))
      )

    return matchesCategory && matchesSearch
  })

  const selectedProduct = products.find((p) => p.product_id === selectedProductId)
  const activePreviewVariant = selectedProduct?.variants.find((v) => v.id === selectedVariantId) || selectedProduct?.variants[0]

  const handleUpdateQuantity = (variantId: string, qty: number): void => {
    setPrintQuantities((prev) => ({
      ...prev,
      [variantId]: Math.max(0, qty),
    }))
  }

  // Print all tags for the selected product sequentially
  const handlePrintProductLabels = (): void => {
    if (!selectedProduct) return

    const printItems: { variant: ProductVariantItem; count: number }[] = []
    let totalCount = 0

    for (const variant of selectedProduct.variants) {
      const count = printQuantities[variant.id] ?? 0
      if (count > 0) {
        printItems.push({ variant, count })
        totalCount += count
      }
    }

    if (totalCount === 0) {
      addToast({ message: t('يرجى تحديد عدد التيكيتات المراد طباعتها (أكبر من 0)'), variant: 'warning' })
      return
    }

    const sizeDimensions: Record<string, { page: string; width: string; height: string }> = {
      '50x25': { page: '50mm 25mm', width: '46mm', height: '21mm' },
      '40x30': { page: '40mm 30mm', width: '36mm', height: '26mm' },
      '38x25': { page: '38mm 25mm', width: '34mm', height: '21mm' },
    }
    const dim = sizeDimensions[labelSize] || sizeDimensions['50x25']

    // Build thermal label HTML string with JsBarcode script included
    const labelHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>طباعة ملصقات الباركود - ${selectedProduct.product_name}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          @page { size: ${dim.page}; margin: 0; }
          body {
            margin: 0;
            padding: 1.5mm;
            width: ${dim.width};
            height: ${dim.height};
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            direction: rtl;
            overflow: hidden;
            box-sizing: border-box;
          }
          .label-container {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            height: 100%;
          }
          .store-name {
            font-size: 7.5px;
            font-weight: 900;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            border-bottom: 0.5pt solid #000;
            width: 100%;
            padding-bottom: 1px;
          }
          .title { 
            font-size: 8.5px; 
            font-weight: 800; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis;
            line-height: 1.1;
            width: 100%;
          }
          .details { 
            font-size: 7.5px; 
            font-weight: bold;
            color: #222;
            margin: 1px 0;
          }
          .barcode-svg {
            max-width: 100%;
            height: 14mm;
          }
          .price { 
            font-size: 13.5px; 
            font-weight: 900; 
            font-family: 'Segoe UI', system-ui, sans-serif;
            letter-spacing: -0.2px;
            margin-top: 1px;
            color: #000;
          }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
        ${printItems
          .map(({ variant, count }, idx) =>
            Array.from({ length: count })
              .map(
                (_, cIdx) => `
              <div class="label-container">
                <div class="store-name">${storeSettings.store_name}</div>
                <div class="title">${selectedProduct.product_name}</div>
                <div class="details">
                  ${variant.size ? `المقاس: ${variant.size}` : ''} 
                  ${variant.color ? ` | اللون: ${variant.color}` : ''}
                </div>
                <svg id="barcode-${idx}-${cIdx}" class="barcode-svg"></svg>
                <div class="price">${formatCurrency(variant.price_dzd)}</div>
              </div>
              <div class="page-break"></div>
            `
              )
              .join('')
          )
          .join('')}
        <script>
          window.onload = function() {
            ${printItems
              .map(({ variant }, idx) =>
                Array.from({ length: printQuantities[variant.id] ?? 0 })
                  .map(
                    (_, cIdx) => `
                  try {
                    JsBarcode("#barcode-${idx}-${cIdx}", "${variant.barcode || variant.sku || '123456789'}", {
                      format: "CODE128",
                      displayValue: true,
                      fontSize: 10,
                      height: 35,
                      margin: 0
                    });
                  } catch(e) {}
                `
                  )
                  .join('')
              )
              .join('')}
            setTimeout(function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }, 300);
          };
        </script>
      </body>
      </html>
    `

    const printWin = window.open('', '_blank', 'width=350,height=400')
    if (printWin) {
      printWin.document.write(labelHtml)
      printWin.document.close()
      addToast({
        message: `تم توليد ${totalCount} ملصق باركود حقيقي لمقاسات "${selectedProduct.product_name}" بنجاح!`,
        variant: 'success',
      })
    }
  }

  // Calculate total labels for current selected product
  const currentTotalLabels = selectedProduct
    ? selectedProduct.variants.reduce((acc, v) => acc + (printQuantities[v.id] ?? 0), 0)
    : 0

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  // Live thermal label preview SVG barcode
  const previewBarcodeSvg = activePreviewVariant
    ? generateBarcodeSvg(activePreviewVariant.barcode || activePreviewVariant.sku || '123456789')
    : ''

  const previewFrameClass =
    labelSize === '50x25'
      ? 'w-[220px] h-[110px]'
      : labelSize === '38x25'
        ? 'w-[170px] h-[110px]'
        : 'w-[180px] h-[135px]'

  return (
    <div className="min-h-screen p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none dark:bg-slate-950">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
              title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
            >
              <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
            </button>

            {!isSecondaryWindow && (
              <button
                type="button"
                onClick={() => {
                  if (window.electron?.openModuleWindow) {
                    window.electron.openModuleWindow('labels')
                    if (onBack) onBack()
                  }
                }}
                className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
                title={t('فتح في نافذة خارجية جديدة')}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">
            {t('طباعة بطاقات الأسعار والباركود للملابس والزبائن')}
          </h1>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-2xl border border-gray-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPrintTab('products')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all btn-press ${
              printTab === 'products'
                ? 'bg-accent text-white shadow-ambient'
                : 'text-text-secondary dark:text-slate-400 hover:text-text-primary'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>{t('🏷️ تيكيتات الملابس والأسعار')}</span>
          </button>
          <button
            type="button"
            onClick={() => setPrintTab('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all btn-press ${
              printTab === 'customers'
                ? 'bg-accent text-white shadow-ambient'
                : 'text-text-secondary dark:text-slate-400 hover:text-text-primary'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>{t('💳 بطاقات الزبائن والولاء')}</span>
          </button>
        </div>
      </div>

      {/* Products Tab View */}
      {printTab === 'products' && (
        <>
          {/* Top Search & Category Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200/80 dark:border-slate-800 shadow-layered-sm">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-text-tertiary absolute right-3.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder={t('البحث باسم المنتج، المقاس، اللون، أو الباركود...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 text-xs font-bold"
              />
            </div>

            {/* Category Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
                  selectedCategoryId === null
                    ? 'bg-accent text-white shadow-ambient'
                    : 'bg-gray-100 dark:bg-slate-800 text-text-secondary hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                الكل ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
                    selectedCategoryId === cat.id
                      ? 'bg-accent text-white shadow-ambient'
                      : 'bg-gray-100 dark:bg-slate-800 text-text-secondary hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products Sidebar List */}
            <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800 lg:col-span-1 h-[calc(100vh-250px)] flex flex-col">
              <div className="p-3.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  <span>قائمة المنتجات ({filteredProducts.length})</span>
                </span>
                <span className="text-[10px] text-text-tertiary font-bold">اختر منتجاً لتعديل الكمية</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
                {isLoading ? (
                  <div className="p-6 text-center text-xs font-bold text-text-tertiary">جاري تحميل قائمة الملابس...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-6 text-center text-xs font-bold text-text-tertiary">لا توجد منتجات تطابق البحث</div>
                ) : (
                  filteredProducts.map((prod) => {
                    const isSelected = prod.product_id === selectedProductId
                    const totalQty = prod.variants.reduce((acc, v) => acc + (printQuantities[v.id] ?? 0), 0)

                    return (
                      <button
                        key={prod.product_id}
                        onClick={() => {
                          setSelectedProductId(prod.product_id)
                          if (prod.variants.length > 0) {
                            setSelectedVariantId(prod.variants[0].id)
                          }
                        }}
                        className={`w-full text-right p-3.5 transition-all flex items-center justify-between group cursor-pointer ${
                          isSelected
                            ? 'bg-accent/10 dark:bg-accent/20 font-black border-r-4 border-accent text-accent'
                            : 'hover:bg-gray-50/80 dark:hover:bg-slate-800/60 text-text-primary dark:text-slate-200'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1 pl-2">
                          <p className="text-xs font-black truncate">{prod.product_name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-text-tertiary font-bold">
                            <span>{prod.category_name ?? 'بدون تصنيف'}</span>
                            <span>•</span>
                            <span>{prod.variants.length} مقاسات</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                            totalQty > 0
                              ? 'bg-accent/15 text-accent border border-accent/20'
                              : 'bg-gray-100 dark:bg-slate-800 text-text-tertiary'
                          }`}
                        >
                          {totalQty} ملصق
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </Card>

            {/* Selected Product Variants & Print Settings (Right Column) */}
            <div className="lg:col-span-2 space-y-4">
              {selectedProduct ? (
                <Card className="p-6 space-y-5 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
                        <span>{selectedProduct.product_name}</span>
                        {selectedProduct.category_name && (
                          <span className="text-xs font-bold text-text-tertiary font-normal">({selectedProduct.category_name})</span>
                        )}
                      </h2>
                      <p className="text-xs text-text-secondary dark:text-slate-400 mt-0.5">
                        حدد الكمية المراد طباعتها لكل مقاس/لون ثم اضغط طباعة الباركود.
                      </p>
                    </div>

                    <button
                      onClick={handlePrintProductLabels}
                      disabled={currentTotalLabels === 0}
                      className="px-5 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-hero-glow transition-all btn-press flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة تيكيتات الباركود ({currentTotalLabels})</span>
                    </button>
                  </div>

                  {/* Live Simulated Thermal Label Preview Box */}
                  <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-2 text-right flex-1">
                      <div className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-accent" />
                        <span>معاينة حية تفاعلية للملصق الحراري المطبوع (Live Preview)</span>
                      </div>
                      <p className="text-[11px] text-text-secondary dark:text-slate-400 leading-relaxed">
                        هذا هو الشكل النهائي الدقيق للملصق كما يخرج من طابعة الباركود الحرارية. اختر الحجم المناسب لرول ملصقات المحل:
                      </p>

                      {/* Size Preset Selector */}
                      <div className="flex items-center gap-2 pt-2">
                        {(['50x25', '40x30', '38x25'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setLabelSize(sz)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                              labelSize === sz
                                ? 'bg-accent text-white shadow-layered-sm'
                                : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {sz === '50x25' ? '50mm × 25mm (عريض)' : sz === '40x30' ? '40mm × 30mm (قياسي)' : '38mm × 25mm'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Simulated Thermal Label Card */}
                    <div className="shrink-0 flex flex-col items-center">
                      <div className={`${previewFrameClass} bg-white text-black p-2 rounded border-2 border-dashed border-gray-300 shadow-md flex flex-col justify-between items-center text-center select-none font-sans overflow-hidden transition-all`}>
                        <div className="w-full text-[9px] font-black border-b border-black pb-0.5 tracking-tight truncate">
                          {storeSettings.store_name}
                        </div>

                        <div className="w-full my-0.5">
                          <div className="text-[10.5px] font-black leading-tight truncate">{selectedProduct.product_name}</div>
                          {activePreviewVariant && (
                            <div className="text-[8px] font-bold text-gray-700">
                              {activePreviewVariant.size ? `المقاس: ${activePreviewVariant.size}` : ''}
                              {activePreviewVariant.color ? ` | اللون: ${activePreviewVariant.color}` : ''}
                            </div>
                          )}
                        </div>

                        {/* High-Density Barcode SVG */}
                        <div
                          className="w-full flex items-center justify-center my-0.5"
                          dangerouslySetInnerHTML={{ __html: previewBarcodeSvg }}
                        />

                        {activePreviewVariant && (
                          <div className="text-[13px] font-black text-black tracking-tight leading-none">
                            {formatCurrency(activePreviewVariant.price_dzd)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-text-tertiary mt-1.5">معاينة الحجم ({labelSize})</span>
                    </div>
                  </div>

                  {/* Variants List Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-text-primary dark:text-slate-200">مقاسات وألوان هذا المنتج:</h3>
                    <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                      {selectedProduct.variants.map((variant) => {
                        const qty = printQuantities[variant.id] ?? 0
                        const isPreviewActive = variant.id === activePreviewVariant?.id

                        return (
                          <div
                            key={variant.id}
                            onClick={() => setSelectedVariantId(variant.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSelectedVariantId(variant.id)
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              isPreviewActive
                                ? 'bg-accent/5 dark:bg-accent/15 border-r-4 border-accent'
                                : 'bg-white dark:bg-slate-900 hover:bg-gray-50/50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
                                {variant.size && <span>المقاس: {variant.size}</span>}
                                {variant.color && <span>• اللون: {variant.color}</span>}
                                {!variant.size && !variant.color && <span>قياسي</span>}
                              </p>
                              <p className="text-[11px] text-text-tertiary font-mono">
                                الباركود: {variant.barcode || variant.sku || 'غير محدد'} • السعر: {formatCurrency(variant.price_dzd)}
                              </p>
                            </div>

                            <div
                              className="flex items-center gap-3"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-text-tertiary font-bold">
                                المخزون: <b className="text-text-primary dark:text-slate-200">{variant.current_stock}</b>
                              </span>
                              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl border border-gray-200 dark:border-slate-700">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(variant.id, qty - 1)}
                                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  value={qty}
                                  onChange={(e) => handleUpdateQuantity(variant.id, Number.parseInt(e.target.value, 10) || 0)}
                                  className="w-12 text-center text-xs font-black bg-transparent focus:outline-none dark:text-slate-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(variant.id, qty + 1)}
                                  className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-xs font-black shadow-sm flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-12 text-center text-xs font-bold text-text-tertiary border border-gray-200/80">
                  اختر منتجاً من القائمة الجانبية لعرض وتوليد ملصقات التيكيتات.
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Customers Cards Tab View */}
      {printTab === 'customers' && (
        <Card className="p-6 space-y-6 border border-gray-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
            <div className="space-y-1">
              <h2 className="text-base font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
                <Award className="w-5 h-5 text-accent" />
                <span>{t('طباعة بطاقات الزبائن والولاء الحرارية (Customer Cards)')}</span>
              </h2>
              <p className="text-xs text-text-secondary dark:text-slate-400">
                {t('طباعة ملصقات الباركود الحاوية على معرف الزبون الفريد 99XXXXXXXX للصقها على كروت المحل البلاستيكية.')}
              </p>
            </div>
            <span className="text-xs font-extrabold px-3.5 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              <span>{customers.length} {t('زبون مسجل')}</span>
            </span>
          </div>

          {/* Search Filter */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-text-tertiary absolute right-3.5 top-1/2 -translate-y-1/2" />
            <Input
              placeholder={t('ابحث باسم الزبون أو رقم الهاتف لتصفية البطاقات...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-xs font-bold"
            />
          </div>

          {/* Ultra-Premium Digital Customer Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {customers
              .filter(
                (c) =>
                  searchQuery.trim() === '' ||
                  c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (c.phone && c.phone.includes(searchQuery))
              )
              .map((cust) => {
                const barcodeCode = cust.barcode || generateCustomerBarcode(cust.id)
                const svgString = generateBarcodeSvg(barcodeCode)

                return (
                  <div
                    key={cust.id}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-layered-sm flex flex-col justify-between gap-4 hover:border-accent/50 transition-all hover:shadow-ambient group"
                  >
                    {/* Card Top Branding Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2.5">
                      <span className="text-[11px] font-black text-accent tracking-tight">
                        {storeSettings.store_name}
                      </span>
                      {storeSettings.loyalty_enabled && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                          {cust.loyalty_points} نقطة
                        </span>
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-1">
                      <h3 className="text-sm font-black text-text-primary dark:text-slate-100 truncate">
                        {cust.full_name}
                      </h3>
                      <p className="text-xs font-bold font-mono text-text-secondary dark:text-slate-400">
                        {cust.phone || t('بدون رقم هاتف')}
                      </p>
                    </div>

                    {/* Live SVG Barcode Preview */}
                    <div className="p-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 flex items-center justify-center">
                      <div
                        className="w-full max-w-[180px] h-[36px]"
                        dangerouslySetInnerHTML={{ __html: svgString }}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="secondary"
                        onClick={() => setSelectedCustomerForModal(cust)}
                        className="flex-1 text-xs py-2 h-auto cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 ml-1" />
                        <span>{t('معاينة')}</span>
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handlePrintCustomerCard(cust)}
                        className="flex-1 text-xs py-2 h-auto bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 ml-1" />
                        <span>{t('طباعة')}</span>
                      </Button>
                    </div>
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* Customer Barcode Modal */}
      {selectedCustomerForModal && (
        <CustomerBarcodeModal
          isOpen={!!selectedCustomerForModal}
          onClose={() => setSelectedCustomerForModal(null)}
          customer={selectedCustomerForModal}
        />
      )}
    </div>
  )
}
