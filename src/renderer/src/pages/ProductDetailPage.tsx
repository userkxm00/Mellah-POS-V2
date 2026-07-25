import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Edit3, Trash2, Plus, Save, X, History } from 'lucide-react'
import { Card, Button, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { StockAdjustmentModal } from '@/components/products/StockAdjustmentModal'
import { useToastStore } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { generateUUID } from '@/lib/uuid'
import { recordAuditLog } from '@/services/auditLogService'
import type { ProductVariantWithStock } from '@/types/database'

interface ProductDetailData {
  id: string
  name: string
  description: string | null
  category_id: string | null
  category_name: string | null
  price_dzd: number
  cost_dzd: number | null
  image_url: string | null
  variants: ProductVariantWithStock[]
}

interface StockMovementRow {
  id: string
  variant_id: string
  type: string
  quantity_change: number
  note: string | null
  created_by_name: string | null
  created_at: string
  size: string | null
  color: string | null
}

interface CategoryOption {
  id: string
  name: string
}

interface ProductDetailPageProps {
  productId: string
  onBack: () => void
}

export function ProductDetailPage({
  productId,
  onBack,
}: ProductDetailPageProps): React.JSX.Element {
  const [product, setProduct] = useState<ProductDetailData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [selectedVariantForAdj, setSelectedVariantForAdj] = useState<{
    id: string
    title: string
  } | null>(null)

  // Edit product state
  const [isEditMode, setIsEditMode] = useState<boolean>(false)
  const [editName, setEditName] = useState<string>('')
  const [editDescription, setEditDescription] = useState<string>('')
  const [editPrice, setEditPrice] = useState<string>('')
  const [editCost, setEditCost] = useState<string>('')
  const [editCategoryId, setEditCategoryId] = useState<string>('')
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // Add variant state
  const [isAddVariantOpen, setIsAddVariantOpen] = useState<boolean>(false)
  const [newSize, setNewSize] = useState<string>('')
  const [newColor, setNewColor] = useState<string>('')
  const [newBarcode, setNewBarcode] = useState<string>('')
  const [newVariantPrice, setNewVariantPrice] = useState<string>('')
  const [isAddingVariant, setIsAddingVariant] = useState<boolean>(false)

  // Stock movements history
  const [stockMovements, setStockMovements] = useState<StockMovementRow[]>([])
  const [isMovementsOpen, setIsMovementsOpen] = useState<boolean>(false)
  const [isLoadingMovements, setIsLoadingMovements] = useState<boolean>(false)

  // Delete confirmation
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadProductDetail = useCallback(async () => {
    setIsLoading(true)
    try {
      const activeBranch = useAuthStore.getState().currentBranch
      const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

      const prods = await window.electron.db.query<{
        id: string
        name: string
        description: string | null
        category_id: string | null
        category_name: string | null
        price_dzd: number
        cost_dzd: number | null
        image_url: string | null
      }>(
        `SELECT p.id, p.name, p.description, p.price_dzd, p.cost_dzd, p.image_url, p.category_id, c.name as category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ? AND p.branch_id = ? AND p.deleted_at IS NULL`,
        [productId, branchId]
      )

      if (prods.length === 0) {
        addToast({ message: 'المنتج غير موجود في الفرع الحالي', variant: 'error' })
        onBack()
        return
      }

      const p = prods[0]

      const variants = await window.electron.db.query<ProductVariantWithStock>(
        `SELECT v.*, COALESCE(SUM(sm.quantity_change), 0) as current_stock
         FROM product_variants v
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id AND sm.branch_id = ?
         WHERE v.product_id = ? AND v.branch_id = ? AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.size, v.color`,
        [branchId, productId, branchId]
      )

      setProduct({ ...p, variants })
    } catch {
      addToast({ message: 'فشل تحميل تفاصيل المنتج', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [productId, onBack, addToast])

  const loadCategories = useCallback(async () => {
    try {
      const activeBranch = useAuthStore.getState().currentBranch
      const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

      const rows = await window.electron.db.query<CategoryOption>(
        `SELECT id, name FROM categories WHERE branch_id = ? AND deleted_at IS NULL ORDER BY name`,
        [branchId]
      )
      setCategories(rows)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadProductDetail()
    loadCategories()
  }, [loadProductDetail, loadCategories])

  // Enter edit mode
  const handleStartEdit = (): void => {
    if (!product) return
    setEditName(product.name)
    setEditDescription(product.description ?? '')
    setEditPrice(String(product.price_dzd))
    setEditCost(product.cost_dzd ? String(product.cost_dzd) : '')
    setEditCategoryId(product.category_id ?? '')
    setIsEditMode(true)
  }

  // Save product edits
  const handleSaveEdit = async (): Promise<void> => {
    if (!product || !editName.trim()) return
    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        `UPDATE products SET name = ?, description = ?, price_dzd = ?, cost_dzd = ?, category_id = ?, updated_at = ? WHERE id = ?`,
        [
          editName.trim(),
          editDescription.trim() || null,
          parseFloat(editPrice) || product.price_dzd,
          editCost ? parseFloat(editCost) : null,
          editCategoryId || null,
          now,
          product.id,
        ]
      )
      addToast({ message: 'تم تحديث بيانات المنتج بنجاح ✅', variant: 'success' })
      recordAuditLog('product_updated', 'products', `تعديل المنتج: ${editName.trim()}`, product.id).catch(() => {})
      setIsEditMode(false)
      await loadProductDetail()
    } catch {
      addToast({ message: 'فشل حفظ التعديلات', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // Delete product (soft delete)
  const handleDeleteProduct = async (): Promise<void> => {
    if (!product) return
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        `UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, product.id]
      )
      // Also soft-delete all variants
      await window.electron.db.execute(
        `UPDATE product_variants SET deleted_at = ? WHERE product_id = ?`,
        [now, product.id]
      )
      addToast({ message: `تم حذف المنتج "${product.name}" ✅`, variant: 'success' })
      recordAuditLog('product_deleted', 'products', `حذف المنتج: ${product.name}`, product.id).catch(() => {})
      onBack()
    } catch {
      addToast({ message: 'فشل حذف المنتج', variant: 'error' })
    }
  }

  // Add new variant
  const handleAddVariant = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!product) return
    setIsAddingVariant(true)
    try {
      const variantId = generateUUID()
      const now = new Date().toISOString()
      const branchId = useAuthStore.getState().currentBranch?.id ?? DEFAULT_BRANCH_ID

      await window.electron.db.execute(
        `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          variantId,
          product.id,
          branchId,
          newSize.trim() || null,
          newColor.trim() || null,
          newBarcode.trim() || null,
          newVariantPrice ? parseFloat(newVariantPrice) : null,
          now,
          now,
        ]
      )
      addToast({ message: 'تم إضافة خيار جديد للمنتج ✅', variant: 'success' })
      setIsAddVariantOpen(false)
      setNewSize('')
      setNewColor('')
      setNewBarcode('')
      setNewVariantPrice('')
      await loadProductDetail()
    } catch {
      addToast({ message: 'فشل إضافة الخيار — تأكد من عدم تكرار الباركود', variant: 'error' })
    } finally {
      setIsAddingVariant(false)
    }
  }

  // Load stock movements history
  const handleOpenMovements = async (): Promise<void> => {
    if (!product) return
    setIsMovementsOpen(true)
    setIsLoadingMovements(true)
    try {
      const rows = await window.electron.db.query<StockMovementRow>(
        `SELECT sm.id, sm.variant_id, sm.type, sm.quantity_change, sm.note, sm.created_at,
                u.full_name as created_by_name, v.size, v.color
         FROM stock_movements sm
         LEFT JOIN users u ON u.id = sm.created_by
         LEFT JOIN product_variants v ON v.id = sm.variant_id
         WHERE sm.variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)
         ORDER BY sm.created_at DESC
         LIMIT 100`,
        [product.id]
      )
      setStockMovements(rows)
    } catch {
      addToast({ message: 'فشل تحميل سجل حركات المخزون', variant: 'error' })
    } finally {
      setIsLoadingMovements(false)
    }
  }

  if (isLoading || !product) {
    return (
      <div className="p-8 text-center">
        <div className="skeleton h-8 w-1/3 rounded mx-auto mb-4" />
        <div className="skeleton h-48 w-full rounded" />
      </div>
    )
  }

  const profitMargin = product.cost_dzd ? product.price_dzd - product.cost_dzd : null
  const totalStock = product.variants.reduce((acc, v) => acc + v.current_stock, 0)

  const movementTypeLabel = (type: string): string => {
    switch (type) {
      case 'sale': return '🛒 بيع'
      case 'restock': return '📦 إعادة تخزين'
      case 'adjustment': return '⚙️ تعديل يدوي'
      case 'return': return '↩️ مرتجع'
      default: return type
    }
  }

  const variantColumns: Column<ProductVariantWithStock>[] = [
    {
      key: 'size',
      header: 'المقاس',
      render: (row) => <span className="font-semibold">{row.size ?? 'عام'}</span>,
    },
    {
      key: 'color',
      header: 'اللون',
      render: (row) => <span className="font-semibold">{row.color ?? 'عام'}</span>,
    },
    {
      key: 'barcode',
      header: 'الباركود',
      render: (row) => <span className="font-mono text-xs text-text-secondary">{row.barcode ?? '-'}</span>,
    },
    {
      key: 'price_dzd',
      header: 'السعر الخاص',
      render: (row) => (
        <span className="currency font-bold text-accent">
          {row.price_dzd ? formatCurrency(row.price_dzd) : `افتراضي (${formatCurrency(product.price_dzd)})`}
        </span>
      ),
    },
    {
      key: 'current_stock',
      header: 'المخزون الحالي (Ledger)',
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
            row.current_stock <= 0
              ? 'bg-danger-light text-danger'
              : row.current_stock <= 5
                ? 'bg-danger-light text-danger'
                : row.current_stock <= 10
                  ? 'bg-warning-light text-warning'
                  : 'bg-success-light text-success'
          }`}
        >
          {row.current_stock} وحدة
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'left',
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setSelectedVariantForAdj({
              id: row.id,
              title: `${product.name} (${row.size ?? ''} ${row.color ?? ''})`,
            })
          }
        >
          ⚙️ تعديل المخزون
        </Button>
      ),
    },
  ]

  const movementColumns: Column<StockMovementRow>[] = [
    {
      key: 'created_at',
      header: 'التاريخ',
      render: (row) => (
        <span className="text-xs font-mono text-text-secondary">
          {new Date(row.created_at).toLocaleString('ar-DZ')}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'النوع',
      render: (row) => <span className="text-xs font-bold">{movementTypeLabel(row.type)}</span>,
    },
    {
      key: 'variant_id',
      header: 'الخيار',
      render: (row) => (
        <span className="text-xs font-semibold text-text-secondary">
          {row.size ?? 'عام'} / {row.color ?? 'عام'}
        </span>
      ),
    },
    {
      key: 'quantity_change',
      header: 'الكمية',
      render: (row) => (
        <span className={`font-black text-sm ${row.quantity_change > 0 ? 'text-success' : 'text-danger'}`}>
          {row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'ملاحظة',
      render: (row) => <span className="text-xs text-text-tertiary">{row.note ?? '-'}</span>,
    },
    {
      key: 'id',
      header: 'بواسطة',
      render: (row) => <span className="text-xs text-text-tertiary">{row.created_by_name ?? 'النظام'}</span>,
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            <ArrowRight className="w-3 h-3" /> العودة لقائمة المنتجات
          </button>
          {isEditMode ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-extrabold"
              placeholder="اسم المنتج"
            />
          ) : (
            <h1 className="text-2xl font-extrabold text-text-primary">{product.name}</h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <Button size="sm" variant="primary" onClick={handleSaveEdit} disabled={isSaving}>
                <Save className="w-4 h-4 ml-1" /> حفظ التعديلات
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setIsEditMode(false)}>
                <X className="w-4 h-4 ml-1" /> إلغاء
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={handleStartEdit}>
                <Edit3 className="w-4 h-4 ml-1" /> تعديل المنتج
              </Button>
              <Button size="sm" variant="secondary" onClick={handleOpenMovements}>
                <History className="w-4 h-4 ml-1" /> سجل الحركات
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setIsDeleteConfirmOpen(true)}>
                <Trash2 className="w-4 h-4 ml-1 text-danger" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Mode: Additional Fields */}
      {isEditMode && (
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="سعر البيع (دج)"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            />
            <Input
              label="سعر التكلفة (دج)"
              type="number"
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">الفئة</label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border-light bg-white text-sm font-semibold text-text-primary focus:ring-2 focus:ring-accent/30"
              >
                <option value="">— بدون فئة —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="الوصف"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="وصف مختصر للمنتج"
            />
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-text-tertiary mb-1">سعر البيع الافتراضي</p>
          <p className="currency-lg text-accent">{formatCurrency(product.price_dzd)}</p>
        </Card>
        <Card>
          <p className="text-xs text-text-tertiary mb-1">سعر التكلفة</p>
          <p className="currency-lg text-text-secondary">
            {product.cost_dzd ? formatCurrency(product.cost_dzd) : '-'}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-text-tertiary mb-1">هامش الربح المتوقع</p>
          <p
            className={`currency-lg ${
              profitMargin && profitMargin > 0 ? 'text-success' : 'text-text-primary'
            }`}
          >
            {profitMargin ? formatCurrency(profitMargin) : '-'}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-text-tertiary mb-1">إجمالي المخزون (جميع الخيارات)</p>
          <p className="currency-lg text-text-primary">{totalStock} قطعة</p>
        </Card>
      </div>

      {/* Variants Table */}
      <Card padding="compact">
        <div className="px-3 py-3 border-b border-border-light flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">
            خيارات المنتج والمخزون ({product.variants.length} خيار)
          </h2>
          <Button size="sm" variant="secondary" onClick={() => setIsAddVariantOpen(true)}>
            <Plus className="w-4 h-4 ml-1" /> إضافة خيار جديد
          </Button>
        </div>

        <Table
          columns={variantColumns}
          data={product.variants}
          rowKey={(row) => row.id}
        />
      </Card>

      <StockAdjustmentModal
        isOpen={selectedVariantForAdj !== null}
        variantId={selectedVariantForAdj?.id ?? null}
        variantTitle={selectedVariantForAdj?.title ?? ''}
        onClose={() => setSelectedVariantForAdj(null)}
        onSuccess={loadProductDetail}
      />

      {/* Add Variant Modal */}
      <Modal isOpen={isAddVariantOpen} onClose={() => setIsAddVariantOpen(false)} title="➕ إضافة خيار جديد (مقاس/لون)">
        <form onSubmit={handleAddVariant} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="المقاس" placeholder="مثال: XL" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
            <Input label="اللون" placeholder="مثال: أسود" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="الباركود" placeholder="اختياري" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} />
            <Input label="سعر خاص (اختياري)" type="number" placeholder="يترك فارغ = سعر المنتج" value={newVariantPrice} onChange={(e) => setNewVariantPrice(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isAddingVariant} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press">
              حفظ الخيار
            </button>
            <button type="button" onClick={() => setIsAddVariantOpen(false)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Movements History Modal */}
      <Modal isOpen={isMovementsOpen} onClose={() => setIsMovementsOpen(false)} title="📦 سجل حركات المخزون" size="lg">
        <div className="max-h-96 overflow-y-auto">
          {isLoadingMovements ? (
            <p className="text-xs text-center py-6 text-text-tertiary font-bold">جاري التحميل...</p>
          ) : stockMovements.length === 0 ? (
            <p className="text-xs text-center py-6 text-text-tertiary font-bold">لا توجد حركات مخزون لهذا المنتج بعد.</p>
          ) : (
            <Table columns={movementColumns} data={stockMovements} rowKey={(row) => row.id} />
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="⚠️ تأكيد حذف المنتج" size="sm">
        <div className="space-y-4 text-center">
          <p className="text-sm text-text-secondary font-bold">
            هل أنت متأكد من حذف المنتج <span className="text-danger font-black">"{product.name}"</span>؟
          </p>
          <p className="text-xs text-text-tertiary">سيتم أرشفة المنتج ولن يظهر في قائمة المنتجات أو نقطة البيع.</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDeleteProduct}
              className="flex-1 py-3 rounded-xl bg-danger text-white text-sm font-bold shadow-ambient btn-press"
            >
              🗑️ نعم، احذف المنتج
            </button>
            <button
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
