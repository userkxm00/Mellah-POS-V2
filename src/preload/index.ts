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

export interface ElectronApi {
  db: DbApi
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
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    throw new Error(`Failed to expose electron API: ${error}`)
  }
} else {
  (window as Window & { electron?: ElectronApi }).electron = api
}
