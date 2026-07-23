import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { ReturnModal } from '@/components/returns/ReturnModal'
import { useToastStore } from '@/stores/toastStore'

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

export function ReturnsPage({ onBack }: { onBack: () => void }): React.JSX.Element {
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
    } catch {
      addToast({ message: 'فشل تحميل سجل المرتجعات', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadReturns()
  }, [loadReturns])

  const columns: Column<ReturnHistoryRow>[] = [
    {
      key: 'original_sale_id',
      header: 'رقم الوصل الأصلي',
      render: (row) => <span className="font-mono text-xs text-text-primary">{row.original_sale_id}</span>,
    },
    {
      key: 'product_name',
      header: 'المنتج المرجوع',
      render: (row) => (
        <div>
          <p className="font-bold text-text-primary text-xs">{row.product_name}</p>
          <p className="text-[11px] text-text-tertiary">
            {row.size ? `مقاس: ${row.size} ` : ''}
            {row.color ? `لون: ${row.color}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'الكمية المرجوعة',
      render: (row) => <span className="text-xs font-bold text-danger">{row.quantity} قطعة</span>,
    },
    {
      key: 'total_refund_dzd',
      header: 'المبلغ المسترد',
      render: (row) => <span className="currency font-bold text-danger">{formatCurrency(row.total_refund_dzd)}</span>,
    },
    {
      key: 'refund_method',
      header: 'طريقة الاسترداد',
      render: (row) => (
        <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-text-secondary text-xs font-bold">
          {row.refund_method === 'cash' ? '💵 نقداً' : '🏷️ رصيد متجر'}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'سبب الإرجاع',
      render: (row) => <span className="text-xs text-text-secondary">{row.reason}</span>,
    },
    {
      key: 'cashier_name',
      header: 'الكاشير',
      render: (row) => <span className="text-xs font-semibold">{row.cashier_name ?? 'عام'}</span>,
    },
    {
      key: 'created_at',
      header: 'التاريخ والوقت',
      render: (row) => (
        <span className="font-mono text-xs text-text-tertiary">
          {new Date(row.created_at).toLocaleString('ar-DZ')}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← العودة لنقطة البيع (POS)
          </button>
          <h1 className="text-2xl font-bold text-text-primary">إدارة المرتجعات واسترداد المبالغ</h1>
        </div>

        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          + تسجيل مرتجع جديد
        </Button>
      </div>

      <Card padding="compact">
        <Table
          columns={columns}
          data={returns}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد عمليات إرجاع مسجلة حالياً"
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
