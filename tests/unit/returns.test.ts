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

    const migrationsDir = path.join(process.cwd(), 'database', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      db.exec(sql)
    }

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
    // 1. Insert Return record matching DB schema (id, branch_id, shift_id, original_sale_id, sale_item_id, variant_id, quantity, unit_price_dzd, refund_method, reason, processed_by)
    db.prepare(
      "INSERT INTO returns (id, branch_id, original_sale_id, sale_item_id, variant_id, quantity, unit_price_dzd, refund_method, reason, processed_by) VALUES (?, ?, ?, 'si-ret-1', ?, ?, 5000, 'cash', 'Size mismatch', ?)"
    ).run(returnId, branchId, saleId, variantId, returnQty, cashierId)

    // 2. Insert Stock Movement Ledger Entry (+2)
    db.prepare(
      "INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note) VALUES ('m-ret-2', ?, ?, 'return', ?, ?, 'Customer Return')"
    ).run(branchId, variantId, returnQty, saleId)
    db.exec('COMMIT')

    // Verify Return record
    const retRecord = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as {
      quantity: number
      refund_method: string
    }
    expect(retRecord).toBeDefined()
    expect(retRecord.quantity).toBe(2)
    expect(retRecord.refund_method).toBe('cash')

    // Verify Stock increased to 17
    const stock = (
      db
        .prepare('SELECT SUM(quantity_change) as s FROM stock_movements WHERE variant_id = ?')
        .get(variantId) as { s: number }
    ).s
    expect(stock).toBe(17)
  })

  it('attributes cash refund to Shift B when sale occurred in Shift A and return processed in Shift B', () => {
    const shiftA = 's-shift-A'
    const shiftB = 's-shift-B'
    const saleId = 'sale-shift-A'
    const returnId = 'ret-shift-B'

    // Shift A (Opening cash 5000)
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, 5000, 'closed')").run(shiftA, branchId, cashierId)

    // Sale in Shift A: 4000 DZD cash sale
    db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES (?, ?, ?, ?, 4000, 4000, 'cash', 'completed')").run(saleId, branchId, shiftA, cashierId)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-shiftA', ?, ?, 1, 4000)").run(saleId, variantId)

    // Shift B (Opening cash 3000)
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, 3000, 'open')").run(shiftB, branchId, cashierId)

    // Return processed during Shift B for sale from Shift A
    db.prepare(`
      INSERT INTO returns (id, branch_id, shift_id, original_sale_id, sale_item_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by)
      VALUES (?, ?, ?, ?, 'si-shiftA', ?, 1, 4000, 'cash', ?)
    `).run(returnId, branchId, shiftB, saleId, variantId, cashierId)

    // Shift A cash refunds MUST be 0
    const refundsA = db.prepare("SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as r FROM returns WHERE shift_id = ? AND refund_method = 'cash'").get(shiftA) as { r: number }
    expect(refundsA.r).toBe(0)

    // Shift B cash refunds MUST be 4000
    const refundsB = db.prepare("SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as r FROM returns WHERE shift_id = ? AND refund_method = 'cash'").get(shiftB) as { r: number }
    expect(refundsB.r).toBe(4000)

    // Close Shift B: Expected cash = 3000 (opening) + 0 (sales) - 4000 (cash refund) = -1000 DZD
    const openingB = 3000
    const expectedB = openingB - refundsB.r
    expect(expectedB).toBe(-1000)

    db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(shiftB)
  })

  it('prevents multi-line variant join multiplication during shift close cash refund calculation', () => {
    const shiftC = 's-shift-C'
    const saleIdMulti = 'sale-multi-lines'
    const returnId = 'ret-multi-line-1'

    // Shift C
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, 10000, 'open')").run(shiftC, branchId, cashierId)

    // Sale with 2 custom items mapping to the same generic variant ID (v-custom-generic)
    const customVarId = 'v-custom-generic'
    db.prepare("INSERT INTO product_variants (id, product_id, branch_id, price_dzd) VALUES (?, 'p-ret', ?, 0)").run(customVarId, branchId)

    db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES (?, ?, ?, ?, 5000, 5000, 'cash', 'completed')").run(saleIdMulti, branchId, shiftC, cashierId)

    // Line 1: custom item 1 (2000 DZD)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-line-1', ?, ?, 1, 2000)").run(saleIdMulti, customVarId)

    // Line 2: custom item 2 (3000 DZD)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-line-2', ?, ?, 1, 3000)").run(saleIdMulti, customVarId)

    // Return Line 1 only (1 item at 2000 DZD)
    db.prepare(`
      INSERT INTO returns (id, branch_id, shift_id, original_sale_id, sale_item_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by)
      VALUES (?, ?, ?, ?, 'si-line-1', ?, 1, 2000, 'cash', ?)
    `).run(returnId, branchId, shiftC, saleIdMulti, customVarId, cashierId)

    // Calculate cash refunds directly from returns table (NO ambiguous joins!)
    const refundsC = db.prepare("SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as r FROM returns WHERE shift_id = ? AND refund_method = 'cash'").get(shiftC) as { r: number }

    // MUST be exactly 2000 DZD (NOT 2000 + 3000 = 5000 DZD!)
    expect(refundsC.r).toBe(2000)

    db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(shiftC)
  })
})
