import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRight,
  Plus,
  FolderEdit,
  Search,
  Eye,
  Package,
  SlidersHorizontal,
  FileText,
  AlertTriangle,
  ShoppingCart
} from 'lucide-react'
import { Card, Button, Input, Table, Modal } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { exportInventoryToCSV } from '@/services/exportService'
import { fetchLowStockVariants, type LowStockVariant } from '@/services/productService'
import { AddProductPage } from '@/pages/AddProductPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { CategoriesModal } from '@/components/products/CategoriesModal'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useAuthStore } from '@/stores/authStore'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'

interface ProductRow {
  id: string
  name: string
  category_name: string | null
  category_id: string | null
  price_dzd: number
  cost_dzd: number | null
  variant_count: number
  total_stock: number
}

interface CategoryItem {
  id: string
  name: string
}

export function ProductsPage({ onNavigateToPos }: { onNavigateToPos: () => void }): React.JSX.Element {
  const [view, setView] = useState<'list' | 'add' | 'detail'>('list')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState<boolean>(false)
  const [isAutoReorderModalOpen, setIsAutoReorderModalOpen] = useState<boolean>(false)
  const [lowStockVariants, setLowStockVariants] = useState<LowStockVariant[]>([])
  const [isFilterLowStockOnly, setIsFilterLowStockOnly] = useState<boolean>(false)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Bulk Price Update State
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState<boolean>(false)
  const [bulkCatId, setBulkCatId] = useState<string>('')
  const [bulkAdjustmentType, setBulkAdjustmentType] = useState<'percent' | 'fixed'>('percent')
  const [bulkAdjustmentVal, setBulkAdjustmentVal] = useState<number>(0)
  const [isBulkSaving, setIsBulkSaving] = useState<boolean>(false)

  // CSV Import Input Ref
  const csvImportInputRef = useRef<HTMLInputElement>(null)

  const addToast = useToastStore((s) => s.addToast)
  const t = useLanguageStore((s) => s.t)

  const handleOpenAutoReorder = async (): Promise<void> => {
    try {
      const items = await fetchLowStockVariants()
      setLowStockVariants(items)
      if (items.length === 0) {
        addToast({ message: 'ممتاز! لا توجد أي سلع منخفضة المخزون حالياً', variant: 'success' })
        return
      }
      setIsAutoReorderModalOpen(true)
    } catch {
      addToast({ message: 'فشل فحص المنتجات ناقصة المخزون', variant: 'error' })
    }
  }

  const handleCSVFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const content = event.target?.result as string
      if (content) {
        try {
          const { importProductsFromCSV } = await import('@/services/csvProductImport')
          const count = await importProductsFromCSV(content)
          addToast({ message: `تمت عملية استيراد ${count} منتج بنجاح من ملف CSV! 📦`, variant: 'success' })
          await loadProducts()
        } catch (err) {
          addToast({ message: (err as Error).message, variant: 'error' })
        }
      }
    }
    reader.readAsText(file)
  }

  const handleExecuteBulkPriceUpdate = async (): Promise<void> => {
    if (bulkAdjustmentVal === 0) {
      addToast({ message: 'يرجى إدخال قيمة التعديل (أكبر أو أقل من 0)', variant: 'warning' })
      return
    }

    setIsBulkSaving(true)
    try {
      const now = new Date().toISOString()
      let whereClause = 'WHERE deleted_at IS NULL'
      const params: unknown[] = []

      if (bulkCatId) {
        whereClause += ' AND category_id = ?'
        params.push(bulkCatId)
      }

      if (bulkAdjustmentType === 'percent') {
        const factor = 1 + bulkAdjustmentVal / 100.0
        await window.electron.db.execute(
          `UPDATE products SET price_dzd = ROUND(price_dzd * ?, 2), updated_at = ? ${whereClause}`,
          [factor, now, ...params]
        )
      } else {
        await window.electron.db.execute(
          `UPDATE products SET price_dzd = MAX(0, price_dzd + ?), updated_at = ? ${whereClause}`,
          [bulkAdjustmentVal, now, ...params]
        )
      }

      addToast({ message: 'تم تحديث أسعار المنتجات المحددة بنجاح! 🏷️', variant: 'success' })
      setIsBulkPriceModalOpen(false)
      setBulkAdjustmentVal(0)
      await loadProducts()
    } catch {
      addToast({ message: 'فشل التعديل الجماعي لأسعار المنتجات', variant: 'error' })
    } finally {
      setIsBulkSaving(false)
    }
  }

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const activeBranch = useAuthStore.getState().currentBranch
      const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

      const catRows = await window.electron.db.query<CategoryItem>(
        'SELECT id, name FROM categories WHERE branch_id = ? AND deleted_at IS NULL ORDER BY name',
        [branchId]
      )
      setCategories(catRows)

      const prodRows = await window.electron.db.query<ProductRow>(
        `SELECT 
           p.id, p.name, p.price_dzd, p.cost_dzd, p.category_id,
           c.name as category_name,
           COUNT(DISTINCT v.id) as variant_count,
           COALESCE(SUM(sm.quantity_change), 0) as total_stock
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants v ON v.product_id = p.id AND v.branch_id = ? AND v.deleted_at IS NULL
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id AND sm.branch_id = ?
         WHERE p.branch_id = ? AND p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
        [branchId, branchId, branchId]
      )
      setProducts(prodRows)
    } catch {
      addToast({ message: 'فشل تحميل المنتجات للفرع الحالي', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (view === 'list') {
      loadProducts()
    }
  }, [view, loadProducts])

  if (view === 'add') {
    return (
      <AddProductPage
        onBack={() => setView('list')}
        onSuccess={() => setView('list')}
      />
    )
  }

  if (view === 'detail' && selectedProductId) {
    return (
      <ProductDetailPage
        productId={selectedProductId}
        onBack={() => {
          setSelectedProductId(null)
          setView('list')
        }}
      />
    )
  }

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategoryId ? p.category_id === selectedCategoryId : true
    const matchesLowStock = isFilterLowStockOnly ? p.total_stock <= 5 : true
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      q === '' ||
      p.name.toLowerCase().includes(q) ||
      (p.category_name && p.category_name.toLowerCase().includes(q))

    return matchesCat && matchesLowStock && matchesSearch
  })

  const handleSort = (key: string): void => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const valA = a[sortKey as keyof ProductRow] ?? ''
    const valB = b[sortKey as keyof ProductRow] ?? ''

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: t('المنتج'),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/10 text-accent border border-accent/20">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <p className="font-extrabold text-[#1C2B3A] dark:text-slate-100 text-sm">{row.name}</p>
            <p className="text-xs font-semibold text-[#6B7A8D] dark:text-slate-400">{row.category_name ?? t('بدون فئة')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price_dzd',
      header: t('السعر الافتراضي'),
      sortable: true,
      render: (row) => <span className="currency font-black text-accent">{formatCurrency(row.price_dzd)}</span>,
    },
    {
      key: 'variant_count',
      header: t('عدد الخيارات'),
      sortable: true,
      render: (row) => (
        <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-[#6B7A8D] dark:text-slate-300 text-xs font-bold border border-gray-200/60 dark:border-slate-700">
          {row.variant_count} {t('خيارات')}
        </span>
      ),
    },
    {
      key: 'total_stock',
      header: t('إجمالي المخزون'),
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border ${
            row.total_stock <= 0
              ? 'bg-danger/10 text-danger border-danger/20'
              : row.total_stock <= 5
                ? 'bg-warning/10 text-warning border-warning/20'
                : 'bg-success/10 text-success border-success/20'
          }`}
        >
          {row.total_stock <= 0 ? t('نفد (0)') : `${row.total_stock} ${t('قطعة')}`}
        </span>
      ),
    },
    {
      key: 'id',
      header: t('الإجراءات'),
      align: 'left',
      render: (row) => (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex justify-end">
          <button
            onClick={() => {
              setSelectedProductId(row.id)
              setView('detail')
            }}
            aria-label="عرض التفاصيل والجرد"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-200 text-xs font-bold shadow-layered-sm hover:border-accent hover:text-accent transition-all btn-press"
          >
            <Eye className="w-3.5 h-3.5 text-accent" />
            <span>التفاصيل والجرد</span>
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12 select-none">
      {/* Hidden CSV File Input */}
      <input
        type="file"
        ref={csvImportInputRef}
        accept=".csv"
        onChange={handleCSVFileChange}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => {
              if (onNavigateToPos) {
                onNavigateToPos()
              } else {
                window.close()
              }
            }}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('إغلاق النافذة')}</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary">{t('إدارة المنتجات والمخزون')}</h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => csvImportInputRef.current?.click()}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-xs font-bold shadow-ambient-sm"
          >
            <FileText className="w-4 h-4 text-accent" />
            <span>{t('استيراد CSV')}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setIsBulkPriceModalOpen(true)}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-xs font-bold shadow-ambient-sm"
          >
            <SlidersHorizontal className="w-4 h-4 text-accent" />
            <span>{t('تعديل الأسعار جماعياً')}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const variantsRows = await window.electron.db.query<{
                  barcode: string | null
                  product_name: string
                  category_name: string | null
                  size: string | null
                  color: string | null
                  price_dzd: number
                  current_stock: number
                }>(`
                  SELECT 
                    v.barcode, p.name as product_name, c.name as category_name,
                    v.size, v.color, COALESCE(v.price_dzd, p.price_dzd) as price_dzd,
                    COALESCE(SUM(sm.quantity_change), 0) as current_stock
                  FROM product_variants v
                  JOIN products p ON p.id = v.product_id
                  LEFT JOIN categories c ON c.id = p.category_id
                  LEFT JOIN stock_movements sm ON sm.variant_id = v.id
                  WHERE p.deleted_at IS NULL AND v.deleted_at IS NULL
                  GROUP BY v.id
                `)
                if (variantsRows.length === 0) {
                  addToast({ message: 'لا يوجد مخزون للتصدير حالياً', variant: 'warning' })
                  return
                }
                exportInventoryToCSV(variantsRows)
                addToast({ message: 'تم تصدير تقرير المخزون لملف CSV بنجاح!', variant: 'success' })
              } catch {
                addToast({ message: 'فشل تصدير بيانات المخزون', variant: 'error' })
              }
            }}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-xs font-bold shadow-ambient-sm"
          >
            <FileText className="w-4 h-4" />
            <span>{t('تصدير CSV')}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleOpenAutoReorder}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-2xl text-xs font-bold border-warning/30 bg-warning/5 text-warning shadow-ambient-sm hover:bg-warning/10"
          >
            <ShoppingCart className="w-4 h-4 text-warning" />
            <span>{t('طلب تزود (PO)')}</span>
          </Button>

          <button
            onClick={() => setIsCategoriesModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-gray-200/80 text-text-primary text-xs font-bold shadow-ambient-sm hover:bg-gray-100 transition-all btn-press"
          >
            <FolderEdit className="w-4 h-4 text-text-secondary" />
            <span>{t('الفئات')}</span>
          </button>

          <button
            onClick={() => setView('add')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
          >
            <Plus className="w-4 h-4" />
            <span>{t('إضافة منتج جديد')}</span>
          </button>
        </div>
      </div>

      {/* Catalog Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
              selectedCategoryId === null
                ? 'bg-accent text-white shadow-ambient'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
            }`}
          >
            جميع الفئات ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
                selectedCategoryId === cat.id
                  ? 'bg-accent text-white shadow-ambient'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72 flex items-center gap-2">
          <button
            onClick={() => setIsFilterLowStockOnly((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              isFilterLowStockOnly
                ? 'bg-warning text-white shadow-ambient'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>المنخفض فقط</span>
          </button>

          <Input
            placeholder="ابحث باسم المنتج أو الفئة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-50 border-gray-200 text-xs"
            icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
          />
        </div>
      </div>

      {/* Products Table */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={sortedProducts}
          loading={isLoading}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyType="search"
          emptyMessage="لا توجد منتجات مسجلة تطابق البحث"
        />
      </Card>

      {/* Categories Management Modal */}
      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        onCategoryChanged={loadProducts}
      />

      {/* Auto Reorder PO Modal */}
      <Modal
        isOpen={isAutoReorderModalOpen}
        onClose={() => setIsAutoReorderModalOpen(false)}
        title="📋 اقتراح طلبية التزود الشاملة للموردين (Auto Purchase Order)"
        size="lg"
      >
        <div className="space-y-4 select-none">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-amber-900 space-y-1">
              <p className="font-extrabold text-sm">تنبيه المخزون المنخفض!</p>
              <p>
                السلع والخيارات التالية اقتربت من النفاد أو نفدت بالكامل. قمنا بحساب الكمية المقترحة للشراء تلقائياً للوصول للمستوى الآمن (10 قطع لكل خيار).
              </p>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 font-bold text-text-secondary">
                <tr>
                  <th className="p-3">المنتج والخيار</th>
                  <th className="p-3 font-mono text-[11px]">الباركود</th>
                  <th className="p-3 text-center">المخزون الحالي</th>
                  <th className="p-3 text-center">الحد الأدنى</th>
                  <th className="p-3 text-center">المقترح للشراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lowStockVariants.map((item) => (
                  <tr key={item.variant_id} className="hover:bg-gray-50/50">
                    <td className="p-3">
                      <p className="font-bold text-text-primary">{item.product_name}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {item.size || 'بدون مقاس'} / {item.color || 'بدون لون'}
                      </p>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-text-secondary">{item.barcode || '—'}</td>
                    <td className="p-3 text-center font-bold text-danger">{item.current_stock} قطعة</td>
                    <td className="p-3 text-center text-text-tertiary">{item.min_stock_level} قطعة</td>
                    <td className="p-3 text-center font-black text-accent bg-accent/5 rounded-lg">
                      +{item.suggested_reorder_qty} قطعة
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-text-tertiary font-bold">
              إجمالي المنتجات المطلوب إعادة تزودها: <span className="text-text-primary">{lowStockVariants.length} سلع</span>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsAutoReorderModalOpen(false)}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  exportInventoryToCSV(
                    lowStockVariants.map((item) => ({
                      barcode: item.barcode,
                      product_name: `[طلبية تزود] ${item.product_name}`,
                      category_name: item.category_name,
                      size: item.size,
                      color: item.color,
                      price_dzd: item.price_dzd,
                      current_stock: item.suggested_reorder_qty,
                    }))
                  )
                  addToast({ message: 'تم تصدير قائمة التزود لملف CSV بنجاح للمورد!', variant: 'success' })
                  setIsAutoReorderModalOpen(false)
                }}
                className="flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>تصدير الطلبية لـ Excel (CSV)</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bulk Price Update Modal */}
      <Modal
        isOpen={isBulkPriceModalOpen}
        onClose={() => setIsBulkPriceModalOpen(false)}
        title="🏷️ التعديل الجماعي لأسعار البيع (Bulk Price Update)"
        size="md"
      >
        <div className="space-y-4 select-none">
          <div className="p-3.5 bg-accent/10 border border-accent/20 rounded-2xl text-xs font-bold text-accent">
            يتيح لك هذا الخيار زيادة أو تخفيض أسعار المنتجات دفعة واحدة لجميع المنتجات أو حسب فئة معينة.
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary">اختر الفئة المستهدفة:</label>
            <select
              value={bulkCatId}
              onChange={(e) => setBulkCatId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 border border-gray-200"
            >
              <option value="">جميع الفئات والمنتجات</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">نوع التعديل:</label>
              <select
                value={bulkAdjustmentType}
                onChange={(e) => setBulkAdjustmentType(e.target.value as 'percent' | 'fixed')}
                className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 border border-gray-200"
              >
                <option value="percent">نسبة مئوية (%)</option>
                <option value="fixed">مبلغ ثابت (دج DZD)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">قيمة التعديل (+ للزيادة، - للتخفيض):</label>
              <input
                type="number"
                placeholder="مثلاً: 10 أو -500"
                value={bulkAdjustmentVal || ''}
                onChange={(e) => setBulkAdjustmentVal(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-2xl text-xs font-black bg-gray-50 border border-gray-200"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleExecuteBulkPriceUpdate}
              disabled={isBulkSaving || bulkAdjustmentVal === 0}
              className="flex-1 py-3.5 rounded-2xl bg-accent text-white text-xs font-extrabold shadow-ambient btn-press disabled:opacity-50"
            >
              {isBulkSaving ? 'جاري تحديث الأسعار...' : 'تأكيد وتطبيق التعديل الجماعي'}
            </button>
            <button
              onClick={() => setIsBulkPriceModalOpen(false)}
              className="px-5 py-3.5 rounded-2xl bg-gray-100 text-text-secondary text-xs font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
