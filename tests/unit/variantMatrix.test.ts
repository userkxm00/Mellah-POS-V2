import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Product & Variant Matrix Builder (Phase 3)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-matrix-test'
  const cashierId = 'u-matrix-test'
  const categoryId = 'c-matrix-test'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-matrix-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Branch Matrix')").run(branchId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Admin', 'admin', '0000')"
    ).run(cashierId, branchId)
    db.prepare("INSERT INTO categories (id, branch_id, name) VALUES (?, ?, 'Clothing')").run(
      categoryId,
      branchId
    )
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

  it('creates a product with 6 size x color variants and initial stock ledger in one transaction', () => {
    const productId = 'p-matrix-1'
    const sizes = ['S', 'M', 'L']
    const colors = ['Black', 'White']
    const basePrice = 3000
    const cost = 1500

    db.exec('BEGIN')

    // Insert product
    db.prepare(
      'INSERT INTO products (id, branch_id, category_id, name, price_dzd, cost_dzd) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, branchId, categoryId, 'Shirt Matrix', basePrice, cost)

    // Insert 3 x 2 = 6 variants
    let counter = 1
    for (const s of sizes) {
      for (const c of colors) {
        const vId = `v-mat-${s}-${c}`
        const barcode = `69088877700${counter}`
        const initialStock = 10

        db.prepare(
          'INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd) VALUES (?, ?, ?, ?, ?, ?, null)'
        ).run(vId, productId, branchId, s, c, barcode)

        // Stock movement restock
        db.prepare(
          "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_by) VALUES (?, ?, ?, 'restock', ?, 'Init Stock', ?)"
        ).run(`m-mat-${s}-${c}`, branchId, vId, initialStock, cashierId)

        counter++
      }
    }

    db.exec('COMMIT')

    // Verify variants count
    const varCountRow = db
      .prepare('SELECT COUNT(*) as c FROM product_variants WHERE product_id = ?')
      .get(productId) as { c: number }

    expect(varCountRow.c).toBe(6)

    // Verify total product stock across all 6 variants = 6 * 10 = 60
    const totalStockRow = db
      .prepare(
        `SELECT COALESCE(SUM(sm.quantity_change), 0) as total
         FROM product_variants v
         JOIN stock_movements sm ON sm.variant_id = v.id
         WHERE v.product_id = ?`
      )
      .get(productId) as { total: number }

    expect(totalStockRow.total).toBe(60)
  })

  it('performs stock adjustment via stock_movements ledger', () => {
    const variantId = 'v-mat-S-Black'

    // Stock before
    const beforeStock = (
      db
        .prepare('SELECT COALESCE(SUM(quantity_change), 0) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(beforeStock).toBe(10)

    // Add restock of 15 items
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_by) VALUES ('m-adj-1', ?, ?, 'restock', 15, 'New Shipment', ?)"
    ).run(branchId, variantId, cashierId)

    // Deduct adjustment of 2 items (damaged)
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_by) VALUES ('m-adj-2', ?, ?, 'adjustment', -2, 'Damaged', ?)"
    ).run(branchId, variantId, cashierId)

    // Stock after = 10 + 15 - 2 = 23
    const afterStock = (
      db
        .prepare('SELECT COALESCE(SUM(quantity_change), 0) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(afterStock).toBe(23)
  })
})
