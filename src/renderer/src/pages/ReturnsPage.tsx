import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Banknote, Tag } from 'lucide-react'
import { Card, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { ReturnModal } from '@/components/returns/ReturnModal'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface ReturnHistoryRow {
  id: string
  original_sale_id: string
  product_name: string
  size: string | null
  color: string | null
  quantity: number
  unit_price: number
  total_refund_dzd: number
  refund_method: string
  reason: string
  cashier_name: string
  created_at: string
}

export function ReturnsPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const _langVersion = useLanguageStore((s) => s.version)
  const [returns, setReturns] = useState<ReturnHistoryRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadReturns = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<ReturnHistoryRow>(
        `SELECT 
           r.id, r.original_sale_id, r.quantity, r.refund_method, r.reason, r.created_at,
           p.name as product_name, v.size, v.color, p.price_dzd as unit_price,
           (r.quantity * COALESCE(v.price_dzd, p.price_dzd)) as total_refund_dzd,
           u.full_name as cashier_name
         FROM returns r
         JOIN product_variants v ON v.id = r.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN users u ON u.id = r.processed_by
         ORDER BY r.created_at DESC`
      )
      setReturns(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[ReturnsPage]", err); addToast({ message: t('فشل تحميل سجل المرتجعات'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  useEffect(() => {
    loadReturns()
  }, [loadReturns])

  const columns: Column<ReturnHistoryRow>[] = [
    {
      key: 'original_sale_id',
      header: t('رقم الوصل الأصلي'),
      render: (row) => <span className="font-mono text-xs text-text-primary font-bold">{row.original_sale_id}</span>,
    },
    {
      key: 'product_name',
      header: t('المنتج المرجوع'),
      render: (row) => (
        <div>
          <p className="font-extrabold text-text-primary text-xs">{row.product_name}</p>
          <p className="text-[11px] text-text-tertiary">
            {row.size ? `${t('مقاس:')} ${row.size} ` : ''}
            {row.color ? `${t('لون:')} ${row.color}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: t('الكمية المرجوعة'),
      render: (row) => <span className="text-xs font-extrabold text-danger">{row.quantity} {t('قطعة')}</span>,
    },
    {
      key: 'total_refund_dzd',
      header: t('المبلغ المسترد'),
      render: (row) => <span className="currency font-black text-danger">{formatCurrency(row.total_refund_dzd)}</span>,
    },
    {
      key: 'refund_method',
      header: t('طريقة الاسترداد'),
      render: (row) => (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-text-secondary text-xs font-bold border border-gray-200/60 dark:border-slate-700">
          {row.refund_method === 'cash' ? (
            <>
              <Banknote className="w-3.5 h-3.5 text-success" />
              <span>{t('نقداً')}</span>
            </>
          ) : (
            <>
              <Tag className="w-3.5 h-3.5 text-accent" />
              <span>{t('رصيد المتجر')}</span>
            </>
          )}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t('سبب الإرجاع'),
      render: (row) => <span className="text-xs text-text-secondary">{row.reason}</span>,
    },
    {
      key: 'cashier_name',
      header: t('الكاشير'),
      render: (row) => <span className="text-xs font-bold text-text-primary">{row.cashier_name ?? t('عام')}</span>,
    },
    {
      key: 'created_at',
      header: t('التاريخ والوقت'),
      render: (row) => (
        <span className="font-mono text-xs text-text-tertiary">
          {new Date(row.created_at).toLocaleString('ar-DZ')}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12 select-none min-h-screen dark:bg-slate-950">
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
          <h1 className="text-2xl font-black text-text-primary">{t('إدارة المرتجعات واستبدال البضاعة')}</h1>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <Plus className="w-4 h-4" />
          <span>{t('تسجيل مرتجع جديد')}</span>
        </button>
      </div>

      <Card padding="compact" className="overflow-hidden border border-gray-200/80">
        <Table
          columns={columns}
          data={returns}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage={t('لا توجد عمليات إرجاع مسجلة حالياً')}
        />
      </Card>

      <ReturnModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadReturns}
      />
    </div>
  )
}
