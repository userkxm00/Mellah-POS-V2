import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Search, Award, Phone, Trash2, History, Receipt, Edit3, Wallet } from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface CustomerItem {
  id: string
  full_name: string
  phone: string | null
  loyalty_points: number
  store_credit_balance: number
  created_at: string
  total_spent_dzd: number
  total_sales_count: number
}

interface CustomerSaleRow {
  id: string
  created_at: string
  total_dzd: number
  payment_method: string
}

export function CustomersPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const [selectedTimelineCustomer, setSelectedTimelineCustomer] = useState<CustomerItem | null>(null)
  const [customerSalesHistory, setCustomerSalesHistory] = useState<CustomerSaleRow[]>([])
  const [isTimelineLoading, setIsTimelineLoading] = useState<boolean>(false)

  const [fullName, setFullName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Edit customer state
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null)
  const [editFullName, setEditFullName] = useState<string>('')
  const [editPhone, setEditPhone] = useState<string>('')
  const [isEditSaving, setIsEditSaving] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<CustomerItem>(`
        SELECT 
          c.id, c.full_name, c.phone, c.loyalty_points, 
          COALESCE(c.store_credit_balance, 0) as store_credit_balance,
          c.created_at,
          COALESCE(SUM(s.total_dzd), 0) as total_spent_dzd,
          COUNT(s.id) as total_sales_count
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'completed' AND s.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY total_spent_dzd DESC
      `)
      setCustomers(rows)
    } catch {
      addToast({ message: 'فشل تحميل قائمة الزبائن', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const handleAddCustomer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!fullName.trim()) {
      addToast({ message: 'يرجى كتابة اسم الزبون', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO customers (id, branch_id, full_name, phone, loyalty_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, DEFAULT_BRANCH_ID, fullName.trim(), phone.trim() || null, 0, now, now]
      )

      addToast({ message: 'تم إضافة الزبون بنجاح!', variant: 'success' })
      setIsModalOpen(false)
      setFullName('')
      setPhone('')
      await loadCustomers()
    } catch {
      addToast({ message: 'فشل إضافة الزبون', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCustomer = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`هل أنت تأكد من رغبتك في حذف الزبون (${name})؟`)) return

    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE customers SET deleted_at = ? WHERE id = ?',
        [now, id]
      )
      addToast({ message: 'تم حذف الزبون', variant: 'info' })
      await loadCustomers()
    } catch {
      addToast({ message: 'فشل حذف الزبون', variant: 'error' })
    }
  }

  // Edit customer handlers
  const handleOpenEditCustomer = (customer: CustomerItem): void => {
    setEditingCustomer(customer)
    setEditFullName(customer.full_name)
    setEditPhone(customer.phone ?? '')
  }

  const handleSaveEditCustomer = async (): Promise<void> => {
    if (!editingCustomer || !editFullName.trim()) return
    setIsEditSaving(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE customers SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?',
        [editFullName.trim(), editPhone.trim() || null, now, editingCustomer.id]
      )
      addToast({ message: `تم تحديث بيانات الزبون "${editFullName.trim()}" ✅`, variant: 'success' })
      setEditingCustomer(null)
      await loadCustomers()
    } catch {
      addToast({ message: 'فشل تحديث بيانات الزبون', variant: 'error' })
    } finally {
      setIsEditSaving(false)
    }
  }

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.trim().toLowerCase()
    return (
      q === '' ||
      c.full_name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    )
  })

  const handleOpenTimeline = async (customer: CustomerItem): Promise<void> => {
    setSelectedTimelineCustomer(customer)
    setIsTimelineLoading(true)
    try {
      const rows = await window.electron.db.query<CustomerSaleRow>(
        `SELECT id, created_at, total_dzd, payment_method 
         FROM sales 
         WHERE customer_id = ? AND status = 'completed' AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [customer.id]
      )
      setCustomerSalesHistory(rows)
    } catch {
      addToast({ message: 'فشل تحميل سجل مشتريات الزبون', variant: 'error' })
    } finally {
      setIsTimelineLoading(false)
    }
  }

  const columns: Column<CustomerItem>[] = [
    {
      key: 'full_name',
      header: 'اسم الزبون والتصنيف',
      render: (row) => {
        const spent = row.total_spent_dzd
        const tier =
          spent >= 500000
            ? { label: '💎 VIP', color: 'bg-purple-100 text-purple-700 border-purple-200' }
            : spent >= 200000
              ? { label: '🥇 ذهبي', color: 'bg-amber-100 text-amber-700 border-amber-200' }
              : spent >= 50000
                ? { label: '🥈 فضي', color: 'bg-slate-100 text-slate-700 border-slate-200' }
                : { label: '🥉 عادي', color: 'bg-gray-100 text-gray-700 border-gray-200' }

        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent/10 text-accent font-black text-sm flex items-center justify-center border border-accent/20">
              {row.full_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-text-primary text-sm">{row.full_name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${tier.color}`}>
                  {tier.label}
                </span>
              </div>
              <p className="text-[11px] text-text-tertiary">
                إجمالي الشراء: <span className="font-bold text-accent">{spent.toLocaleString('ar-DZ')} دج</span> ({row.total_sales_count} زيارات)
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'phone',
      header: 'رقم الهاتف',
      render: (row) => (
        <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary font-mono">
          <Phone className="w-3.5 h-3.5 text-text-tertiary" />
          <span>{row.phone ?? 'غير مسجل'}</span>
        </span>
      ),
    },
    {
      key: 'loyalty_points',
      header: 'نقاط الولاء',
      render: (row) => (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-warning/10 text-warning border border-warning/20 text-xs font-black">
          <Award className="w-3.5 h-3.5 text-warning" />
          <span>{row.loyalty_points} نقطة</span>
        </span>
      ),
    },
    {
      key: 'store_credit_balance',
      header: 'رصيد المتجر',
      render: (row) => (
        row.store_credit_balance > 0 ? (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 text-xs font-black">
            <Wallet className="w-3.5 h-3.5" />
            <span>{row.store_credit_balance.toLocaleString('ar-DZ')} دج</span>
          </span>
        ) : (
          <span className="text-xs text-text-tertiary font-bold">—</span>
        )
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'left',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleOpenTimeline(row)}
            className="flex items-center gap-1 text-xs text-accent font-bold bg-accent/10 hover:bg-accent/20 px-2 py-1 rounded-lg transition-colors btn-press"
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل</span>
          </button>
          <button
            onClick={() => handleOpenEditCustomer(row)}
            className="flex items-center gap-1 text-xs text-warning font-bold hover:bg-warning/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>تعديل</span>
          </button>
          <button
            onClick={() => handleDeleteCustomer(row.id, row.full_name)}
            className="flex items-center gap-1 text-xs text-danger font-bold hover:bg-danger/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => {
              if (onBack) onBack()
              else window.close()
            }}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('إغلاق النافذة')}</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary">{t('إدارة الزبائن وعضوية الولاء')}</h1>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <Plus className="w-4 h-4" />
          <span>{t('إضافة زبون جديد')}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-ambient-sm">
        <Input
          placeholder="ابحث باسم الزبون أو رقم الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-gray-50/80 border-gray-200 text-xs"
          icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
        />
      </div>

      <Card padding="compact" className="overflow-hidden border border-gray-200/80">
        <Table
          columns={columns}
          data={filteredCustomers}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage="لا يوجد زبائن مسجلين حالياً"
        />
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة زبون جديد للمتجر">
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <Input
            label="اسم الزبون الكامل"
            placeholder="مثال: ياسمين بن علي"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="رقم الهاتف"
            placeholder="مثال: 0661234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press"
            >
              حفظ الزبون
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Purchase History Timeline Modal */}
      <Modal
        isOpen={Boolean(selectedTimelineCustomer)}
        onClose={() => setSelectedTimelineCustomer(null)}
        title={`📜 السجل الزمني لمشتريات الزبون — ${selectedTimelineCustomer?.full_name ?? ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-accent/5 border border-accent/20 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary font-bold">إجمالي المشتريات التراكمي</p>
              <p className="currency text-accent font-black text-xl">
                {selectedTimelineCustomer?.total_spent_dzd.toLocaleString('ar-DZ')} دج
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs text-text-tertiary font-bold">عدد الفواتير والعمليات</p>
              <p className="text-text-primary font-black text-lg">
                {selectedTimelineCustomer?.total_sales_count} زيارات
              </p>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
            {isTimelineLoading ? (
              <p className="text-xs text-center py-6 text-text-tertiary font-bold">جاري تحميل سجل المشتريات...</p>
            ) : customerSalesHistory.length === 0 ? (
              <p className="text-xs text-center py-6 text-text-tertiary font-bold">لا توجد عمليات مبيعات سابقة لهذا الزبون.</p>
            ) : (
              customerSalesHistory.map((sale) => (
                <div key={sale.id} className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white border border-gray-200 text-text-secondary">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-mono text-xs font-bold text-text-primary">فاتورة ID: #{sale.id.slice(0, 8)}</p>
                      <p className="text-[11px] text-text-tertiary font-mono">
                        {new Date(sale.created_at).toLocaleString('ar-DZ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="currency font-black text-accent text-sm">{sale.total_dzd.toLocaleString('ar-DZ')} دج</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-text-secondary">
                      {sale.payment_method === 'cash' ? 'نقداً' : sale.payment_method === 'card' ? 'بطاقة CIB' : 'مزدوج'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal isOpen={editingCustomer !== null} onClose={() => setEditingCustomer(null)} title={`✏️ تعديل بيانات الزبون — ${editingCustomer?.full_name ?? ''}`}>
        <div className="space-y-4">
          <Input label="اسم الزبون الكامل" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} required autoFocus />
          <Input label="رقم الهاتف" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="مثال: 0661234567" />
          {editingCustomer && editingCustomer.store_credit_balance > 0 && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-xs text-success font-bold flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              <span>رصيد المتجر: {editingCustomer.store_credit_balance.toLocaleString('ar-DZ')} دج</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSaveEditCustomer} disabled={isEditSaving} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press">حفظ التعديلات</button>
            <button onClick={() => setEditingCustomer(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
