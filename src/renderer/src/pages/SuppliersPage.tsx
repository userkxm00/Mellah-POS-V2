import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Search, Phone, History, Truck } from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

export interface SupplierItem {
  id: string
  name: string
  phone: string | null
  company_name: string | null
  address: string | null
  total_debt_dzd: number
  notes: string | null
  created_at: string
}

interface SupplierPurchaseRow {
  id: string
  invoice_number: string | null
  total_amount_dzd: number
  paid_amount_dzd: number
  remaining_debt_dzd: number
  notes: string | null
  created_at: string
}

interface SupplierPaymentRow {
  id: string
  amount_dzd: number
  payment_method: string
  notes: string | null
  created_at: string
}

export function SuppliersPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Add Supplier Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [companyName, setCompanyName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Add Purchase Invoice Modal State
  const [purchasingSupplier, setPurchasingSupplier] = useState<SupplierItem | null>(null)
  const [invoiceNo, setInvoiceNo] = useState<string>('')
  const [purchaseTotalDzd, setPurchaseTotalDzd] = useState<string>('')
  const [purchasePaidDzd, setPurchasePaidDzd] = useState<string>('')
  const [purchaseNotes, setPurchaseNotes] = useState<string>('')
  const [isSavingPurchase, setIsSavingPurchase] = useState<boolean>(false)

  // Pay Supplier Debt Modal State
  const [repayingSupplier, setRepayingSupplier] = useState<SupplierItem | null>(null)
  const [repayAmountDzd, setRepayAmountDzd] = useState<string>('')
  const [repayMethod, setRepayMethod] = useState<'cash' | 'card'>('cash')
  const [repayNotes, setRepayNotes] = useState<string>('')
  const [isRepaying, setIsRepaying] = useState<boolean>(false)

  // Supplier Statement Modal State
  const [statementSupplier, setStatementSupplier] = useState<SupplierItem | null>(null)
  const [purchasesHistory, setPurchasesHistory] = useState<SupplierPurchaseRow[]>([])
  const [paymentsHistory, setPaymentsHistory] = useState<SupplierPaymentRow[]>([])
  const [isStatementLoading, setIsStatementLoading] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<SupplierItem>(`
        SELECT id, name, phone, company_name, address, COALESCE(total_debt_dzd, 0) as total_debt_dzd, notes, created_at
        FROM suppliers
        WHERE branch_id = ?
        ORDER BY total_debt_dzd DESC, name ASC
      `, [DEFAULT_BRANCH_ID]).catch(() => [])
      setSuppliers(rows)
    } catch {
      addToast({ message: 'فشل تحميل قائمة الموردين', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  const handleAddSupplier = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) {
      addToast({ message: 'يرجى كتابة اسم المورد', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        `INSERT INTO suppliers (id, branch_id, name, phone, company_name, address, total_debt_dzd, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, DEFAULT_BRANCH_ID, name.trim(), phone.trim() || null, companyName.trim() || null, address.trim() || null, notes.trim() || null, now, now]
      )

      addToast({ message: 'تم إضافة المورد بنجاح! 🚚', variant: 'success' })
      setIsAddModalOpen(false)
      setName('')
      setCompanyName('')
      setPhone('')
      setAddress('')
      setNotes('')
      await loadSuppliers()
    } catch {
      addToast({ message: 'فشل إضافة المورد', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreatePurchaseInvoice = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!purchasingSupplier) return
    const total = parseFloat(purchaseTotalDzd)
    const paid = parseFloat(purchasePaidDzd) || 0
    if (!total || total <= 0) {
      addToast({ message: 'يرجى كتابة إجمالي مبلغ الفاتورة', variant: 'error' })
      return
    }

    const remainingDebt = Math.max(0, total - paid)
    setIsSavingPurchase(true)
    try {
      const purchaseId = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.transaction([
        {
          sql: `INSERT INTO supplier_purchases (id, branch_id, supplier_id, invoice_number, total_amount_dzd, paid_amount_dzd, remaining_debt_dzd, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [purchaseId, DEFAULT_BRANCH_ID, purchasingSupplier.id, invoiceNo.trim() || null, total, paid, remainingDebt, purchaseNotes.trim() || null, now],
        },
        {
          sql: `UPDATE suppliers 
                SET total_debt_dzd = COALESCE(total_debt_dzd, 0) + ?, updated_at = ? 
                WHERE id = ?`,
          params: [remainingDebt, now, purchasingSupplier.id],
        },
      ])

      addToast({ message: `تم تسجيل فاتورة الشراء وتحديث ديون المورد ${purchasingSupplier.name}! 📦`, variant: 'success' })
      setPurchasingSupplier(null)
      setInvoiceNo('')
      setPurchaseTotalDzd('')
      setPurchasePaidDzd('')
      setPurchaseNotes('')
      await loadSuppliers()
    } catch {
      addToast({ message: 'فشل تسجيل فاتورة الشراء', variant: 'error' })
    } finally {
      setIsSavingPurchase(false)
    }
  }

  const handleRepaySupplierDebt = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!repayingSupplier) return
    const amount = parseFloat(repayAmountDzd)
    if (!amount || amount <= 0) {
      addToast({ message: 'يرجى كتابة مبلغ التسديد الصحيح', variant: 'error' })
      return
    }

    setIsRepaying(true)
    try {
      const paymentId = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.transaction([
        {
          sql: `INSERT INTO supplier_payments (id, branch_id, supplier_id, amount_dzd, payment_method, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [paymentId, DEFAULT_BRANCH_ID, repayingSupplier.id, amount, repayMethod, repayNotes.trim() || null, now],
        },
        {
          sql: `UPDATE suppliers 
                SET total_debt_dzd = MAX(0, COALESCE(total_debt_dzd, 0) - ?), updated_at = ? 
                WHERE id = ?`,
          params: [amount, now, repayingSupplier.id],
        },
      ])

      addToast({ message: `تم تسجيل تسديد مستحقات المورد ${repayingSupplier.name} بمبلغ ${amount.toLocaleString('ar-DZ')} دج! 💵`, variant: 'success' })
      setRepayingSupplier(null)
      setRepayAmountDzd('')
      setRepayNotes('')
      await loadSuppliers()
    } catch {
      addToast({ message: 'فشل تسجيل تسديد المستحقات', variant: 'error' })
    } finally {
      setIsRepaying(false)
    }
  }

  const handleOpenStatement = async (supplier: SupplierItem): Promise<void> => {
    setStatementSupplier(supplier)
    setIsStatementLoading(true)
    try {
      const purRows = await window.electron.db.query<SupplierPurchaseRow>(
        `SELECT id, invoice_number, total_amount_dzd, paid_amount_dzd, remaining_debt_dzd, notes, created_at 
         FROM supplier_purchases 
         WHERE supplier_id = ?
         ORDER BY created_at DESC`,
        [supplier.id]
      ).catch(() => [])
      setPurchasesHistory(purRows)

      const payRows = await window.electron.db.query<SupplierPaymentRow>(
        `SELECT id, amount_dzd, payment_method, notes, created_at 
         FROM supplier_payments 
         WHERE supplier_id = ?
         ORDER BY created_at DESC`,
        [supplier.id]
      ).catch(() => [])
      setPaymentsHistory(payRows)
    } catch {
      addToast({ message: 'فشل تحميل كشف حساب المورد', variant: 'error' })
    } finally {
      setIsStatementLoading(false)
    }
  }

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.trim().toLowerCase()
    return (
      q === '' ||
      s.name.toLowerCase().includes(q) ||
      (s.company_name && s.company_name.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    )
  })

  const columns: Column<SupplierItem>[] = [
    {
      key: 'name',
      header: 'اسم المورد والشركة',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 text-accent font-black text-sm flex items-center justify-center border border-blue-200">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-text-primary text-sm">{row.name}</span>
              {row.company_name && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                  {row.company_name}
                </span>
              )}
            </div>
            {row.address && <p className="text-[11px] text-text-tertiary">{row.address}</p>}
          </div>
        </div>
      ),
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
      key: 'total_debt_dzd',
      header: 'ديون المورد المستحقة (Dettes)',
      render: (row) => (
        row.total_debt_dzd > 0 ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black">
              <span>{row.total_debt_dzd.toLocaleString('ar-DZ')} دج</span>
            </span>
            <button
              onClick={() => {
                setRepayingSupplier(row)
                setRepayAmountDzd(String(row.total_debt_dzd))
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition-all btn-press shadow-sm"
            >
              تسديد المستحقات
            </button>
          </div>
        ) : (
          <span className="text-xs text-emerald-600 font-extrabold">مُسدد بالكامل ✅</span>
        )
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'left',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPurchasingSupplier(row)}
            className="flex items-center gap-1 text-xs text-accent font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors btn-press"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>فاتورة شراء</span>
          </button>
          <button
            onClick={() => handleOpenStatement(row)}
            className="flex items-center gap-1 text-xs text-text-secondary font-bold bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span>كشف</span>
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
          <h1 className="text-2xl font-black text-text-primary">إدارة الموردين ودين السلع (Dettes Fournisseurs)</h1>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد جديد</span>
        </button>
      </div>

      {/* Main Table Card */}
      <Card className="p-4 border border-gray-200/80 space-y-4">
        <div className="flex items-center gap-3 bg-gray-50/80 p-2 rounded-2xl border border-gray-100">
          <Search className="w-4 h-4 text-text-tertiary mr-2" />
          <input
            type="text"
            placeholder="ابحث باسم المورد، اسم الشركة، أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs font-bold text-text-primary focus:outline-none"
          />
        </div>

        <Table
          rowKey={(row) => (row as SupplierItem).id}
          columns={columns as unknown as Column<unknown>[]}
          data={filteredSuppliers}
          loading={isLoading}
          emptyMessage="لا يوجد موردين مسجلين حالياً. اضغط 'إضافة مورد جديد' للبدء."
        />
      </Card>

      {/* Add Supplier Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="🚚 إضافة مورد سلع جديد">
        <form onSubmit={handleAddSupplier} className="space-y-4">
          <Input label="اسم المورد أو الوكيل" placeholder="مثال: يوسف للملابس بالجملة" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input label="اسم الشركة / العلامة (اختياري)" placeholder="مثال: EURL Mellah Textiles" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="رقم الهاتف" placeholder="مثال: 0550123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="عنوان المقر / المحل" placeholder="مثال: العلمة، سطيف" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Input label="ملاحظات المورد" placeholder="مثال: مورد القمصان والجينز الأسبوعي" value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient btn-press">
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ المورد'}
            </button>
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Purchase Invoice Modal */}
      <Modal isOpen={Boolean(purchasingSupplier)} onClose={() => setPurchasingSupplier(null)} title={`📦 إضافة فاتورة شراء من المورد — ${purchasingSupplier?.name ?? ''}`}>
        <form onSubmit={handleCreatePurchaseInvoice} className="space-y-4">
          <Input label="رقم فاتورة المورد (اختياري)" placeholder="مثال: FACT-2026-890" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} autoFocus />
          <Input label="إجمالي مبلغ السلعة المشتراة (دج)" type="number" min={1} placeholder="مثال: 150000" value={purchaseTotalDzd} onChange={(e) => setPurchaseTotalDzd(e.target.value)} required />
          <Input label="المبلغ المدفوع تسقيع / نقداً للمورد (دج)" type="number" min={0} placeholder="0 دج" value={purchasePaidDzd} onChange={(e) => setPurchasePaidDzd(e.target.value)} />
          
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 font-bold">
            <span>المبلغ المتبقي كدين للمورد (Dette):</span>
            <span className="text-sm font-black text-amber-800">
              {((parseFloat(purchaseTotalDzd) || 0) - (parseFloat(purchasePaidDzd) || 0)).toLocaleString('ar-DZ')} دج
            </span>
          </div>

          <Input label="ملاحظات الشراء" placeholder="مثال: طلبية قمصان قطنية تشكيلة الصيف" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSavingPurchase} className="flex-1 py-3 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient">
              {isSavingPurchase ? 'جاري التسجيل...' : 'تسجيل فاتورة الشراء وتحديث الدين'}
            </button>
            <button type="button" onClick={() => setPurchasingSupplier(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Supplier Debt Modal */}
      <Modal isOpen={Boolean(repayingSupplier)} onClose={() => setRepayingSupplier(null)} title={`💵 تسديد مستحقات المورد — ${repayingSupplier?.name ?? ''}`}>
        <form onSubmit={handleRepaySupplierDebt} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 font-bold">
            <span>إجمالي المستحقات المتبقية للمورد:</span>
            <span className="text-sm font-black text-amber-800">
              {(repayingSupplier?.total_debt_dzd ?? 0).toLocaleString('ar-DZ')} دج
            </span>
          </div>

          <Input label="المبلغ المسدد (دج)" type="number" min={1} max={repayingSupplier?.total_debt_dzd ?? 9999999} value={repayAmountDzd} onChange={(e) => setRepayAmountDzd(e.target.value)} required autoFocus />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-primary">طريقة الدفع</label>
            <select value={repayMethod} onChange={(e) => setRepayMethod(e.target.value as 'cash' | 'card')} className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="cash">💵 نقداً (Cash)</option>
              <option value="card">💳 تحويل بنكي / CIB</option>
            </select>
          </div>

          <Input label="ملاحظات التسديد" placeholder="مثال: تسديد دفعة فاتورة القمصان" value={repayNotes} onChange={(e) => setRepayNotes(e.target.value)} />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isRepaying} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-ambient">
              {isRepaying ? 'جاري التسجيل...' : 'تأكيد وحفظ تسديد المستحقات'}
            </button>
            <button type="button" onClick={() => setRepayingSupplier(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Statement Modal */}
      <Modal isOpen={Boolean(statementSupplier)} onClose={() => setStatementSupplier(null)} title={`📜 كشف حساب وفواتير المورد — ${statementSupplier?.name ?? ''}`} size="lg">
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[11px] text-amber-900 font-bold">إجمالي المستحقات الحالية للمورد</p>
              <p className="font-black text-lg text-amber-900">
                {(statementSupplier?.total_debt_dzd ?? 0).toLocaleString('ar-DZ')} دج
              </p>
            </div>
            <div>
              <p className="text-[11px] text-amber-900 font-bold">عدد فواتير الشراء المسجلة</p>
              <p className="text-amber-900 font-black text-lg">{purchasesHistory.length} فواتير</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black text-text-primary">فواتير الشراء:</h3>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {isStatementLoading ? (
                <p className="text-xs text-center py-4 text-text-tertiary font-bold">جاري تحميل كشف الحساب...</p>
              ) : purchasesHistory.length === 0 ? (
                <p className="text-xs text-center py-4 text-text-tertiary font-bold">لا توجد فواتير شراء مسجلة من هذا المورد.</p>
              ) : (
                purchasesHistory.map((pur) => (
                  <div key={pur.id} className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-text-primary">فاتورة #{pur.invoice_number || pur.id.slice(0, 8)}</p>
                      <p className="text-[10px] text-text-tertiary font-mono">{new Date(pur.created_at).toLocaleString('ar-DZ')}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-black text-accent text-xs">إجمالي: {pur.total_amount_dzd.toLocaleString('ar-DZ')} دج</p>
                      {pur.remaining_debt_dzd > 0 && (
                        <p className="text-[10px] text-red-600 font-black">متبقي: {pur.remaining_debt_dzd.toLocaleString('ar-DZ')} دج</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {paymentsHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <h3 className="text-xs font-black text-emerald-800">دفوعات تسديد المستحقات:</h3>
              <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                {paymentsHistory.map((pay) => (
                  <div key={pay.id} className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-emerald-900">تسديد مبلغ: {pay.amount_dzd.toLocaleString('ar-DZ')} دج</p>
                      <p className="text-[10px] text-emerald-700 font-mono">{new Date(pay.created_at).toLocaleString('ar-DZ')}</p>
                    </div>
                    {pay.notes && <p className="text-[10px] text-emerald-800 font-semibold">{pay.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
