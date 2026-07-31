import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowRight,
  Printer,
  Tag,
  Search,
  Layers,
  Sparkles
} from 'lucide-react'
import { Card, Input } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

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

export function LabelPrinterPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const [products, setProducts] = useState<ProductGroup[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  
  // Map of variant_id -> print_quantity
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)

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
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[LabelPrinterPage]", err); addToast({ message: t('فشل تحميل المنتجات للطباعة'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

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

  const handleUpdateQuantity = (variantId: string, qty: number): void => {
    setPrintQuantities((prev) => ({
      ...prev,
      [variantId]: Math.max(0, qty),
    }))
  }

  // Label dimensions state (presets: 40x30mm, 50x25mm, 58x40mm)
  const [labelSize, setLabelSize] = useState<'40x30' | '50x25' | '58x40'>('40x30')

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
      '40x30': { page: '40mm 30mm', width: '36mm', height: '26mm' },
      '50x25': { page: '50mm 25mm', width: '46mm', height: '21mm' },
      '58x40': { page: '58mm 40mm', width: '54mm', height: '36mm' },
    }
    const dim = sizeDimensions[labelSize] || sizeDimensions['40x30']

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
            font-size: 11px; 
            font-weight: 900; 
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
        message: `تم توليد ${totalCount} ملصق باركود حقيقي لمقاسات "${selectedProduct.product_name}" بنجاح! 🖨️`,
        variant: 'success',
      })
    }
  }

  // Calculate total labels for current selected product
  const currentTotalLabels = selectedProduct
    ? selectedProduct.variants.reduce((acc, v) => acc + (printQuantities[v.id] ?? 0), 0)
    : 0

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  return (
    <div className="min-h-screen p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none dark:bg-slate-950">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
            title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
          >
            <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">
            {t('طباعة بطاقات الأسعار والباركود للملابس (Price Tags)')}
          </h1>
        </div>
      </div>

      {/* Top Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-layered-sm">
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

      {/* Main Grid: Left Products List, Right Variant Breakdown & Print */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Products List Picker (Left Column) */}
        <div className="lg:col-span-5 space-y-3">
          <p className="text-xs font-bold text-text-secondary flex items-center gap-1.5 px-1">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>اختر المنتج لطباعة تيكيتات مقاساته وألوانه:</span>
          </p>

          <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="p-8 text-center text-xs font-bold text-text-tertiary">
                جاري تحميل المنتجات...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 text-xs font-bold text-text-tertiary">
                لا تتوفر منتجات تطابق البحث
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const isSelected = prod.product_id === selectedProductId
                const totalStock = prod.variants.reduce((acc, v) => acc + v.current_stock, 0)

                return (
                  <button
                    key={prod.product_id}
                    onClick={() => setSelectedProductId(prod.product_id)}
                    className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-accent/10 border-accent ring-2 ring-accent/20 shadow-layered-sm'
                        : 'bg-white dark:bg-slate-900 border-gray-200/80 dark:border-slate-800 hover:border-accent/40 hover:bg-gray-50/80 dark:hover:bg-slate-800/80 shadow-layered-sm'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black text-text-primary">{prod.product_name}</h4>
                      <p className="text-[10px] font-bold text-text-tertiary mt-0.5">
                        {prod.category_name ? t(prod.category_name) : t('بدون فئة')} • {prod.variants.length} {t('خيارات')}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                        totalStock > 0
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-danger/10 text-danger border-danger/20'
                      }`}
                    >
                      {totalStock} {t('قطعة بالمخزون')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Selected Product Breakdown & Print Config (Right Column) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedProduct ? (
            <Card className="p-6 space-y-6 border border-gray-200/80 shadow-layered">
              {/* Selected Product Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-accent/10 text-accent px-2.5 py-0.5 rounded-full text-[10px] font-extrabold mb-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{t('طباعة التيكيتات لجميع الخيارات بالتسلسل')}</span>
                  </div>
                  <h2 className="text-base font-black text-text-primary">
                    {selectedProduct.product_name}
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={labelSize}
                    onChange={(e) => setLabelSize(e.target.value as '40x30' | '50x25' | '58x40')}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="40x30">40×30 مم (Standard Tag)</option>
                    <option value="50x25">50×25 مم (Compact Tag)</option>
                    <option value="58x40">58×40 مم (Large Tag)</option>
                  </select>

                  <button
                    onClick={handlePrintProductLabels}
                    className="px-5 py-3 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{t('طباعة باركود حقيقي')} ({currentTotalLabels})</span>
                  </button>
                </div>
              </div>

              {/* Variants Table */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-text-secondary">
                  {t('حدد عدد الملصقات لكل مقاس ولون:')}
                </p>

                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {selectedProduct.variants.map((variant) => {
                    const printCount = printQuantities[variant.id] ?? 0

                    return (
                      <div
                        key={variant.id}
                        className="bg-gray-50/80 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-gray-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-text-primary">
                              {variant.size ? `${t('مقاس:')} ${variant.size}` : t('مقاس عادي')} 
                              {variant.color ? ` | ${t('لون:')} ${variant.color}` : ''}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-text-tertiary bg-white px-2 py-0.5 rounded-md border border-gray-200">
                              {variant.barcode ?? t('بدون باركود')}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-text-secondary">
                            السعر: {formatCurrency(variant.price_dzd)} • المخزون الحالي: {variant.current_stock} قطعة
                          </p>
                        </div>

                        {/* Label Count Input */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-bold text-text-tertiary">العدد:</span>
                          <input
                            type="number"
                            min="0"
                            max="500"
                            value={printCount}
                            onChange={(e) =>
                              handleUpdateQuantity(variant.id, Number.parseInt(e.target.value, 10) || 0)
                            }
                            className="w-20 px-3 py-1.5 rounded-xl text-xs font-black font-mono bg-white border border-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tag Preview Box */}
              <div className="bg-gray-100/70 rounded-2xl p-4 border border-gray-200 flex flex-col items-center justify-center text-center">
                <p className="text-[11px] font-bold text-text-tertiary mb-2 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-accent" />
                  <span>معاينة نموذج البطاقة الحرارية (40mm × 30mm)</span>
                </p>

                {selectedProduct.variants[0] && (
                  <div className="w-[180px] h-[130px] bg-white rounded-xl border-2 border-dashed border-gray-400 p-2.5 shadow-sm flex flex-col items-center justify-between">
                    <p className="font-extrabold text-[10px] text-text-primary truncate w-full">
                      {selectedProduct.product_name}
                    </p>
                    <p className="text-[8px] font-bold text-text-secondary">
                      {selectedProduct.variants[0].size ? `مقاس: ${selectedProduct.variants[0].size}` : ''}
                      {selectedProduct.variants[0].color ? ` | لون: ${selectedProduct.variants[0].color}` : ''}
                    </p>
                    <div className="font-mono text-[9px] font-bold tracking-widest border-y border-black w-full py-0.5 my-0.5">
                      ||||||||||||||||||||||<br />
                      {selectedProduct.variants[0].barcode ?? '690123456789'}
                    </div>
                    <p className="font-black text-xs text-text-primary">
                      {formatCurrency(selectedProduct.variants[0].price_dzd)}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-xs font-bold text-text-tertiary border border-gray-200/80">
              اختر منتجاً من القائمة الجانبية لعرض وتوليد ملصقات التيكيتات.
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
