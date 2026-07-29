import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { supabase } from '@/lib/supabase'

export interface SalesAnalyticsSummary {
  totalRevenueDzd: number
  totalSalesCount: number
  totalCogsDzd: number
  netProfitDzd: number
  profitMarginPercent: number
  cashSalesDzd: number
  cardSalesDzd: number
}

export interface TopProductRow {
  variant_id: string
  product_name: string
  size: string | null
  color: string | null
  total_quantity_sold: number
  total_revenue_dzd: number
}

export interface InventoryValuationSummary {
  totalItemsCount: number
  totalCostValueDzd: number
  totalRetailValueDzd: number
  expectedProfitDzd: number
}

export interface ShiftAuditRow {
  id: string
  cashier_name: string
  opening_cash_dzd: number
  expected_cash_dzd: number | null
  closing_cash_dzd: number | null
  difference_dzd: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

export async function fetchSalesAnalytics(startDate?: string, endDate?: string): Promise<SalesAnalyticsSummary> {
  let dateClause = ''
  const params: unknown[] = [DEFAULT_BRANCH_ID]

  if (startDate && endDate) {
    dateClause = ' AND DATE(created_at) >= ? AND DATE(created_at) <= ?'
    params.push(startDate, endDate)
  }

  // 1. Total Sales & Payment Method Breakdown
  const salesSummary = await window.electron.db.query<{
    payment_method: string
    total: number
    count: number
  }>(
    `SELECT payment_method, SUM(total_dzd) as total, COUNT(*) as count
     FROM sales
     WHERE branch_id = ? AND status = 'completed'${dateClause}
     GROUP BY payment_method`,
    params
  )

  let totalRevenue = 0
  let totalCount = 0
  let cashSales = 0
  let cardSales = 0

  for (const s of salesSummary) {
    totalRevenue += s.total
    totalCount += s.count
    if (s.payment_method === 'cash' || s.payment_method === 'mixed') {
      cashSales += s.total
    } else if (s.payment_method === 'card') {
      cardSales += s.total
    }
  }

  // 2. Net Profit Calculation (Sales Revenue - Item Costs)
  const profitParams: unknown[] = [DEFAULT_BRANCH_ID]
  let profitDateClause = ''
  if (startDate && endDate) {
    profitDateClause = ' AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?'
    profitParams.push(startDate, endDate)
  }

  const profitRow = await window.electron.db.query<{ total_cost: number | null }>(
    `SELECT SUM(si.quantity * COALESCE(p.cost_dzd, 0)) as total_cost
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN product_variants v ON v.id = si.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE s.branch_id = ? AND s.status = 'completed'${profitDateClause}`,
    profitParams
  )

  const totalCost = profitRow[0]?.total_cost ?? 0
  const netProfit = totalRevenue - totalCost
  const profitMarginPercent = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0

  return {
    totalRevenueDzd: totalRevenue,
    totalSalesCount: totalCount,
    totalCogsDzd: totalCost,
    netProfitDzd: netProfit,
    profitMarginPercent,
    cashSalesDzd: cashSales,
    cardSalesDzd: cardSales,
  }
}

export async function fetchTopSellingProducts(limit = 10, startDate?: string, endDate?: string): Promise<TopProductRow[]> {
  let dateClause = ''
  const params: unknown[] = [DEFAULT_BRANCH_ID]

  if (startDate && endDate) {
    dateClause = ' AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?'
    params.push(startDate, endDate)
  }
  params.push(limit)

  return window.electron.db.query<TopProductRow>(
    `SELECT 
       si.variant_id, p.name as product_name, v.size, v.color,
       SUM(si.quantity) as total_quantity_sold,
       SUM(si.quantity * si.unit_price_dzd) as total_revenue_dzd
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN product_variants v ON v.id = si.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE s.branch_id = ? AND s.status = 'completed'${dateClause}
     GROUP BY si.variant_id
     ORDER BY total_quantity_sold DESC
     LIMIT ?`,
    params
  )
}

export async function fetchInventoryValuation(): Promise<InventoryValuationSummary> {
  const rows = await window.electron.db.query<{
    current_stock: number
    cost_dzd: number
    price_dzd: number
  }>(
    `SELECT 
       COALESCE(SUM(sm.quantity_change), 0) as current_stock,
       COALESCE(p.cost_dzd, 0) as cost_dzd,
       COALESCE(v.price_dzd, p.price_dzd, 0) as price_dzd
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     LEFT JOIN stock_movements sm ON sm.variant_id = v.id
     WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
     GROUP BY v.id`
  )

  let totalItems = 0
  let totalCost = 0
  let totalRetail = 0

  for (const r of rows) {
    if (r.current_stock > 0) {
      totalItems += r.current_stock
      totalCost += r.current_stock * r.cost_dzd
      totalRetail += r.current_stock * r.price_dzd
    }
  }

  return {
    totalItemsCount: totalItems,
    totalCostValueDzd: totalCost,
    totalRetailValueDzd: totalRetail,
    expectedProfitDzd: totalRetail - totalCost,
  }
}

export async function fetchShiftAuditLogs(): Promise<ShiftAuditRow[]> {
  return window.electron.db.query<ShiftAuditRow>(
    `SELECT 
       sh.id, sh.opening_cash_dzd, sh.expected_cash_dzd, sh.closing_cash_dzd,
       sh.difference_dzd, sh.status, sh.opened_at, sh.closed_at,
       u.full_name as cashier_name
     FROM shifts sh
     LEFT JOIN users u ON u.id = sh.cashier_id
     WHERE sh.branch_id = ?
     ORDER BY sh.opened_at DESC`,
    [DEFAULT_BRANCH_ID]
  )
}

export interface CloudBranchRevenueRow {
  branch_id: string
  branch_name: string
  total_revenue_dzd: number
  sales_count: number
}

/**
 * Direct Supabase Cloud Query for Admin Multi-Branch Sales Analytics.
 * Decoupled from local SQLite POS registers to maintain zero pollution and zero FK errors.
 */
export async function fetchCloudMultiBranchAnalytics(): Promise<CloudBranchRevenueRow[]> {
  const hasRealSupabase =
    import.meta.env.VITE_SUPABASE_URL &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

  if (!hasRealSupabase) return []

  try {
    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select('branch_id, total_dzd')
      .eq('status', 'completed')

    if (salesErr || !salesData) return []

    const { data: branchData } = await supabase
      .from('branches')
      .select('id, name')

    const branchMap = new Map<string, string>()
    if (branchData) {
      for (const b of branchData) {
        branchMap.set(b.id, b.name)
      }
    }

    const map = new Map<string, { total_revenue_dzd: number; sales_count: number }>()

    for (const s of salesData) {
      const bId = s.branch_id
      const amount = Number(s.total_dzd) || 0
      const current = map.get(bId) || { total_revenue_dzd: 0, sales_count: 0 }
      map.set(bId, {
        total_revenue_dzd: current.total_revenue_dzd + amount,
        sales_count: current.sales_count + 1,
      })
    }

    return Array.from(map.entries()).map(([branch_id, stats]) => ({
      branch_id,
      branch_name: branchMap.get(branch_id) || 'فرع تجاري',
      total_revenue_dzd: stats.total_revenue_dzd,
      sales_count: stats.sales_count,
    }))
  } catch (err) {// eslint-disable-next-line no-console
      console.error("[reportService]", err); return []
  }
}
