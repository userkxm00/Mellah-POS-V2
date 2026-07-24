/**
 * Auto-Updater Module for Mellah POS
 * Uses electron-updater with GitHub Releases as the update source.
 *
 * Architecture:
 *   Main Process ←→ IPC ←→ Renderer (UpdateNotificationBanner)
 *
 * Events sent to renderer:
 *   - update:status  { status, version?, progress?, error? }
 *
 * IPC handlers:
 *   - update:check-now   → manually trigger a check
 *   - update:install-now → quit and install the downloaded update
 */

import { autoUpdater } from 'electron-updater'
import { ipcMain, BrowserWindow } from 'electron'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdatePayload {
  status: UpdateStatus
  version?: string
  progress?: number
  error?: string
  releaseNotes?: string
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

let mainWin: BrowserWindow | null = null
let checkTimer: ReturnType<typeof setInterval> | null = null

function send(payload: UpdatePayload): void {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('update:status', payload)
  }
}

export function initAutoUpdater(win: BrowserWindow): void {
  mainWin = win

  // ── Configuration ──
  autoUpdater.autoDownload = false          // Let user decide
  autoUpdater.autoInstallOnAppQuit = true   // Install on next quit
  autoUpdater.allowDowngrade = false

  // ── Events ──
  autoUpdater.on('checking-for-update', () => {
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  })

  autoUpdater.on('update-not-available', () => {
    send({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({
      status: 'downloading',
      progress: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    send({
      status: 'error',
      error: err?.message ?? 'Unknown update error',
    })
  })

  // ── IPC Handlers ──
  ipcMain.handle('update:check-now', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo?.version ?? null
    } catch (err) {
      return null
    }
  })

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('update:install-now', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // ── Periodic check ──
  // First check after 60 seconds (give app time to load)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 60_000)

  checkTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
