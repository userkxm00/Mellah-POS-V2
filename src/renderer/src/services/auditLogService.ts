import { generateUUID } from '@/lib/uuid'
import { useAuthStore } from '@/stores/authStore'

export interface AuditLogItem {
  id: string
  user_id: string
  user_name?: string
  action: string
  entity_name: string
  entity_id?: string
  details: string
  created_at: string
}

export async function ensureAuditLogTable(): Promise<void> {
  await window.electron.db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

export async function recordAuditLog(
  action: string,
  entityName: string,
  details: string,
  entityId?: string
): Promise<void> {
  try {
    await ensureAuditLogTable()
    const activeUser = useAuthStore.getState().currentUser
    const userId = activeUser?.id ?? 'system'
    const logId = generateUUID()
    const now = new Date().toISOString()

    await window.electron.db.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, userId, action, entityName, entityId || null, details, now]
    )
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to record audit log:', err)
  }
}

export async function fetchAuditLogs(limit = 50): Promise<AuditLogItem[]> {
  await ensureAuditLogTable()
  const rows = await window.electron.db.query<AuditLogItem>(
    `SELECT a.*, u.full_name as user_name
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [limit]
  )
  return rows
}
