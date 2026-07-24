import { contextBridge, ipcRenderer } from 'electron'

// ----- Typed API exposed to the renderer process -----

export interface DbRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface DbApi {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  execute: (sql: string, params?: unknown[]) => Promise<DbRunResult>
  transaction: (
    operations: Array<{ sql: string; params: unknown[] }>
  ) => Promise<DbRunResult[]>
}

export interface AuthResult {
  user: {
    id: string
    branch_id: string
    full_name: string
    role: string
    branch_name: string
  }
  branch: {
    id: string
    name: string
    address: string
  } | null
}

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

export interface MaintenanceResult {
  success: boolean
  error?: string
  details?: unknown
}

export interface UpdaterApi {
  checkForUpdates: () => Promise<string | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  onUpdateStatus: (callback: (payload: unknown) => void) => () => void
}

export interface MaintenanceApi {
  vacuum: () => Promise<MaintenanceResult>
  integrityCheck: () => Promise<MaintenanceResult>
  clearCache: () => Promise<MaintenanceResult>
  runFull: () => Promise<Record<string, MaintenanceResult>>
}

export interface AppInfoApi {
  getVersion: () => Promise<string>
  getDbSize: () => Promise<number>
}

export interface ElectronApi {
  db: DbApi
  openModuleWindow: (moduleName: string) => Promise<void>
  verifyPin: (pin: string, userId?: string) => Promise<AuthResult | null>
  hashPin: (pin: string) => Promise<string>
  getPrinters: () => Promise<PrinterInfo[]>
  printHtml: (htmlContent: string, printerName?: string) => Promise<boolean>
  updater: UpdaterApi
  maintenance: MaintenanceApi
  appInfo: AppInfoApi
}

const api: ElectronApi = {
  db: {
    query: <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      return ipcRenderer.invoke('db:query', sql, params) as Promise<T[]>
    },
    execute: (sql: string, params: unknown[] = []): Promise<DbRunResult> => {
      return ipcRenderer.invoke('db:execute', sql, params) as Promise<DbRunResult>
    },
    transaction: (
      operations: Array<{ sql: string; params: unknown[] }>
    ): Promise<DbRunResult[]> => {
      return ipcRenderer.invoke('db:transaction', operations) as Promise<DbRunResult[]>
    },
  },
  openModuleWindow: (moduleName: string): Promise<void> => {
    return ipcRenderer.invoke('app:open-module-window', moduleName) as Promise<void>
  },
  verifyPin: (pin: string, userId?: string): Promise<AuthResult | null> => {
    return ipcRenderer.invoke('auth:verify-pin', pin, userId) as Promise<AuthResult | null>
  },
  hashPin: (pin: string): Promise<string> => {
    return ipcRenderer.invoke('auth:hash-pin', pin) as Promise<string>
  },
  getPrinters: (): Promise<PrinterInfo[]> => {
    return ipcRenderer.invoke('printer:get-list') as Promise<PrinterInfo[]>
  },
  printHtml: (htmlContent: string, printerName?: string): Promise<boolean> => {
    return ipcRenderer.invoke('printer:print-html', htmlContent, printerName) as Promise<boolean>
  },
  updater: {
    checkForUpdates: (): Promise<string | null> => {
      return ipcRenderer.invoke('update:check-now') as Promise<string | null>
    },
    downloadUpdate: (): Promise<boolean> => {
      return ipcRenderer.invoke('update:download') as Promise<boolean>
    },
    installUpdate: (): void => {
      ipcRenderer.invoke('update:install-now')
    },
    onUpdateStatus: (callback: (payload: unknown) => void): (() => void) => {
      const handler = (_event: unknown, payload: unknown): void => {
        callback(payload)
      }
      ipcRenderer.on('update:status', handler)
      return () => {
        ipcRenderer.removeListener('update:status', handler)
      }
    },
  },
  maintenance: {
    vacuum: (): Promise<MaintenanceResult> => {
      return ipcRenderer.invoke('maintenance:vacuum') as Promise<MaintenanceResult>
    },
    integrityCheck: (): Promise<MaintenanceResult> => {
      return ipcRenderer.invoke('maintenance:integrity') as Promise<MaintenanceResult>
    },
    clearCache: (): Promise<MaintenanceResult> => {
      return ipcRenderer.invoke('maintenance:clear-cache') as Promise<MaintenanceResult>
    },
    runFull: (): Promise<Record<string, MaintenanceResult>> => {
      return ipcRenderer.invoke('maintenance:run-full') as Promise<Record<string, MaintenanceResult>>
    },
  },
  appInfo: {
    getVersion: (): Promise<string> => {
      return ipcRenderer.invoke('app:get-version') as Promise<string>
    },
    getDbSize: (): Promise<number> => {
      return ipcRenderer.invoke('app:get-db-size') as Promise<number>
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    throw new Error(`Failed to expose electron API: ${error}`)
  }
} else {
  (window as Window & { electron?: ElectronApi }).electron = api
}
