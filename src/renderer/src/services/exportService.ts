/**
 * Utility service to export POS reports, sales, and inventory data into Excel-compatible UTF-8 CSV files.
 */

export function downloadCSV(filename: string, csvContent: string): void {
  // UTF-8 BOM byte sequence to ensure Excel opens Arabic/French text correctly without encoding artifacts
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportSalesToCSV(sales: Array<{
  id: string
  created_at: string
  total_dzd: number
  payment_method: string
  cash_amount_dzd?: number | null
  card_amount_dzd?: number | null
  cashier_name?: string | null
  customer_name?: string | null
}>): void {
  const headers = ['رقم الفاتورة ID', 'التاريخ والوقت', 'الكاشير', 'الزبون', 'طريقة الدفع', 'المبلغ الإجمالي (دج)', 'كاش (دج)', 'بطاقة (دج)']
  
  const rows = sales.map((s) => [
    s.id,
    new Date(s.created_at).toLocaleString('ar-DZ'),
    s.cashier_name || 'الكاشير',
    s.customer_name || 'زبون عابر',
    s.payment_method === 'cash' ? 'نقداً' : s.payment_method === 'card' ? 'بطاقة CIB' : 'مزدوج',
    s.total_dzd,
    s.cash_amount_dzd ?? (s.payment_method === 'cash' ? s.total_dzd : 0),
    s.card_amount_dzd ?? (s.payment_method === 'card' ? s.total_dzd : 0)
  ])

  const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n')
  downloadCSV(`MellahPOS_Sales_${new Date().toISOString().slice(0, 10)}.csv`, csvContent)
}

export function exportInventoryToCSV(inventory: Array<{
  barcode: string | null
  product_name: string
  category_name?: string | null
  size: string | null
  color: string | null
  price_dzd: number
  current_stock: number
}>): void {
  const headers = ['الباركود', 'اسم المنتج', 'الفئة', 'المقاس', 'اللون', 'سعر البيع (دج)', 'المخزون المتوفر']
  
  const rows = inventory.map((item) => [
    item.barcode || 'بدون باركود',
    item.product_name,
    item.category_name || 'عام',
    item.size || '-',
    item.color || '-',
    item.price_dzd,
    item.current_stock
  ])

  const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n')
  downloadCSV(`MellahPOS_Inventory_${new Date().toISOString().slice(0, 10)}.csv`, csvContent)
}

export function exportShiftsToCSV(shifts: Array<{
  id: string
  opened_at: string
  closed_at: string | null
  cashier_name?: string
  opening_cash_dzd: number
  expected_cash_dzd: number | null
  closing_cash_dzd: number | null
  difference_dzd: number | null
  status: string
}>): void {
  const headers = ['رقم الوردية', 'تاريخ الفتح', 'تاريخ الإغلاق', 'الكاشير', 'كاش الفتح (دج)', 'المتوقع (دج)', 'الفعلي في الدرج (دج)', 'الفارق (دج)', 'الحالة']
  
  const rows = shifts.map((sh) => [
    sh.id,
    new Date(sh.opened_at).toLocaleString('ar-DZ'),
    sh.closed_at ? new Date(sh.closed_at).toLocaleString('ar-DZ') : 'جارية',
    sh.cashier_name || 'الكاشير',
    sh.opening_cash_dzd,
    sh.expected_cash_dzd ?? '-',
    sh.closing_cash_dzd ?? '-',
    sh.difference_dzd ?? '-',
    sh.status === 'open' ? 'نشطة' : 'مغلقة'
  ])

  const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n')
  downloadCSV(`MellahPOS_Shifts_${new Date().toISOString().slice(0, 10)}.csv`, csvContent)
}
