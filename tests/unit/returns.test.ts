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

  it('handles legacy returns with NULL sale_item_id without bypassing over-return guard or double counting across shared variant lines', () => {
    const saleIdLegacy = 'sale-legacy-test'
    const legacyVarId = 'v-legacy-item'

    db.prepare("INSERT INTO product_variants (id, product_id, branch_id, price_dzd) VALUES (?, 'p-ret', ?, 1000)").run(legacyVarId, branchId)

    // Sale with 2 lines for same variant: Line A (qty 2) & Line B (qty 3) -> Total purchased = 5
    db.prepare("INSERT INTO sales (id, branch_id, cashier_id, total_dzd, cash_amount_dzd, payment_method, status) VALUES (?, ?, ?, 5000, 5000, 'cash', 'completed')").run(saleIdLegacy, branchId, cashierId)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-leg-A', ?, ?, 2, 1000)").run(saleIdLegacy, legacyVarId)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-leg-B', ?, ?, 3, 1000)").run(saleIdLegacy, legacyVarId)

    // Insert legacy return with NULL sale_item_id (qty 2)
    db.prepare(`
      INSERT INTO returns (id, branch_id, original_sale_id, sale_item_id, variant_id, quantity, refund_method, processed_by)
      VALUES ('ret-leg-1', ?, ?, NULL, ?, 2, 'cash', ?)
    `).run(branchId, saleIdLegacy, legacyVarId, cashierId)

    // Query existing returns for dual-constraint calculation
    const rawReturns = db.prepare('SELECT sale_item_id, variant_id, COALESCE(SUM(quantity), 0) as total_returned FROM returns WHERE original_sale_id = ? GROUP BY sale_item_id, variant_id').all(saleIdLegacy) as Array<{ sale_item_id: string | null; variant_id: string; total_returned: number }>

    const explicitReturnedByLine = new Map<string, number>()
    const totalReturnedByVariant = new Map<string, number>()
    for (const r of rawReturns) {
      if (r.sale_item_id) {
        explicitReturnedByLine.set(r.sale_item_id, (explicitReturnedByLine.get(r.sale_item_id) ?? 0) + r.total_returned)
      }
      totalReturnedByVariant.set(r.variant_id, (totalReturnedByVariant.get(r.variant_id) ?? 0) + r.total_returned)
    }

    const totalPurchasedVariant = 5 // Line A (2) + Line B (3)
    const totalReturnedVariant = totalReturnedByVariant.get(legacyVarId) ?? 0 // 2 legacy returned

    // Calculate max returnable for Line A (qty 2)
    const explicitLineA = explicitReturnedByLine.get('si-leg-A') ?? 0
    const maxLineA = Math.max(0, Math.min(2 - explicitLineA, totalPurchasedVariant - totalReturnedVariant))
    expect(maxLineA).toBe(2) // min(2-0, 5-2) = 2

    // Calculate max returnable for Line B (qty 3)
    const explicitLineB = explicitReturnedByLine.get('si-leg-B') ?? 0
    const maxLineB = Math.max(0, Math.min(3 - explicitLineB, totalPurchasedVariant - totalReturnedVariant))
    expect(maxLineB).toBe(3) // min(3-0, 5-2) = 3

    // If 2 items are returned on Line B, new total returned for variant becomes 4 (2 legacy + 2 new).
    const newTotalReturnedVar = totalReturnedVariant + 2
    const remainingAfterLineB = Math.max(0, Math.min(2 - explicitLineA, totalPurchasedVariant - newTotalReturnedVar))
    expect(remainingAfterLineB).toBe(1) // min(2-0, 5-4) = 1 (cannot over-return beyond 5 total!)
  })

  it('migration 0011 backfills deterministic legacy returns and preserves NULL unit_price_dzd for ambiguous multi-price lines', () => {
    const saleDet = 'sale-det-mig'
    const saleAmb = 'sale-amb-mig'
    const varDet = 'v-det-mig'
    const varAmb = 'v-amb-mig'

    db.prepare("INSERT INTO product_variants (id, product_id, branch_id, price_dzd) VALUES (?, 'p-ret', ?, 1000)").run(varDet, branchId)
    db.prepare("INSERT INTO product_variants (id, product_id, branch_id, price_dzd) VALUES (?, 'p-ret', ?, 2000)").run(varAmb, branchId)

    // Deterministic sale: 1 line for varDet (qty 2, price 1000 DZD)
    db.prepare("INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 2000, 'cash')").run(saleDet, branchId, cashierId)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-det-1', ?, ?, 2, 1000)").run(saleDet, varDet)

    // Legacy return for deterministic sale (sale_item_id = NULL, unit_price_dzd = NULL)
    db.prepare("INSERT INTO returns (id, branch_id, original_sale_id, sale_item_id, variant_id, quantity, refund_method, processed_by) VALUES ('ret-det-mig', ?, ?, NULL, ?, 1, 'cash', ?)").run(branchId, saleDet, varDet, cashierId)

    // Ambiguous sale: 2 lines for varAmb with DIFFERENT prices (line 1 at 2000 DZD, line 2 at 3000 DZD)
    db.prepare("INSERT INTO sales (id, branch_id, cashier_id, total_dzd, payment_method) VALUES (?, ?, ?, 5000, 'cash')").run(saleAmb, branchId, cashierId)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-amb-1', ?, ?, 1, 2000)").run(saleAmb, varAmb)
    db.prepare("INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd) VALUES ('si-amb-2', ?, ?, 1, 3000)").run(saleAmb, varAmb)

    // Legacy return for ambiguous sale (sale_item_id = NULL, unit_price_dzd = NULL)
    db.prepare("INSERT INTO returns (id, branch_id, original_sale_id, sale_item_id, variant_id, quantity, refund_method, processed_by) VALUES ('ret-amb-mig', ?, ?, NULL, ?, 1, 'cash', ?)").run(branchId, saleAmb, varAmb, cashierId)

    // Execute migration 0011 backfill queries
    db.exec(`
      UPDATE returns
      SET sale_item_id = (
        SELECT si.id
        FROM sale_items si
        WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
      )
      WHERE sale_item_id IS NULL
        AND (
          SELECT COUNT(*)
          FROM sale_items si
          WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
        ) = 1;

      UPDATE returns
      SET unit_price_dzd = (
        SELECT si.unit_price_dzd
        FROM sale_items si
        WHERE si.id = returns.sale_item_id
      )
      WHERE unit_price_dzd IS NULL AND sale_item_id IS NOT NULL;

      UPDATE returns
      SET unit_price_dzd = (
        SELECT MIN(si.unit_price_dzd)
        FROM sale_items si
        WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
      )
      WHERE unit_price_dzd IS NULL
        AND (
          SELECT COUNT(DISTINCT si.unit_price_dzd)
          FROM sale_items si
          WHERE si.sale_id = returns.original_sale_id AND si.variant_id = returns.variant_id
        ) = 1;
    `)

    // Verify deterministic return: sale_item_id = 'si-det-1', unit_price_dzd = 1000
    const detRow = db.prepare('SELECT sale_item_id, unit_price_dzd FROM returns WHERE id = ?').get('ret-det-mig') as { sale_item_id: string | null; unit_price_dzd: number | null }
    expect(detRow.sale_item_id).toBe('si-det-1')
    expect(detRow.unit_price_dzd).toBe(1000)

    // Verify ambiguous return: sale_item_id = NULL, unit_price_dzd = NULL (not arbitrarily guessed!)
    const ambRow = db.prepare('SELECT sale_item_id, unit_price_dzd FROM returns WHERE id = ?').get('ret-amb-mig') as { sale_item_id: string | null; unit_price_dzd: number | null }
    expect(ambRow.sale_item_id).toBeNull()
    expect(ambRow.unit_price_dzd).toBeNull()
  })
})
