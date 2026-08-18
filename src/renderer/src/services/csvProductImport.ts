import { logger } from '@/lib/logger'

export async function importProductsFromCSV(csvContent: string): Promise<number> {
  if (window.electron?.biz?.products?.importCsv) {
    const res = await window.electron.biz.products.importCsv(csvContent)
    logger.info('CSV import executed successfully via Main IPC', { importedCount: res.importedCount })
    return res.importedCount
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لاستيراد ملف CSV')
}
