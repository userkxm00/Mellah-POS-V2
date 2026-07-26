export const ALL_BACKUP_TABLES = [
  'branches',
  'users',
  'categories',
  'products',
  'product_variants',
  'stock_movements',
  'shifts',
  'sales',
  'sale_items',
  'returns',
  'customers',
  'store_settings',
  'audit_logs',
  'customer_payments',
  'suppliers',
  'supplier_purchases',
  'supplier_payments',
]

export async function exportDatabaseBackup(isAutoBackup = false): Promise<string> {
  try {
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFileName = `mellah-pos-backup-${dateStr}.json`

    const backupData: Record<string, unknown[]> = {}

    for (const table of ALL_BACKUP_TABLES) {
      try {
        const rows = await window.electron.db.query(`SELECT * FROM ${table}`)
        backupData[table] = rows
      } catch {
        // Table might not exist yet
      }
    }

    const jsonString = JSON.stringify(backupData, null, 2)

    if (isAutoBackup) {
      // Store automated backup payload in local storage for auto-recovery
      localStorage.setItem('mellah_auto_backup_latest', jsonString)
      localStorage.setItem('mellah_last_auto_backup_timestamp', new Date().toISOString())
      return 'auto_backup_saved'
    }

    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName
    a.click()
    URL.revokeObjectURL(url)

    return backupFileName
  } catch (err) {
    throw new Error('فشل تصدير النسخة الاحتياطية: ' + (err as Error).message)
  }
}

export async function importDatabaseBackup(jsonString: string): Promise<number> {
  let backupData: Record<string, Record<string, unknown>[]>
  try {
    backupData = JSON.parse(jsonString)
  } catch {
    throw new Error('ملف النسخة الاحتياطية غير صالح (صيغة JSON غير صحيحة)')
  }

  if (typeof backupData !== 'object' || backupData === null) {
    throw new Error('محتوى النسخة الاحتياطية فارغ أو غير متمفصل')
  }

  const operations: Array<{ sql: string; params: unknown[] }> = []
  let totalRestoredRows = 0

  // Reverse tables for clean deletion (dependencies first)
  const reverseTables = [...ALL_BACKUP_TABLES].reverse()
  for (const table of reverseTables) {
    operations.push({ sql: `DELETE FROM ${table}`, params: [] })
  }

  // Build insert operations for each table in backup
  for (const table of ALL_BACKUP_TABLES) {
    const rows = backupData[table]
    if (Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        const keys = Object.keys(row)
        if (keys.length === 0) continue
        const cols = keys.join(', ')
        const placeholders = keys.map(() => '?').join(', ')
        const params = keys.map((k) => row[k])

        operations.push({
          sql: `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
          params,
        })
        totalRestoredRows++
      }
    }
  }

  try {
    await window.electron.db.transaction(operations)
    return totalRestoredRows
  } catch (err) {
    throw new Error('فشل استرجاع البيانات: ' + (err as Error).message)
  }
}

/**
 * Initializes background auto-backup task.
 * Automatically runs a full database backup snapshot once every 24 hours.
 */
export function initAutoBackupScheduler(): () => void {
  const checkAndRunAutoBackup = () => {
    const lastBackup = localStorage.getItem('mellah_last_auto_backup_timestamp')
    const now = Date.now()
    const ONE_DAY_MS = 24 * 60 * 60 * 1000

    if (!lastBackup || now - new Date(lastBackup).getTime() >= ONE_DAY_MS) {
      exportDatabaseBackup(true).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Auto backup background task warning:', err)
      })
    }
  }

  // Initial check on boot
  checkAndRunAutoBackup()

  // Periodic check every 4 hours
  const intervalId = setInterval(checkAndRunAutoBackup, 4 * 60 * 60 * 1000)

  return () => clearInterval(intervalId)
}
