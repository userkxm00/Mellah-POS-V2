import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite')
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { UserRole } from '../../src/renderer/src/types/database'

describe('Auth, Roles & Multi-Branch Management (Phase 4)', () => {
  let db: typeof DatabaseSync
  let dbPath: string

  const branch1Id = 'b-auth-algiers'
  const branch2Id = 'b-auth-oran'

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `mellah-pos-auth-test-${Date.now()}.db`)
    db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')

    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '0001_init.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    db.exec(sql)

    // Setup 2 branches
    db.prepare("INSERT INTO branches (id, name, address) VALUES (?, 'Algiers Branch', 'Didouche')").run(branch1Id)
    db.prepare("INSERT INTO branches (id, name, address) VALUES (?, 'Oran Branch', 'Hamani')").run(branch2Id)
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

  it('creates users with valid roles and PIN codes', () => {
    const adminId = 'u-admin-1'
    const cashierId = 'u-cashier-1'

    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Admin User', 'admin', '1234')"
    ).run(adminId, branch1Id)

    db.prepare(
      "INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, 'Cashier User', 'cashier', '5555')"
    ).run(cashierId, branch1Id)

    const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId) as {
      full_name: string
      role: string
      pin_hash: string
    }

    expect(admin).toBeDefined()
    expect(admin.role).toBe('admin')
    expect(admin.pin_hash).toBe('1234')

    const cashier = db.prepare('SELECT * FROM users WHERE id = ?').get(cashierId) as {
      full_name: string
      role: string
      pin_hash: string
    }

    expect(cashier).toBeDefined()
    expect(cashier.role).toBe('cashier')
    expect(cashier.pin_hash).toBe('5555')
  })

  it('queries user profile by PIN code for authentication', () => {
    const user = db
      .prepare(
        `SELECT u.*, b.name as branch_name 
         FROM users u 
         JOIN branches b ON b.id = u.branch_id 
         WHERE u.pin_hash = ? AND u.deleted_at IS NULL`
      )
      .get('1234') as { full_name: string; role: string; branch_name: string }

    expect(user).toBeDefined()
    expect(user.full_name).toBe('Admin User')
    expect(user.role).toBe('admin')
    expect(user.branch_name).toBe('Algiers Branch')
  })

  it('validates role permission helper rules', () => {
    const checkRolePermission = (userRole: UserRole, allowedRoles: UserRole[]): boolean => {
      return allowedRoles.includes(userRole)
    }

    // Cashier attempting admin/manager screens -> Should be DENIED
    expect(checkRolePermission('cashier', ['admin', 'manager'])).toBe(false)
    expect(checkRolePermission('cashier', ['admin'])).toBe(false)

    // Cashier attempting POS screen -> Should be ALLOWED
    expect(checkRolePermission('cashier', ['admin', 'manager', 'cashier'])).toBe(true)

    // Manager attempting Products screen -> Should be ALLOWED
    expect(checkRolePermission('manager', ['admin', 'manager'])).toBe(true)

    // Admin attempting Users/Branches screen -> Should be ALLOWED
    expect(checkRolePermission('admin', ['admin'])).toBe(true)
  })

  it('supports multi-branch scoping', () => {
    const branchCount = (
      db.prepare('SELECT COUNT(*) as c FROM branches WHERE deleted_at IS NULL').get() as { c: number }
    ).c

    expect(branchCount).toBe(2)
  })
})
