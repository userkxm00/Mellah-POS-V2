import { describe, it, expect, beforeAll, afterAll } from 'vitest'
const { DatabaseSync } = require('node:sqlite')
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Database Schema (0001_init migration)', () => {
  let db: DatabaseSync
  let dbPath: string

  beforeAll(() => {
    // Create a temp database for testing
    dbPath = path.join(os.tmpdir(), `mellah-pos-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    // Apply the migration
    const migrationPath = path.join(
      process.cwd(),
      'database',
      'migrations',
      '0001_init.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)
  })

  afterAll(() => {
    db.close()
    // Clean up temp files
    try {
      fs.unlinkSync(dbPath)
      fs.unlinkSync(`${dbPath}-wal`)
      fs.unlinkSync(`${dbPath}-shm`)
    } catch {
      // Files may not exist, that's fine
    }
  })

  it('creates all 13 expected tables', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>

    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('branches')
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('categories')
    expect(tableNames).toContain('products')
    expect(tableNames).toContain('product_variants')
    expect(tableNames).toContain('stock_movements')
    expect(tableNames).toContain('shifts')
    expect(tableNames).toContain('customers')
    expect(tableNames).toContain('sales')
    expect(tableNames).toContain('sale_items')
    expect(tableNames).toContain('returns')
    expect(tableNames).toContain('store_settings')
    expect(tableNames).toContain('sync_queue')
  })

  it('inserts a branch with UUID primary key', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    db.prepare('INSERT INTO branches (id, name, address) VALUES (?, ?, ?)').run(
      id,
      'Test Branch',
      '123 Test St'
    )

    const row = db.prepare('SELECT * FROM branches WHERE id = ?').get(id) as {
      id: string
      name: string
      address: string
    }

    expect(row).toBeDefined()
    expect(row.id).toBe(id)
    expect(row.name).toBe('Test Branch')
  })

  it('enforces foreign key constraint on users.branch_id', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES ('u1', 'nonexistent', 'Test', 'cashier', 'hash')"
      ).run()
    }).toThrow()
  })

  it('enforces CHECK constraint on users.role', () => {
    const branchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES ('u2', ?, 'Test', 'invalid_role', 'hash')"
      ).run(branchId)
    }).toThrow()
  })

  it('enforces CHECK constraint on stock_movements.type', () => {
    const branchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    // Need a product + variant first for FK
    db.prepare(
      "INSERT OR IGNORE INTO products (id, branch_id, name, price_dzd) VALUES ('p-fk', ?, 'FK Product', 100)"
    ).run(branchId)
    db.prepare(
      "INSERT OR IGNORE INTO product_variants (id, product_id, branch_id, barcode) VALUES ('v-fk', 'p-fk', ?, 'fk-barcode')"
    ).run(branchId)

    expect(() => {
      db.prepare(
        "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('sm-bad', ?, 'v-fk', 'invalid_type', 5)"
      ).run(branchId)
    }).toThrow()
  })

  it('enforces UNIQUE constraint on product_variants.barcode', () => {
    const branchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    // Create a product first
    db.prepare(
      "INSERT OR IGNORE INTO products (id, branch_id, name, price_dzd) VALUES ('p1', ?, 'Test Product', 1000)"
    ).run(branchId)

    // Insert first variant with barcode
    db.prepare(
      "INSERT OR IGNORE INTO product_variants (id, product_id, branch_id, barcode) VALUES ('v1', 'p1', ?, '123456')"
    ).run(branchId)

    // Try duplicate barcode — should fail
    expect(() => {
      db.prepare(
        "INSERT INTO product_variants (id, product_id, branch_id, barcode) VALUES ('v2', 'p1', ?, '123456')"
      ).run(branchId)
    }).toThrow()
  })

  it('supports transaction rollback on failure', () => {
    const branchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    // Count products before
    const before = (
      db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }
    ).count

    // Try a transaction that will fail midway
    try {
      db.exec('BEGIN')
      db.prepare(
        "INSERT INTO products (id, branch_id, name, price_dzd) VALUES ('tx-p1', ?, 'TX Product', 500)"
      ).run(branchId)

      // This should fail (foreign key violation)
      db.prepare(
        "INSERT INTO product_variants (id, product_id, branch_id, barcode) VALUES ('tx-v1', 'nonexistent-product', ?, '999')"
      ).run(branchId)

      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
    }

    // Count products after — should be same as before (rolled back)
    const after = (
      db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }
    ).count

    expect(after).toBe(before)
  })

  it('derives stock correctly by summing stock_movements', () => {
    const branchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    // Create a product+variant for this test
    db.prepare(
      "INSERT OR IGNORE INTO products (id, branch_id, name, price_dzd) VALUES ('p-stock', ?, 'Stock Test', 1000)"
    ).run(branchId)
    db.prepare(
      "INSERT OR IGNORE INTO product_variants (id, product_id, branch_id, barcode) VALUES ('v-stock', 'p-stock', ?, 'stock-barcode')"
    ).run(branchId)

    const variantId = 'v-stock'

    // Add stock movements
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('sm-1', ?, ?, 'restock', 50)"
    ).run(branchId, variantId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('sm-2', ?, ?, 'sale', -3)"
    ).run(branchId, variantId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('sm-3', ?, ?, 'sale', -2)"
    ).run(branchId, variantId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('sm-4', ?, ?, 'return', 1)"
    ).run(branchId, variantId)

    // Query computed stock
    const result = db
      .prepare(
        'SELECT COALESCE(SUM(quantity_change), 0) as current_stock FROM stock_movements WHERE variant_id = ?'
      )
      .get(variantId) as { current_stock: number }

    // 50 - 3 - 2 + 1 = 46
    expect(result.current_stock).toBe(46)
  })
})
