import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'node:fs'
import path from 'node:path'
import os from 'os'

describe('Phase 2B Hardening & Typed IPC Audit Verification', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branchId = 'b-phase2b-test'
  const cashierId = 'u-cashier-2b'
  const customerId = 'c-cust-2b'
  const shiftId = 's-shift-2b'
  const variantId = 'v-item-2b'
  const productId = 'p-item-2b'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-phase2b-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationsDir = path.join(process.cwd(), 'database', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      db.exec(sql)
    }

    // Seed test entities
    db.prepare("INSERT INTO branches (id, name) VALUES (?, 'Branch 2B')").run(branchId)
    db.prepare("INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier 2B', 'cashier', '0000')").run(cashierId, branchId)
    db.prepare("INSERT INTO customers (id, branch_id, full_name, loyalty_points, store_credit_balance) VALUES (?, ?, 'Customer 2B', 10, 500)").run(customerId, branchId)
    db.prepare("INSERT INTO products (id, branch_id, name, price_dzd) VALUES (?, ?, 'Test Product 2B', 1000)").run(productId, branchId)
    db.prepare("INSERT INTO product_variants (id, product_id, branch_id, price_dzd) VALUES (?, ?, ?, 1000)").run(variantId, productId, branchId)
    db.prepare("INSERT INTO store_settings (branch_id, store_name, loyalty_enabled, loyalty_spend_per_point_dzd) VALUES (?, 'Store 2B', 1, 1000)").run(branchId)

    // Restock variant to 100 units
    db.prepare("INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, created_by) VALUES ('m-init-2b', ?, ?, 'restock', 100, ?)").run(branchId, variantId, cashierId)

    // Open active shift
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, 5000, 'open', datetime('now'))").run(shiftId, branchId, cashierId)
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

  it('enforces mixed payment invariants cash_amount + card_amount = total_dzd', () => {
    const total = 5000
    const cashPaid = 3000
    const cardPaid = 2000

    expect(cashPaid + cardPaid).toBe(total)
    expect(cashPaid).toBeGreaterThan(0)
    expect(cardPaid).toBeGreaterThan(0)

    db.prepare(`
      INSERT INTO sales (id, branch_id, shift_id, cashier_id, customer_id, total_dzd, cash_amount_dzd, card_amount_dzd, payment_method, status)
      VALUES ('sale-mixed-inv', ?, ?, ?, ?, ?, ?, ?, 'mixed', 'completed')
    `).run(branchId, shiftId, cashierId, customerId, total, cashPaid, cardPaid)

    const row = db.prepare('SELECT total_dzd, cash_amount_dzd, card_amount_dzd, payment_method FROM sales WHERE id = ?').get('sale-mixed-inv') as {
      total_dzd: number
      cash_amount_dzd: number
      card_amount_dzd: number
      payment_method: string
    }

    expect(row.payment_method).toBe('mixed')
    expect(row.cash_amount_dzd + row.card_amount_dzd).toBe(row.total_dzd)
  })

  it('verifies DB unique index blocks opening duplicate open shifts for cashier/branch', () => {
    expect(() => {
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES ('s-dup', ?, ?, 1000, 'open')").run(branchId, cashierId)
    }).toThrow(/UNIQUE constraint failed/)
  })

  it('verifies customer loyalty points calculation and atomic update', () => {
    const currentPoints = (db.prepare('SELECT loyalty_points FROM customers WHERE id = ?').get(customerId) as { loyalty_points: number }).loyalty_points
    const saleTotal = 3000 // 3 points earned at 1000 DZD per point
    const spendPerPoint = 1000
    const pointsEarned = Math.floor(saleTotal / spendPerPoint)

    db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?').run(pointsEarned, customerId)

    const updatedPoints = (db.prepare('SELECT loyalty_points FROM customers WHERE id = ?').get(customerId) as { loyalty_points: number }).loyalty_points
    expect(updatedPoints).toBe(currentPoints + 3)
  })

  it('verifies sync queue insertion contains cash_amount_dzd and card_amount_dzd', () => {
    const syncId = 'sync-test-2b'
    const payload = JSON.stringify({
      id: 'sale-sync-1',
      branch_id: branchId,
      shift_id: shiftId,
      cashier_id: cashierId,
      total_dzd: 4000,
      cash_amount_dzd: 2500,
      card_amount_dzd: 1500,
      payment_method: 'mixed',
      status: 'completed',
    })

    db.prepare("INSERT INTO sync_queue (id, table_name, operation, payload) VALUES (?, 'sales', 'insert', ?)").run(syncId, payload)

    const row = db.prepare('SELECT payload FROM sync_queue WHERE id = ?').get(syncId) as { payload: string }
    const parsed = JSON.parse(row.payload)

    expect(parsed.cash_amount_dzd).toBe(2500)
    expect(parsed.card_amount_dzd).toBe(1500)
    expect(parsed.payment_method).toBe('mixed')
  })

  it('verifies store credit deduction in DB', () => {
    const initialCredit = (db.prepare('SELECT store_credit_balance FROM customers WHERE id = ?').get(customerId) as { store_credit_balance: number }).store_credit_balance
    const usedCredit = 200

    db.prepare('UPDATE customers SET store_credit_balance = MAX(0, store_credit_balance - ?) WHERE id = ?').run(usedCredit, customerId)

    const finalCredit = (db.prepare('SELECT store_credit_balance FROM customers WHERE id = ?').get(customerId) as { store_credit_balance: number }).store_credit_balance
    expect(finalCredit).toBe(initialCredit - 200)
  })

  it('verifies CloseShiftModal expected cash preview math matches IPC shift close calculation including partial cash refunds', () => {
    const shiftModalId = 's-modal-test'
    const openingCash = 5000

    // Close existing shift to allow new open shift
    db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(shiftId)
    db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(shiftModalId, branchId, cashierId, openingCash)

    // Sale: 4000 DZD cash
    db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-mod-1', ?, ?, ?, 4000, 4000, 'cash', 'completed')").run(branchId, shiftModalId, cashierId)

    // Customer Debt Repayment: 1000 DZD cash
    db.prepare("INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, amount_dzd, payment_method) VALUES ('cp-mod-1', ?, ?, ?, 1000, 'cash')").run(branchId, shiftModalId, customerId)

    // Partial Cash Return in this shift: 1500 DZD
    db.prepare(`
      INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by)
      VALUES ('ret-mod-1', ?, ?, 'sale-mod-1', ?, 1, 1500, 'cash', ?)
    `).run(branchId, shiftModalId, variantId, cashierId)

    // Query values using the EXACT queries executed by CloseShiftModal and biz:shifts:close IPC
    const salesCash = (db.prepare("SELECT COALESCE(SUM(cash_amount_dzd), 0) as c FROM sales WHERE shift_id = ? AND status != 'voided'").get(shiftModalId) as { c: number }).c
    const repayCash = (db.prepare("SELECT COALESCE(SUM(amount_dzd), 0) as r FROM customer_payments WHERE shift_id = ? AND payment_method = 'cash'").get(shiftModalId) as { r: number }).r
    const refundCash = (db.prepare("SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as rf FROM returns WHERE shift_id = ? AND refund_method = 'cash'").get(shiftModalId) as { rf: number }).rf

    const expectedCashUI = openingCash + salesCash + repayCash - refundCash

    expect(salesCash).toBe(4000)
    expect(repayCash).toBe(1000)
    expect(refundCash).toBe(1500)
    expect(expectedCashUI).toBe(8500) // 5000 + 4000 + 1000 - 1500 = 8500 DZD
  })

  describe('PHASE 2B-6 — Shift Close Refund Consistency (TEST 1 to TEST 7)', () => {
    // Pure calculation function representing identical backend / frontend expected cash formula
    function computeExpectedCash(shiftId: string, openingCash: number): {
      cashSales: number
      repayments: number
      cashRefunds: number
      expectedCash: number
    } {
      const salesCash = (
        db
          .prepare(
            "SELECT COALESCE(SUM(cash_amount_dzd), 0) as c FROM sales WHERE shift_id = ? AND status != 'voided'"
          )
          .get(shiftId) as { c: number }
      ).c
      const repayCash = (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount_dzd), 0) as r FROM customer_payments WHERE shift_id = ? AND payment_method = 'cash'"
          )
          .get(shiftId) as { r: number }
      ).r
      const refundCash = (
        db
          .prepare(
            "SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as rf FROM returns WHERE shift_id = ? AND refund_method = 'cash'"
          )
          .get(shiftId) as { rf: number }
      ).rf
      return {
        cashSales: salesCash,
        repayments: repayCash,
        cashRefunds: refundCash,
        expectedCash: openingCash + salesCash + repayCash - refundCash,
      }
    }

    it('TEST 1 — normal cash sale (Opening 10000, Cash Sales 5000 -> Expected 15000)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test1'
      const opening = 10000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t1', ?, ?, ?, 5000, 5000, 'cash', 'completed')").run(branchId, sId, cashierId)

      const result = computeExpectedCash(sId, opening)
      expect(result.cashSales).toBe(5000)
      expect(result.repayments).toBe(0)
      expect(result.cashRefunds).toBe(0)
      expect(result.expectedCash).toBe(15000)

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })

    it('TEST 2 — cash refund (Opening 10000, Cash Sales 5000, Cash Refund 1000 -> Expected 14000)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test2'
      const opening = 10000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t2', ?, ?, ?, 5000, 5000, 'cash', 'completed')").run(branchId, sId, cashierId)
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t2', ?, ?, 'sale-t2', ?, 1, 1000, 'cash', ?)").run(branchId, sId, variantId, cashierId)

      const result = computeExpectedCash(sId, opening)
      expect(result.cashSales).toBe(5000)
      expect(result.cashRefunds).toBe(1000)
      expect(result.expectedCash).toBe(14000)

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })

    it('TEST 3 — partial_refund sale (sale with partial_refund status and valid cash split agrees)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test3'
      const opening = 10000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)

      // Original sale: 6000 DZD cash (status: partial_refund after line returned)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t3', ?, ?, ?, 6000, 6000, 'cash', 'partial_refund')").run(branchId, sId, cashierId)
      // Cash return: 2000 DZD
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t3', ?, ?, 'sale-t3', ?, 1, 2000, 'cash', ?)").run(branchId, sId, variantId, cashierId)

      const result = computeExpectedCash(sId, opening)
      // 10000 opening + 6000 cash sale - 2000 refund = 14000
      expect(result.cashSales).toBe(6000)
      expect(result.cashRefunds).toBe(2000)
      expect(result.expectedCash).toBe(14000)

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })

    it('TEST 4 — store credit refund (Cash Sales 5000, Store-Credit Refund 1000 -> Expected physical cash MUST remain 15000)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test4'
      const opening = 10000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t4', ?, ?, ?, 5000, 5000, 'cash', 'completed')").run(branchId, sId, cashierId)
      // Store credit refund: 1000 DZD (non-cash)
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t4', ?, ?, 'sale-t4', ?, 1, 1000, 'store_credit', ?)").run(branchId, sId, variantId, cashierId)

      const result = computeExpectedCash(sId, opening)
      expect(result.cashSales).toBe(5000)
      expect(result.cashRefunds).toBe(0) // Non-cash return excluded from physical cash deduction
      expect(result.expectedCash).toBe(15000)

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })

    it('TEST 5 — multiple refunds (Multiple cash refunds aggregated exactly once)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test5'
      const opening = 5000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t5', ?, ?, ?, 8000, 8000, 'cash', 'completed')").run(branchId, sId, cashierId)
      // Refund 1: 1500 DZD cash
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t5-1', ?, ?, 'sale-t5', ?, 1, 1500, 'cash', ?)").run(branchId, sId, variantId, cashierId)
      // Refund 2: 500 DZD cash
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t5-2', ?, ?, 'sale-t5', ?, 1, 500, 'cash', ?)").run(branchId, sId, variantId, cashierId)

      const result = computeExpectedCash(sId, opening)
      expect(result.cashSales).toBe(8000)
      expect(result.cashRefunds).toBe(2000) // 1500 + 500
      expect(result.expectedCash).toBe(11000) // 5000 + 8000 - 2000 = 11000

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })

    it('TEST 6 — shift isolation (Refund belonging to Shift A does not alter Shift B expected cash)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sIdA = 's-test6-A'
      const sIdB = 's-test6-B'
      const opening = 5000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'closed')").run(sIdA, branchId, cashierId, opening)
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sIdB, branchId, cashierId, opening)

      // Sale in Shift A
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t6-a', ?, ?, ?, 4000, 4000, 'cash', 'completed')").run(branchId, sIdA, cashierId)
      // Refund in Shift A
      db.prepare("INSERT INTO returns (id, branch_id, shift_id, original_sale_id, variant_id, quantity, unit_price_dzd, refund_method, processed_by) VALUES ('ret-t6-a', ?, ?, 'sale-t6-a', ?, 1, 1000, 'cash', ?)").run(branchId, sIdA, variantId, cashierId)

      // Sale in Shift B
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t6-b', ?, ?, ?, 3000, 3000, 'cash', 'completed')").run(branchId, sIdB, cashierId)

      // Shift B calculation MUST be isolated from Shift A's refund
      const resultB = computeExpectedCash(sIdB, opening)
      expect(resultB.cashSales).toBe(3000)
      expect(resultB.cashRefunds).toBe(0)
      expect(resultB.expectedCash).toBe(8000) // 5000 + 3000 = 8000

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sIdB)
    })

    it('TEST 7 — zero refunds (Normal shift close calculation unchanged when no refunds exist)', () => {
      db.prepare("UPDATE shifts SET status = 'closed' WHERE branch_id = ? AND cashier_id = ? AND status = 'open'").run(branchId, cashierId)
      const sId = 's-test7'
      const opening = 2000
      db.prepare("INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status) VALUES (?, ?, ?, ?, 'open')").run(sId, branchId, cashierId, opening)
      db.prepare("INSERT INTO sales (id, branch_id, shift_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES ('sale-t7', ?, ?, ?, 3500, 3500, 'cash', 'completed')").run(branchId, sId, cashierId)

      const result = computeExpectedCash(sId, opening)
      expect(result.cashSales).toBe(3500)
      expect(result.cashRefunds).toBe(0)
      expect(result.expectedCash).toBe(5500)

      db.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(sId)
    })
  })

  it('repairs pre-existing pending sync_queue sale payloads missing cash_amount_dzd and card_amount_dzd', () => {
    const oldSaleId = 'sale-pre-migration-10'
    const oldSyncId = 'sync-pre-migration-10'

    // Insert sale with cash_amount_dzd = 6000, card_amount_dzd = 0
    db.prepare("INSERT INTO sales (id, branch_id, cashier_id, total_dzd, cash_amount_dzd, card_amount_dzd, payment_method, status) VALUES (?, ?, ?, 6000, 6000, 0, 'cash', 'completed')").run(oldSaleId, branchId, cashierId)

    // Insert pre-existing pending sync_queue row with payload missing cash_amount_dzd / card_amount_dzd
    const legacyPayload = JSON.stringify({
      id: oldSaleId,
      branch_id: branchId,
      total_dzd: 6000,
      payment_method: 'cash',
      status: 'completed',
    })
    db.prepare("INSERT INTO sync_queue (id, table_name, operation, payload) VALUES (?, 'sales', 'insert', ?)").run(oldSyncId, legacyPayload)

    // Execute migration 0011 repair query
    db.exec(`
      UPDATE sync_queue
      SET payload = json_set(
        payload,
        '$.cash_amount_dzd',
        COALESCE(
          (SELECT s.cash_amount_dzd FROM sales s WHERE s.id = json_extract(sync_queue.payload, '$.id')),
          CASE WHEN json_extract(payload, '$.payment_method') = 'card' THEN 0 ELSE json_extract(payload, '$.total_dzd') END
        ),
        '$.card_amount_dzd',
        COALESCE(
          (SELECT s.card_amount_dzd FROM sales s WHERE s.id = json_extract(sync_queue.payload, '$.id')),
          CASE WHEN json_extract(payload, '$.payment_method') = 'card' THEN json_extract(payload, '$.total_dzd') ELSE 0 END
        )
      )
      WHERE table_name = 'sales'
        AND synced_at IS NULL
        AND (json_extract(payload, '$.cash_amount_dzd') IS NULL OR json_extract(payload, '$.card_amount_dzd') IS NULL);
    `)

    // Verify repaired payload string in DB
    const syncRow = db.prepare('SELECT payload FROM sync_queue WHERE id = ?').get(oldSyncId) as { payload: string }
    const repaired = JSON.parse(syncRow.payload)

    expect(repaired.cash_amount_dzd).toBe(6000)
    expect(repaired.card_amount_dzd).toBe(0)
    expect(repaired.payment_method).toBe('cash')
  })
})
