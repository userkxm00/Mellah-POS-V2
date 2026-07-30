import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
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

  it('verifies migration 0005 allows payment_method=credit and derived debt calculations', () => {
    // Apply migrations 0002, 0003, 0004, and 0005 in sequence
    const migDir = path.join(process.cwd(), 'database', 'migrations')
    db.exec(fs.readFileSync(path.join(migDir, '0002_commercial_features.sql'), 'utf-8'))
    db.exec(fs.readFileSync(path.join(migDir, '0003_sales_columns.sql'), 'utf-8'))
    db.exec(fs.readFileSync(path.join(migDir, '0004_debts_and_suppliers.sql'), 'utf-8'))
    db.exec(fs.readFileSync(path.join(migDir, '0005_fix_sales_check_and_ledgers.sql'), 'utf-8'))

    const customerId = 'c-debt-test-1'
    const shiftId = 's-shift-test-1'

    db.prepare("INSERT INTO customers (id, branch_id, full_name) VALUES (?, ?, 'Yacine Debt Test')").run(customerId, branchId)
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, 5000, 'open')").run(shiftId, branchId, cashierId)

    // 1. Insert Credit Sale: Total 10,000 DZD, paid 3,000 cash, remaining debt 7,000 DZD
    const creditSaleId = 'sale-credit-1'
    expect(() => {
      db.prepare(`
        INSERT INTO sales (id, branch_id, shift_id, cashier_id, customer_id, total_dzd, cash_amount_dzd, paid_amount_dzd, remaining_debt_dzd, payment_method, status)
        VALUES (?, ?, ?, ?, ?, 10000, 3000, 3000, 7000, 'credit', 'completed')
      `).run(creditSaleId, branchId, shiftId, cashierId, customerId)
    }).not.toThrow() // Must NOT throw CHECK constraint failed error!

    // 2. Insert Mixed Sale: Total 10,000 DZD (4,000 cash + 6,000 card)
    db.prepare(`
      INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, card_amount_dzd, payment_method, status)
      VALUES ('sale-mixed-1', ?, ?, ?, 10000, 4000, 6000, 'mixed', 'completed')
    `).run(branchId, shiftId, cashierId)

    // 3. Customer repays 2,000 DZD debt in cash during this shift
    db.prepare(`
      INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, amount_dzd, payment_method)
      VALUES ('pay-1', ?, ?, ?, 2000, 'cash')
    `).run(branchId, shiftId, customerId)

    // 4. Verify Derived Customer Debt Ledger: (7,000 - 2,000 = 5,000 DZD)
    const debtRow = db.prepare(`
      SELECT (
        COALESCE((SELECT SUM(s.remaining_debt_dzd) FROM sales s WHERE s.customer_id = ? AND s.status = 'completed' AND s.deleted_at IS NULL), 0) -
        COALESCE((SELECT SUM(cp.amount_dzd) FROM customer_payments cp WHERE cp.customer_id = ?), 0)
      ) as derived_debt
    `).get(customerId, customerId) as { derived_debt: number }

    expect(debtRow.derived_debt).toBe(5000)

    // 5. Verify Shift Expected Cash Math:
    // Opening Cash (5000) + Credit Cash Deposit (3000) + Mixed Cash (4000) + Cash Debt Repayment (2000) = 14,000 DZD
    const salesCashRow = db.prepare(`
      SELECT SUM(
        CASE 
          WHEN payment_method = 'cash' THEN total_dzd 
          WHEN payment_method IN ('mixed', 'credit') THEN COALESCE(cash_amount_dzd, paid_amount_dzd, 0) 
          ELSE 0 
        END
      ) as total_cash_sales 
      FROM sales 
      WHERE shift_id = ? AND status = 'completed' AND deleted_at IS NULL
    `).get(shiftId) as { total_cash_sales: number }

    const repaymentsCashRow = db.prepare(`
      SELECT SUM(amount_dzd) as total_repayments 
      FROM customer_payments 
      WHERE shift_id = ? AND payment_method = 'cash'
    `).get(shiftId) as { total_repayments: number }

    const totalExpectedCash = 5000 + salesCashRow.total_cash_sales + repaymentsCashRow.total_repayments
    expect(salesCashRow.total_cash_sales).toBe(7000) // 3000 + 4000
    expect(repaymentsCashRow.total_repayments).toBe(2000)
    expect(totalExpectedCash).toBe(14000)
  })
})
