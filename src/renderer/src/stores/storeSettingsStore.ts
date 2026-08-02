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
  loyalty_enabled: boolean
  loyalty_spend_per_point_dzd: number
  loyalty_point_value_dzd: number
  loyalty_expiry_months: number
  receipt_printer_name: string
  label_printer_name: string
  barcode_label_language: 'ar' | 'fr' | 'en'
  barcode_label_size: '40x30' | '50x25' | '38x25'
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
  loyalty_enabled: false,
  loyalty_spend_per_point_dzd: 1000,
  loyalty_point_value_dzd: 1,
  loyalty_expiry_months: 0,
  receipt_printer_name: '',
  label_printer_name: '',
  barcode_label_language: 'ar',
  barcode_label_size: '50x25',
}

export const useStoreSettingsStore = create<StoreSettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,

  loadSettings: async () => {
    try {
      // Ensure all store_settings columns exist defensively
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN loyalty_enabled INTEGER DEFAULT 0`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN loyalty_spend_per_point_dzd REAL DEFAULT 1000`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN loyalty_point_value_dzd REAL DEFAULT 1`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN loyalty_expiry_months INTEGER DEFAULT 0`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN receipt_printer_name TEXT DEFAULT ''`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN label_printer_name TEXT DEFAULT ''`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN barcode_label_language TEXT DEFAULT 'ar'`).catch(() => {})
      await window.electron.db.execute(`ALTER TABLE store_settings ADD COLUMN barcode_label_size TEXT DEFAULT '50x25'`).catch(() => {})

      const rows = await window.electron.db.query<{
        store_name: string
        store_address: string
        store_phone: string
        receipt_footer_text: string
        logo_url: string | null
        default_language: string
        session_timeout_minutes: number
        loyalty_enabled: number
        loyalty_spend_per_point_dzd: number
        loyalty_point_value_dzd: number
        loyalty_expiry_months: number
        receipt_printer_name?: string | null
        label_printer_name?: string | null
        barcode_label_language?: string | null
        barcode_label_size?: string | null
      }>(
        `SELECT store_name, COALESCE(store_address, '') as store_address, 
                COALESCE(store_phone, '') as store_phone,
                COALESCE(receipt_footer_text, '') as receipt_footer_text, 
                logo_url, default_language,
                COALESCE(session_timeout_minutes, 5) as session_timeout_minutes,
                COALESCE(loyalty_enabled, 0) as loyalty_enabled,
                COALESCE(loyalty_spend_per_point_dzd, 1000) as loyalty_spend_per_point_dzd,
                COALESCE(loyalty_point_value_dzd, 1) as loyalty_point_value_dzd,
                COALESCE(loyalty_expiry_months, 0) as loyalty_expiry_months,
                COALESCE(receipt_printer_name, '') as receipt_printer_name,
                COALESCE(label_printer_name, '') as label_printer_name,
                COALESCE(barcode_label_language, 'ar') as barcode_label_language,
                COALESCE(barcode_label_size, '50x25') as barcode_label_size
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
            loyalty_enabled: Number(rows[0].loyalty_enabled) === 1,
            loyalty_spend_per_point_dzd: rows[0].loyalty_spend_per_point_dzd ?? 1000,
            loyalty_point_value_dzd: rows[0].loyalty_point_value_dzd ?? 1,
            loyalty_expiry_months: rows[0].loyalty_expiry_months ?? 0,
            receipt_printer_name: rows[0].receipt_printer_name || '',
            label_printer_name: rows[0].label_printer_name || '',
            barcode_label_language: (rows[0].barcode_label_language as 'ar' | 'fr' | 'en') || 'ar',
            barcode_label_size: (rows[0].barcode_label_size as '40x30' | '50x25' | '38x25') || '50x25',
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
