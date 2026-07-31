import { create } from 'zustand'
import { DEFAULT_BRANCH_ID } from './shiftStore'

export interface StoreSettings {
  store_name: string
  store_address: string
  store_phone: string
  receipt_footer_text: string
  logo_url: string | null
  default_language: string
  session_timeout_minutes: number
}

interface StoreSettingsState {
  settings: StoreSettings
  loaded: boolean
  loadSettings: () => Promise<void>
}

const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'بوتيك الملاح للملابس',
  store_address: '',
  store_phone: '',
  receipt_footer_text: 'شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام مع إحضار الفاتورة.',
  logo_url: null,
  default_language: 'ar',
  session_timeout_minutes: 5,
}

export const useStoreSettingsStore = create<StoreSettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,

  loadSettings: async () => {
    try {
      const rows = await window.electron.db.query<StoreSettings>(
        `SELECT store_name, COALESCE(store_address, '') as store_address, 
                COALESCE(store_phone, '') as store_phone,
                COALESCE(receipt_footer_text, '') as receipt_footer_text, 
                logo_url, default_language,
                COALESCE(session_timeout_minutes, 5) as session_timeout_minutes
         FROM store_settings WHERE branch_id = ?`,
        [DEFAULT_BRANCH_ID]
      )
      if (rows.length > 0) {
        set({
          settings: {
            store_name: rows[0].store_name || DEFAULT_SETTINGS.store_name,
            store_address: rows[0].store_address || '',
            store_phone: rows[0].store_phone || '',
            receipt_footer_text: rows[0].receipt_footer_text || DEFAULT_SETTINGS.receipt_footer_text,
            logo_url: rows[0].logo_url || null,
            default_language: rows[0].default_language || 'ar',
            session_timeout_minutes: rows[0].session_timeout_minutes ?? 5,
          },
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[storeSettingsStore]", err); set({ loaded: true })
    }
  },
}))
