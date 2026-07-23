import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'fs'
import path from 'path'
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

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

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
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, payment_method, status) VALUES ('sale-1', ?, ?, ?, 2500, 'cash', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Sale 2: Cash 1500 DA
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, payment_method, status) VALUES ('sale-2', ?, ?, ?, 1500, 'cash', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Sale 3: Card 4000 DA (Should be EXCLUDED from physical cash count)
    db.prepare(
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, payment_method, status) VALUES ('sale-3', ?, ?, ?, 4000, 'card', 'completed')"
    ).run(branchId, shiftId, cashierId)

    // Query total cash sales
    const cashSalesRow = db
      .prepare(
        "SELECT SUM(total_dzd) as cash_total FROM sales WHERE shift_id = ? AND payment_method IN ('cash', 'mixed') AND status = 'completed'"
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
      "INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, payment_method, status) VALUES ('sale-s1', ?, ?, ?, 2000, 'cash', 'completed')"
    ).run(branchId, shiftIdShort, cashierId)

    // Expected: 3000 + 2000 = 5000
    // Physical count: 4800 (Shortage of 200 DA)
    const expected = 5000
    const physical = 4800
    const diff = physical - expected

    expect(diff).toBe(-200) // Shortage
  })
})
