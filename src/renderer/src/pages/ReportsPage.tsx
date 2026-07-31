import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowRight,
  ExternalLink,
  DollarSign,
  TrendingUp,
  PackageCheck,
  CreditCard,
  Flame,
  ClipboardList,
  BarChart2,
  FileText
} from 'lucide-react'
import { exportShiftsToCSV } from '@/services/exportService'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell
} from 'recharts'
import { Card, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import {
  fetchSalesAnalytics,
  fetchTopSellingProducts,
  fetchInventoryValuation,
  fetchShiftAuditLogs,
  fetchCloudMultiBranchAnalytics,
  type SalesAnalyticsSummary,
  type TopProductRow,
  type InventoryValuationSummary,
  type ShiftAuditRow,
  type CloudBranchRevenueRow,
} from '@/services/reportService'
import { formatCurrency } from '@/lib/format'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface DailyChartPoint {
  day: string
  revenue: number
}

export function ReportsPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const [salesSummary, setSalesSummary] = useState<SalesAnalyticsSummary | null>(null)
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])
  const [inventoryVal, setInventoryVal] = useState<InventoryValuationSummary | null>(null)
  const [shifts, setShifts] = useState<ShiftAuditRow[]>([])
  const [cloudBranchData, setCloudBranchData] = useState<CloudBranchRevenueRow[]>([])
  const [dailyChartData, setDailyChartData] = useState<DailyChartPoint[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [period, setPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all')

  const addToast = useToastStore((s) => s.addToast)

  const getPeriodDates = useCallback((): { start?: string; end?: string } => {
    if (period === 'all') return {}
    const end = new Date().toISOString().split('T')[0]
    const startDateObj = new Date()
    if (period === '7d') startDateObj.setDate(startDateObj.getDate() - 7)
    if (period === '30d') startDateObj.setDate(startDateObj.getDate() - 30)
    if (period === '90d') startDateObj.setDate(startDateObj.getDate() - 90)
    return { start: startDateObj.toISOString().split('T')[0], end }
  }, [period])

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const { start, end } = getPeriodDates()
      const [salesRes, topRes, invRes, shiftRes, cloudBranchRes] = await Promise.all([
        fetchSalesAnalytics(start, end),
        fetchTopSellingProducts(10, start, end),
        fetchInventoryValuation(),
        fetchShiftAuditLogs(),
        fetchCloudMultiBranchAnalytics(),
      ])

      setSalesSummary(salesRes)
      setTopProducts(topRes)
      setInventoryVal(invRes)
      setShifts(shiftRes)
      setCloudBranchData(cloudBranchRes)

      let dateClause = ''
      const params: string[] = []
      if (start && end) {
        dateClause = ' AND DATE(created_at) >= ? AND DATE(created_at) <= ?'
        params.push(start, end)
      }

      // Fetch sales curve from SQLite
      const chartRows = await window.electron.db.query<{ day: string; revenue: number }>(
        `SELECT DATE(created_at) as day, SUM(total_dzd) as revenue
         FROM sales
         WHERE status = 'completed' AND deleted_at IS NULL${dateClause}
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at) ASC
         LIMIT 14`,
        params
      )

      if (chartRows.length > 0) {
        setDailyChartData(chartRows)
      } else {
        setDailyChartData([
          { day: t('اليوم'), revenue: salesRes.totalRevenueDzd },
        ])
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[ReportsPage]", err); addToast({ message: t('فشل تحميل التقارير'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [getPeriodDates, addToast, t])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const topProductColumns: Column<TopProductRow>[] = [
    {
      key: 'product_name',
      header: t('المنتج الخيار'),
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
      key: 'total_quantity_sold',
      header: t('الكمية المباعة'),
      render: (row) => (
        <span className="px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-black border border-accent/20">
          {row.total_quantity_sold} {t('قطعة')}
        </span>
      ),
    },
    {
      key: 'total_revenue_dzd',
      header: t('إجمالي العوائد'),
      render: (row) => <span className="currency font-black text-success text-xs">{formatCurrency(row.total_revenue_dzd)}</span>,
    },
  ]

  const shiftAuditColumns: Column<ShiftAuditRow>[] = [
    {
      key: 'cashier_name',
      header: t('الكاشير'),
      render: (row) => <span className="font-bold text-text-primary text-xs">{row.cashier_name ?? t('غير معروف')}</span>,
    },
    {
      key: 'opening_cash_dzd',
      header: t('مبلغ الفتح'),
      render: (row) => <span className="currency text-xs font-bold">{formatCurrency(row.opening_cash_dzd)}</span>,
    },
    {
      key: 'expected_cash_dzd',
      header: t('المحسوب متوقع'),
      render: (row) => (
        <span className="currency font-extrabold text-accent text-xs">
          {row.expected_cash_dzd ? formatCurrency(row.expected_cash_dzd) : '-'}
        </span>
      ),
    },
    {
      key: 'closing_cash_dzd',
      header: t('العد الفعلي'),
      render: (row) => (
        <span className="currency font-extrabold text-text-primary text-xs">
          {row.closing_cash_dzd ? formatCurrency(row.closing_cash_dzd) : '-'}
        </span>
      ),
    },
    {
      key: 'difference_dzd',
      header: t('الفرق (عجز/فائض)'),
      render: (row) => {
        if (row.difference_dzd === null) return <span className="text-xs text-text-tertiary">{t('مفتوحة')}</span>
        const diff = row.difference_dzd
        return (
          <span
            className={`currency font-extrabold text-xs px-2.5 py-1 rounded-full border ${
              diff === 0
                ? 'bg-success/10 text-success border-success/20'
                : diff > 0
                  ? 'bg-warning/10 text-warning border-warning/20'
                  : 'bg-danger/10 text-danger border-danger/20'
            }`}
          >
            {diff === 0 ? `0 DA (${t('متطابق')})` : diff > 0 ? `+${formatCurrency(diff)}` : `- ${formatCurrency(Math.abs(diff))}`}
          </span>
        )
      },
    },
    {
      key: 'opened_at',
      header: t('تاريخ الفتح والإغلاق'),
      render: (row) => (
        <span className="font-mono text-[11px] text-text-tertiary">
          {new Date(row.opened_at).toLocaleDateString('ar-DZ')}{' '}
          {row.closed_at ? `← ${new Date(row.closed_at).toLocaleTimeString('ar-DZ')}` : `(${t('جارية')})`}
        </span>
      ),
    },
  ]

  const paymentData = [
    { name: t('نقداً'), amount: salesSummary?.cashSalesDzd ?? 0, color: '#30D158' },
    { name: t('بطاقة CIB'), amount: salesSummary?.cardSalesDzd ?? 0, color: '#0A84FF' },
  ]

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  return (
    <div className="min-h-screen p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
              title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
            >
              <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
            </button>

            {!isSecondaryWindow && (
              <button
                type="button"
                onClick={() => {
                  if (window.electron?.openModuleWindow) {
                    window.electron.openModuleWindow('reports')
                    if (onBack) onBack()
                  }
                }}
                className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
                title={t('فتح في نافذة خارجية جديدة')}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('التقارير ولوحة التحليلات التنفيذية')}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'all' ? 'bg-white text-accent shadow-sm font-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              كل الوقت
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === '7d' ? 'bg-white text-accent shadow-sm font-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === '30d' ? 'bg-white text-accent shadow-sm font-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              آخر 30 يوم
            </button>
            <button
              onClick={() => setPeriod('90d')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === '90d' ? 'bg-white text-accent shadow-sm font-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              آخر 90 يوم
            </button>
          </div>

          <button
            onClick={() => {
              if (shifts.length === 0) {
                addToast({ message: t('لا توجد بيانات ورديات للتصدير حالياً'), variant: 'warning' })
                return
              }
              exportShiftsToCSV(shifts)
              addToast({ message: t('تم تصدير تقرير الورديات إلى ملف CSV بنجاح!'), variant: 'success' })
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-success hover:bg-success/90 text-white text-xs font-bold shadow-ambient transition-all btn-press"
          >
            <FileText className="w-4 h-4" />
            <span>{t('تصدير الورديات CSV')}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-secondary">إجمالي المبيعات</span>
            <div className="p-2 rounded-xl bg-accent/10 text-accent">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="currency-lg text-accent text-2xl font-black">
            {salesSummary ? formatCurrency(salesSummary.totalRevenueDzd) : '-'}
          </p>
          <p className="text-[11px] font-bold text-text-tertiary mt-2">
            عدد العمليات: {salesSummary?.totalSalesCount ?? 0} عملية
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-secondary">صافي الأرباح الربحية</span>
            <div className="p-2 rounded-xl bg-success/10 text-success">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p
            className={`currency-lg text-2xl font-black ${
              salesSummary && salesSummary.netProfitDzd > 0 ? 'text-success' : 'text-text-primary'
            }`}
          >
            {salesSummary ? formatCurrency(salesSummary.netProfitDzd) : '-'}
          </p>
          <div className="flex items-center justify-between mt-2 text-[11px] font-bold">
            <span className="text-text-tertiary">التكلفة (COGS): {salesSummary ? formatCurrency(salesSummary.totalCogsDzd) : '-'}</span>
            <span className="px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
              هامش: {salesSummary?.profitMarginPercent ?? 0}%
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-secondary">تقييم المخزون الحالي</span>
            <div className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-text-primary">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="currency-lg text-text-primary text-2xl font-black">
            {inventoryVal ? formatCurrency(inventoryVal.totalRetailValueDzd) : '-'}
          </p>
          <p className="text-[11px] font-bold text-text-tertiary mt-2">
            التكلفة: {inventoryVal ? formatCurrency(inventoryVal.totalCostValueDzd) : '-'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-secondary">توزيع طرق الدفع</span>
            <div className="p-2 rounded-xl bg-accent/10 text-accent">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xs space-y-1.5 mt-1">
            <div className="flex justify-between font-bold">
              <span className="text-text-secondary">كاش:</span>
              <span className="currency text-success">{formatCurrency(salesSummary?.cashSalesDzd ?? 0)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-text-secondary">بطاقة CIB:</span>
              <span className="currency text-accent">{formatCurrency(salesSummary?.cardSalesDzd ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Recharts Section */}
      <div className="grid grid-cols-3 gap-6">
        {/* Sales Revenue Curve */}
        <div className="col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
            <BarChart2 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-black text-text-primary">منحنى المبيعات الإجمالية (آخر الأيام)</h2>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#AEAEB2" fontSize={11} />
                <YAxis stroke="#AEAEB2" fontSize={11} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any) => [`${(Number(val) || 0).toLocaleString()} DA`, t('المبيعات')]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e5ea', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0A84FF" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Chart */}
        <div className="col-span-1 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200/80 dark:border-slate-800 shadow-ambient-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
            <CreditCard className="w-4 h-4 text-success" />
            <h2 className="text-sm font-black text-text-primary">{t('مقارنة وسائل الدفع')} (DA)</h2>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentData}>
                <XAxis dataKey="name" stroke="#AEAEB2" fontSize={11} />
                <YAxis stroke="#AEAEB2" fontSize={11} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any) => [`${(Number(val) || 0).toLocaleString()} DA`, t('المبلغ')]}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e5ea', fontWeight: 'bold' }}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Selling Products Leaderboard */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80">
        <div className="px-4 py-3.5 border-b border-gray-200/80 bg-gray-50/50 flex items-center gap-2">
          <Flame className="w-4 h-4 text-warning" />
          <h2 className="text-sm font-black text-text-primary">الأكثر مبيعاً (Top 10 Selling Products)</h2>
        </div>
        <Table
          columns={topProductColumns}
          data={topProducts}
          loading={isLoading}
          rowKey={(row) => row.variant_id}
          emptyMessage={t('لا توجد بيانات مبيعات بعد')}
        />
      </Card>

      {/* Shift Audit Log */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80">
        <div className="px-4 py-3.5 border-b border-gray-200/80 bg-gray-50/50 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-black text-text-primary">{t('سجل ورديات العمل وصندوق الكاشير (Shift Audit Log)')}</h2>
        </div>
        <Table
          columns={shiftAuditColumns}
          data={shifts}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage={t('لا توجد ورديات سابقة')}
        />
      </Card>

      {/* Decoupled Cloud Multi-Branch Analytics (Admin Cloud Summary) */}
      {cloudBranchData.length > 0 && (
        <Card padding="compact" className="overflow-hidden border border-blue-200 bg-blue-50/20">
          <div className="px-4 py-3.5 border-b border-blue-100 bg-blue-50/50 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-black text-text-primary">
              لوحة تحكم المدير: مقارنة إيرادات جميع الفروع (سحابية مباشرة)
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {cloudBranchData.map((b) => (
              <div key={b.branch_id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-300">{b.branch_name}</span>
                <span className="text-lg font-black text-text-primary">{formatCurrency(b.total_revenue_dzd)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-300">{b.sales_count} عملية بيع مسجلة سحابياً</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
