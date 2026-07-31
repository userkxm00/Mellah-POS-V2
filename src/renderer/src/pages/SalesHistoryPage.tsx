import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Printer,
  Eye,
  ArrowRight,
  Receipt,
  Banknote,
  CreditCard,
  Layers,
  FileText,
  Ban
} from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { printThermalReceipt } from '@/services/receiptService'
import { exportSalesToCSV } from '@/services/exportService'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { useShiftStore } from '@/stores/shiftStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { voidSale } from '@/services/voidSaleService'

interface SaleRow {
  id: string
  created_at: string
  subtotal_dzd: number | null
  discount_dzd: number | null
  total_dzd: number
  cash_amount_dzd: number | null
  card_amount_dzd: number | null
  payment_method: string
  status: string
  void_reason: string | null
  cashier_name: string
  customer_name: string | null
  item_count: number
}

interface SaleItemDetail {
  variant_id: string
  product_name: string
  size: string | null
  color: string | null
  quantity: number
  unit_price_dzd: number
}

interface ShiftOption {
  id: string
  opened_at: string
  closed_at: string | null
  status: string
}

function getPaymentMethodStyle(pm: string): string {
  if (pm === 'cash') return 'bg-success/10 text-success border-success/20'
  if (pm === 'card') return 'bg-accent/10 text-accent border-accent/20'
  return 'bg-warning/10 text-warning border-warning/20'
}

function getPaymentMethodIcon(pm: string): React.JSX.Element {
  if (pm === 'cash') return <Banknote className="w-3.5 h-3.5" />
  if (pm === 'card') return <CreditCard className="w-3.5 h-3.5" />
  return <Layers className="w-3.5 h-3.5" />
}

function getPaymentMethodName(pm: string, t: (k: string) => string): string {
  if (pm === 'cash') return t('نقداً')
  if (pm === 'card') return t('بطاقة CIB')
  return t('مزدوج')
}

function getStatusStyle(status: string): string {
  if (status === 'completed') return 'bg-success-light text-success'
  if (status === 'voided') return 'bg-danger-light text-danger'
  return 'bg-warning-light text-warning'
}

function getStatusLabel(status: string, t: (k: string) => string): string {
  if (status === 'completed') return t('مكتملة')
  if (status === 'voided') return t('ملغاة (Voided)')
  return t('مرتجعة')
}

function getPaymentMethodLabel(sale: SaleRow, t: (k: string) => string): string {
  if (sale.payment_method === 'cash') return t('نقداً')
  if (sale.payment_method === 'card') return t('بطاقة CIB')
  return `${t('مزدوج')} (${sale.cash_amount_dzd ?? 0} ${t('دج نقد')} + ${sale.card_amount_dzd ?? 0} ${t('دج كارت')})`
}

interface SalesHistoryPageProps {
  readonly onBack?: () => void
}

export function SalesHistoryPage({ onBack }: SalesHistoryPageProps): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const activeShift = useShiftStore((s) => s.activeShift)
  const storeSettings = useStoreSettingsStore((s) => s.settings)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<'current_shift' | 'today' | 'yesterday' | 'by_shift' | 'range'>('current_shift')
  
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0])

  const [shiftsList, setShiftsList] = useState<ShiftOption[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')

  // Modal details
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null)
  const [saleItems, setSaleItems] = useState<SaleItemDetail[]>([])
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false)

  // Void modal
  const [isVoidModalOpen, setIsVoidModalOpen] = useState<boolean>(false)
  const [voidReason, setVoidReason] = useState<string>('')
  const [isVoiding, setIsVoiding] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  // Fetch list of past shifts
  useEffect(() => {
    void (async () => {
      try {
        const rows = await window.electron.db.query<ShiftOption>(
          'SELECT id, opened_at, closed_at, status FROM shifts ORDER BY opened_at DESC LIMIT 20'
        )
        setShiftsList(rows)
        if (rows.length > 0) setSelectedShiftId(rows[0].id)
      } catch {
        // Non-critical shifts dropdown load fallback
      }
    })()
  }, [])

  const loadSalesHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      let dateCondition = ''
      const params: string[] = []

      if (dateFilter === 'current_shift' && activeShift) {
        dateCondition = `AND s.shift_id = ?`
        params.push(activeShift.id)
      } else if (dateFilter === 'by_shift' && selectedShiftId) {
        dateCondition = `AND s.shift_id = ?`
        params.push(selectedShiftId)
      } else if (dateFilter === 'today' || (dateFilter === 'current_shift' && !activeShift)) {
        const todayStr = new Date().toISOString().split('T')[0]
        dateCondition = `AND DATE(s.created_at) = ?`
        params.push(todayStr)
      } else if (dateFilter === 'yesterday') {
        const yest = new Date()
        yest.setDate(yest.getDate() - 1)
        const yestStr = yest.toISOString().split('T')[0]
        dateCondition = `AND DATE(s.created_at) = ?`
        params.push(yestStr)
      } else if (dateFilter === 'range') {
        dateCondition = `AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?`
        params.push(startDate, endDate)
      }

      const rows = await window.electron.db.query<SaleRow>(
        `SELECT 
           s.id, s.created_at, s.subtotal_dzd, s.discount_dzd, s.total_dzd,
           s.cash_amount_dzd, s.card_amount_dzd, s.payment_method, s.status, s.void_reason,
           u.full_name as cashier_name,
           c.full_name as customer_name,
           (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
         FROM sales s
         LEFT JOIN users u ON u.id = s.cashier_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.deleted_at IS NULL ${dateCondition}
         ORDER BY s.created_at DESC`,
        params
      )
      setSales(rows)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SalesHistoryPage:loadSalesHistory]', err)
      addToast({ message: t('فشل تحميل سجل المبيعات'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [dateFilter, activeShift, selectedShiftId, startDate, endDate, addToast, t])

  useEffect(() => {
    loadSalesHistory()
  }, [loadSalesHistory])

  const handleOpenDetail = async (sale: SaleRow): Promise<void> => {
    setSelectedSale(sale)
    try {
      const items = await window.electron.db.query<SaleItemDetail>(
        `SELECT 
           si.variant_id, p.name as product_name, v.size, v.color, si.quantity, si.unit_price_dzd
         FROM sale_items si
         JOIN product_variants v ON v.id = si.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE si.sale_id = ?`,
        [sale.id]
      )
      setSaleItems(items)
      setIsDetailOpen(true)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SalesHistoryPage:handleOpenDetail]', err)
      addToast({ message: t('فشل جلب تفاصيل الفاتورة'), variant: 'error' })
    }
  }

  const handleReprintReceipt = (sale: SaleRow, items: SaleItemDetail[]): void => {
    const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
    const paperWidth = (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
    const receiptLanguage = (localStorage.getItem('mellah_receipt_language') as 'ar' | 'fr' | 'en') ?? 'ar'

    printThermalReceipt(
      {
        storeName: storeSettings.store_name,
        branchAddress: storeSettings.store_address || undefined,
        receiptId: sale.id,
        date: sale.created_at,
        cashierName: sale.cashier_name,
        customerName: sale.customer_name ?? undefined,
        items: items.map((i) => ({
          product_name: i.product_name,
          size: i.size,
          color: i.color,
          quantity: i.quantity,
          unit_price: i.unit_price_dzd,
        })),
        subtotalDzd: sale.subtotal_dzd ?? sale.total_dzd,
        discountDzd: (sale.discount_dzd ?? 0) > 0 ? (sale.discount_dzd as number) : undefined,
        totalDzd: sale.total_dzd,
        paymentMethod: sale.payment_method,
      },
      { printerName, paperWidth, language: receiptLanguage }
    )
      .then(() => {
        addToast({ message: t('تم إرسال أمر الطباعة الحرارية بنجاح 🖨️'), variant: 'success' })
      })
      .catch(() => {
        addToast({ message: t('تعذرت الطباعة — تحقق من اتصال الطابعة'), variant: 'warning' })
      })
  }

  const handleConfirmVoid = async (): Promise<void> => {
    if (!selectedSale || !voidReason.trim()) return
    setIsVoiding(true)
    try {
      await voidSale(
        selectedSale.id,
        voidReason.trim(),
        saleItems.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, product_name: i.product_name }))
      )
      addToast({ message: `تم إلغاء الفاتورة #${selectedSale.id.slice(0, 8)} وإعادة المخزون بنجاح ✅`, variant: 'success' })
      setIsVoidModalOpen(false)
      setIsDetailOpen(false)
      setVoidReason('')
      await loadSalesHistory()
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsVoiding(false)
    }
  }

  const filteredSales = sales.filter((s) => {
    const q = searchQuery.trim().toLowerCase()
    return (
      q === '' ||
      s.id.toLowerCase().includes(q) ||
      s.cashier_name?.toLowerCase().includes(q) ||
      s.customer_name?.toLowerCase().includes(q)
    )
  })

  const validSales = filteredSales.filter((s) => s.status !== 'voided')
  const dayTotalDzd = validSales.reduce((acc, curr) => acc + curr.total_dzd, 0)

  const [sortKey, setSortKey] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: string): void => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }

  const sortedSales = [...filteredSales].sort((a, b) => {
    const valA = a[sortKey as keyof SaleRow] ?? ''
    const valB = b[sortKey as keyof SaleRow] ?? ''

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  const columns: Column<SaleRow>[] = [
    {
      key: 'id',
      header: t('رقم الفاتورة'),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
            <Receipt className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-text-primary">#{row.id.slice(0, 8)}</span>
            <span className="block text-[10px] text-text-tertiary font-mono">
              {new Date(row.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'cashier_name',
      header: t('الكاشير والزبون'),
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-text-primary text-xs block">{row.cashier_name ?? t('كاشير الفرع')}</span>
          <span className="text-[11px] text-text-tertiary block">{row.customer_name ? `${t('الزبون:')} ${row.customer_name}` : t('زبون عام')}</span>
        </div>
      ),
    },
    {
      key: 'payment_method',
      header: t('طريقة الدفع'),
      sortable: true,
      render: (row) => (
        <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border ${getPaymentMethodStyle(
              row.payment_method
            )}`}
          >
            {getPaymentMethodIcon(row.payment_method)}
            <span>{getPaymentMethodName(row.payment_method, t)}</span>
        </span>
      ),
    },
    {
      key: 'total_dzd',
      header: t('مبلغ الفاتورة'),
      sortable: true,
      render: (row) => (
        <div>
          <span className={`currency font-black text-sm block ${row.status === 'voided' ? 'line-through text-text-tertiary' : 'text-accent'}`}>
            {formatCurrency(row.total_dzd)}
          </span>
          {(row.discount_dzd ?? 0) > 0 ? (
            <span className="text-[10px] text-danger font-bold block">{t('الخصم (دج):')} {formatCurrency(row.discount_dzd as number)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('الحالة'),
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${getStatusStyle(
            row.status
          )}`}
        >
          {getStatusLabel(row.status, t)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('التفاصيل والطباعة'),
      align: 'left',
      render: (row) => (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex justify-end gap-1.5">
          <button
            onClick={() => handleOpenDetail(row)}
            aria-label={t('عرض التفاصيل والطباعة')}
            className="flex items-center gap-1 px-3 py-1 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs transition-colors btn-press"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t('التفاصيل والجرد')}</span>
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
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
            title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
          >
            <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('سجل الفواتير والمبيعات اليومية')}</h1>
        </div>

        <button
          onClick={() => exportSalesToCSV(filteredSales)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-success hover:bg-success/90 text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <FileText className="w-4 h-4" />
          <span>{t('تصدير السجلات CSV')}</span>
        </button>
      </div>

      {/* Summary Stat Card */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-accent/5 border border-accent/20">
          <p className="text-xs text-text-tertiary font-bold mb-1">{t('إجمالي الفواتير النشطة')}</p>
          <p className="text-2xl font-black text-text-primary">{validSales.length} {t('فاتورة')}</p>
        </Card>
        <Card className="p-4 bg-accent/5 border border-accent/20">
          <p className="text-xs text-text-tertiary font-bold mb-1">{t('إجمالي المبيعات المحُددة')}</p>
          <p className="currency text-accent font-black text-2xl">{formatCurrency(dayTotalDzd)}</p>
        </Card>
        <Card className="p-4 bg-danger/5 border border-danger/20">
          <p className="text-xs text-text-tertiary font-bold mb-1">{t('فواتير ملغاة')}</p>
          <p className="text-2xl font-black text-danger">
            {filteredSales.filter((s) => s.status === 'voided').length} {t('فاتورة')}
          </p>
        </Card>
      </div>

      {/* Controls & Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setDateFilter('current_shift')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'current_shift' ? 'bg-white text-accent shadow-sm font-black' : 'hover:text-text-primary'
              }`}
            >
              {t('الوردية الحالية')}
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'today' ? 'bg-white text-accent shadow-sm font-black' : 'hover:text-text-primary'
              }`}
            >
              {t('اليوم')}
            </button>
            <button
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'yesterday' ? 'bg-white text-accent shadow-sm font-black' : 'hover:text-text-primary'
              }`}
            >
              {t('أمس')}
            </button>
            <button
              onClick={() => setDateFilter('range')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'range' ? 'bg-white text-accent shadow-sm font-black' : 'hover:text-text-primary'
              }`}
            >
              {t('مجال تاريخ (من-إلى)')}
            </button>
            <button
              onClick={() => setDateFilter('by_shift')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'by_shift' ? 'bg-white text-accent shadow-sm font-black' : 'hover:text-text-primary'
              }`}
            >
              {t('حسب الوردية')}
            </button>
          </div>

          {dateFilter === 'by_shift' && (
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-mono bg-gray-50 border border-gray-200 font-bold"
            >
              {shiftsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.opened_at.split('T')[0]} ({s.status === 'open' ? t('نشطة') : t('مغلقة')})
                </option>
              ))}
            </select>
          )}

          {dateFilter === 'range' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono bg-gray-50 border border-gray-200"
              />
              <span className="text-xs font-bold text-text-tertiary">{t('إلى')}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono bg-gray-50 border border-gray-200"
              />
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72">
          <Input
            placeholder={t('ابحث برقم الفاتورة أو اسم الكاشير...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-50/80 border-gray-200 text-xs"
            icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
          />
        </div>
      </div>

      {/* Sales Table */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={sortedSales}
          loading={isLoading}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyType="sales"
          emptyMessage={t('لا توجد مبيعات مسجلة في هذا التاريخ')}
        />
      </Card>

      {/* Sale Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`${t('تفاصيل الفاتورة')} #${selectedSale?.id.slice(0, 8)}`}
        size="lg"
      >
        {selectedSale && (
          <div className="space-y-5 select-none">
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 grid grid-cols-4 gap-3 text-xs">
              <div>
                <p className="font-bold text-text-tertiary">{t('تاريخ البيع:')}</p>
                <p className="font-bold text-text-primary font-mono mt-0.5">
                  {new Date(selectedSale.created_at).toLocaleString('ar-DZ')}
                </p>
              </div>
              <div>
                <p className="font-bold text-text-tertiary">{t('الكاشير:')}</p>
                <p className="font-bold text-text-primary mt-0.5">{selectedSale.cashier_name}</p>
              </div>
              <div>
                <p className="font-bold text-text-tertiary">{t('الزبون:')}</p>
                <p className="font-bold text-text-primary mt-0.5">{selectedSale.customer_name ?? t('زبون عام')}</p>
              </div>
              <div>
                <p className="font-bold text-text-tertiary">{t('طريقة الدفع:')}</p>
                <p className="font-bold text-accent mt-0.5">
                  {getPaymentMethodLabel(selectedSale, t)}
                </p>
              </div>
            </div>

            {selectedSale.status === 'voided' && (
              <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-xs text-danger font-bold">
                🚫 {t('فواتير ملغاة')}. {t('السبب:')} {selectedSale.void_reason ?? t('بدون سبب مذكور')}
              </div>
            )}

            {/* Itemized Table */}
            <div className="border border-gray-200/80 dark:border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200/80 dark:border-slate-800 font-bold text-text-secondary dark:text-slate-300">
                  <tr>
                    <th className="p-3">{t('المنتج')}</th>
                    <th className="p-3 text-center">{t('الكمية')}</th>
                    <th className="p-3 text-left">{t('المبلغ')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {saleItems.map((item) => (
                    <tr key={item.variant_id || item.product_name} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-text-primary dark:text-slate-100">
                        {item.product_name}
                        {(item.size || item.color) && (
                          <span className="block text-[11px] font-medium text-text-tertiary dark:text-slate-400">
                            {item.size ? `${t('مقاس:')} ${item.size}` : ''} {item.color ? `${t('لون:')} ${t(item.color)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center font-bold">{item.quantity}</td>
                      <td className="p-3 text-left currency font-black text-accent">
                        {formatCurrency(item.quantity * item.unit_price_dzd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Subtotal & Discount display */}
            <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl space-y-1.5 text-xs font-semibold">
              {selectedSale.subtotal_dzd && selectedSale.subtotal_dzd > selectedSale.total_dzd && (
                <div className="flex justify-between text-text-tertiary dark:text-slate-400">
                  <span>{t('المجموع الفرعي:')}</span>
                  <span>{formatCurrency(selectedSale.subtotal_dzd)}</span>
                </div>
              )}
              {selectedSale.discount_dzd && selectedSale.discount_dzd > 0 && (
                <div className="flex justify-between text-danger font-bold">
                  <span>{t('الخصم المطبق:')}</span>
                  <span>-{formatCurrency(selectedSale.discount_dzd)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-accent pt-1 border-t border-gray-200 dark:border-slate-700">
                <span>{t('المبلغ النهائي المستحق:')}</span>
                <span>{formatCurrency(selectedSale.total_dzd)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              {selectedSale.status !== 'voided' ? (
                <button
                  onClick={() => setIsVoidModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger text-xs font-bold transition-all"
                >
                  <Ban className="w-4 h-4" />
                  <span>{t('إلغاء الفاتورة (Void)')}</span>
                </button>
              ) : (
                <span className="text-xs font-bold text-danger">الفاتورة ملغاة بالفعل</span>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleReprintReceipt(selectedSale, saleItems)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-ambient transition-all btn-press"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الفاتورة الحرارية</span>
                </button>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold btn-press"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Void Reason Confirmation Modal */}
      <Modal isOpen={isVoidModalOpen} onClose={() => setIsVoidModalOpen(false)} title="⚠️ تأكيد إلغاء الفاتورة وإعادة السلع للمخزون" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary font-bold">
            إلغاء الفاتورة سيعيد الكميات المباعة تلقائياً إلى المخزون وسيسجل العملية في سجل التدقيق.
          </p>

          <Input
            label={t('سبب إلغاء الفاتورة')}
            placeholder={t('مثال: خطأ في الصرف / طلب الزبون')}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            required
            autoFocus
          />

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirmVoid}
              disabled={isVoiding || !voidReason.trim()}
              className="flex-1 py-3 rounded-xl bg-danger text-white text-xs font-bold shadow-ambient btn-press disabled:opacity-50"
            >
              {isVoiding ? t('جاري الإلغاء...') : t('تأكيد الإلغاء وإعادة السلع')}
            </button>
            <button
              onClick={() => setIsVoidModalOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
