import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: DatabaseSync | null = null

/**
 * Get the path to the SQLite database file.
 * Stored in the app's user data directory (not the business database location).
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'mellah-pos.db')
}

/**
 * Get the path to the migrations directory.
 * In development, this is relative to the project root.
 * In production, it's bundled with the app.
 */
function getMigrationsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'database', 'migrations')
  }
  return path.join(app.getAppPath(), 'database', 'migrations')
}

/**
 * Initialize the SQLite database connection with WAL mode and foreign keys.
 * Uses Node.js 22+ built-in SQLite (node:sqlite) — no native compilation required.
 */
export function initDatabase(): DatabaseSync {
  if (db) return db

  const dbPath = getDatabasePath()
  const dbDir = path.dirname(dbPath)

  // Ensure the directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new DatabaseSync(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.exec('PRAGMA journal_mode = WAL')
  // Enable foreign key enforcement
  db.exec('PRAGMA foreign_keys = ON')

  // Run migrations
  runMigrations(db)

  return db
}

/**
 * Run all pending SQL migrations in order.
 * Migrations are tracked in a `_migrations` meta table.
 */
function runMigrations(database: DatabaseSync): void {
  // Create migrations tracking table
  database.exec(`
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

  // Get all migration files sorted by name
  const migrationFiles = fs
    .readdirSync(migrationsPath)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // Get already applied migrations
  const stmt = database.prepare('SELECT name FROM _migrations')
  const rows = stmt.all() as Array<{ name: string }>
  const applied = new Set(rows.map((row) => row.name))

  // Apply pending migrations
  for (const file of migrationFiles) {
    if (applied.has(file)) continue

    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf-8')

    // Execute migration in a pseudo-transaction
    // node:sqlite DatabaseSync doesn't have .transaction() method,
    // so we use BEGIN/COMMIT/ROLLBACK manually
    try {
      database.exec('BEGIN')
      database.exec(sql)
      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

/**
 * Get the active database instance. Throws if not initialized.
 */
export function getDatabase(): DatabaseSync {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Execute a write operation inside a transaction.
 * All multi-table writes MUST use this to ensure atomicity.
 */
export function withTransaction<T>(fn: (database: DatabaseSync) => T): T {
  const database = getDatabase()
  try {
    database.exec('BEGIN')
    const result = fn(database)
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

/**
 * Get the database path (for backup purposes).
 */
export function getDatabaseFilePath(): string {
  return getDatabasePath()
}
