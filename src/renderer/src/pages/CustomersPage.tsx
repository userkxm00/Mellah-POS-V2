import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Search, Award, Phone, Trash2, History, Receipt, Edit3, Wallet } from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID, useShiftStore } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface CustomerItem {
  id: string
  full_name: string
  phone: string | null
  loyalty_points: number
  store_credit_balance: number
  total_debt_dzd: number
  created_at: string
  total_spent_dzd: number
  total_sales_count: number
}

interface CustomerPaymentRow {
  id: string
  amount_dzd: number
  payment_method: string
  notes: string | null
  created_at: string
}

interface CustomerSaleRow {
  id: string
  created_at: string
  total_dzd: number
  paid_amount_dzd?: number
  remaining_debt_dzd?: number
  payment_method: string
}

export function CustomersPage({ onBack }: { readonly onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const [selectedTimelineCustomer, setSelectedTimelineCustomer] = useState<CustomerItem | null>(null)
  const [customerSalesHistory, setCustomerSalesHistory] = useState<CustomerSaleRow[]>([])
  const [customerPaymentsHistory, setCustomerPaymentsHistory] = useState<CustomerPaymentRow[]>([])
  const [isTimelineLoading, setIsTimelineLoading] = useState<boolean>(false)

  // Debt Repayment Modal state
  const [payingDebtCustomer, setPayingDebtCustomer] = useState<CustomerItem | null>(null)
  const [repayAmountDzd, setRepayAmountDzd] = useState<string>('')
  const [repayMethod, setRepayMethod] = useState<'cash' | 'card'>('cash')
  const [repayNotes, setRepayNotes] = useState<string>('')
  const [isRepaying, setIsRepaying] = useState<boolean>(false)

  const [fullName, setFullName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Edit customer state
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null)
  const [editFullName, setEditFullName] = useState<string>('')
  const [editPhone, setEditPhone] = useState<string>('')
  const [isEditSaving, setIsEditSaving] = useState<boolean>(false)

  const activeShift = useShiftStore((s) => s.activeShift)
  const addToast = useToastStore((s) => s.addToast)

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<CustomerItem>(`
        SELECT 
          c.id, c.full_name, c.phone, c.loyalty_points, 
          COALESCE(c.store_credit_balance, 0) as store_credit_balance,
          (
            COALESCE((SELECT SUM(s.remaining_debt_dzd) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed' AND s.deleted_at IS NULL), 0) -
            COALESCE((SELECT SUM(cp.amount_dzd) FROM customer_payments cp WHERE cp.customer_id = c.id), 0)
          ) as total_debt_dzd,
          c.created_at,
          COALESCE(SUM(s.total_dzd), 0) as total_spent_dzd,
          COUNT(s.id) as total_sales_count
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'completed' AND s.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY total_debt_dzd DESC, total_spent_dzd DESC
      `)
      setCustomers(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CustomersPage]", err); addToast({ message: t('فشل تحميل قائمة الزبائن والديون'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const handleAddCustomer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!fullName.trim()) {
      addToast({ message: t('يرجى كتابة اسم الزبون'), variant: 'error' })
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

      addToast({ message: t('تم إضافة الزبون بنجاح!'), variant: 'success' })
      setIsModalOpen(false)
      setFullName('')
      setPhone('')
      await loadCustomers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CustomersPage]", err); addToast({ message: t('فشل إضافة الزبون'), variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCustomer = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`${t('هل أنت متأكد من رغبتك في حذف الزبون')} (${name})؟`)) return

    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE customers SET deleted_at = ? WHERE id = ?',
        [now, id]
      )
      addToast({ message: t('تم حذف الزبون'), variant: 'info' })
      await loadCustomers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CustomersPage]", err); addToast({ message: t('فشل حذف الزبون'), variant: 'error' })
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
      addToast({ message: `${t('تم تحديث بيانات الزبون')} "${editFullName.trim()}"`, variant: 'success' })
      setEditingCustomer(null)
      await loadCustomers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CustomersPage]", err); addToast({ message: t('فشل تحديث بيانات الزبون'), variant: 'error' })
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

  const handleRepayDebt = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!payingDebtCustomer) return
    const amount = Number.parseFloat(repayAmountDzd)
    if (!amount || amount <= 0) {
      addToast({ message: t('يرجى كتابة مبلغ تسديد صحيح'), variant: 'error' })
      return
    }

    setIsRepaying(true)
    try {
      const paymentId = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.execute(
        `INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, amount_dzd, payment_method, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, DEFAULT_BRANCH_ID, activeShift?.id || null, payingDebtCustomer.id, amount, repayMethod, repayNotes.trim() || null, now]
      )

      addToast({ message: `${t('تم تسديد مبلغ')} ${amount.toLocaleString('ar-DZ')} ${t('دج لـ')} ${payingDebtCustomer.full_name}`, variant: 'success' })
      setPayingDebtCustomer(null)
      setRepayAmountDzd('')
      setRepayNotes('')
      await loadCustomers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CustomersPage]", err); addToast({ message: t('فشل تسجيل عملية تسديد الدين'), variant: 'error' })
    } finally {
      setIsRepaying(false)
    }
  }

  const handleOpenTimeline = async (customer: CustomerItem): Promise<void> => {
    setSelectedTimelineCustomer(customer)
    setIsTimelineLoading(true)
    try {
      const salesRows = await window.electron.db.query<CustomerSaleRow>(
        `SELECT id, created_at, total_dzd, paid_amount_dzd, remaining_debt_dzd, payment_method 
         FROM sales 
         WHERE customer_id = ? AND status = 'completed' AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [customer.id]
      )
      setCustomerSalesHistory(salesRows)

      const paymentRows = await window.electron.db.query<CustomerPaymentRow>(
        `SELECT id, amount_dzd, payment_method, notes, created_at 
         FROM customer_payments 
         WHERE customer_id = ?
         ORDER BY created_at DESC`,
        [customer.id]
      )
      setCustomerPaymentsHistory(paymentRows)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CustomersPage]', err)
      addToast({ message: t('فشل تحميل سجل مشتريات وتسديدات الزبون'), variant: 'error' })
    } finally {
      setIsTimelineLoading(false)
    }
  }
  const [sortKey, setSortKey] = useState<string>('full_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string): void => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const valA = a[sortKey as keyof CustomerItem] ?? ''
    const valB = b[sortKey as keyof CustomerItem] ?? ''

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  const columns: Column<CustomerItem>[] = [
    {
      key: 'full_name',
      header: t('اسم الزبون والتصنيف'),
      sortable: true,
      render: (row) => {
        const spent = row.total_spent_dzd
        const tier =
          spent >= 500000
            ? { label: `💎 ${t('VIP')}`, color: 'bg-purple-100 text-purple-700 border-purple-200' }
            : spent >= 200000
              ? { label: `🥇 ${t('ذهبي')}`, color: 'bg-amber-100 text-amber-700 border-amber-200' }
              : spent >= 50000
                ? { label: `🥈 ${t('فضي')}`, color: 'bg-slate-100 text-slate-700 border-slate-200' }
                : { label: `🥉 ${t('عادي')}`, color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' }

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
                {t('إجمالي الشراء:')} <span className="font-bold text-accent">{spent.toLocaleString('ar-DZ')} {t('دج')}</span> ({row.total_sales_count} {t('زيارات')})
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'phone',
      header: t('رقم الهاتف'),
      sortable: true,
      render: (row) => (
        <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary font-mono">
          <Phone className="w-3.5 h-3.5 text-text-tertiary" />
          <span>{row.phone ?? t('غير مسجل')}</span>
        </span>
      ),
    },
    {
      key: 'total_debt_dzd',
      header: t('الديون المستحقة'),
      sortable: true,
      render: (row) => (
        row.total_debt_dzd > 0 ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 text-xs font-black">
              <span>{row.total_debt_dzd.toLocaleString('ar-DZ')} {t('دج')}</span>
            </span>
            <button
              onClick={() => {
                setPayingDebtCustomer(row)
                setRepayAmountDzd(String(row.total_debt_dzd))
              }}
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-black hover:bg-red-700 transition-colors btn-press shadow-sm"
            >
              {t('تسديد الدين')}
            </button>
          </div>
        ) : (
          <span className="text-xs text-text-tertiary font-bold">—</span>
        )
      ),
    },
    {
      key: 'loyalty_points',
      header: t('نقاط الولاء'),
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-extrabold">
          <Award className="w-3.5 h-3.5 text-amber-500" />
          <span>{row.loyalty_points} {t('نقطة')}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('الإجراءات'),
      align: 'left',
      render: (row) => (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-end gap-1">
          <button
            onClick={() => handleOpenTimeline(row)}
            aria-label={t('عرض سجل المشتريات')}
            className="flex items-center gap-1 text-xs text-accent font-bold bg-accent/10 hover:bg-accent/20 px-2 py-1 rounded-lg transition-colors btn-press"
          >
            <History className="w-3.5 h-3.5" />
            <span>{t('سجل')}</span>
          </button>
          <button
            onClick={() => handleOpenEditCustomer(row)}
            aria-label={t('تعديل الزبون')}
            className="flex items-center gap-1 text-xs text-warning font-bold hover:bg-warning/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t('تعديل')}</span>
          </button>
          <button
            onClick={() => handleDeleteCustomer(row.id, row.full_name)}
            aria-label={t('حذف الزبون')}
            className="flex items-center gap-1 text-xs text-danger font-bold hover:bg-danger/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ]

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  return (
    <div className="p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack()
              else window.close()
            }}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
            title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
          >
            <ArrowRight className="w-4 h-4 transform rtl:rotate-0 ltr:rotate-180" />
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('إدارة الزبائن وعضوية الولاء')}</h1>
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
          placeholder={t('ابحث باسم الزبون أو رقم الهاتف...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-gray-50/80 border-gray-200 text-xs"
          icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
        />
      </div>

      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={sortedCustomers}
          loading={isLoading}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyType="customers"
          emptyMessage={t('لا يوجد زبائن مسجلين يطابقون البحث')}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('إضافة زبون جديد للمتجر')}
        isDirty={fullName.trim().length > 0 || phone.trim().length > 0}
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <Input
            label={t('اسم الزبون الكامل')}
            placeholder={t('مثال: ياسمين بن علي')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            isValid={fullName.trim().length >= 2}
            error={fullName.length > 0 && fullName.trim().length < 2 ? t('اسم الزبون يجب أن يحتوي على حرفين على الأقل') : undefined}
            required
            autoFocus
          />

          <Input
            label={t('رقم الهاتف')}
            placeholder={t('مثال: 0661234567')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press"
            >
              {t('حفظ الزبون')}
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press"
            >
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Purchase History & Statement Timeline Modal */}
      <Modal
        isOpen={Boolean(selectedTimelineCustomer)}
        onClose={() => setSelectedTimelineCustomer(null)}
        title={`${t('سجل مشتريات ودفعات الزبون')} — ${selectedTimelineCustomer?.full_name ?? ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-accent/5 border border-accent/20 rounded-2xl grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('إجمالي المشتريات التراكمي')}</p>
              <p className="currency text-accent font-black text-base">
                {selectedTimelineCustomer?.total_spent_dzd.toLocaleString('ar-DZ')} {t('دج')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('الدين المستحق الحالي')}</p>
              <p className={`font-black text-base ${(selectedTimelineCustomer?.total_debt_dzd ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {(selectedTimelineCustomer?.total_debt_dzd ?? 0).toLocaleString('ar-DZ')} {t('دج')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('عدد الفواتير والعمليات')}</p>
              <p className="text-text-primary font-black text-base">
                {selectedTimelineCustomer?.total_sales_count} {t('زيارات')}
              </p>
            </div>
          </div>

          {/* Sales History List */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-text-primary">{t('فواتير المبيعات:')}</h3>
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {isTimelineLoading ? (
                <p className="text-xs text-center py-4 text-text-tertiary font-bold">{t('جاري تحميل السجل...')}</p>
              ) : customerSalesHistory.length === 0 ? (
                <p className="text-xs text-center py-4 text-text-tertiary font-bold">{t('لا توجد عمليات مبيعات سابقة لهذا الزبون.')}</p>
              ) : (
                customerSalesHistory.map((sale) => (
                  <div key={sale.id} className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white border border-gray-200 text-text-secondary">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-mono text-xs font-bold text-text-primary">{t('فاتورة ID:')} #{sale.id.slice(0, 8)}</p>
                        <p className="text-[11px] text-text-tertiary font-mono">
                          {new Date(sale.created_at).toLocaleString('ar-DZ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="currency font-black text-accent text-xs">{sale.total_dzd.toLocaleString('ar-DZ')} {t('دج')}</p>
                      {sale.remaining_debt_dzd && sale.remaining_debt_dzd > 0 ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          {t('دين متبقي:')} {sale.remaining_debt_dzd.toLocaleString('ar-DZ')} {t('دج')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-text-secondary">
                          {sale.payment_method === 'cash' ? t('نقداً') : sale.payment_method === 'card' ? t('بطاقة CIB') : sale.payment_method === 'credit' ? t('كريدي') : t('مزدوج')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Payments History List */}
          {customerPaymentsHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <h3 className="text-xs font-black text-emerald-800">{t('دفوعات تسديد الديون المنسوبة:')}</h3>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {customerPaymentsHistory.map((p) => (
                  <div key={p.id} className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-emerald-900">{t('تسديد مبلغ:')} {p.amount_dzd.toLocaleString('ar-DZ')} {t('دج')}</p>
                      <p className="text-[10px] text-emerald-700 font-mono">{new Date(p.created_at).toLocaleString('ar-DZ')} ({p.payment_method === 'cash' ? t('نقداً') : t('بطاقة')})</p>
                    </div>
                    {p.notes && <p className="text-[10px] text-emerald-800 font-semibold">{p.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Pay Debt Modal */}
      <Modal
        isOpen={Boolean(payingDebtCustomer)}
        onClose={() => setPayingDebtCustomer(null)}
        title={`${t('تسديد دين الزبون')} — ${payingDebtCustomer?.full_name ?? ''}`}
      >
        <form onSubmit={handleRepayDebt} className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-900 font-bold">
            <span>{t('إجمالي الدين المستحق حالياً:')}</span>
            <span className="text-sm font-black text-red-700">
              {(payingDebtCustomer?.total_debt_dzd ?? 0).toLocaleString('ar-DZ')} {t('دج')}
            </span>
          </div>

          <Input
            label={t('المبلغ المسدد (دج)')}
            type="number"
            min={1}
            max={payingDebtCustomer?.total_debt_dzd ?? 999999}
            value={repayAmountDzd}
            onChange={(e) => setRepayAmountDzd(e.target.value)}
            required
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-primary">{t('طريقة التسديد')}</label>
            <select
              value={repayMethod}
              onChange={(e) => setRepayMethod(e.target.value as 'cash' | 'card')}
              className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="cash">{t('💵 نقداً (Cash)')}</option>
              <option value="card">{t('💳 بطاقة CIB / الذهبية')}</option>
            </select>
          </div>

          <Input
            label={t('ملاحظات التسديد (اختياري)')}
            placeholder={t('مثال: دفعة جزئية عن مشتريات الأسبوع')}
            value={repayNotes}
            onChange={(e) => setRepayNotes(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isRepaying}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-ambient"
            >
              {isRepaying ? t('جاري التسجيل...') : t('تأكيد وحفظ تسديد الدين')}
            </button>
            <button
              type="button"
              onClick={() => setPayingDebtCustomer(null)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold"
            >
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal isOpen={editingCustomer !== null} onClose={() => setEditingCustomer(null)} title={`${t('تعديل بيانات الزبون')} — ${editingCustomer?.full_name ?? ''}`}>
        <div className="space-y-4">
          <Input label={t('اسم الزبون الكامل')} value={editFullName} onChange={(e) => setEditFullName(e.target.value)} required autoFocus />
          <Input label={t('رقم الهاتف')} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder={t('مثال: 0661234567')} />
          {editingCustomer && editingCustomer.store_credit_balance > 0 && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-xs text-success font-bold flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              <span>{t('رصيد المتجر الحالي:')} {editingCustomer.store_credit_balance.toLocaleString('ar-DZ')} {t('دج')}</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSaveEditCustomer} disabled={isEditSaving} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press">{t('حفظ التعديلات')}</button>
            <button onClick={() => setEditingCustomer(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">{t('إلغاء')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
