import React, { useState } from 'react'
import {
  Button,
  Card,
  Input,
  Modal,
  Table,
  ToastContainer,
  SkeletonCard,
  SkeletonLine,
} from '@/components/ui'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency } from '@/lib/format'
import type { Column } from '@/components/ui'

// ----- Demo data type -----

interface DemoProduct {
  id: string
  name: string
  category: string
  price: number
  stock: number
}

const DEMO_DATA: DemoProduct[] = [
  { id: '1', name: 'تي شيرت نايك', category: 'ملابس رجالية', price: 4500, stock: 23 },
  { id: '2', name: 'جينز ليفايس 501', category: 'ملابس رجالية', price: 8900, stock: 12 },
  { id: '3', name: 'فستان صيفي', category: 'ملابس نسائية', price: 6200, stock: 0 },
  { id: '4', name: 'حذاء رياضي أديداس', category: 'أحذية', price: 12500, stock: 8 },
  { id: '5', name: 'قميص كلاسيك', category: 'ملابس رجالية', price: 3800, stock: 45 },
]

const COLUMNS: Column<DemoProduct>[] = [
  { key: 'name', header: 'المنتج' },
  { key: 'category', header: 'الفئة' },
  {
    key: 'price',
    header: 'السعر',
    render: (row) => (
      <span className="currency text-accent">{formatCurrency(row.price)}</span>
    ),
  },
  {
    key: 'stock',
    header: 'المخزون',
    render: (row) => (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          row.stock === 0
            ? 'bg-danger-light text-danger'
            : row.stock < 10
              ? 'bg-warning-light text-warning'
              : 'bg-success-light text-success'
        }`}
      >
        {row.stock} وحدة
      </span>
    ),
  },
]

// ----- Navigation items -----

interface NavItem {
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'نقطة البيع', icon: '🏪' },
  { label: 'المنتجات', icon: '📦' },
  { label: 'المخزون', icon: '📊' },
  { label: 'المبيعات', icon: '💰' },
  { label: 'التقارير', icon: '📈' },
  { label: 'الإعدادات', icon: '⚙️' },
]

// ----- App Component -----

function App(): React.JSX.Element {
  const [activeNav, setActiveNav] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [buttonLoading, setButtonLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleDemoLoading = (): void => {
    setButtonLoading(true)
    setTimeout(() => setButtonLoading(false), 2000)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ----- Sidebar (glassmorphism) ----- */}
      <aside className="w-64 glass flex flex-col border-l border-border-light">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <h1 className="text-xl font-bold text-accent tracking-tight">MELLAH POS</h1>
          <p className="text-xs text-text-tertiary mt-0.5">نظام نقاط البيع</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.label}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'transition-all duration-200 ease-smooth btn-press',
                activeNav === index
                  ? 'bg-accent text-white shadow-ambient-sm'
                  : 'text-text-secondary hover:bg-white/50 hover:text-text-primary',
              ].join(' ')}
              onClick={() => setActiveNav(index)}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-bold">
              م
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">محمد الكاشير</p>
              <p className="text-xs text-text-tertiary">كاشير</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ----- Main Content ----- */}
      <main className="flex-1 overflow-auto">
        {/* Top toolbar (glass) */}
        <header className="sticky top-0 z-10 glass border-b border-border-light px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {NAV_ITEMS[activeNav].label}
              </h2>
              <p className="text-xs text-text-tertiary">عرض مكونات نظام التصميم</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-light">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-medium text-success">متصل</span>
              </div>
              <span className="text-xs text-text-tertiary">AR / FR</span>
            </div>
          </div>
        </header>

        {/* Content area */}
        <div className="p-6 space-y-6">
          {/* ----- Buttons Section ----- */}
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">الأزرار</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleDemoLoading} loading={buttonLoading}>
                زر رئيسي
              </Button>
              <Button variant="secondary">زر ثانوي</Button>
              <Button variant="danger">زر خطر</Button>
              <Button variant="ghost">زر شفاف</Button>
              <Button variant="primary" size="sm">
                صغير
              </Button>
              <Button variant="primary" size="lg">
                كبير
              </Button>
              <Button variant="primary" disabled>
                معطل
              </Button>
            </div>
          </Card>

          {/* ----- Inputs Section ----- */}
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">حقول الإدخال</h3>
            <div className="grid grid-cols-3 gap-4">
              <Input label="اسم المنتج" placeholder="أدخل اسم المنتج" />
              <Input
                label="السعر (DA)"
                type="number"
                placeholder="0"
              />
              <Input
                label="الباركود"
                error="هذا الباركود مستخدم بالفعل"
                defaultValue="123456789"
              />
            </div>
          </Card>

          {/* ----- Currency Display ----- */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <p className="text-xs text-text-tertiary mb-1">إجمالي المبيعات اليوم</p>
              <p className="currency-lg text-accent">{formatCurrency(145200)}</p>
            </Card>
            <Card>
              <p className="text-xs text-text-tertiary mb-1">عدد العمليات</p>
              <p className="currency-lg text-text-primary">23</p>
            </Card>
            <Card>
              <p className="text-xs text-text-tertiary mb-1">المخزون المنخفض</p>
              <p className="currency-lg text-danger">5</p>
            </Card>
            <Card>
              <p className="text-xs text-text-tertiary mb-1">الكاش في الصندوق</p>
              <p className="currency-lg text-success">{formatCurrency(87500)}</p>
            </Card>
          </div>

          {/* ----- Glass Card ----- */}
          <Card glass>
            <h3 className="text-base font-semibold text-text-primary mb-2">
              بطاقة زجاجية (Glassmorphism)
            </h3>
            <p className="text-sm text-text-secondary">
              هذه البطاقة تستخدم تأثير الزجاج مع ضبابية الخلفية لإعطاء مظهر احترافي
              وعصري للتطبيق.
            </p>
          </Card>

          {/* ----- Table ----- */}
          <Card padding="compact">
            <div className="px-2 py-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">المنتجات</h3>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                + إضافة منتج
              </Button>
            </div>
            <Table
              columns={COLUMNS}
              data={DEMO_DATA}
              rowKey={(row) => row.id}
              loading={showSkeleton}
              onRowClick={() => {
                addToast({ message: 'تم النقر على صف المنتج', variant: 'info' })
              }}
            />
          </Card>

          {/* ----- Skeleton Demo ----- */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">حالة التحميل</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSkeleton((s) => !s)}
              >
                {showSkeleton ? 'إخفاء' : 'عرض'} Skeleton
              </Button>
            </div>
            {showSkeleton && (
              <div className="grid grid-cols-3 gap-4">
                <SkeletonCard />
                <SkeletonCard />
                <div className="space-y-3">
                  <SkeletonLine width="w-full" />
                  <SkeletonLine width="w-5/6" />
                  <SkeletonLine width="w-2/3" />
                  <SkeletonLine width="w-4/5" />
                </div>
              </div>
            )}
          </Card>

          {/* ----- Toast Triggers ----- */}
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">إشعارات Toast</h3>
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => addToast({ message: 'تمت العملية بنجاح!', variant: 'success' })}
              >
                نجاح
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  addToast({ message: 'حدث خطأ في العملية', variant: 'error' })
                }
              >
                خطأ
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  addToast({ message: 'تنبيه: المخزون منخفض', variant: 'warning' })
                }
              >
                تحذير
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  addToast({ message: 'معلومة: تم تحديث البيانات', variant: 'info' })
                }
              >
                معلومات
              </Button>
            </div>
          </Card>
        </div>
      </main>

      {/* ----- Modal ----- */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="إضافة منتج جديد">
        <div className="space-y-4">
          <Input label="اسم المنتج" placeholder="مثال: تي شيرت نايك" />
          <Input label="الفئة" placeholder="اختر الفئة" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="سعر البيع (DA)" type="number" placeholder="0" />
            <Input label="سعر التكلفة (DA)" type="number" placeholder="0" />
          </div>
          <div className="flex gap-3 justify-start pt-2">
            <Button variant="primary">حفظ المنتج</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* ----- Toast Container ----- */}
      <ToastContainer />
    </div>
  )
}

export default App
