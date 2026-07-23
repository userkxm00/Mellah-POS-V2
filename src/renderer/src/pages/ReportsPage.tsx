import React, { useState, useEffect, useCallback } from 'react'
import { Card, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import {
  fetchSalesAnalytics,
  fetchTopSellingProducts,
  fetchInventoryValuation,
  fetchShiftAuditLogs,
  type SalesAnalyticsSummary,
  type TopProductRow,
  type InventoryValuationSummary,
  type ShiftAuditRow,
} from '@/services/reportService'
import { formatCurrency } from '@/lib/format'
import { useToastStore } from '@/stores/toastStore'

export function ReportsPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [salesSummary, setSalesSummary] = useState<SalesAnalyticsSummary | null>(null)
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])
  const [inventoryVal, setInventoryVal] = useState<InventoryValuationSummary | null>(null)
  const [shifts, setShifts] = useState<ShiftAuditRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const addToast = useToastStore((s) => s.addToast)

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const [salesRes, topRes, invRes, shiftRes] = await Promise.all([
        fetchSalesAnalytics(),
        fetchTopSellingProducts(10),
        fetchInventoryValuation(),
        fetchShiftAuditLogs(),
      ])

      setSalesSummary(salesRes)
      setTopProducts(topRes)
      setInventoryVal(invRes)
      setShifts(shiftRes)
    } catch {
      addToast({ message: 'فشل تحميل التقارير', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const topProductColumns: Column<TopProductRow>[] = [
    {
      key: 'product_name',
      header: 'المنتج الخيار',
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
      key: 'total_quantity_sold',
      header: 'الكمية المباعة',
      render: (row) => (
        <span className="px-2.5 py-0.5 rounded-full bg-accent-light text-accent text-xs font-bold">
          {row.total_quantity_sold} قطعة
        </span>
      ),
    },
    {
      key: 'total_revenue_dzd',
      header: 'إجمالي العوائد',
      render: (row) => <span className="currency font-bold text-success text-xs">{formatCurrency(row.total_revenue_dzd)}</span>,
    },
  ]

  const shiftAuditColumns: Column<ShiftAuditRow>[] = [
    {
      key: 'cashier_name',
      header: 'الكاشير',
      render: (row) => <span className="font-bold text-text-primary text-xs">{row.cashier_name ?? 'غير معروف'}</span>,
    },
    {
      key: 'opening_cash_dzd',
      header: 'مبلغ الفتح',
      render: (row) => <span className="currency text-xs">{formatCurrency(row.opening_cash_dzd)}</span>,
    },
    {
      key: 'expected_cash_dzd',
      header: 'المحسوب متوقع',
      render: (row) => (
        <span className="currency font-semibold text-accent text-xs">
          {row.expected_cash_dzd ? formatCurrency(row.expected_cash_dzd) : '-'}
        </span>
      ),
    },
    {
      key: 'closing_cash_dzd',
      header: 'العد الفعلي',
      render: (row) => (
        <span className="currency font-semibold text-text-primary text-xs">
          {row.closing_cash_dzd ? formatCurrency(row.closing_cash_dzd) : '-'}
        </span>
      ),
    },
    {
      key: 'difference_dzd',
      header: 'الفرق (عجز/فائض)',
      render: (row) => {
        if (row.difference_dzd === null) return <span className="text-xs text-text-tertiary">مفتوحة</span>
        const diff = row.difference_dzd
        return (
          <span
            className={`currency font-bold text-xs px-2 py-0.5 rounded ${
              diff === 0
                ? 'bg-success-light text-success'
                : diff > 0
                  ? 'bg-warning-light text-warning'
                  : 'bg-danger-light text-danger'
            }`}
          >
            {diff === 0 ? '0 DA (متطابق)' : diff > 0 ? `+${formatCurrency(diff)}` : `- ${formatCurrency(Math.abs(diff))}`}
          </span>
        )
      },
    },
    {
      key: 'opened_at',
      header: 'تاريخ الفتح والإغلاق',
      render: (row) => (
        <span className="font-mono text-[11px] text-text-tertiary">
          {new Date(row.opened_at).toLocaleDateString('ar-DZ')}{' '}
          {row.closed_at ? `← ${new Date(row.closed_at).toLocaleTimeString('ar-DZ')}` : '(جارية)'}
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
          <h1 className="text-2xl font-bold text-text-primary">التقارير ولوحة التحليلات التنفيذية</h1>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-text-tertiary mb-1">💵 إجمالي المبيعات (Revenue)</p>
          <p className="currency-lg text-accent text-2xl">
            {salesSummary ? formatCurrency(salesSummary.totalRevenueDzd) : '-'}
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">
            عدد العمليات: {salesSummary?.totalSalesCount ?? 0} عملية
          </p>
        </Card>

        <Card>
          <p className="text-xs text-text-tertiary mb-1">📈 صافي الأرباح المقدرة</p>
          <p
            className={`currency-lg text-2xl ${
              salesSummary && salesSummary.netProfitDzd > 0 ? 'text-success' : 'text-text-primary'
            }`}
          >
            {salesSummary ? formatCurrency(salesSummary.netProfitDzd) : '-'}
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">المبيعات - تكلفة الشراء</p>
        </Card>

        <Card>
          <p className="text-xs text-text-tertiary mb-1">📦 تقييم المخزون الحالي (سعر البيع)</p>
          <p className="currency-lg text-text-primary text-2xl">
            {inventoryVal ? formatCurrency(inventoryVal.totalRetailValueDzd) : '-'}
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">
            التكلفة: {inventoryVal ? formatCurrency(inventoryVal.totalCostValueDzd) : '-'}
          </p>
        </Card>

        <Card>
          <p className="text-xs text-text-tertiary mb-1">💳 توزيع طرق الدفع</p>
          <div className="text-xs space-y-1 mt-1">
            <div className="flex justify-between">
              <span>كاش:</span>
              <span className="font-bold text-success">{formatCurrency(salesSummary?.cashSalesDzd ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>بطاقة CIB:</span>
              <span className="font-bold text-accent">{formatCurrency(salesSummary?.cardSalesDzd ?? 0)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Selling Products Leaderboard */}
      <Card padding="compact">
        <div className="px-3 py-3 border-b border-border-light">
          <h2 className="text-base font-bold text-text-primary">🔥 الأقثر مبيعاً (Top 10 Selling Products)</h2>
        </div>
        <Table
          columns={topProductColumns}
          data={topProducts}
          loading={isLoading}
          rowKey={(row) => row.variant_id}
          emptyMessage="لا توجد بيانات مبيعات بعد"
        />
      </Card>

      {/* Shift Audit Log */}
      <Card padding="compact">
        <div className="px-3 py-3 border-b border-border-light">
          <h2 className="text-base font-bold text-text-primary">📑 سجل ورديات العمل وصندوق الكاشير (Shift Audit)</h2>
        </div>
        <Table
          columns={shiftAuditColumns}
          data={shifts}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد ورديات سابقة"
        />
      </Card>
    </div>
  )
}
