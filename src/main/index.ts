import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase, getDatabase, withTransaction } from './database'
import { initAutoUpdater, stopAutoUpdater } from './autoUpdater'

const BCRYPT_ROUNDS = 10

// ----- Window state persistence -----

interface WindowState {
  width: number
  height: number
  x: number | undefined
  y: number | undefined
  isMaximized: boolean
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8')
      return JSON.parse(data) as WindowState
    }
  } catch {
    // Corrupted config — use defaults
  }
  // First run defaults: will be maximized
  return { width: 1280, height: 800, x: undefined, y: undefined, isMaximized: true }
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: win.isMaximized(),
  }
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2))
  } catch {
    // Non-critical — window state not saved
  }
}

// ----- IPC Handlers -----

type SqlParam = string | number | bigint | null | Uint8Array

function registerIpcHandlers(): void {
  // Generic database query handler (read-only)
  ipcMain.handle('db:query', async (_event, sql: string, params: unknown[]) => {
    const db = getDatabase()
    return db.query(sql, params)
  })

  // Generic database execute handler (single write)
  ipcMain.handle('db:execute', async (_event, sql: string, params: unknown[]) => {
    const db = getDatabase()
    return db.execute(sql, params)
  })

  // Transaction handler (multiple writes atomically)
  ipcMain.handle(
    'db:transaction',
    async (_event, operations: Array<{ sql: string; params: unknown[] }>) => {
      return withTransaction(async (db) => {
        const results: unknown[] = []
        for (const op of operations) {
          const res = await db.execute(op.sql, op.params)
          results.push(res)
        }
        return results
      })
    }
  )

  // ── Secure PIN Authentication ──
  // The renderer sends the raw PIN; bcrypt comparison happens HERE in the main process.
  // Supports optional userId for direct user matching and auto-migrates legacy unhashed PINs.
  ipcMain.handle('auth:verify-pin', async (_event, pin: string, userId?: string) => {
    const db = getDatabase()
    let sql = 'SELECT id, branch_id, full_name, role, pin_hash FROM users WHERE deleted_at IS NULL'
    const params: unknown[] = []
    if (userId) {
      sql += ' AND id = ?'
      params.push(userId)
    }

    const users = await db.query<{
      id: string
      branch_id: string
      full_name: string
      role: string
      pin_hash: string
    }>(sql, params)

    for (const user of users) {
      let isMatch = false
      try {
        if (bcrypt.compareSync(pin, user.pin_hash)) {
          isMatch = true
        }
      } catch {
        // Invalid bcrypt string format (e.g. legacy plain-text PIN stored in DB)
      }

      // Transparent backward compatibility for pre-existing DBs with legacy plain-text PINs
      if (!isMatch && user.pin_hash === pin) {
        isMatch = true
        try {
          const newHash = bcrypt.hashSync(pin, BCRYPT_ROUNDS)
          await db.execute('UPDATE users SET pin_hash = ? WHERE id = ?', [newHash, user.id])
        } catch (e) {
          console.error('Failed to auto-migrate legacy PIN to bcrypt hash:', e)
        }
      }

      if (isMatch) {
        // Match found — fetch branch info and return user
        const branches = await db.query<{ id: string; name: string; address: string }>(
          'SELECT * FROM branches WHERE id = ?',
          [user.branch_id]
        )
        return {
          user: {
            id: user.id,
            branch_id: user.branch_id,
            full_name: user.full_name,
            role: user.role,
            branch_name: branches[0]?.name ?? '',
          },
          branch: branches[0] ?? null,
        }
      }
    }

    // No match
    return null
  })

  // ── Hash a PIN for user creation/update ──
  // Called by the renderer when creating or editing a user.
  ipcMain.handle('auth:hash-pin', async (_event, pin: string) => {
    return bcrypt.hashSync(pin, BCRYPT_ROUNDS)
  })

  // ── Thermal Printer IPC Handlers ──
  ipcMain.handle('printer:get-list', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return []
      const list = await win.webContents.getPrintersAsync()
      return list.map((p) => ({ name: p.name, isDefault: p.isDefault }))
    } catch (e) {
      console.error('Failed to get printer list:', e)
      return []
    }
  })

  ipcMain.handle('printer:print-html', async (_event, htmlContent: string, printerName?: string) => {
    let printWin: BrowserWindow | null = null
    try {
      printWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

      return await new Promise<boolean>((resolve) => {
        if (!printWin) return resolve(false)
        printWin.webContents.print(
          {
            silent: true,
            deviceName: printerName || '',
            margins: { marginType: 'none' },
          },
          (success, failureReason) => {
            if (printWin) {
              printWin.destroy()
              printWin = null
            }
            if (!success) {
              console.error('Printing failed:', failureReason)
            }
            resolve(success)
          }
        )
      })
    } catch (err) {
      if (printWin) {
        (printWin as BrowserWindow).destroy()
      }
      console.error('Print HTML exception:', err)
      return false
    }
  })

  // ── Open a secondary module window ──
  ipcMain.handle('app:open-module-window', async (_event, moduleName: string) => {
    createModuleWindow(moduleName)
  })

  // ── App Info ──
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:get-db-size', () => {
    try {
      const dbFile = path.join(app.getPath('userData'), 'mellah-pos.db')
      if (fs.existsSync(dbFile)) {
        const stats = fs.statSync(dbFile)
        return stats.size
      }
    } catch { /* ignore */ }
    return 0
  })

  // ── Maintenance IPC Handlers ──
  ipcMain.handle('maintenance:vacuum', async () => {
    try {
      const db = getDatabase()
      await db.exec('VACUUM')
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('maintenance:integrity', async () => {
    try {
      const db = getDatabase()
      const rows = await db.query<{ integrity_check: string }>('PRAGMA integrity_check')
      const ok = rows.length > 0 && (rows[0] as any).integrity_check === 'ok'
      return { success: ok, details: rows }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('maintenance:clear-cache', async () => {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'Cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
      const gpuCacheDir = path.join(app.getPath('userData'), 'GPUCache')
      if (fs.existsSync(gpuCacheDir)) {
        fs.rmSync(gpuCacheDir, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('maintenance:run-full', async () => {
    const results: Record<string, { success: boolean; error?: string }> = {}
    // 1. Integrity check
    try {
      const db = getDatabase()
      const rows = await db.query<{ integrity_check: string }>('PRAGMA integrity_check')
      results.integrity = { success: rows.length > 0 && (rows[0] as any).integrity_check === 'ok' }
    } catch (err) {
      results.integrity = { success: false, error: (err as Error).message }
    }
    // 2. VACUUM
    try {
      const db = getDatabase()
      await db.exec('VACUUM')
      results.vacuum = { success: true }
    } catch (err) {
      results.vacuum = { success: false, error: (err as Error).message }
    }
    // 3. Clear cache
    try {
      const cacheDir = path.join(app.getPath('userData'), 'Cache')
      if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true })
      const gpuCacheDir = path.join(app.getPath('userData'), 'GPUCache')
      if (fs.existsSync(gpuCacheDir)) fs.rmSync(gpuCacheDir, { recursive: true, force: true })
      results.cache = { success: true }
    } catch (err) {
      results.cache = { success: false, error: (err as Error).message }
    }
    return results
  })
}

// ----- Main Window -----

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1280,
    minHeight: 800,
    resizable: true,
    maximizable: true,
    minimizable: true,
    show: false,
    autoHideMenuBar: true,
    title: 'MELLAH POS',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    if (state.isMaximized) {
      mainWindow?.maximize()
    }
    mainWindow?.show()
  })

  // Save window state on close
  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer in development, otherwise load the production bundle
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ----- Secondary Module Windows -----
// Each opens in a separate BrowserWindow, sharing the same SQLite via the main process IPC.
// Closing a secondary window does NOT close the main window or log the user out.

const moduleWindowTitles: Record<string, string> = {
  history: 'سجل المبيعات — MELLAH POS',
  returns: 'إدارة المرتجعات — MELLAH POS',
  customers: 'الزبائن والولاء — MELLAH POS',
  labels: 'طباعة الملصقات — MELLAH POS',
  products: 'المنتجات والمخزون — MELLAH POS',
  reports: 'التقارير والتحليلات — MELLAH POS',
  users: 'إدارة المستخدمين — MELLAH POS',
  branches: 'إدارة الفروع — MELLAH POS',
  settings: 'إعدادات المتجر — MELLAH POS',
  audit_logs: 'سجل العمليات — MELLAH POS',
  maintenance: 'الصيانة والتحديثات — MELLAH POS',
}

function createModuleWindow(moduleName: string): void {
  const moduleWin = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    maximizable: true,
    minimizable: true,
    autoHideMenuBar: true,
    title: moduleWindowTitles[moduleName] ?? `${moduleName} — MELLAH POS`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // Load the same renderer but with a query parameter indicating the module
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    moduleWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?module=${moduleName}`)
  } else {
    // For production, load file with query string
    const indexPath = path.join(__dirname, '../renderer/index.html')
    moduleWin.loadFile(indexPath, { query: { module: moduleName } })
  }

  moduleWin.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

// ----- App lifecycle -----

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mellah.pos')

  // Initialize the database
  await initDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Watch for shortcut keys in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Initialize auto-updater (production only)
  if (!is.dev && mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAutoUpdater()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
