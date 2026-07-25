import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import bcrypt from 'bcryptjs'

describe('End-to-End Business Flow Simulation (E2E Integration Test)', () => {
  let db: SqlJsDatabase

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()

    // 1. Initialize DB Schema
    db.run(`
      CREATE TABLE branches (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE users (id TEXT PRIMARY KEY, branch_id TEXT, full_name TEXT, role TEXT, pin_hash TEXT, deleted_at TEXT);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, deleted_at TEXT);
      CREATE TABLE products (id TEXT PRIMARY KEY, category_id TEXT, name TEXT, price_dzd REAL, cost_dzd REAL, deleted_at TEXT);
      CREATE TABLE product_variants (id TEXT PRIMARY KEY, product_id TEXT, branch_id TEXT, size TEXT, color TEXT, barcode TEXT, price_dzd REAL, deleted_at TEXT);
      CREATE TABLE stock_movements (id TEXT PRIMARY KEY, branch_id TEXT, variant_id TEXT, type TEXT, quantity_change INTEGER, reference_id TEXT, note TEXT, created_by TEXT, created_at TEXT);
      CREATE TABLE shifts (id TEXT PRIMARY KEY, branch_id TEXT, cashier_id TEXT, opening_cash_dzd REAL, expected_cash_dzd REAL, closing_cash_dzd REAL, difference_dzd REAL, status TEXT, opened_at TEXT, closed_at TEXT);
      CREATE TABLE sales (id TEXT PRIMARY KEY, branch_id TEXT, shift_id TEXT, cashier_id TEXT, customer_id TEXT, total_dzd REAL, cash_amount_dzd REAL, card_amount_dzd REAL, payment_method TEXT, status TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE sale_items (id TEXT PRIMARY KEY, sale_id TEXT, variant_id TEXT, quantity INTEGER, unit_price_dzd REAL, created_at TEXT);
      CREATE TABLE customers (id TEXT PRIMARY KEY, branch_id TEXT, full_name TEXT, phone TEXT, loyalty_points INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT);
      CREATE TABLE sync_queue (id TEXT PRIMARY KEY, table_name TEXT, operation TEXT, payload TEXT, created_at TEXT, synced_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT);
    `)

    // Seed test data
    const pinHash = bcrypt.hashSync('1234', 10)
    db.run(`INSERT INTO branches VALUES ('b1', 'Main Branch')`)
    db.run(`INSERT INTO users VALUES ('u1', 'b1', 'Ahmad Cashier', 'cashier', '${pinHash}', NULL)`)
    db.run(`INSERT INTO categories VALUES ('c1', 'Clothing', NULL)`)
    db.run(`INSERT INTO products VALUES ('p1', 'c1', 'LV T-Shirt', 5000, 3000, NULL)`)
    db.run(`INSERT INTO product_variants VALUES ('v1', 'p1', 'b1', 'L', 'White', '112233', 5000, NULL)`)
    // Initial Stock Ledger entry (+10 items)
    db.run(`INSERT INTO stock_movements VALUES ('sm1', 'b1', 'v1', 'initial', 10, NULL, 'Initial stock', 'u1', '2026-07-24T10:00:00Z')`)
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('completes E2E flow: PIN login -> Open Shift -> Sale with stock ledger -> Close Shift Z-Report', () => {
    // Step 1: Verify PIN Auth
    const userStmt = db.prepare(`SELECT * FROM users WHERE id = 'u1' AND deleted_at IS NULL`)
    expect(userStmt.step()).toBe(true)
    const userObj = userStmt.getAsObject() as { pin_hash: string; full_name: string }
    userStmt.free()
    expect(bcrypt.compareSync('1234', userObj.pin_hash)).toBe(true)

    // Step 2: Open Shift with 10,000 DZD opening cash
    const shiftId = 'shift-999'
    const openTime = '2026-07-24T12:00:00Z'
    db.run(`INSERT INTO shifts VALUES ('${shiftId}', 'b1', 'u1', 10000, NULL, NULL, NULL, 'open', '${openTime}', NULL)`)

    // Step 3: Check initial stock balance
    const stockStmt = db.prepare(`SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_movements WHERE variant_id = 'v1'`)
    stockStmt.step()
    expect(stockStmt.getAsObject().stock).toBe(10)
    stockStmt.free()

    // Step 4: Execute Sale of 2 LV T-Shirts (Total = 10,000 DZD, Mixed payment: 6,000 DZD Cash + 4,000 DZD Card)
    const saleId = 'sale-101'
    const saleTime = '2026-07-24T14:30:00Z'
    db.run(`INSERT INTO sales VALUES ('${saleId}', 'b1', '${shiftId}', 'u1', NULL, 10000, 6000, 4000, 'mixed', 'completed', '${saleTime}', '${saleTime}')`)
    db.run(`INSERT INTO sale_items VALUES ('item-1', '${saleId}', 'v1', 2, 5000, '${saleTime}')`)
    // Deduct stock in ledger (-2)
    db.run(`INSERT INTO stock_movements VALUES ('sm-sale', 'b1', 'v1', 'sale', -2, '${saleId}', 'POS Sale', 'u1', '${saleTime}')`)

    // Step 5: Verify remaining stock in ledger is 8
    const stockAfterStmt = db.prepare(`SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_movements WHERE variant_id = 'v1'`)
    stockAfterStmt.step()
    expect(stockAfterStmt.getAsObject().stock).toBe(8)
    stockAfterStmt.free()

    // Step 6: Close Shift & Calculate Z-Report Expected Cash
    const shiftSalesStmt = db.prepare(`
      SELECT 
        COALESCE(SUM(cash_amount_dzd), 0) as cash_total,
        COALESCE(SUM(card_amount_dzd), 0) as card_total
      FROM sales WHERE shift_id = '${shiftId}' AND status = 'completed'
    `)
    shiftSalesStmt.step()
    const totals = shiftSalesStmt.getAsObject() as { cash_total: number; card_total: number }
    shiftSalesStmt.free()

    expect(totals.cash_total).toBe(6000)
    expect(totals.card_total).toBe(4000)

    const openingCash = 10000
    const expectedCash = openingCash + totals.cash_total // 10,000 + 6,000 = 16,000 DZD
    expect(expectedCash).toBe(16000)

    // Cashier counts 16,000 DZD in drawer (Difference = 0)
    const closingCash = 16000
    const diff = closingCash - expectedCash
    expect(diff).toBe(0)
    db.run(`UPDATE shifts SET expected_cash_dzd = 16000, closing_cash_dzd = 16000, difference_dzd = 0, status = 'closed', closed_at = '2026-07-24T22:00:00Z' WHERE id = '${shiftId}'`)

    const closedShiftStmt = db.prepare(`SELECT * FROM shifts WHERE id = '${shiftId}'`)
    closedShiftStmt.step()
    const closedShift = closedShiftStmt.getAsObject() as { status: string; difference_dzd: number }
    closedShiftStmt.free()

    expect(closedShift.status).toBe('closed')
    expect(closedShift.difference_dzd).toBe(0)
  })
})
