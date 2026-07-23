import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase, getDatabase, withTransaction } from './database'

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
}

// ----- Window creation -----

function createWindow(): void {
  const state = loadWindowState()

  const mainWindow = new BrowserWindow({
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
      mainWindow.maximize()
    }
    mainWindow.show()
  })

  // Save window state on close
  mainWindow.on('close', () => {
    saveWindowState(mainWindow)
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

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
