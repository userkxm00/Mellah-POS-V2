import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Atomic Sale Transaction & Inventory Ledger (Phase 2)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-sale-test'
  const cashierId = 'u-sale-test'
  const productId = 'p-sale-1'
  const variantId = 'v-sale-1'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-sale-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    // Setup dummy branch, user, product, variant
    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Branch 1')").run(branchId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier 1', 'cashier', '0000')"
    ).run(cashierId, branchId)

    db.prepare(
      "INSERT INTO products (id, branch_id, name, price_dzd, cost_dzd) VALUES (?, ?, 'T-Shirt Demo', 2000, 1000)"
    ).run(productId, branchId)

    db.prepare(
      "INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd) VALUES (?, ?, ?, 'M', 'Black', '777000111', 2000)"
    ).run(variantId, productId, branchId)

    // Initial stock restock: 50 units
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_by) VALUES ('m-init', ?, ?, 'restock', 50, 'Initial Stock', ?)"
    ).run(branchId, variantId, cashierId)
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

  it('verifies initial stock is derived from stock_movements ledger', () => {
    const stockRow = db
      .prepare(
        'SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_movements WHERE variant_id = ?'
      )
      .get(variantId) as { stock: number }

    expect(stockRow.stock).toBe(50)
  })

  it('executes atomic sale transaction with sale_items and stock deduction ledger', () => {
    const saleId = 'sale-atomic-1'
    const saleItemId = 'si-1'
    const movementId = 'm-sale-1'
    const qtySold = 3
    const unitPrice = 2000
    const totalDzd = qtySold * unitPrice

    try {
      db.exec('BEGIN')

      // 1. Insert Sales
      db.prepare(
        "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method, status) VALUES (?, ?, ?, ?, 'cash', 'completed')"
      ).run(saleId, branchId, cashierId, totalDzd)

      // 2. Insert Sale Item
      db.prepare(
        'INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES (?, ?, ?, ?, ?)'
      ).run(saleItemId, saleId, variantId, qtySold, unitPrice)

      // 3. Insert Stock Movement Ledger Entry (Negative)
      db.prepare(
        "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, created_by) VALUES (?, ?, ?, 'sale', ?, ?, ?)"
      ).run(movementId, branchId, variantId, -qtySold, saleId, cashierId)

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    // Verify Sale record exists
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as {
      total_dzd: number
      payment_method: string
    }
    expect(sale).toBeDefined()
    expect(sale.total_dzd).toBe(6000)

    // Verify Sale Item exists
    const item = db.prepare('SELECT * FROM sale_items WHERE id = ?').get(saleItemId) as {
      quantity: number
    }
    expect(item).toBeDefined()
    expect(item.quantity).toBe(3)

    // Verify Stock Movement exists
    const movement = db
      .prepare('SELECT * FROM stock_movements WHERE id = ?')
      .get(movementId) as { quantity_change: number; type: string }
    expect(movement).toBeDefined()
    expect(movement.type).toBe('sale')
    expect(movement.quantity_change).toBe(-3)

    // Verify updated stock ledger total (50 - 3 = 47)
    const newStockRow = db
      .prepare(
        'SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_movements WHERE variant_id = ?'
      )
      .get(variantId) as { stock: number }

    expect(newStockRow.stock).toBe(47)
  })

  it('rolls back atomic sale completely if any statement fails', () => {
    const saleIdFail = 'sale-fail-1'
    const beforeSaleCount = (
      db.prepare('SELECT COUNT(*) as c FROM sales').get() as { c: number }
    ).c
    const beforeMoveCount = (
      db.prepare('SELECT COUNT(*) as c FROM stock_movements').get() as { c: number }
    ).c

    try {
      db.exec('BEGIN')

      // Insert Sales
      db.prepare(
        "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method, status) VALUES (?, ?, ?, 4000, 'cash', 'completed')"
      ).run(saleIdFail, branchId, cashierId)

      // Insert Sale Item with NONEXISTENT variant_id -> Should trigger Foreign Key Error!
      db.prepare(
        'INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES (?, ?, ?, 2, 2000)'
      ).run('si-fail', saleIdFail, 'nonexistent-variant')

      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
    }

    const afterSaleCount = (
      db.prepare('SELECT COUNT(*) as c FROM sales').get() as { c: number }
    ).c
    const afterMoveCount = (
      db.prepare('SELECT COUNT(*) as c FROM stock_movements').get() as { c: number }
    ).c

    // Verified rollback: counts remain unchanged
    expect(afterSaleCount).toBe(beforeSaleCount)
    expect(afterMoveCount).toBe(beforeMoveCount)
  })
})
