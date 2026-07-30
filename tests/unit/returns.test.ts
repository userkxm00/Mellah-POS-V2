import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Returns, Refunds & Inventory Restock (Phase 6)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-return-test'
  const cashierId = 'u-return-test'
  const variantId = 'v-return-item'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-return-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Branch Return')").run(branchId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier Return', 'cashier', '0000')"
    ).run(cashierId, branchId)

    db.prepare(
      "INSERT INTO products (id, branch_id, name, price_dzd) VALUES ('p-ret', ?, 'Jacket', 5000)"
    ).run(branchId)

    db.prepare(
      "INSERT INTO product_variants (id, product_id, branch_id, size, barcode) VALUES (?, 'p-ret', ?, 'XL', '555444333')"
    ).run(variantId, branchId)

    // Initial Restock: 20 items
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note) VALUES ('m-init-20', ?, ?, 'restock', 20, 'Initial')"
    ).run(branchId, variantId)
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

  it('completes sale of 5 items, reducing stock to 15', () => {
    const saleId = 'sale-to-return-1'

    db.exec('BEGIN')
    db.prepare(
      "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method, status) VALUES (?, ?, ?, 25000, 'cash', 'completed')"
    ).run(saleId, branchId, cashierId)

    db.prepare(
      'INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES (?, ?, ?, 5, 5000)'
    ).run('si-ret-1', saleId, variantId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id) VALUES ('m-sale-5', ?, ?, 'sale', -5, ?)"
    ).run(branchId, variantId, saleId)
    db.exec('COMMIT')

    const stock = (
      db
        .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(stock).toBe(15) // 20 - 5 = 15
  })

  it('processes partial return of 2 items, creating positive stock_movement restock (+2) and increasing stock to 17', () => {
    const saleId = 'sale-to-return-1'
    const returnId = 'ret-partial-1'
    const returnQty = 2

    db.exec('BEGIN')
    // 1. Insert Return record matching DB schema (original_sale_id, variant_id, quantity, refund_method, reason, processed_by)
    db.prepare(
      "INSERT INTO returns (id, branch_id, original_sale_id, variant_id, quantity, refund_method, reason, processed_by) VALUES (?, ?, ?, ?, ?, 'cash', 'Size mismatch', ?)"
    ).run(returnId, branchId, saleId, variantId, returnQty, cashierId)

    // 2. Insert Stock Movement Ledger Entry (+2)
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note) VALUES ('m-ret-2', ?, ?, 'return', ?, ?, 'Customer Return')"
    ).run(branchId, variantId, returnQty, saleId)
    db.exec('COMMIT')

    // Verify Return record
    const retRecord = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as {
      original_sale_id: string
      quantity: number
      refund_method: string
    }

    expect(retRecord).toBeDefined()
    expect(retRecord.original_sale_id).toBe(saleId)
    expect(retRecord.quantity).toBe(2)
    expect(retRecord.refund_method).toBe('cash')

    // Verify Positive Stock Movement (+2)
    const move = db.prepare("SELECT * FROM stock_movements WHERE id = 'm-ret-2'").get() as {
      type: string
      quantity_change: number
    }

    expect(move.type).toBe('return')
    expect(move.quantity_change).toBe(2)

    // Verify recovered inventory stock level (20 - 5 + 2 = 17)
    const updatedStock = (
      db
        .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s

    expect(updatedStock).toBe(17)
  })
})
