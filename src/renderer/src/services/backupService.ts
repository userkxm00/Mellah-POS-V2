export async function exportDatabaseBackup(): Promise<string> {
  try {
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFileName = `mellah-pos-backup-${dateStr}.json`

    // Dump tables to JSON backup string
    const tables = [
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
    ]
    const backupData: Record<string, unknown[]> = {}

    for (const table of tables) {
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

  const tables = [
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
  ]

  const operations: Array<{ sql: string; params: unknown[] }> = []
  let totalRestoredRows = 0

  // Reverse tables for clean deletion (dependencies first)
  const reverseTables = [...tables].reverse()
  for (const table of reverseTables) {
    operations.push({ sql: `DELETE FROM ${table}`, params: [] })
  }

  // Build insert operations for each table in backup
  for (const table of tables) {
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
