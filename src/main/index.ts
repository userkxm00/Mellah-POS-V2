import { app, shell, BrowserWindow, ipcMain, nativeImage, Menu, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase, whenDatabaseReady, withTransaction } from './database'
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

function registerIpcHandlers(): void {
  // Generic database query handler (read-only) - awaits whenDatabaseReady() to handle early queries seamlessly
  ipcMain.handle('db:query', async (_event, sql: string, params: unknown[]) => {
    const db = await whenDatabaseReady()
    return db.query(sql, params)
  })

  // Generic database execute handler (single write) - awaits whenDatabaseReady()
  ipcMain.handle('db:execute', async (_event, sql: string, params: unknown[]) => {
    const db = await whenDatabaseReady()
    return db.execute(sql, params)
  })

  // Transaction handler (multiple writes atomically) - awaits whenDatabaseReady()
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
  // ── PIN Authentication & Legacy Auto-migration ──
  // Checks bcrypt hash first; if failed, checks legacy plaintext PIN and auto-hashes on match.
  ipcMain.handle('auth:verify-pin', async (_event, pin: string) => {
    const db = await whenDatabaseReady()
    const users = await db.query<{
      id: string
      branch_id: string
      full_name: string
      role: 'admin' | 'cashier'
      pin_hash: string
    }>('SELECT id, branch_id, full_name, role, pin_hash FROM users')

    for (const user of users) {
      let isMatch = false

      // 1. Standard bcrypt compare
      try {
        isMatch = bcrypt.compareSync(pin, user.pin_hash)
      } catch {
        isMatch = false
      }

      // 2. Legacy plaintext fallback (auto-migrate to bcrypt hash)
      if (!isMatch && user.pin_hash === pin) {
        isMatch = true
        try {
          const newHash = bcrypt.hashSync(pin, BCRYPT_ROUNDS)
          await db.execute('UPDATE users SET pin_hash = ? WHERE id = ?', [newHash, user.id])
        } catch (e) {
          // eslint-disable-next-line no-console
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

  // In-memory runtime session for active application execution
  let activeRuntimeUserId: string | null = null

  ipcMain.handle('auth:set-session', (_event, userId: string | null) => {
    activeRuntimeUserId = userId
    return true
  })

  ipcMain.handle('auth:get-session', () => {
    return activeRuntimeUserId
  })

  // ── App Relaunch IPC Handler for Language Change ──
  ipcMain.handle('app:relaunch', () => {
    app.relaunch({ execPath: process.execPath, args: process.argv.slice(1) })
    app.exit(0)
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
      // eslint-disable-next-line no-console
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
              // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error('Print HTML exception:', err)
      return false
    }
  })

  // ── Open Cash Drawer ESC/POS Pulse Handler ──
  ipcMain.handle('printer:open-cash-drawer', async (_event, printerName?: string) => {
    let printWin: BrowserWindow | null = null
    try {
      printWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      // Standard ESC/POS cash drawer pulse HTML snippet
      const htmlContent = `<!DOCTYPE html><html><head><style>@page{size:80mm 10mm;margin:0;}body{margin:0;font-size:1px;}</style></head><body>&#27;&#112;&#0;&#25;&#250;</body></html>`
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

      return await new Promise<boolean>((resolve) => {
        if (!printWin) return resolve(false)
        printWin.webContents.print(
          {
            silent: true,
            deviceName: printerName || '',
            margins: { marginType: 'none' },
          },
          (success) => {
            if (printWin) {
              printWin.destroy()
              printWin = null
            }
            resolve(success)
          }
        )
      })
    } catch {
      if (printWin) {
        (printWin as BrowserWindow).destroy()
      }
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

  // ── File-Based Database Backup System ──

  const DEFAULT_BACKUP_DIR = path.join(app.getPath('userData'), 'backups')
  const BACKUP_CONFIG_FILE = path.join(app.getPath('userData'), 'backup-config.json')
  const MAX_BACKUPS = 14

  function loadBackupConfig(): { customDir: string | null } {
    try {
      if (fs.existsSync(BACKUP_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(BACKUP_CONFIG_FILE, 'utf-8'))
      }
    } catch { /* corrupted config — use default */ }
    return { customDir: null }
  }

  function saveBackupConfig(config: { customDir: string | null }): void {
    fs.writeFileSync(BACKUP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  }

  function getActiveBackupDir(): string {
    const config = loadBackupConfig()
    if (config.customDir && fs.existsSync(config.customDir)) {
      return config.customDir
    }
    return DEFAULT_BACKUP_DIR
  }

  function ensureBackupDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  function rotateOldBackups(dir: string): void {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('mellah-pos-backup-') && f.endsWith('.json'))
        .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time) // newest first

      // Delete backups beyond MAX_BACKUPS
      for (let i = MAX_BACKUPS; i < files.length; i++) {
        try {
          fs.unlinkSync(path.join(dir, files[i].name))
        } catch { /* ignore individual delete failures */ }
      }
    } catch { /* directory might not exist yet */ }
  }

  ipcMain.handle('backup:run-auto', async () => {
    try {
      const db = await whenDatabaseReady()
      const backupDir = getActiveBackupDir()
      ensureBackupDir(backupDir)

      const tables = [
        'branches', 'users', 'categories', 'products', 'product_variants',
        'stock_movements', 'shifts', 'sales', 'sale_items', 'returns',
        'customers', 'store_settings', 'audit_logs', 'customer_payments',
        'suppliers', 'supplier_purchases', 'supplier_payments',
      ]

      const backupData: Record<string, unknown[]> = {}
      for (const table of tables) {
        try {
          backupData[table] = await db.query(`SELECT * FROM ${table}`)
        } catch { /* table might not exist */ }
      }

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `mellah-pos-backup-${dateStr}.json`
      const filePath = path.join(backupDir, fileName)

      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8')

      // Rotate old backups
      rotateOldBackups(backupDir)

      return { success: true, filePath, fileName }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('backup:get-info', () => {
    try {
      const config = loadBackupConfig()
      const configuredDir = config.customDir
      const isCustomMissing = Boolean(configuredDir && !fs.existsSync(configuredDir))
      const backupDir = getActiveBackupDir()
      ensureBackupDir(backupDir)

      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('mellah-pos-backup-') && f.endsWith('.json'))
        .map(f => {
          const stats = fs.statSync(path.join(backupDir, f))
          return { name: f, size: stats.size, time: stats.mtimeMs }
        })
        .sort((a, b) => b.time - a.time)

      return {
        backupDir,
        configuredDir,
        isCustomMissing,
        backupCount: files.length,
        latestBackup: files[0] ?? null,
        totalSizeBytes: files.reduce((sum, f) => sum + f.size, 0),
      }
    } catch {
      const config = loadBackupConfig()
      const dir = getActiveBackupDir()
      return {
        backupDir: dir,
        configuredDir: config.customDir,
        isCustomMissing: Boolean(config.customDir && !fs.existsSync(config.customDir)),
        backupCount: 0,
        latestBackup: null,
        totalSizeBytes: 0,
      }
    }
  })

  // SafeStorage IPC Handlers for Sensitive Credential Encryption
  ipcMain.handle('safe-storage:is-available', () => {
    return safeStorage.isEncryptionAvailable()
  })

  ipcMain.handle('safe-storage:encrypt', (_event, plaintext: string) => {
    if (!plaintext) return ''
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plaintext).toString('base64')
    }
    return plaintext
  })

  ipcMain.handle('safe-storage:decrypt', (_event, ciphertext: string) => {
    if (!ciphertext) return ''
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(ciphertext, 'base64')
        return safeStorage.decryptString(buffer)
      } catch {
        return ciphertext
      }
    }
    return ciphertext
  })

  ipcMain.handle('backup:get-dir', () => {
    return getActiveBackupDir()
  })

  ipcMain.handle('backup:set-dir', async (_event, customDir: string | null) => {
    try {
      if (customDir) {
        const targetDir = path.resolve(path.normalize(customDir))
        // Validate the directory exists or can be created
        ensureBackupDir(targetDir)
        // Resolve symlinks with fs.realpathSync before boundary check
        const realTargetDir = fs.existsSync(targetDir) ? fs.realpathSync(targetDir) : targetDir
        const testFile = path.resolve(realTargetDir, '.mellah-write-test')
        if (!testFile.startsWith(realTargetDir)) {
          throw new Error('Invalid path traversal detected')
        }
        fs.writeFileSync(testFile, 'test', 'utf-8')
        fs.unlinkSync(testFile)
      }
      saveBackupConfig({ customDir })
      return { success: true, activeDir: getActiveBackupDir() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('backup:pick-folder', async () => {
    if (!mainWindow) return { cancelled: true }
    const result = await (await import('electron')).dialog.showOpenDialog(mainWindow, {
      title: 'اختر مجلد النسخ الاحتياطي',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'اختيار هذا المجلد',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }
    return { cancelled: false, folderPath: result.filePaths[0] }
  })

  // ── Database Maintenance ──
  ipcMain.handle('maintenance:vacuum', async () => {
    try {
      const db = await whenDatabaseReady()
      await db.exec('VACUUM')
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('maintenance:integrity', async () => {
    try {
      const db = await whenDatabaseReady()
      const rows = await db.query<{ integrity_check: string }>('PRAGMA integrity_check')
      const ok = rows.length > 0 && rows[0]?.integrity_check === 'ok'
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
      const db = await whenDatabaseReady()
      const rows = await db.query<{ integrity_check: string }>('PRAGMA integrity_check')
      results.integrity = { success: rows.length > 0 && rows[0]?.integrity_check === 'ok' }
    } catch (err) {
      results.integrity = { success: false, error: (err as Error).message }
    }
    // 2. VACUUM
    try {
      const db = await whenDatabaseReady()
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

function getAppNativeIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'build/icon.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return nativeImage.createEmpty()
}

function createWindow(): void {
  const state = loadWindowState()
  const appIcon = getAppNativeIcon()

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
    show: true,
    autoHideMenuBar: true,
    title: 'MELLAH POS',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: is.dev,
    },
  })

  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  }

  if (state.isMaximized) {
    mainWindow.maximize()
  }

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
  const appIcon = getAppNativeIcon()

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
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: is.dev,
    },
  })

  if (!appIcon.isEmpty()) {
    moduleWin.setIcon(appIcon)
  }

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
  // Disable default Electron application menu to prevent F12 DevTools conflict
  Menu.setApplicationMenu(null)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mellah.pos')

  // Register IPC handlers
  registerIpcHandlers()

  // Watch for shortcut keys in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ⚡ INSTANT STARTUP: Create window immediately so HTML/React splash paints instantly (<30ms)
  createWindow()

  // Initialize database in background while splash screen is visible
  initDatabase()
    .then(() => {
      if (!is.dev && mainWindow) {
        initAutoUpdater(mainWindow)
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Database init error:', err)
    })

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
