import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { StockAdjustmentModal } from '@/components/products/StockAdjustmentModal'
import { useToastStore } from '@/stores/toastStore'
import type { ProductVariantWithStock } from '@/types/database'

interface ProductDetailData {
  id: string
  name: string
  description: string | null
  category_name: string | null
  price_dzd: number
  cost_dzd: number | null
  variants: ProductVariantWithStock[]
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

  const addToast = useToastStore((s) => s.addToast)

  const loadProductDetail = useCallback(async () => {
    setIsLoading(true)
    try {
      // 1. Fetch Product
      const prods = await window.electron.db.query<{
        id: string
        name: string
        description: string | null
        category_name: string | null
        price_dzd: number
        cost_dzd: number | null
      }>(
        `SELECT p.id, p.name, p.description, p.price_dzd, p.cost_dzd, c.name as category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ? AND p.deleted_at IS NULL`,
        [productId]
      )

      if (prods.length === 0) {
        addToast({ message: 'المنتج غير موجود', variant: 'error' })
        onBack()
        return
      }

      const p = prods[0]

      // 2. Fetch Product Variants with stock from stock_movements ledger
      const variants = await window.electron.db.query<ProductVariantWithStock>(
        `SELECT v.*, COALESCE(SUM(sm.quantity_change), 0) as current_stock
         FROM product_variants v
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id
         WHERE v.product_id = ? AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.size, v.color`,
        [productId]
      )

      setProduct({
        ...p,
        variants,
      })
    } catch (err) {
      addToast({ message: 'فشل تحميل تفاصيل المنتج', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [productId, onBack, addToast])

  useEffect(() => {
    loadProductDetail()
  }, [loadProductDetail])

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
              : row.current_stock < 5
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← العودة لقائمة المنتجات
          </button>
          <h1 className="text-2xl font-extrabold text-text-primary">{product.name}</h1>
        </div>
      </div>

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
    </div>
  )
}
