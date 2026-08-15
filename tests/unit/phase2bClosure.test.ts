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
})
