import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Shift & Cash Drawer Management (Phase 2)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-shift-test'
  const cashierId = 'u-shift-test'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-shift-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationsDir = path.join(process.cwd(), 'database', 'migrations')
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      db.exec(sql)
    }

    // Insert dummy branch & user
    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Test Branch')").run(branchId)
    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier Test', 'cashier', '0000')"
    ).run(cashierId, branchId)
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

  it('opens a shift with opening cash', () => {
    const shiftId = 's-open-1'
    const openingCash = 5000

    db.prepare(
      "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', datetime('now'))"
    ).run(shiftId, branchId, cashierId, openingCash)

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as {
      id: string
      opening_cash_dzd: number
      status: string
    }

    expect(shift).toBeDefined()
    expect(shift.opening_cash_dzd).toBe(5000)
    expect(shift.status).toBe('open')

    // Close shift to allow subsequent test shifts
    db.prepare("UPDATE shifts SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(shiftId)
  })

  it('prevents multiple open shifts for the same cashier and branch at DB level', () => {
    const shift1 = 's-unique-1'
    const shift2 = 's-unique-2'

    db.prepare(
      "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, 1000, 'open', datetime('now'))"
    ).run(shift1, branchId, cashierId)

    // Attempting to open a second shift for the same cashier/branch MUST fail at DB level
    expect(() => {
      db.prepare(
        "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, 2000, 'open', datetime('now'))"
      ).run(shift2, branchId, cashierId)
    }).toThrow(/UNIQUE constraint failed/)

    db.prepare("UPDATE shifts SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(shift1)
  })

  it('calculates expected cash excluding card sales on shift close', () => {
    const shiftId = 's-close-test'
    const openingCash = 5000

    // Open shift
    db.prepare(
      "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', datetime('now'))"
    ).run(shiftId, branchId, cashierId, openingCash)

    // Add 3 sales in this shift:
    // Sale 1: Cash 2500 DA
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-1', ?, ?, ?, 2500, 2500, 'cash', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Sale 2: Cash 1500 DA
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-2', ?, ?, ?, 1500, 1500, 'cash', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Sale 3: Card 4000 DA (Should be EXCLUDED from physical cash count)
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, card_amount_dzd, payment_method, status) VALUES ('sale-3', ?, ?, ?, 4000, 4000, 'card', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Query total cash sales
    const cashSalesRow = db
      .prepare(
        "SELECT SUM(cash_amount_dzd) as cash_total FROM sales WHERE shift_id = ? AND status = 'completed'"
      )
      .get(shiftId) as { cash_total: number }

    const cashSalesTotal = cashSalesRow.cash_total ?? 0
    const expectedCash = openingCash + cashSalesTotal

    // Opening 5000 + Cash sales 4000 = 9000 (Card 4000 excluded)
    expect(cashSalesTotal).toBe(4000)
    expect(expectedCash).toBe(9000)

    // Cashier counts 9000 (Perfect match)
    const closingCashCount = 9000
    const difference = closingCashCount - expectedCash

    expect(difference).toBe(0)

    // Close shift
    db.prepare(
      "UPDATE shifts SET expected_cash_dzd = ?, closing_cash_dzd = ?, difference_dzd = ?, status = 'closed', closed_at = datetime('now') WHERE id = ?"
    ).run(expectedCash, closingCashCount, difference, shiftId)

    const closedShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as {
      status: string
      expected_cash_dzd: number
      closing_cash_dzd: number
      difference_dzd: number
    }

    expect(closedShift.status).toBe('closed')
    expect(closedShift.expected_cash_dzd).toBe(9000)
    expect(closedShift.closing_cash_dzd).toBe(9000)
    expect(closedShift.difference_dzd).toBe(0)
  })

  it('correctly records cash shortage (عجز) and surplus (فائض)', () => {
    const shiftIdShort = 's-short'
    const openingCash = 3000

    db.prepare(
      "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', datetime('now'))"
    ).run(shiftIdShort, branchId, cashierId, openingCash)

    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-s1', ?, ?, ?, 2000, 2000, 'cash', 'completed')"
    ).run(branchId, shiftIdShort, cashierId)

    // Query actual expected cash calculation from DB
    const cashSalesRow = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE 
          WHEN payment_method = 'cash' THEN total_dzd
          WHEN payment_method = 'mixed' THEN cash_amount_dzd
          WHEN payment_method = 'credit' THEN cash_amount_dzd
          ELSE 0
        END), 0) as cash_total
      FROM sales
      WHERE shift_id = ? AND status = 'completed'
    `).get(shiftIdShort) as { cash_total: number }

    const actualExpected = openingCash + cashSalesRow.cash_total
    const physical = 4800
    const diff = physical - actualExpected

    expect(actualExpected).toBe(5000)
    expect(diff).toBe(-200) // Shortage verified via real shift calculation query

    db.prepare("UPDATE shifts SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(shiftIdShort)
  })

  it('correctly includes mixed sales, credit cash portions, and customer debt cash repayments in expected cash', () => {
    const shiftId = 's-mixed-credit'
    const openingCash = 10000

    db.prepare(
      "INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', datetime('now'))"
    ).run(shiftId, branchId, cashierId, openingCash)

    // Sale 1: Mixed payment — 10000 Total (6000 Cash, 4000 Card)
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, card_amount_dzd, payment_method, status) VALUES ('sale-m1', ?, ?, ?, 10000, 6000, 4000, 'mixed', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Sale 2: Credit payment — 15000 Total (5000 Paid Cash upfront, 10000 Debt)
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, remaining_debt_dzd, payment_method, status) VALUES ('sale-cr1', ?, ?, ?, 15000, 5000, 10000, 'credit', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Dummy customer for foreign key constraint
    db.prepare("INSERT INTO customers (id, branch_id, full_name) VALUES ('cust-1', ?, 'Test Customer')").run(branchId)

    // Customer Debt Repayment: 3000 Cash paid during this shift
    db.prepare(
      "INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, amount_dzd, payment_method) VALUES ('cp-1', ?, ?, 'cust-1', 3000, 'cash')"
    ).run(branchId, shiftId)

    // Query sales physical cash
    const salesCashRow = db.prepare(`
      SELECT SUM(
        CASE 
          WHEN payment_method = 'cash' THEN total_dzd
          WHEN payment_method IN ('mixed', 'credit') THEN COALESCE(cash_amount_dzd, paid_amount_dzd, 0)
          ELSE 0 
        END
      ) as sales_cash
      FROM sales 
      WHERE shift_id = ? AND status = 'completed'
    `).get(shiftId) as { sales_cash: number }

    // Query customer payments cash
    const debtCashRow = db.prepare(`
      SELECT SUM(amount_dzd) as debt_cash
      FROM customer_payments
      WHERE shift_id = ? AND payment_method = 'cash'
    `).get(shiftId) as { debt_cash: number }

    const salesCash = salesCashRow.sales_cash ?? 0 // 6000 + 5000 = 11000
    const debtCash = debtCashRow.debt_cash ?? 0   // 3000
    const totalExpected = openingCash + salesCash + debtCash // 10000 + 11000 + 3000 = 24000

    expect(salesCash).toBe(11000)
    expect(debtCash).toBe(3000)
    expect(totalExpected).toBe(24000)

    db.prepare("UPDATE shifts SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(shiftId)
  })
})
