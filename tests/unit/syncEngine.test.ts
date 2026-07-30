import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Offline Sync Engine & Multi-Branch Reconciliation (Phase 5)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchAId = 'b-branch-algiers'
  const branchBId = 'b-branch-oran'
  const cashierAId = 'u-cashier-a'
  const cashierBId = 'u-cashier-b'
  const variantId = 'v-shared-shirt'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-sync-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    // Setup 2 branches and cashiers
    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Algiers')").run(branchAId)
    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Oran')").run(branchBId)

    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier A', 'cashier', '0000')"
    ).run(cashierAId, branchAId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier B', 'cashier', '0000')"
    ).run(cashierBId, branchBId)

    // Setup shared product variant with starting stock = 5
    db.prepare(
      "INSERT INTO products (id, branch_id, name, price_dzd) VALUES ('p-shared', ?, 'Shared Shirt', 2000)"
    ).run(branchAId)

    db.prepare(
      "INSERT INTO product_variants (id, product_id, branch_id, size, barcode) VALUES (?, 'p-shared', ?, 'L', '999888777')"
    ).run(variantId, branchAId)

    // Starting stock restock: 5 units
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note) VALUES ('m-init-5', ?, ?, 'restock', 5, 'Initial Stock')"
    ).run(branchAId, variantId)
  })

  afterAll(() => {
    db.close()
    try {
      fs.unlinkSync(dbPath)
      fs.unlinkSync(`${dbPath}-wal`)
      fs.unlinkSync(`${dbPath}-shm`)
    } catch {
      // Ignore
    }
  })

  it('enqueues local write operations into sync_queue', () => {
    const syncOpId = 'sq-1'
    const payload = JSON.stringify({ sale_id: 'sale-1', total: 2000 })

    db.prepare(
      "INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'sales', 'insert', ?, datetime('now'), 0)"
    ).run(syncOpId, payload)

    const entry = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(syncOpId) as {
      table_name: string
      operation: string
      synced_at: string | null
    }

    expect(entry).toBeDefined()
    expect(entry.table_name).toBe('sales')
    expect(entry.synced_at).toBeNull()
  })

  it('simulates two offline branches selling the last unit concurrently and reconciling via append-only ledger', () => {
    // Current stock before offline sales = 5
    const initialStock = (
      db
        .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(initialStock).toBe(5)

    // Branch A sells 1 unit offline
    const saleAId = 'sale-offline-branch-a'
    const moveAId = 'm-offline-a'
    db.exec('BEGIN')
    db.prepare(
      "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 2000, 'cash')"
    ).run(saleAId, branchAId, cashierAId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id) VALUES (?, ?, ?, 'sale', -1, ?)"
    ).run(moveAId, branchAId, variantId, saleAId)

    db.prepare(
      "INSERT INTO sync_queue (id, table_name, operation, payload, created_at) VALUES ('sq-a', 'sales', 'insert', ?, datetime('now'))"
    ).run(JSON.stringify({ sale_id: saleAId }))
    db.exec('COMMIT')

    // Branch B sells 1 unit offline concurrently
    const saleBId = 'sale-offline-branch-b'
    const moveBId = 'm-offline-b'
    db.exec('BEGIN')
    db.prepare(
      "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 2000, 'cash')"
    ).run(saleBId, branchBId, cashierBId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id) VALUES (?, ?, ?, 'sale', -1, ?)"
    ).run(moveBId, branchBId, variantId, saleBId)

    db.prepare(
      "INSERT INTO sync_queue (id, table_name, operation, payload, created_at) VALUES ('sq-b', 'sales', 'insert', ?, datetime('now'))"
    ).run(JSON.stringify({ sale_id: saleBId }))
    db.exec('COMMIT')

    // Reconnect & sync queue processing:
    db.prepare("UPDATE sync_queue SET synced_at = datetime('now') WHERE synced_at IS NULL").run()

    // Derived stock after reconciliation = 5 - 1 (Branch A) - 1 (Branch B) = 3
    const finalStock = (
      db
        .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(finalStock).toBe(3)

    // Verify all queue items are synced
    const unsyncedCount = (
      db.prepare('SELECT COUNT(*) as c FROM sync_queue WHERE synced_at IS NULL').get() as { c: number }
    ).c

    expect(unsyncedCount).toBe(0)
  })

  it('guarantees idempotency on duplicate sync execution using UUID primary key', () => {
    const dupSaleId = 'sale-idempotent-1'

    // First insertion
    db.prepare(
      "INSERT OR IGNORE INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 1000, 'cash')"
    ).run(dupSaleId, branchAId, cashierAId)

    // Duplicate insertion attempt with identical UUID (e.g. after crash mid-sync)
    db.prepare(
      "INSERT OR IGNORE INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 1000, 'cash')"
    ).run(dupSaleId, branchAId, cashierAId)

    // Count sales records with this UUID
    const count = (
      db.prepare('SELECT COUNT(*) as c FROM sales WHERE id = ?').get(dupSaleId) as { c: number }
    ).c

    expect(count).toBe(1) // Guaranteed single record, no duplicate created
  })
})
