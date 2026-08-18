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

export interface BackupResult {
  success: boolean
  filePath?: string
  fileName?: string
  error?: string
}

export interface BackupInfo {
  backupDir: string
  configuredDir: string | null
  isCustomMissing: boolean
  backupCount: number
  latestBackup: { name: string; size: number; time: number } | null
  totalSizeBytes: number
}

export interface BackupSetDirResult {
  success: boolean
  activeDir?: string
  error?: string
}

export interface BackupPickFolderResult {
  cancelled: boolean
  folderPath?: string
}

export interface BackupApi {
  runAuto: () => Promise<BackupResult>
  getInfo: () => Promise<BackupInfo>
  getDir: () => Promise<string>
  setDir: (customDir: string | null) => Promise<BackupSetDirResult>
  pickFolder: () => Promise<BackupPickFolderResult>
}

export interface AppInfoApi {
  getVersion: () => Promise<string>
  getDbSize: () => Promise<number>
}

export interface SafeStorageApi {
  isAvailable: () => Promise<boolean>
  encrypt: (plaintext: string) => Promise<string>
  decrypt: (ciphertext: string) => Promise<string>
}

export interface BizApi {
  pos: {
    loadData: <T = unknown>(targetBranchId?: string) => Promise<T>
    quickAddCustomer: (name: string, phone: string, targetBranchId?: string) => Promise<{ id: string; barcode: string }>
  }
  sales: {
    process: (payload: unknown) => Promise<{ saleId: string; totalDzd: number; itemCount: number }>
    void: (saleId: string, reason: string, items: Array<{ variant_id: string; quantity: number }>) => Promise<{ success: boolean }>
    history: <T = unknown>(targetBranchId?: string) => Promise<T[]>
  }
  returns: {
    process: (payload: unknown) => Promise<{ returnId: string }>
    search: <T = unknown>(query: string, targetBranchId?: string) => Promise<T[]>
  }
  shifts: {
    active: <T = unknown>(targetBranchId?: string) => Promise<T | null>
    open: <T = unknown>(openingCashDzd: number, targetBranchId?: string) => Promise<T>
    close: (shiftId: string, closingCashDzd: number) => Promise<{ expectedCash: number; difference: number }>
    summary: (shiftId: string) => Promise<{
      openingCash: number
      cashSales: number
      cardSales: number
      cashRepayments: number
      cashRefunds: number
      expectedCash: number
    }>
  }
  customers: {
    list: <T = unknown>(targetBranchId?: string) => Promise<T[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<unknown>
    recordPayment: (payload: { customerId: string; amountDzd: number; paymentMethod: 'cash' | 'card'; notes?: string; shiftId?: string }) => Promise<{ paymentId: string }>
  }
  users: {
    list: <T = unknown>() => Promise<T[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
    delete: (id: string) => Promise<unknown>
  }
  branches: {
    list: <T = unknown>() => Promise<T[]>
    create: (data: unknown) => Promise<unknown>
    update: (id: string, data: unknown) => Promise<unknown>
  }
  settings: {
    load: <T = unknown>() => Promise<T | null>
    save: (settings: Record<string, unknown>) => Promise<{ success: boolean }>
  }
  products: {
    create: (input: unknown) => Promise<{ productId: string; variantIds: string[] }>
    update: (input: unknown) => Promise<{ success: boolean }>
    delete: (productId: string) => Promise<{ success: boolean }>
    addVariant: (input: unknown) => Promise<{ variantId: string }>
    bulkUpdatePrice: (input: unknown) => Promise<{ success: boolean }>
    importCsv: (csvContent: string) => Promise<{ importedCount: number }>
  }
  inventory: {
    adjustStock: (input: unknown) => Promise<{ success: boolean }>
  }
  categories: {
    manage: (input: unknown) => Promise<{ categoryId?: string; success: boolean }>
  }
}

export interface ElectronApi {
  db: DbApi
  biz: BizApi
  openModuleWindow: (moduleName: string) => Promise<void>
  verifyPin: (pin: string, userId?: string) => Promise<AuthResult | null>
  hashPin: (pin: string) => Promise<string>
  setSessionUser: (userId: string | null) => Promise<boolean>
  getSessionUser: () => Promise<string | null>
  getPrinters: () => Promise<PrinterInfo[]>
  printHtml: (htmlContent: string, printerName?: string) => Promise<boolean>
  openCashDrawer: (printerName?: string) => Promise<boolean>
  updater: UpdaterApi
  maintenance: MaintenanceApi
  backup: BackupApi
  appInfo: AppInfoApi
  relaunchApp: () => Promise<void>
  updateWindowIcon?: (primaryHex: string, secondaryHex?: string) => void
  safeStorage: SafeStorageApi
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
  biz: {
    pos: {
      loadData: (targetBranchId?: string) => ipcRenderer.invoke('biz:pos:loadData', targetBranchId),
      quickAddCustomer: (name: string, phone: string, targetBranchId?: string) => ipcRenderer.invoke('biz:pos:quickAddCustomer', name, phone, targetBranchId),
    },
    sales: {
      process: (payload: unknown) => ipcRenderer.invoke('biz:sales:process', payload),
      void: (saleId: string, reason: string, items: Array<{ variant_id: string; quantity: number }>) => ipcRenderer.invoke('biz:sales:void', saleId, reason, items),
      history: (targetBranchId?: string) => ipcRenderer.invoke('biz:sales:history', targetBranchId),
    },
    returns: {
      process: (payload: unknown) => ipcRenderer.invoke('biz:returns:process', payload),
      search: (query: string, targetBranchId?: string) => ipcRenderer.invoke('biz:returns:search', query, targetBranchId),
    },
    shifts: {
      active: (targetBranchId?: string) => ipcRenderer.invoke('biz:shifts:active', targetBranchId),
      open: (openingCashDzd: number, targetBranchId?: string) => ipcRenderer.invoke('biz:shifts:open', openingCashDzd, targetBranchId),
      close: (shiftId: string, closingCashDzd: number) => ipcRenderer.invoke('biz:shifts:close', shiftId, closingCashDzd),
      summary: (shiftId: string) => ipcRenderer.invoke('biz:shifts:summary', shiftId),
    },
    customers: {
      list: (targetBranchId?: string) => ipcRenderer.invoke('biz:customers:list', targetBranchId),
      create: (data: unknown) => ipcRenderer.invoke('biz:customers:create', data),
      update: (id: string, data: unknown) => ipcRenderer.invoke('biz:customers:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('biz:customers:delete', id),
      recordPayment: (payload: { customerId: string; amountDzd: number; paymentMethod: 'cash' | 'card'; notes?: string; shiftId?: string }) => ipcRenderer.invoke('biz:customers:recordPayment', payload),
    },
    users: {
      list: () => ipcRenderer.invoke('biz:users:list'),
      create: (data: unknown) => ipcRenderer.invoke('biz:users:create', data),
      update: (id: string, data: unknown) => ipcRenderer.invoke('biz:users:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('biz:users:delete', id),
    },
    branches: {
      list: () => ipcRenderer.invoke('biz:branches:list'),
      create: (data: unknown) => ipcRenderer.invoke('biz:branches:create', data),
      update: (id: string, data: unknown) => ipcRenderer.invoke('biz:branches:update', id, data),
    },
    settings: {
      load: () => ipcRenderer.invoke('biz:settings:load'),
      save: (settings: Record<string, unknown>) => ipcRenderer.invoke('biz:settings:save', settings),
    },
    products: {
      create: (input: unknown) => ipcRenderer.invoke('biz:products:create', input),
      update: (input: unknown) => ipcRenderer.invoke('biz:products:update', input),
      delete: (productId: string) => ipcRenderer.invoke('biz:products:delete', productId),
      addVariant: (input: unknown) => ipcRenderer.invoke('biz:products:addVariant', input),
      bulkUpdatePrice: (input: unknown) => ipcRenderer.invoke('biz:products:bulkUpdatePrice', input),
      importCsv: (csvContent: string) => ipcRenderer.invoke('biz:products:importCsv', csvContent),
    },
    inventory: {
      adjustStock: (input: unknown) => ipcRenderer.invoke('biz:inventory:adjustStock', input),
    },
    categories: {
      manage: (input: unknown) => ipcRenderer.invoke('biz:categories:manage', input),
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
  setSessionUser: (userId: string | null): Promise<boolean> => {
    return ipcRenderer.invoke('auth:set-session', userId) as Promise<boolean>
  },
  getSessionUser: (): Promise<string | null> => {
    return ipcRenderer.invoke('auth:get-session') as Promise<string | null>
  },
  getPrinters: (): Promise<PrinterInfo[]> => {
    return ipcRenderer.invoke('printer:get-list') as Promise<PrinterInfo[]>
  },
  printHtml: (htmlContent: string, printerName?: string): Promise<boolean> => {
    return ipcRenderer.invoke('printer:print-html', htmlContent, printerName) as Promise<boolean>
  },
  openCashDrawer: (printerName?: string): Promise<boolean> => {
    return ipcRenderer.invoke('printer:open-cash-drawer', printerName) as Promise<boolean>
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
  backup: {
    runAuto: (): Promise<BackupResult> => {
      return ipcRenderer.invoke('backup:run-auto') as Promise<BackupResult>
    },
    getInfo: (): Promise<BackupInfo> => {
      return ipcRenderer.invoke('backup:get-info') as Promise<BackupInfo>
    },
    getDir: (): Promise<string> => {
      return ipcRenderer.invoke('backup:get-dir') as Promise<string>
    },
    setDir: (customDir: string | null): Promise<BackupSetDirResult> => {
      return ipcRenderer.invoke('backup:set-dir', customDir) as Promise<BackupSetDirResult>
    },
    pickFolder: (): Promise<BackupPickFolderResult> => {
      return ipcRenderer.invoke('backup:pick-folder') as Promise<BackupPickFolderResult>
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
  relaunchApp: (): Promise<void> => {
    return ipcRenderer.invoke('app:relaunch') as Promise<void>
  },
  updateWindowIcon: (primaryHex: string, secondaryHex?: string): void => {
    ipcRenderer.send('app:update-window-icon', primaryHex, secondaryHex)
  },
  safeStorage: {
    isAvailable: (): Promise<boolean> => {
      return ipcRenderer.invoke('safe-storage:is-available') as Promise<boolean>
    },
    encrypt: (plaintext: string): Promise<string> => {
      return ipcRenderer.invoke('safe-storage:encrypt', plaintext) as Promise<string>
    },
    decrypt: (ciphertext: string): Promise<string> => {
      return ipcRenderer.invoke('safe-storage:decrypt', ciphertext) as Promise<string>
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
