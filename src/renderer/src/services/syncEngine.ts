import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { useSyncStore } from '@/stores/syncStore'
import { supabase } from '@/lib/supabase'
import type { SyncQueueEntry, SyncOperation } from '@/types/database'

/**
 * Enqueue a database operation to the local sync_queue table.
 * Must be called whenever local DB writes occur so operations are pushed to cloud when online.
 */
export async function enqueueSyncOperation(
  tableName: string,
  operation: SyncOperation,
  payload: object
): Promise<string> {
  const id = generateUUID()
  const now = new Date().toISOString()
  const payloadJson = JSON.stringify(payload)

  try {
    await window.electron.db.execute(
      `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, 0)`,
      [id, tableName, operation, payloadJson, now]
    )
    logger.info('Enqueued sync operation', { id, tableName, operation })
    await updatePendingQueueCount()
    return id
  } catch (err) {
    logger.error('Failed to enqueue sync operation', { err, tableName, operation })
    throw err
  }
}

/**
 * Update current pending queue count in syncStore.
 */
export async function updatePendingQueueCount(): Promise<number> {
  try {
    const rows = await window.electron.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE synced_at IS NULL'
    )
    const count = rows[0]?.count ?? 0
    useSyncStore.getState().setPendingCount(count)
    return count
  } catch (err) {// eslint-disable-next-line no-console
      console.error("[syncEngine]", err); return 0
  }
}

/**
 * Perform a reachability check.
 * Checks real network connectivity with fallbacks.
 */
export async function checkRealConnectivity(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    useSyncStore.getState().setOnlineStatus(false)
    return false
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    // Ping cloudflare cdn-cgi/trace with no-cors to avoid CORS blocks
    await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeoutId)

    useSyncStore.getState().setOnlineStatus(true)
    return true
  } catch (err) {// eslint-disable-next-line no-console
      console.error("[syncEngine]", err); // If ping fails (e.g. offline local network), use navigator.onLine fallback
    const online = typeof navigator !== 'undefined' ? navigator.onLine : false
    useSyncStore.getState().setOnlineStatus(online)
    return online
  }
}

import { useAuthStore } from '@/stores/authStore'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'

/**
 * Ensures the Electron app establishes an authenticated Supabase session.
 * Uses Supabase Anonymous Auth with branch_id in user_metadata so RLS policies pass with role = 'authenticated'.
 */
export async function ensureSupabaseAuth(): Promise<boolean> {
  const hasRealSupabase =
    import.meta.env.VITE_SUPABASE_URL &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

  if (!hasRealSupabase) return false

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return true

    const activeBranch = useAuthStore.getState().currentBranch
    const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

    const { data, error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          branch_id: branchId,
        },
      },
    })

    if (error) {
      logger.error('Failed to establish Supabase Anonymous Auth session', error)
      return false
    }

    return !!data.session
  } catch (err) {
    logger.error('Error ensuring Supabase Auth', err)
    return false
  }
}

/**
 * Background queue processor.
 * Pushes pending sync_queue entries in chronological order.
 */
export async function processSyncQueue(): Promise<number> {
  const syncStore = useSyncStore.getState()
  if (syncStore.isSyncing) return 0

  const isOnline = await checkRealConnectivity()
  if (!isOnline) {
    return 0
  }

  syncStore.setSyncing(true)
  let processedCount = 0

  try {
    const hasRealSupabase =
      import.meta.env.VITE_SUPABASE_URL &&
      !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

    if (hasRealSupabase) {
      await ensureSupabaseAuth()
    }

    const pendingEntries = await window.electron.db.query<SyncQueueEntry>(
      `SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 50`
    )

    if (pendingEntries.length === 0) {
      // Bi-directional pull check even if push queue is empty
      await pullFromSupabase()
      syncStore.setSyncing(false)
      return 0
    }

    const now = new Date().toISOString()

    for (const entry of pendingEntries) {
      try {
        let payloadObj: Record<string, unknown> = {}
        try {
          payloadObj = JSON.parse(entry.payload)
        } catch (err) {// eslint-disable-next-line no-console
      console.error("[syncEngine]", err); payloadObj = {}
        }

        // If actual Supabase credentials exist, push to remote Supabase DB
        if (hasRealSupabase) {
          if (entry.operation === 'insert' || entry.operation === 'update') {
            const { error } = await supabase.from(entry.table_name).upsert(payloadObj)
            if (error) throw new Error(error.message)
          } else if (entry.operation === 'delete') {
            const { error } = await supabase
              .from(entry.table_name)
              .delete()
              .eq('id', (payloadObj as { id?: string }).id ?? '')
            if (error) throw new Error(error.message)
          }
        }

        // Mark as synced locally
        await window.electron.db.execute(
          `UPDATE sync_queue SET synced_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?`,
          [now, entry.id]
        )
        processedCount++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'فشل الرفع للسحابة'
        logger.error('Failed to sync queue entry', { id: entry.id, err })
        await window.electron.db.execute(
          `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
          [errorMsg, entry.id]
        )
      }
    }

    // Bi-directional pull from Supabase for multi-branch catalog sync
    await pullFromSupabase()

    syncStore.setLastSyncedAt(now)
    await updatePendingQueueCount()
  } catch (err) {
    logger.error('Error during sync queue processing', err)
  } finally {
    syncStore.setSyncing(false)
  }

  return processedCount
}

/**
 * Pull new & updated records from Supabase cloud database to local SQLite database.
 * Enables true multi-branch synchronization so catalog updates are pulled across branches.
 */
export async function pullFromSupabase(): Promise<number> {
  const hasRealSupabase =
    import.meta.env.VITE_SUPABASE_URL &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

  if (!hasRealSupabase) return 0

  await ensureSupabaseAuth()

  let pulledCount = 0
  const lastPull = localStorage.getItem('mellah_last_pull_timestamp') ?? '1970-01-01T00:00:00.000Z'
  const now = new Date().toISOString()

  const ALLOWED_SYNC_SET = new Set([
    'branches',
    'categories',
    'products',
    'product_variants',
    'customers',
    'store_settings',
  ])

  for (const tableName of Array.from(ALLOWED_SYNC_SET)) {
    try {
      if (!ALLOWED_SYNC_SET.has(tableName)) {
        throw new Error(`Unauthorized table name in sync engine: ${tableName}`)
      }
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .gt('updated_at', lastPull)

      if (error || !data || data.length === 0) continue

      for (const item of data) {
        const columns = Object.keys(item)
        const placeholders = columns.map(() => '?').join(', ')
        const updateAssignments = columns
          .filter((col) => col !== 'id')
          .map((col) => `${col} = EXCLUDED.${col}`)
          .join(', ')

        const values = columns.map((col) => item[col])

        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`
        await window.electron.db.execute(sql, values)
        pulledCount++
      }
    } catch (err) {
      logger.error('Failed to pull table updates from Supabase', { tableName, err })
    }
  }

  localStorage.setItem('mellah_last_pull_timestamp', now)
  return pulledCount
}

/**
 * Manual trigger for user to force re-connection check and sync.
 */
export async function manualReconnectAndSync(): Promise<{ isOnline: boolean; processed: number }> {
  useSyncStore.getState().setSyncing(true)
  const isOnline = await checkRealConnectivity()
  let processed = 0
  if (isOnline) {
    processed = await processSyncQueue()
  }
  useSyncStore.getState().setSyncing(false)
  return { isOnline, processed }
}

/**
 * Initialize background sync polling loop (runs every 15 seconds).
 */
export function startBackgroundSyncLoop(): () => void {
  // Initial check & process
  checkRealConnectivity()
  updatePendingQueueCount()
  processSyncQueue()

  const intervalId = setInterval(() => {
    processSyncQueue()
  }, 15000)

  return () => clearInterval(intervalId)
}
