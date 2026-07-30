import initSqlJs from 'sql.js'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { seedInitialData } from './seed'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rawDb: any = null
let dbPath: string = ''

function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'mellah-pos.db')
}

function getMigrationsPath(): string {
  return path.join(app.getAppPath(), 'database', 'migrations')
}

export interface StatementWrapper {
  all(...params: unknown[]): Promise<unknown[]>
  run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>
}

export interface DbWrapper {
  exec(sql: string): Promise<void>
  prepare(sql: string): StatementWrapper
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>
  close(): void
}

let activeWrapper: DbWrapper | null = null

let inTransaction = false

function persist(): void {
  if (rawDb && dbPath && !inTransaction) {
    const data = rawDb.export()
    const tempPath = `${dbPath}.tmp`
    fs.writeFileSync(tempPath, Buffer.from(data))
    fs.renameSync(tempPath, dbPath)
  }
}

// Global promise to await database initialization
let initPromise: Promise<DbWrapper> | null = null

export function initDatabase(): Promise<DbWrapper> {
  if (activeWrapper) return Promise.resolve(activeWrapper)
  if (initPromise) return initPromise

  initPromise = (async () => {
    dbPath = getDatabasePath()
    const dbDir = path.dirname(dbPath)

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const SQL = await initSqlJs()

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      rawDb = new SQL.Database(fileBuffer)
    } else {
      rawDb = new SQL.Database()
      persist()
    }

    // Enable WAL mode & foreign keys (WASM SQLite requires manual configuration)
    rawDb.run('PRAGMA foreign_keys = ON;')

    const wrapper: DbWrapper = {
      async exec(sql: string): Promise<void> {
        const cleanSql = sql.trim().toUpperCase()
        if (cleanSql.startsWith('BEGIN')) {
          inTransaction = true
        } else if (cleanSql.startsWith('COMMIT') || cleanSql.startsWith('ROLLBACK')) {
          inTransaction = false
        }
        rawDb.run(sql)
        persist()
      },
      prepare(sql: string): StatementWrapper {
        return {
          async all(...params: unknown[]): Promise<unknown[]> {
            const stmt = rawDb.prepare(sql)
            const actualParams = Array.isArray(params[0]) ? params[0] : params
            stmt.bind(actualParams)
            const rows: unknown[] = []
            while (stmt.step()) {
              rows.push(stmt.getAsObject())
            }
            stmt.free()
            return rows
          },
          async run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
            const stmt = rawDb.prepare(sql)
            const actualParams = Array.isArray(params[0]) ? params[0] : params
            stmt.run(actualParams)
            stmt.free()
            persist()

            // Fetch changes and lastID
            const info = rawDb.exec('SELECT changes() as changes, last_insert_rowid() as id')
            const changes = info[0]?.values[0]?.[0] ?? 0
            const lastInsertRowid = info[0]?.values[0]?.[1] ?? 0
            return { changes, lastInsertRowid }
          },
        }
      },
      async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
        const stmt = rawDb.prepare(sql)
        stmt.bind(params)
        const rows: T[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T)
        }
        stmt.free()
        return rows
      },
      async execute(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
        const cleanSql = sql.trim().toUpperCase()
        if (cleanSql.startsWith('BEGIN')) {
          inTransaction = true
        } else if (cleanSql.startsWith('COMMIT') || cleanSql.startsWith('ROLLBACK')) {
          inTransaction = false
        }
        const stmt = rawDb.prepare(sql)
        stmt.run(params)
        stmt.free()
        persist()

        const info = rawDb.exec('SELECT changes() as changes, last_insert_rowid() as id')
        const changes = info[0]?.values[0]?.[0] ?? 0
        const lastInsertRowid = info[0]?.values[0]?.[1] ?? 0
        return { changes, lastInsertRowid }
      },
      close(): void {
        if (rawDb) {
          persist()
          rawDb.close()
          rawDb = null
          activeWrapper = null
          initPromise = null
        }
      },
    }

    activeWrapper = wrapper

    await runMigrations(wrapper)
    await ensureSalesColumnsExist(wrapper)
    await seedInitialData(wrapper)

    return wrapper
  })()

  return initPromise
}

async function ensureSalesColumnsExist(wrapper: DbWrapper): Promise<void> {
  try {
    const tableInfo = await wrapper.query<{ name: string }>('PRAGMA table_info(sales)')
    const columns = new Set(tableInfo.map((c) => c.name))
    if (!columns.has('voided_at')) {
      await wrapper.exec('ALTER TABLE sales ADD COLUMN voided_at TEXT')
    }
    if (!columns.has('void_reason')) {
      await wrapper.exec('ALTER TABLE sales ADD COLUMN void_reason TEXT')
    }
  } catch {
    // Non-critical: sales table might not exist before migrations
  }
}

async function runMigrations(wrapper: DbWrapper): Promise<void> {
  await wrapper.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrationsPath = getMigrationsPath()

  if (!fs.existsSync(migrationsPath)) {
    return
  }

  const migrationFiles = fs
    .readdirSync(migrationsPath)
    .filter((f) => f.endsWith('.sql'))
    .sort((a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true }))

  const appliedRows = await wrapper.query<{ name: string }>('SELECT name FROM _migrations')
  const applied = new Set(appliedRows.map((row) => row.name))

  for (const file of migrationFiles) {
    if (applied.has(file)) continue

    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf-8')

    try {
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      await wrapper.exec('BEGIN')
      for (const stmt of statements) {
        await wrapper.exec(stmt)
      }
      await wrapper.execute('INSERT INTO _migrations (name) VALUES (?)', [file])
      await wrapper.exec('COMMIT')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('MIGRATION FAILED:', file, error)
      try {
        await wrapper.exec('ROLLBACK')
      } catch (rollbackErr) {
        // eslint-disable-next-line no-console
        console.error('ROLLBACK FAILED:', rollbackErr)
      }
      throw error
    }
  }
}

export function whenDatabaseReady(): Promise<DbWrapper> {
  if (activeWrapper) return Promise.resolve(activeWrapper)
  if (initPromise) return initPromise
  return initDatabase()
}

export function getDatabase(): DbWrapper {
  if (!activeWrapper) {
    throw new Error('Database not initialized. Ensure initDatabase() is awaited on app startup.')
  }
  return activeWrapper
}

export function closeDatabase(): void {
  if (activeWrapper) {
    activeWrapper.close()
  }
}

export async function withTransaction<T>(fn: (wrapper: DbWrapper) => Promise<T>): Promise<T> {
  const wrapper = await whenDatabaseReady()
  try {
    await wrapper.exec('BEGIN')
    const result = await fn(wrapper)
    await wrapper.exec('COMMIT')
    return result
  } catch (error) {
    await wrapper.exec('ROLLBACK')
    throw error
  }
}

export function getDatabaseFilePath(): string {
  return getDatabasePath()
}
