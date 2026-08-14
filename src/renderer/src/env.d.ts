/// <reference types="vite/client" />

import type { ElectronApi } from '../../preload/index'

declare global {
  interface Window {
    electron: ElectronApi
  }

  interface ImportMetaEnv {
    readonly VITE_TELEGRAM_BOT_TOKEN?: string
    readonly VITE_TELEGRAM_CHAT_ID?: string
    readonly [key: string]: string | undefined
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
