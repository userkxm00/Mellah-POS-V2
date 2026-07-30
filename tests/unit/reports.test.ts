import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Analytics, Reporting & Inventory Valuation (Phase 7)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-report-test'
  const cashierId = 'u-report-test'
  const productId = 'p-rep-1'
  const variantId = 'v-rep-1'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-report-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Branch Analytics')").run(branchId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Reporter', 'admin', '0000')"
    ).run(cashierId, branchId)

    // Product with price 4000 DA, cost 2000 DA
    db.prepare(
      "INSERT INTO products (id, branch_id, name, price_dzd, cost_dzd) VALUES (?, ?, 'Jeans Alpha', 4000, 2000)"
    ).run(productId, branchId)

    db.prepare(
      "INSERT INTO product_variants (id, product_id, branch_id, size, barcode) VALUES (?, ?, ?, '32', '111222333')"
    ).run(variantId, productId, branchId)

    // Restock 10 items
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change) VALUES ('m-init-10', ?, ?, 'restock', 10)"
    ).run(branchId, variantId)

    // Completed Sale of 2 items: total 8000 DA
    db.prepare(
      "INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method, status) VALUES ('s-rep-1', ?, ?, 8000, 'cash', 'completed')"
    ).run(branchId, cashierId)

    db.prepare(
      'INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES (\'si-rep-1\', \'s-rep-1\', ?, 2, 4000)'
    ).run(variantId)

    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id) VALUES ('m-sale-2', ?, ?, 'sale', -2, 's-rep-1')"
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

  it('calculates total revenue and net profit', () => {
    const revRow = db
      .prepare(
        "SELECT SUM(total_dzd) as total_rev FROM sales WHERE branch_id = ? AND status = 'completed'"
      )
      .get(branchId) as { total_rev: number }

    expect(revRow.total_rev).toBe(8000)

    // Cost of items sold: 2 items * 2000 cost = 4000
    const costRow = db
      .prepare(
        `SELECT SUM(si.quantity * p.cost_dzd) as total_cost
         FROM sale_items si
         JOIN product_variants v ON v.id = si.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE p.branch_id = ?`
      )
      .get(branchId) as { total_cost: number }

    expect(costRow.total_cost).toBe(4000)

    const netProfit = revRow.total_rev - costRow.total_cost
    expect(netProfit).toBe(4000) // 8000 revenue - 4000 cost = 4000 profit
  })

  it('calculates inventory retail and cost valuation for remaining stock', () => {
    // Remaining stock: 10 - 2 = 8 items
    const stockRow = db
      .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
      .get(variantId) as { s: number }

    expect(stockRow.s).toBe(8)

    const costValuation = stockRow.s * 2000 // 8 * 2000 = 16000
    const retailValuation = stockRow.s * 4000 // 8 * 4000 = 32000

    expect(costValuation).toBe(16000)
    expect(retailValuation).toBe(32000)
  })

  it('aggregates top selling products by quantity sold', () => {
    const topProd = db
      .prepare(
        `SELECT p.name, SUM(si.quantity) as qty
         FROM sale_items si
         JOIN product_variants v ON v.id = si.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE p.branch_id = ?
         GROUP BY p.id`
      )
      .get(branchId) as { name: string; qty: number }

    expect(topProd.name).toBe('Jeans Alpha')
    expect(topProd.qty).toBe(2)
  })
})
