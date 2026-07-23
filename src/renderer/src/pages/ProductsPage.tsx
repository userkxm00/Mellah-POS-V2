import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Input, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { AddProductPage } from '@/pages/AddProductPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { CategoriesModal } from '@/components/products/CategoriesModal'
import { useToastStore } from '@/stores/toastStore'

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

  const addToast = useToastStore((s) => s.addToast)

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      // Fetch categories
      const catRows = await window.electron.db.query<CategoryItem>(
        'SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name'
      )
      setCategories(catRows)

      // Fetch products with variant count and total stock derived from stock_movements ledger
      const prodRows = await window.electron.db.query<ProductRow>(
        `SELECT 
           p.id, p.name, p.price_dzd, p.cost_dzd, p.category_id,
           c.name as category_name,
           COUNT(DISTINCT v.id) as variant_count,
           COALESCE(SUM(sm.quantity_change), 0) as total_stock
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
         LEFT JOIN stock_movements sm ON sm.variant_id = v.id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.updated_at DESC`
      )
      setProducts(prodRows)
    } catch {
      addToast({ message: 'فشل تحميل المنتجات', variant: 'error' })
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
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      q === '' ||
      p.name.toLowerCase().includes(q) ||
      (p.category_name && p.category_name.toLowerCase().includes(q))

    return matchesCat && matchesSearch
  })

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'المنتج',
      render: (row) => (
        <div>
          <p className="font-bold text-text-primary text-sm">{row.name}</p>
          <p className="text-xs text-text-tertiary">{row.category_name ?? 'بدون فئة'}</p>
        </div>
      ),
    },
    {
      key: 'price_dzd',
      header: 'السعر الافتراضي',
      render: (row) => <span className="currency font-bold text-accent">{formatCurrency(row.price_dzd)}</span>,
    },
    {
      key: 'variant_count',
      header: 'عدد الخيارات',
      render: (row) => (
        <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-text-secondary text-xs font-semibold">
          {row.variant_count} خيارات
        </span>
      ),
    },
    {
      key: 'total_stock',
      header: 'إجمالي المخزون (Ledger)',
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
            row.total_stock <= 0
              ? 'bg-danger-light text-danger'
              : row.total_stock < 10
                ? 'bg-warning-light text-warning'
                : 'bg-success-light text-success'
          }`}
        >
          {row.total_stock} قطعة
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
          onClick={() => {
            setSelectedProductId(row.id)
            setView('detail')
          }}
        >
          🔍 التفاصيل وتعديل المخزون
        </Button>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onNavigateToPos}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← العودة لنقطة البيع (POS)
          </button>
          <h1 className="text-2xl font-bold text-text-primary">إدارة المنتجات والمخزون</h1>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setIsCategoriesModalOpen(true)}>
            📁 إدارة الفئات
          </Button>
          <Button variant="primary" onClick={() => setView('add')}>
            + إضافة منتج جديد
          </Button>
        </div>
      </div>

      {/* Catalog Filters & Search */}
      <Card padding="compact" className="flex flex-col gap-3">
        <Input
          placeholder="ابحث باسم المنتج أو الفئة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-gray-50/80"
        />

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 btn-press whitespace-nowrap ${
              selectedCategoryId === null
                ? 'bg-accent text-white border-accent shadow-ambient-sm'
                : 'bg-white text-text-secondary border-border hover:bg-gray-50'
            }`}
            onClick={() => setSelectedCategoryId(null)}
          >
            الكل ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 btn-press whitespace-nowrap ${
                selectedCategoryId === c.id
                  ? 'bg-accent text-white border-accent shadow-ambient-sm'
                  : 'bg-white text-text-secondary border-border hover:bg-gray-50'
              }`}
              onClick={() => setSelectedCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Products Table */}
      <Card padding="compact">
        <Table
          columns={columns}
          data={filteredProducts}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد منتجات مسجلة حالياً"
        />
      </Card>

      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        onCategoryChanged={loadProducts}
      />
    </div>
  )
}
