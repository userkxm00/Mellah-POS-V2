/**
 * Mellah POS — File-Based Database Backup Service
 *
 * Backups are written as real JSON files to disk via the Main Process (Node fs).
 * Default location: {userData}/backups/mellah-pos-backup-{ISO date}.json
 * Retention: last 14 daily backups (older ones auto-deleted).
 *
 * Manual export/import still uses browser download/upload for portability.
 */

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

/**
 * Manual export: dumps all 17 tables to a JSON file downloaded by the browser.
 */
export async function exportDatabaseBackup(): Promise<string> {
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

/**
 * Manual import: restores all tables from a user-uploaded JSON string.
 */
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
 * Initializes background auto-backup scheduler.
 * Runs a file-based backup via Main Process IPC once every 24 hours.
 * Backup files are written to {userData}/backups/ with 14-day rotation.
 */
export function initAutoBackupScheduler(): () => void {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  const checkAndRunAutoBackup = async (): Promise<void> => {
    try {
      const info = await window.electron.backup.getInfo()

      // Skip if last backup was less than 24h ago
      if (info.latestBackup && Date.now() - info.latestBackup.time < ONE_DAY_MS) {
        return
      }

      await window.electron.backup.runAuto()
    } catch {
      // Silently fail — non-critical background task
    }
  }

  // Initial check on boot (after a short delay to let the app initialize)
  const bootTimeout = setTimeout(() => {
    checkAndRunAutoBackup()
  }, 10_000)

  // Periodic check every 4 hours
  const intervalId = setInterval(checkAndRunAutoBackup, 4 * 60 * 60 * 1000)

  return () => {
    clearTimeout(bootTimeout)
    clearInterval(intervalId)
  }
}
