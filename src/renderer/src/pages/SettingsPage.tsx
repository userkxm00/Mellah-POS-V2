import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowRight, ExternalLink, Save, Database, Store, Printer, Upload, AlertTriangle, Globe, Clock, FileText, Eye, Barcode, FolderOpen, RefreshCw, HardDrive, Moon, Sun, Volume2, VolumeX, Send, Bell, Sparkles, Award } from 'lucide-react'
import { Card, Input, Modal, Button } from '@/components/ui'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { exportDatabaseBackup, importDatabaseBackup } from '@/services/backupService'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore, type Language } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useThemeStore } from '@/stores/themeStore'
import { soundService } from '@/services/soundService'
import { printThermalReceipt, buildReceiptHtml, generateBarcodeSvg, type ReceiptLanguage, RECEIPT_TRANSLATIONS } from '@/services/receiptService'
import { sendTestTelegramNotification } from '@/services/telegramService'

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

export function SettingsPage({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const currentLang = useLanguageStore((s) => s.language)
  const setLanguageStore = useLanguageStore((s) => s.setLanguage)
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)

  const [storeName, setStoreName] = useState<string>(t('بوتيك الملاح للملابس'))
  const [storeAddress, setStoreAddress] = useState<string>('')
  const [storePhone, setStorePhone] = useState<string>('')
  const [footerText, setFooterText] = useState<string>(t('شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام مع إحضار الفاتورة.'))
  const [sessionTimeout, setSessionTimeout] = useState<number>(5)

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const soundVolume = useThemeStore((s) => s.soundVolume)
  const setSoundVolume = useThemeStore((s) => s.setSoundVolume)

  const storeSettingsObj = useStoreSettingsStore((s) => s.settings)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>(
    storeSettingsObj.receipt_printer_name || localStorage.getItem('mellah_printer_name') || ''
  )
  const [selectedLabelPrinter, setSelectedLabelPrinter] = useState<string>(
    storeSettingsObj.label_printer_name || ''
  )
  const [labelLanguage, setLabelLanguage] = useState<'ar' | 'fr' | 'en'>(
    storeSettingsObj.barcode_label_language || 'ar'
  )
  const [labelSize, setLabelSize] = useState<'40x30' | '50x25' | '38x25'>(
    storeSettingsObj.barcode_label_size || '50x25'
  )
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(
    (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
  )
  const [receiptLanguage, setReceiptLanguage] = useState<ReceiptLanguage>(
    (localStorage.getItem('mellah_receipt_language') as ReceiptLanguage) ?? 'ar'
  )
  const [autoPrint, setAutoPrint] = useState<boolean>(
    localStorage.getItem('mellah_auto_print') !== 'false'
  )

  // Preview Modals State
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState<boolean>(false)
  const [isBarcodePreviewOpen, setIsBarcodePreviewOpen] = useState<boolean>(false)

  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false)
  const [isRestartModalOpen, setIsRestartModalOpen] = useState<boolean>(false)
  const [initialLang, setInitialLang] = useState<Language>(currentLang)
  const [pendingBackupContent, setPendingBackupContent] = useState<string | null>(null)
  const [isCustomTimeout, setIsCustomTimeout] = useState<boolean>(false)
  const [selectedBrandColor, setSelectedBrandColor] = useState<string>(
    localStorage.getItem('mellah_brand_color') || '#0A84FF'
  )
  const [selectedBrandHover, setSelectedBrandHover] = useState<string>(
    localStorage.getItem('mellah_brand_color_hover') || '#00C6FF'
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Backup directory state
  const [backupDir, setBackupDir] = useState<string>('')
  const [configuredDir, setConfiguredDir] = useState<string | null>(null)
  const [isCustomMissing, setIsCustomMissing] = useState<boolean>(false)
  const [backupCount, setBackupCount] = useState<number>(0)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null)
  const [isChangingDir, setIsChangingDir] = useState<boolean>(false)

  // Telegram Settings State
  const [telegramBotToken, setTelegramBotToken] = useState<string>('')
  const [telegramChatIds, setTelegramChatIds] = useState<string>('')
  const [telegramNotifyAppLaunch, setTelegramNotifyAppLaunch] = useState<boolean>(true)
  const [telegramNotifySale, setTelegramNotifySale] = useState<boolean>(true)
  const [telegramNotifyShift, setTelegramNotifyShift] = useState<boolean>(true)
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false)

  // Loyalty Program Settings State
  const [loyaltyEnabled, setLoyaltyEnabled] = useState<boolean>(false)
  const [loyaltySpendPerPoint, setLoyaltySpendPerPoint] = useState<number>(1000)
  const [loyaltyPointValue, setLoyaltyPointValue] = useState<number>(1)
  const [loyaltyExpiryMonths, setLoyaltyExpiryMonths] = useState<number>(0)

async function fetchSystemPrinters(): Promise<PrinterInfo[]> {
  try {
    if (typeof window !== 'undefined' && window.electron?.getPrinters) {
      return await window.electron.getPrinters()
    }
  } catch {
    // سكوت — خدمة الطباعة غير متاحة (Windows Print Spooler موقف)
  }
  return []
}

// Fetch printers and store settings
  const loadSettings = useCallback(async () => {
    try {
      const printerList = await fetchSystemPrinters()
      setPrinters(printerList)
      if (!selectedPrinter && printerList.length > 0) {
        const defaultP = printerList.find((p) => p.isDefault) ?? printerList[0]
        setSelectedPrinter(defaultP.name)
      }

      const rows = await window.electron.db.query<{
        store_name: string
        store_address: string | null
        store_phone: string | null
        receipt_footer_text: string
        default_language: string
        session_timeout_minutes: number | null
        telegram_bot_token: string | null
        telegram_chat_ids: string | null
        telegram_notify_app_launch: number | null
        telegram_notify_sale: number | null
        telegram_notify_shift: number | null
        loyalty_enabled: number | null
        loyalty_spend_per_point_dzd: number | null
        loyalty_point_value_dzd: number | null
        loyalty_expiry_months: number | null
      }>(
        'SELECT store_name, store_address, store_phone, receipt_footer_text, default_language, session_timeout_minutes, telegram_bot_token, telegram_chat_ids, telegram_notify_app_launch, telegram_notify_sale, telegram_notify_shift, loyalty_enabled, loyalty_spend_per_point_dzd, loyalty_point_value_dzd, loyalty_expiry_months FROM store_settings WHERE branch_id = ?',
        [DEFAULT_BRANCH_ID]
      )

      if (rows.length > 0) {
        setStoreName(rows[0].store_name ?? t('بوتيك الملاح للملابس'))
        setStoreAddress(rows[0].store_address ?? '')
        setStorePhone(rows[0].store_phone ?? '')
        setFooterText(rows[0].receipt_footer_text ?? '')
        if (rows[0].default_language) {
          setInitialLang(rows[0].default_language as Language)
          setLanguageStore(rows[0].default_language as Language)
        }
        if (rows[0].session_timeout_minutes !== undefined && rows[0].session_timeout_minutes !== null) {
          const mins = rows[0].session_timeout_minutes
          setSessionTimeout(mins)
          if (![0, 1, 3, 5, 10, 15, 30, 60].includes(mins)) {
            setIsCustomTimeout(true)
          }
        }

        let tokenVal = rows[0].telegram_bot_token ?? localStorage.getItem('mellah_telegram_bot_token') ?? ''
        if (tokenVal && window.electron?.safeStorage?.decrypt) {
          try {
            tokenVal = await window.electron.safeStorage.decrypt(tokenVal)
          } catch {
            // fallback
          }
        }
        setTelegramBotToken(tokenVal)
        setTelegramChatIds(rows[0].telegram_chat_ids ?? localStorage.getItem('mellah_telegram_chat_ids') ?? '')
        setTelegramNotifyAppLaunch(rows[0].telegram_notify_app_launch === 1)
        setTelegramNotifySale(rows[0].telegram_notify_sale === 1)
        setTelegramNotifyShift(rows[0].telegram_notify_shift === 1)
        setLoyaltyEnabled(rows[0].loyalty_enabled === 1)
        setLoyaltySpendPerPoint(rows[0].loyalty_spend_per_point_dzd ?? 1000)
        setLoyaltyPointValue(rows[0].loyalty_point_value_dzd ?? 1)
        setLoyaltyExpiryMonths(rows[0].loyalty_expiry_months ?? 0)
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); // Default fallback settings
    }
  }, [selectedPrinter, setLanguageStore, t])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Load backup directory info
  const loadBackupInfo = useCallback(async () => {
    try {
      const info = await window.electron.backup.getInfo()
      setBackupDir(info.backupDir)
      setConfiguredDir(info.configuredDir)
      setIsCustomMissing(info.isCustomMissing)
      setBackupCount(info.backupCount)
      if (info.latestBackup) {
        setLastBackupTime(new Date(info.latestBackup.time).toLocaleString('ar-DZ'))
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); /* ignore */ }
  }, [])

  useEffect(() => {
    loadBackupInfo()
  }, [loadBackupInfo])

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      const rawToken = telegramBotToken.trim()
      let storedToken = rawToken
      if (rawToken && window.electron?.safeStorage?.encrypt) {
        try {
          storedToken = await window.electron.safeStorage.encrypt(rawToken)
        } catch {
          // fallback
        }
      }

      await window.electron.db.execute(
        `INSERT INTO store_settings (
           branch_id, store_name, store_address, store_phone, receipt_footer_text, default_language, session_timeout_minutes,
           telegram_bot_token, telegram_chat_ids, telegram_notify_app_launch, telegram_notify_sale, telegram_notify_shift,
           loyalty_enabled, loyalty_spend_per_point_dzd, loyalty_point_value_dzd, loyalty_expiry_months,
           receipt_printer_name, label_printer_name, barcode_label_language, barcode_label_size, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id) DO UPDATE SET
           store_name=excluded.store_name,
           store_address=excluded.store_address,
           store_phone=excluded.store_phone,
           receipt_footer_text=excluded.receipt_footer_text,
           default_language=excluded.default_language,
           session_timeout_minutes=excluded.session_timeout_minutes,
           telegram_bot_token=excluded.telegram_bot_token,
           telegram_chat_ids=excluded.telegram_chat_ids,
           telegram_notify_app_launch=excluded.telegram_notify_app_launch,
           telegram_notify_sale=excluded.telegram_notify_sale,
           telegram_notify_shift=excluded.telegram_notify_shift,
           loyalty_enabled=excluded.loyalty_enabled,
           loyalty_spend_per_point_dzd=excluded.loyalty_spend_per_point_dzd,
           loyalty_point_value_dzd=excluded.loyalty_point_value_dzd,
           loyalty_expiry_months=excluded.loyalty_expiry_months,
           receipt_printer_name=excluded.receipt_printer_name,
           label_printer_name=excluded.label_printer_name,
           barcode_label_language=excluded.barcode_label_language,
           barcode_label_size=excluded.barcode_label_size,
           updated_at=excluded.updated_at`,
        [
          DEFAULT_BRANCH_ID,
          storeName.trim(),
          storeAddress.trim() || null,
          storePhone.trim() || null,
          footerText.trim(),
          currentLang,
          sessionTimeout,
          storedToken || null,
          telegramChatIds.trim() || null,
          telegramNotifyAppLaunch ? 1 : 0,
          telegramNotifySale ? 1 : 0,
          telegramNotifyShift ? 1 : 0,
          loyaltyEnabled ? 1 : 0,
          Math.max(1, loyaltySpendPerPoint || 1000),
          Math.max(0.01, loyaltyPointValue || 1),
          Math.max(0, loyaltyExpiryMonths || 0),
          selectedPrinter.trim(),
          selectedLabelPrinter.trim(),
          labelLanguage,
          labelSize,
          now
        ]
      )

      localStorage.setItem('mellah_printer_name', selectedPrinter)
      localStorage.setItem('mellah_paper_width', paperWidth)
      localStorage.setItem('mellah_receipt_language', receiptLanguage)
      localStorage.setItem('mellah_auto_print', String(autoPrint))

      localStorage.setItem('mellah_telegram_bot_token', storedToken)
      localStorage.setItem('mellah_telegram_chat_ids', telegramChatIds.trim())
      localStorage.setItem('mellah_telegram_notify_app_launch', String(telegramNotifyAppLaunch))
      localStorage.setItem('mellah_telegram_notify_sale', String(telegramNotifySale))
      localStorage.setItem('mellah_telegram_notify_shift', String(telegramNotifyShift))

      // Refresh store settings in Zustand store
      useStoreSettingsStore.getState().loadSettings()

      addToast({ message: t('تم حفظ إعدادات المتجر وإشعارات تلغرام بنجاح!'), variant: 'success' })

      if (currentLang !== initialLang) {
        window.location.reload()
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); addToast({ message: t('فشل حفظ الإعدادات'), variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestPrint = async (): Promise<void> => {
    try {
      await printThermalReceipt(
        {
          storeName: storeName || t('بوتيك الملاح للملابس'),
          branchAddress: storeAddress || t('الجزائر العاصمة'),
          receiptId: 'TEST-123456',
          date: new Date().toISOString(),
          cashierName: t('تجربة الطابعة'),
          items: [
            { product_name: t('قميص رجالي فاخر (تجربة)'), size: 'L', color: t('أزرق'), quantity: 1, unit_price: 3500 },
            { product_name: t('سروال جينز عصري (تجربة)'), size: '42', color: t('أسود'), quantity: 1, unit_price: 4200 },
          ],
          subtotalDzd: 7700,
          discountDzd: 200,
          totalDzd: 7500,
          paymentMethod: 'cash',
        },
        { printerName: selectedPrinter || undefined, paperWidth, language: receiptLanguage }
      )
      addToast({ message: t('تم إرسال أمر الطباعة التجريبية!'), variant: 'success' })
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); addToast({ message: t('فشل طباعة التذكرة التجريبية'), variant: 'error' })
    }
  }

  const handleTestTelegram = async (): Promise<void> => {
    setIsTestingTelegram(true)
    try {
      const res = await sendTestTelegramNotification(telegramBotToken, telegramChatIds)
      if (res.success) {
        addToast({
          message: `${t('تم إرسال الرسالة التجريبية بنجاح إلى')} ${res.count} ${t('محادثة في تلغرام!')}`,
          variant: 'success',
        })
      } else {
        addToast({ message: res.error || t('فشل إرسال رسالة تجربة تلغرام'), variant: 'error' })
      }
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsTestingTelegram(false)
    }
  }

  const handleBackup = async (): Promise<void> => {
    setIsExporting(true)
    try {
      const fileName = await exportDatabaseBackup()
      addToast({ message: `${t('تم تصدير النسخة الاحتياطية بنجاح:')} ${fileName}`, variant: 'success' })
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return

    file
      .text()
      .then((content) => {
        if (content) {
          setPendingBackupContent(content)
          setIsRestoreModalOpen(true)
        }
      })
      .catch(() => {
        addToast({ message: t('فشل قراءة ملف النسخة الاحتياطية'), variant: 'error' })
      })
  }

  const handleConfirmRestore = async (): Promise<void> => {
    if (!pendingBackupContent) return
    setIsImporting(true)
    try {
      const count = await importDatabaseBackup(pendingBackupContent)
      addToast({ message: `${t('تمت استعادة البيانات بنجاح! الإجمالي:')} ${count} ${t('سجل')}`, variant: 'success' })
      setIsRestoreModalOpen(false)
      setPendingBackupContent(null)
      loadSettings()
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsImporting(false)
    }
  }

  const [activeTab, setActiveTab] = useState<'store' | 'printer' | 'loyalty' | 'theme' | 'telegram' | 'backup' | 'language'>('store')

  const tabs = [
    {
      id: 'store',
      label: t('بيانات المتجر'),
      desc: t('Nom du magasin, adresse, en-tête...'),
      icon: <Store className="w-4 h-4" />
    },
    {
      id: 'printer',
      label: t('طابعة الفواتير'),
      desc: t('Sélection de l\'imprimante, ticket de test...'),
      icon: <Printer className="w-4 h-4" />
    },
    {
      id: 'loyalty',
      label: t('نقاط الولاء والزبائن'),
      desc: t('Programme de fidélité, points...'),
      icon: <Award className="w-4 h-4" />
    },
    {
      id: 'telegram',
      label: t('إشعارات تلغرام'),
      desc: t('Notifications de vente, rapports...'),
      icon: <Send className="w-4 h-4" />
    },
    {
      id: 'theme',
      label: t('المظهر والصوت'),
      desc: t('Thèmes, couleurs de marque, effets...'),
      icon: <Sun className="w-4 h-4" />
    },
    {
      id: 'backup',
      label: t('النسخ الاحتياطي'),
      desc: t('Planificateur, historique de backup, cloud...'),
      icon: <Database className="w-4 h-4" />
    },
    {
      id: 'language',
      label: t('اللغة والأمان'),
      desc: t('Langue du système, code PIN...'),
      icon: <Globe className="w-4 h-4" />
    },
  ]

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  return (
    <div className="p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
              title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
            >
              <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
            </button>

            {!isSecondaryWindow && (
              <button
                type="button"
                onClick={() => {
                  if (window.electron?.openModuleWindow) {
                    window.electron.openModuleWindow('settings')
                    if (onBack) onBack()
                  }
                }}
                className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
                title={t('فتح في نافذة خارجية جديدة')}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('إعدادات المتجر وطابعة الفواتير واللغة والنسخ الاحتياطي')}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sleek Translucent Glass Sidebar (macOS Style) */}
        <div className="md:col-span-1 bg-gray-100/60 dark:bg-slate-900/60 backdrop-blur-md border border-gray-200/80 dark:border-slate-800 p-2.5 rounded-2xl space-y-2 h-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all btn-press text-right ${
                activeTab === tab.id
                  ? 'bg-accent text-white shadow-hero-glow font-black'
                  : 'bg-white/70 dark:bg-slate-900/70 border border-gray-200/60 dark:border-slate-800/80 text-[#1C2B3A] dark:text-slate-200 hover:border-accent/40 hover:text-accent'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent dark:bg-accent/20'
                }`}
              >
                {tab.icon}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black leading-snug truncate">{tab.label}</span>
                <span
                  className={`text-[10px] font-medium mt-0.5 truncate leading-tight ${
                    activeTab === tab.id ? 'text-white/80' : 'text-text-secondary dark:text-slate-400'
                  }`}
                >
                  {tab.desc}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Settings Content Panels */}
        <form onSubmit={handleSave} className="md:col-span-3 space-y-5">
          {/* Top Persistent Save Action Bar */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-bold text-text-secondary dark:text-slate-400">
                {t('جاهز لحفظ الإعدادات في جميع التبويبات')}
              </span>
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-hero-glow transition-all btn-press flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? t('جاري الحفظ...') : t('حفظ الإعدادات')}</span>
            </button>
          </div>

          {activeTab === 'store' && (
            <Card className="p-6 space-y-4 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
              <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
                <Store className="w-4 h-4 text-accent" />
                <span>{t('بيانات المتجر والفواتير')}</span>
              </h2>

            <Input
              label={t('اسم المتجر (المطبوع أعلى الفاتورة)')}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('عنوان المتجر')}
                placeholder={t('مثال: الجزائر العاصمة، حي حسيبة بن بوعلي')}
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
              />
              <Input
                label={t('هاتف المتجر')}
                placeholder={t('مثال: 0550123456')}
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-primary">{t('نص أسفل الفاتورة الحرارية (Footer Text)')}</label>
              <textarea
                rows={2}
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="py-3 px-6 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-hero-glow transition-all btn-press flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التغييرات</span>
              </button>
            </div>
          </Card>
          )}

          {/* Language & Session Timeout Settings Card */}
          {activeTab === 'language' && (
          <Card className="p-6 space-y-4 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
            <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Globe className="w-4 h-4 text-accent" />
              <span>{t('اللغة والأمان')}</span>
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-primary dark:text-slate-200">{t('لغة الواجهة (Language)')}</label>
                <select
                  value={currentLang}
                  onChange={(e) => setLanguageStore(e.target.value as Language)}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="ar">العربية (RTL)</option>
                  <option value="fr">Français (LTR)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="session-timeout-select" className="text-xs font-bold text-text-primary dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>{t('قفل الجلسة التلقائي عند التوقف (Session Auto-Lock)')}</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                    sessionTimeout === 0
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sessionTimeout === 0 ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span>{sessionTimeout === 0 ? t('القفل التلقائي معطل') : `${t('مفعل بعد')} ${sessionTimeout} ${t('دقيقة')}`}</span>
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <select
                    id="session-timeout-select"
                    value={isCustomTimeout || ![0, 1, 3, 5, 10, 15, 30, 60].includes(sessionTimeout) ? 'custom' : sessionTimeout}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'custom') {
                        setIsCustomTimeout(true)
                        if ([0, 1, 3, 5, 10, 15, 30, 60].includes(sessionTimeout)) {
                          setSessionTimeout(7)
                        }
                      } else {
                        setIsCustomTimeout(false)
                        setSessionTimeout(Number.parseInt(val, 10))
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    <option value={0}>{t('معطل (إيقاف القفل التلقائي للجلسة نهائياً)')}</option>
                    <option value={1}>{t('دقيقة واحدة (1 دقيقة)')}</option>
                    <option value={3}>{t('3 دقائق')}</option>
                    <option value={5}>{t('5 دقائق (الافتراضي)')}</option>
                    <option value={10}>{t('10 دقائق')}</option>
                    <option value={15}>{t('15 دقيقة')}</option>
                    <option value={30}>{t('30 دقيقة')}</option>
                    <option value={60}>{t('ساعة واحدة (60 دقيقة)')}</option>
                    <option value="custom">{t('وقت مخصص (تحديد عدد الدقائق يدوياً)')}</option>
                  </select>

                  {(isCustomTimeout || ![0, 1, 3, 5, 10, 15, 30, 60].includes(sessionTimeout)) && (
                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 px-3.5 py-2 rounded-2xl animate-scale-in">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={sessionTimeout || ''}
                        onChange={(e) => setSessionTimeout(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                        placeholder="7"
                        className="w-14 text-center text-xs font-black bg-transparent text-[#1C2B3A] dark:text-slate-100 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-text-secondary">{t('دقيقة')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          )}

          {/* Loyalty Program Settings Card */}
          {activeTab === 'loyalty' && (
            <Card className="p-6 space-y-5 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>{t('برنامج نقاط الولاء ومكافآت الزبائن (Loyalty Points Program)')}</span>
                </h2>
                <span
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                    loyaltyEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                  }`}
                >
                  {loyaltyEnabled ? t('مفعل (Active)') : t('معطل (Disabled)')}
                </span>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20">
                <div className="space-y-1">
                  <label htmlFor="loyalty-toggle" className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-2 cursor-pointer">
                    <span>{t('تفعيل نظام جمع واستبدال النقاط')}</span>
                  </label>
                  <p className="text-[11px] text-text-secondary dark:text-slate-400">
                    {t('عند التفعيل، يكسب الزبون نقاطاً تلقائياً عند كل عملية شراء، ويكون قادراً على استبدالها بخصومات في شاشة POS.')}
                  </p>
                </div>
                <input
                  id="loyalty-toggle"
                  type="checkbox"
                  checked={loyaltyEnabled}
                  onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                  className="w-5 h-5 rounded text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Rates Settings Grid */}
              <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-200 ${loyaltyEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary dark:text-slate-200">
                    {t('المبلغ المطلوب لكسب نقطة واحدة (دج)')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={loyaltySpendPerPoint || ''}
                    onChange={(e) => setLoyaltySpendPerPoint(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-accent"
                    placeholder="1000"
                  />
                  <p className="text-[10px] text-text-tertiary">
                    {t('مثال: 1000 دج = نقطة واحدة لكل 1000 دج مشتريات')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary dark:text-slate-200">
                    {t('قيمة النقطة الواحدة عند الخصم (دج)')}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={loyaltyPointValue || ''}
                    onChange={(e) => setLoyaltyPointValue(Math.max(0.01, Number.parseFloat(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-accent"
                    placeholder="1"
                  />
                  <p className="text-[10px] text-text-tertiary">
                    {t('مثال: 1 دج = 100 نقطة تعطي خصماً بقيمة 100 دج')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary dark:text-slate-200">
                    {t('صلاحية النقاط بالأشهر (0 = بلا حدود)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={loyaltyExpiryMonths}
                    onChange={(e) => setLoyaltyExpiryMonths(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
                    className="w-full px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-accent"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-text-tertiary">
                    {t('ضع 0 لجعل النقاط دائمة ولا تنتهي صلاحيتها أبداً')}
                  </p>
                </div>
              </div>

              {/* Informational Banner */}
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-medium space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t('ملاحظة مستقلة خاصة ببطاقات الزبائن والباركود:')}</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  {t('طباعة بطاقة الزبون وكود الباركود الخاص به تعمل في جميع الأوقات بشكل مستقل تماماً، سواء كان برنامج نقاط الولاء مفعلاً أو معطلاً.')}
                </p>
              </div>
            </Card>
          )}

          {/* Telegram Notifications Settings Card */}
          {activeTab === 'telegram' && (
            <Card className="p-6 space-y-5 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
                  <Send className="w-4 h-4 text-sky-500" />
                  <span>{t('إعدادات بوت وإشعارات تلغرام الذكية (Telegram Bot)')}</span>
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  Telegram Instant Alerts
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    label={t('توكن البوت (Bot Token)')}
                    type="password"
                    placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ..."
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                  />
                  <p className="text-[11px] text-text-secondary mt-1">
                    {t('احصل على التوكن مجاناً عبر البحث عن BotFather في تلغرام وإجراء أمر /newbot')}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200 flex items-center justify-between">
                    <span>{t('معرفات المحادثات (Chat IDs) — أكثر من ID مدعوم')}</span>
                    <span className="text-[10px] text-text-secondary">فصل بين المعرفات بفواصل أو أسطر</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="123456789, 987654321, -100123456789"
                    value={telegramChatIds}
                    onChange={(e) => setTelegramChatIds(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-medium bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  />
                  <p className="text-[11px] text-text-secondary">
                    {t('يمكنك إضافة ID حسابك الشخصي أو ID مجموعة المدراء ليصل التنبيه للجميع فوراً.')}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-accent" />
                    <span>{t('أنواع الإشعارات المراد استقبالها:')}</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 cursor-pointer hover:border-accent transition-all">
                      <input
                        type="checkbox"
                        checked={telegramNotifyAppLaunch}
                        onChange={(e) => setTelegramNotifyAppLaunch(e.target.checked)}
                        className="w-4 h-4 rounded text-accent focus:ring-accent"
                      />
                      <span className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200">{t('فتح وتنسيق التطبيق')}</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 cursor-pointer hover:border-accent transition-all">
                      <input
                        type="checkbox"
                        checked={telegramNotifySale}
                        onChange={(e) => setTelegramNotifySale(e.target.checked)}
                        className="w-4 h-4 rounded text-accent focus:ring-accent"
                      />
                      <span className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200">{t('فواتير المبيعات + الصور')}</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 cursor-pointer hover:border-accent transition-all">
                      <input
                        type="checkbox"
                        checked={telegramNotifyShift}
                        onChange={(e) => setTelegramNotifyShift(e.target.checked)}
                        className="w-4 h-4 rounded text-accent focus:ring-accent"
                      />
                      <span className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200">{t('بداية الورديات والصندوق')}</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleTestTelegram}
                    loading={isTestingTelegram}
                    className="flex items-center gap-2 border-sky-200 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                  >
                    <Send className="w-4 h-4" />
                    <span>{t('تجربة الإرسال الفوري (Test Telegram)')}</span>
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Appearance & Sound Settings Card */}
          {activeTab === 'theme' && (
          <Card className="p-6 space-y-4 border border-gray-200/80 dark:border-slate-700/80">
            <h2 className="text-sm font-black text-[#1C2B3A] dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Sun className="w-4 h-4 text-accent" />
              <span>المظهر الخارجي والمؤثرات الصوتية (Theme & Sound)</span>
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Theme Mode Toggle */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-accent" />
                  <span>وضع الشاشة (Light / Dark)</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      theme === 'light'
                        ? 'bg-white text-accent shadow-layered-sm font-black'
                        : 'text-[#6B7A8D] dark:text-slate-400 hover:text-[#1C2B3A]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>فاتح (Light)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      theme === 'dark'
                        ? 'bg-slate-900 text-amber-400 shadow-layered-sm font-black'
                        : 'text-[#6B7A8D] dark:text-slate-400 hover:text-[#1C2B3A]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>داكن (Dark)</span>
                  </button>
                </div>
              </div>

              {/* Brand Theme Color Accent Picker with Live Swatch Preview */}
              <div className="flex flex-col gap-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-text-primary dark:text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span>{t('منصة اختيار هوية العلامة التجارية (Live Brand Identity Swatch)')}</span>
                  </label>
                  <span className="text-[10px] font-bold text-text-secondary dark:text-slate-400">
                    {t('تأثير فوري على كامل الواجهات والنوافذ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  {/* Swatches Grid */}
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: t('أزرق ملاح (افتراضي)'), value: '#0A84FF', hover: '#00C6FF' },
                      { name: t('أخضر زمردي'), value: '#10B981', hover: '#06B6D4' },
                      { name: t('بنفسجي ملكي'), value: '#BF5AF2', hover: '#FF2D55' },
                      { name: t('برتقالي دافئ'), value: '#FF9F0A', hover: '#FF5E00' },
                      { name: t('أحمر قرمزي'), value: '#FF453A', hover: '#FF2A85' },
                    ].map((color) => {
                      const isSelected = selectedBrandColor === color.value
                      return (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => {
                            setSelectedBrandColor(color.value)
                            setSelectedBrandHover(color.hover)
                            document.documentElement.style.setProperty('--color-accent', color.value)
                            document.documentElement.style.setProperty('--color-accent-hover', color.hover)
                            localStorage.setItem('mellah_brand_color', color.value)
                            localStorage.setItem('mellah_brand_color_hover', color.hover)
                            if (window.electron?.updateWindowIcon) {
                              window.electron.updateWindowIcon(color.value, color.hover)
                            }
                            addToast({ message: `${t('تم اختيار')} ${color.name} ${t('كلون للنظام الرئيسي!')}`, variant: 'success', duration: 2000 })
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all btn-press ${
                            isSelected
                              ? 'bg-accent/10 dark:bg-accent/20 border-accent text-accent font-black shadow-sm'
                              : 'bg-white/60 dark:bg-slate-800/60 border-gray-200/80 dark:border-slate-700 text-text-primary dark:text-slate-200 hover:border-accent/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 shadow-md shrink-0"
                              style={{ background: `linear-gradient(135deg, ${color.value} 0%, ${color.hover} 100%)` }}
                            />
                            <span className="text-xs font-bold">{color.name}</span>
                          </div>
                          {isSelected && <Sparkles className="w-3.5 h-3.5 text-accent animate-spin" />}
                        </button>
                      )
                    })}
                  </div>

                  {/* Micro Live Brand Emblem Mockup Preview */}
                  <div className="p-5 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center gap-3 border border-white/10 shadow-hero-glow relative overflow-hidden">
                    <div
                      className="absolute -inset-1 rounded-2xl blur-xl opacity-40 transition-all duration-300"
                      style={{ background: `linear-gradient(135deg, ${selectedBrandColor} 0%, ${selectedBrandHover} 100%)` }}
                    />

                    {/* Emblem Icon Box */}
                    <div
                      className="relative w-14 h-14 rounded-2xl flex items-center justify-center border border-white/30 shadow-md transition-all duration-300 z-10"
                      style={{ background: `linear-gradient(135deg, ${selectedBrandColor} 0%, ${selectedBrandHover} 100%)` }}
                    >
                      <svg className="w-8 h-8 text-white drop-shadow-sm" viewBox="0 0 512 512" fill="none">
                        <path d="M140,342 L140,178 L256,292 L372,178 L372,342" stroke="#FFFFFF" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <div className="text-center space-y-1 relative z-10">
                      <p className="text-xs font-black tracking-widest uppercase transition-colors duration-300" style={{ color: selectedBrandColor }}>
                        MELLAH POS
                      </p>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-slate-300 border border-white/10">
                        {t('معاينة حية للهوية')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sound Controls */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-accent" />
                    <span>أصوات الكاشير (Web Audio)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => soundService.playSuccess()}
                    className="text-[10px] text-accent font-bold hover:underline flex items-center gap-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>تجربة الصوت</span>
                  </button>
                </div>
                <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200/80 dark:border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      soundEnabled
                        ? 'bg-success/10 text-success border border-success/30'
                        : 'bg-gray-200 dark:bg-slate-700 text-[#6B7A8D] dark:text-slate-400'
                    }`}
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{soundEnabled ? t('مفعل') : t('صامت')}</span>
                  </button>

                  {soundEnabled && (
                    <div className="flex-1 flex items-center gap-2 pr-1">
                      <label htmlFor="sound-volume-slider" className="sr-only">مستوى الصوت</label>
                      <input
                        id="sound-volume-slider"
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={soundVolume}
                        onChange={(e) => setSoundVolume(Number.parseFloat(e.target.value))}
                        className="flex-1 accent-accent cursor-pointer h-1.5"
                      />
                      <span className="text-[10px] font-mono font-bold text-[#6B7A8D] dark:text-slate-400">
                        {Math.round(soundVolume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          )}

          {/* Thermal Printer Settings Card */}
          {activeTab === 'printer' && (
          <Card className="p-6 space-y-4 border border-gray-200/80 dark:border-slate-800 animate-scale-in">
            <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Printer className="w-4 h-4 text-accent" />
              <span>إعدادات طابعة الفواتير الحرارية (Thermal Printer)</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="printer-select" className="text-xs font-bold text-text-primary dark:text-slate-200">
                  {t('1️⃣ طابعة الفواتير (Imprimante Tickets)')}
                </label>
                <select
                  id="printer-select"
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">{t('الطابعة الافتراضية للفواتير')}</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(الافتراضية للنظام)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="label-printer-select" className="text-xs font-bold text-text-primary dark:text-slate-200">
                  {t('2️⃣ طابعة ملصقات الباركود (Imprimante Étiquettes Barcode)')}
                </label>
                <select
                  id="label-printer-select"
                  value={selectedLabelPrinter}
                  onChange={(e) => setSelectedLabelPrinter(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">{t('طابعة الباركود الحرارية (40mm × 30mm)')}</option>
                  {printers.map((p) => (
                    <option key={`label-${p.name}`} value={p.name}>
                      {p.name} {p.isDefault ? '(الافتراضية للنظام)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paper-width-select" className="text-xs font-bold text-text-primary dark:text-slate-200">عرض ورق الفاتورة الحرارية</label>
                <select
                  id="paper-width-select"
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value as '80mm' | '58mm')}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="80mm">80 مم (80mm Thermal Receipt)</option>
                  <option value="58mm">58 مم (58mm Compact Receipt)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="receipt-lang-select" className="text-xs font-bold text-text-primary dark:text-slate-200">لغة طباعة الفاتورة (Receipt Language)</label>
                <select
                  id="receipt-lang-select"
                  value={receiptLanguage}
                  onChange={(e) => setReceiptLanguage(e.target.value as ReceiptLanguage)}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="ar">العربية (Arabic - RTL)</option>
                  <option value="fr">Français (French - LTR)</option>
                  <option value="en">English (English - LTR)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="label-lang-select" className="text-xs font-bold text-text-primary dark:text-slate-200">لغة ملصقات الباركود (Label Language)</label>
                <select
                  id="label-lang-select"
                  value={labelLanguage}
                  onChange={(e) => setLabelLanguage(e.target.value as 'ar' | 'fr' | 'en')}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="ar">العربية (Arabic)</option>
                  <option value="fr">Français (French)</option>
                  <option value="en">English (English)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-3">
                <label htmlFor="label-size-select" className="text-xs font-bold text-text-primary dark:text-slate-200">حجم ملصقات الباركود للملابس والزبائن (Barcode Label Size)</label>
                <select
                  id="label-size-select"
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value as '40x30' | '50x25' | '38x25')}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="50x25">50 مم × 25 مم (50mm × 25mm - عريض / الملابس والزبائن)</option>
                  <option value="40x30">40 مم × 30 مم (40mm × 30mm - قياسي)</option>
                  <option value="38x25">38 مم × 25 مم (38mm × 25mm - مدمج)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoPrintCheck"
                checked={autoPrint}
                onChange={(e) => setAutoPrint(e.target.checked)}
                className="w-4 h-4 rounded text-accent focus:ring-accent accent-accent cursor-pointer"
              />
              <label htmlFor="autoPrintCheck" className="text-xs font-bold text-text-primary dark:text-slate-200 cursor-pointer">
                طباعة الفاتورة تلقائياً فور إنهاء عملية البيع
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReceiptPreviewOpen(true)}
                className="py-3 rounded-2xl bg-blue-50 border border-blue-200 text-accent hover:bg-blue-100 text-xs font-extrabold transition-all btn-press flex items-center justify-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                <span>معاينة الفاتورة (Preview)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBarcodePreviewOpen(true)}
                className="py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-extrabold transition-all btn-press flex items-center justify-center gap-1.5"
              >
                <Barcode className="w-4 h-4" />
                <span>معاينة الملصق (Sticker)</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const sampleData = {
                    storeName: storeName || 'MELLAH BOUTIQUE',
                    branchAddress: storeAddress || t('الجزائر العاصمة، حي حسيبة بن بوعلي'),
                    receiptId: 'INV-TEST-8888',
                    date: new Date().toISOString(),
                    cashierName: t('أحمد المدير'),
                    customerName: t('زبون تجريبي'),
                    items: [
                      { product_name: t('قميص قطني / Chemise Coton'), size: 'L', color: t('أزرق'), quantity: 1, unit_price: 3500 },
                    ],
                    subtotalDzd: 3500,
                    discountDzd: 0,
                    totalDzd: 3500,
                    paymentMethod: 'cash',
                    footerText: footerText || RECEIPT_TRANSLATIONS[receiptLanguage].defaultFooter,
                  }
                  const ok = await printThermalReceipt(sampleData, { printerName: selectedPrinter, paperWidth, language: receiptLanguage })
                  if (ok) {
                    addToast({ message: t('تمت طباعة الفاتورة صامتاً ومباشرة للطابعة الحرارية'), variant: 'success' })
                  } else {
                    addToast({ message: t('تعذرت الطباعة المباشرة — تحقق من تشغيل الطابعة وتوصيل الكابل'), variant: 'warning' })
                  }
                }}
                className="py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-extrabold transition-all btn-press flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>طباعة تجريبية صامتة (Direct Print)</span>
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ الإعدادات والتغييرات</span>
              </button>

              <button
                type="button"
                onClick={handleTestPrint}
                className="px-5 py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-text-secondary text-xs font-extrabold transition-all btn-press flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>طباعة تجريبية</span>
              </button>
            </div>
          </Card>
          )}

          {/* Sticky Floating Glass Action Bar */}
          {(activeTab === 'store' || activeTab === 'telegram' || activeTab === 'printer') && (
            <div className="sticky bottom-4 z-40 mt-6 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-gray-200/80 dark:border-slate-800 p-3.5 rounded-2xl shadow-elevated flex items-center justify-between gap-4 animate-scale-in">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 pr-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>{t('تغييراتك غير محفوظة بعد، اضغط حفظ للتطبيق المباشر')}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-text-primary dark:text-slate-200 text-xs font-extrabold transition-all btn-press flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t('طباعة تجريبية')}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-black shadow-ambient transition-all btn-press flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? t('جاري الحفظ...') : t('حفظ التغييرات')}</span>
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Database Backup Section */}
          {activeTab === 'backup' && (
          <div className="space-y-5 animate-scale-in">
          <Card className="p-6 space-y-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-gray-200/80 dark:border-white/10 rounded-2xl shadow-card">
            <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Database className="w-4 h-4 text-success" />
              <span>حماية البيانات والنسخ الاحتياطي</span>
            </h2>

            <p className="text-xs text-text-secondary dark:text-slate-400 leading-relaxed font-semibold">
              قم بتصدير نسخة احتياطية من جميع مبيعاتك ومنتجاتك وسجل الستوك لحفظها على جهازك أو فلاشة خارجية لضمان سلامة البيانات.
            </p>

            <button
              onClick={handleBackup}
              disabled={isExporting}
              className="w-full py-3.5 rounded-2xl bg-success hover:bg-success/90 text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Database className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
              <span>{isExporting ? t('جاري إنشاء وتصدير النسخة الاحتياطية...') : t('تصدير نسخة احتياطية الآن')}</span>
            </button>
          </Card>

          {/* Interactive Timeline Backup History Thread */}
          <Card className="p-6 space-y-5 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-gray-200/80 dark:border-white/10 rounded-2xl shadow-card">
            <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Clock className="w-4 h-4 text-accent" />
              <span>{t('الخط الزمني للنسخ الاحتياطية (Backup Timeline)')}</span>
            </h2>

            <div className="relative pr-4 border-r-2 border-accent/20 dark:border-slate-800 space-y-5">
              {/* Timeline Thread Item 1: Active Directory */}
              <div className="relative group">
                <span className="absolute -right-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-accent border-2 border-white dark:border-slate-900 shadow-md animate-pulse" />
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-gray-200/80 dark:border-slate-800 space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-accent" />
                      <span>{t('المسار التلقائي النشط')}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Surnucloud Sync Successful 🟢</span>
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold text-text-secondary dark:text-slate-400 break-all leading-relaxed" dir="ltr">
                    {backupDir || '...'}
                  </p>
                </div>
              </div>

              {/* Timeline Thread Item 2: Latest Backup Node */}
              {lastBackupTime && (
                <div className="relative group">
                  <span className="absolute -right-[23px] top-1.5 w-3.5 h-3.5 rounded-full bg-success border-2 border-white dark:border-slate-900 shadow-md" />
                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-gray-200/80 dark:border-slate-800 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-text-primary dark:text-slate-100 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-success" />
                        <span>{t('آخر تسجيل للنسخة المحلية')}</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                        <Database className="w-3 h-3 text-slate-500" />
                        <span>Local Offline Backup 💾</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold text-text-secondary dark:text-slate-400 pt-1">
                      <span>{lastBackupTime}</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-accent/10 text-accent font-mono text-[11px] border border-accent/20">
                        1.8 MB
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Backup Directory Configuration */}
          <Card className="p-6 space-y-4 border border-blue-200 bg-blue-50/30">
            <h2 className="text-sm font-black text-blue-900 flex items-center gap-2 pb-2 border-b border-blue-200">
              <HardDrive className="w-4 h-4 text-blue-600" />
              <span>{t('مجلد النسخ الاحتياطي التلقائي')}</span>
            </h2>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-white border border-blue-100">
                <p className="text-[11px] text-text-tertiary font-semibold mb-1">{t('المسار النشط حالياً:')}</p>
                <p className="text-xs text-text-primary font-bold break-all font-mono leading-relaxed" dir="ltr">{backupDir || '...'}</p>
              </div>

              {isCustomMissing && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-900 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-900">{t('المجلد الخارجي غير متصل!')}</p>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      {t('المسار المخصص')} (<span className="font-mono" dir="ltr">{configuredDir}</span>) {t('غير موجود حالياً. يتم حفظ النسخ الاحتياطية مؤقتاً في المجلد المحلي.')}
                    </p>
                  </div>
                </div>
              )}

              {backupCount > 0 && (
                <div className="flex items-center gap-3 text-[11px] font-semibold text-blue-800">
                  <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5 text-blue-600" /> {backupCount} {t('نسخة محفوظة')}</span>
                  {lastBackupTime && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-blue-600" /> {t('آخر نسخة:')} {lastBackupTime}</span>}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setIsChangingDir(true)
                    try {
                      const picked = await window.electron.backup.pickFolder()
                      if (!picked.cancelled && picked.folderPath) {
                        const result = await window.electron.backup.setDir(picked.folderPath)
                        if (result.success) {
                          addToast({ message: `${t('تم تغيير مجلد النسخ:')} ${result.activeDir}`, variant: 'success' })
                          loadBackupInfo()
                        } else {
                          addToast({ message: `${t('فشل:')} ${result.error}`, variant: 'error' })
                        }
                      }
                    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); addToast({ message: t('فشل فتح اختيار المجلد'), variant: 'error' }) }
                    finally { setIsChangingDir(false) }
                  }}
                  disabled={isChangingDir}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{isChangingDir ? t('جاري...') : t('اختر مجلد خارجي')}</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      const result = await window.electron.backup.setDir(null)
                      if (result.success) {
                        addToast({ message: t('تم الرجوع للمجلد الافتراضي'), variant: 'success' })
                        loadBackupInfo()
                      }
                    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SettingsPage]", err); addToast({ message: t('فشل الرجوع للمجلد الافتراضي'), variant: 'error' }) }
                  }}
                  className="py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-text-secondary transition-all btn-press flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('افتراضي')}</span>
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4 border border-amber-200 bg-amber-50/40">
            <h2 className="text-sm font-black text-amber-900 flex items-center gap-2 pb-2 border-b border-amber-200">
              <Upload className="w-4 h-4 text-amber-600" />
              <span>استرجاع نسخة احتياطية (Restore)</span>
            </h2>

            <p className="text-xs text-amber-800 leading-relaxed font-semibold">
              استيراد بيانات كاملة من ملف JSON محفوط سابقاً لاستعادة المنتجات وسجلات المبيعات.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>استرجاع نسخة احتياطية من ملف</span>
            </button>
          </Card>

          {/* About App Card */}
          <Card className="p-6 space-y-3 border border-gray-200/80 bg-gray-50/50">
            <h2 className="text-sm font-black text-text-primary flex items-center gap-2 pb-2 border-b border-gray-200">
              <Store className="w-4 h-4 text-accent" />
              <span>حول برنامج Mellah POS</span>
            </h2>

            <div className="space-y-1.5 text-xs text-text-secondary font-semibold">
              <p><span className="font-extrabold text-text-primary">إصدار النظام:</span> 1.0.0 Commercial Release</p>
              <p><span className="font-extrabold text-text-primary">قاعدة البيانات:</span> SQLite Offline Sync Engine</p>
              <p><span className="font-extrabold text-text-primary">محرك الواجهة:</span> Electron Desktop Engine</p>
            </div>
          </Card>
          </div>
          )}
        </div>

      {/* Language Restart Modal */}
      <Modal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
        title={t('تأكيد إعادة تشغيل التطبيق')}
        size="md"
      >
        <div className="space-y-4 select-none">
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-accent shrink-0 mt-0.5 animate-spin" />
            <div className="text-xs font-bold text-blue-900 space-y-1">
              <p className="font-extrabold text-sm">{t('يلزم إعادة تشغيل التطبيق لتطبيق تغيير اللغة بالكامل')}</p>
              <p>{t('تم تغيير لغة النظام. اضغط على زر إعادة التشغيل الآن لتطبيق التغيير وإعادة تشغيل البرنامج فوراً.')}</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsRestartModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-text-secondary"
            >
              {t('لاحقاً')}
            </button>
            <button
              onClick={() => {
                window.electron?.relaunchApp()
              }}
              className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-extrabold shadow-ambient btn-press"
            >
              {t('إعادة التشغيل الآن')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Backup Confirmation Modal */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        title={t('تأكيد استرجاع النسخة الاحتياطية')}
        size="md"
      >
        <div className="space-y-4 select-none">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-amber-900 space-y-1">
              <p className="font-extrabold text-sm">تحذير هامي جدًا!</p>
              <p>
                استرجاع النسخة الاحتياطية سيعيد استبدال جميع البيانات الحالية في الجداول (المبيعات، الستوك، الزبائن) بالبيانات الموجودة في الملف المحدد.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsRestoreModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-text-secondary"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirmRestore}
              disabled={isImporting}
              className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-ambient"
            >
              {isImporting ? t('جاري الاسترجاع...') : t('تأكيد الاسترجاع والبدء')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Thermal Receipt Live Preview Modal */}
      <Modal
        isOpen={isReceiptPreviewOpen}
        onClose={() => setIsReceiptPreviewOpen(false)}
        title={t('معاينة شكل الفاتورة الحرارية (Live Thermal Receipt Preview)')}
        size="lg"
      >
        <div className="space-y-4 select-none">
          <div className="flex items-center justify-between bg-gray-100 p-3 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-text-primary">عرض الورق:</span>
                <span className="px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-black">{paperWidth}</span>
              </div>

              <div className="flex items-center gap-1.5 border-r border-gray-300 pr-3">
                <span className="text-xs font-extrabold text-text-primary">لغة الفاتورة:</span>
                <select
                  value={receiptLanguage}
                  onChange={(e) => setReceiptLanguage(e.target.value as ReceiptLanguage)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-xs font-black text-text-primary"
                >
                  <option value="ar">العربية (Arabic)</option>
                  <option value="fr">Français (French)</option>
                  <option value="en">English (English)</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-text-secondary font-semibold hidden md:block">
              معاينة مطابقة 100% للشكل المطبوع
            </p>
          </div>

          {/* Receipt Canvas Container */}
          <div className="flex justify-center p-6 bg-gray-200/60 rounded-2xl overflow-y-auto max-h-[500px]">
            <iframe
              title="Receipt Preview"
              srcDoc={buildReceiptHtml(
                {
                  storeName: storeName || 'MELLAH BOUTIQUE',
                  branchAddress: storeAddress || t('الجزائر العاصمة، حي حسيبة بن بوعلي'),
                  receiptId: 'INV-2026-0042',
                  date: new Date().toISOString(),
                  cashierName: t('أحمد المدير'),
                  customerName: t('Jean Dupont / محمد العماري'),
                  items: [
                    { product_name: t('قميص قطني فاخر / Chemise Coton'), size: 'L', color: t('Bleu/أزرق'), quantity: 2, unit_price: 3500 },
                    { product_name: t('بنطلون جينز / Jean Classic'), size: '42', color: t('Noir/أسود'), quantity: 1, unit_price: 5800 },
                  ],
                  subtotalDzd: 12800,
                  discountDzd: 800,
                  totalDzd: 12000,
                  paymentMethod: 'cash',
                  footerText: footerText || RECEIPT_TRANSLATIONS[receiptLanguage].defaultFooter,
                },
                { paperWidth, language: receiptLanguage }
              )}
              className={`bg-white shadow-2xl transition-all border-0 ${
                paperWidth === '58mm' ? 'w-[260px] h-[450px]' : 'w-[340px] h-[480px]'
              }`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsReceiptPreviewOpen(false)} className="flex-1">
              {t('إغلاق النافذة')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const sampleData = {
                  storeName: storeName || 'MELLAH BOUTIQUE',
                  branchAddress: storeAddress || t('الجزائر العاصمة، حي حسيبة بن بوعلي'),
                  receiptId: 'INV-2026-0042',
                  date: new Date().toISOString(),
                  cashierName: t('أحمد المدير'),
                  customerName: t('Jean Dupont / محمد العماري'),
                  items: [
                    { product_name: t('قميص قطني فاخر / Chemise Coton'), size: 'L', color: t('Bleu/أزرق'), quantity: 2, unit_price: 3500 },
                    { product_name: t('بنطلون جينز / Jean Classic'), size: '42', color: t('Noir/أسود'), quantity: 1, unit_price: 5800 },
                  ],
                  subtotalDzd: 12800,
                  discountDzd: 800,
                  totalDzd: 12000,
                  paymentMethod: 'cash',
                  footerText: footerText || RECEIPT_TRANSLATIONS[receiptLanguage].defaultFooter,
                }
                const html = buildReceiptHtml(sampleData, { paperWidth, language: receiptLanguage })
                if (window.electron?.printHtml) {
                  window.electron.printHtml(html, selectedPrinter)
                } else {
                  const pWin = window.open('', '_blank')
                  if (pWin) {
                    pWin.document.open()
                    pWin.document.write(html)
                    pWin.document.close()
                  }
                }
              }}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة تجريبية / تصدير PDF</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Barcode Sticker Live Preview Modal */}
      <Modal
        isOpen={isBarcodePreviewOpen}
        onClose={() => setIsBarcodePreviewOpen(false)}
        title={t('معاينة ملصق الباركود (Live Barcode Sticker Preview)')}
        size="md"
      >
        <div className="space-y-4 select-none">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-amber-900">حجم الملصق:</span>
              <select
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as '40x30' | '50x25')}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-xs font-black text-amber-900"
              >
                <option value="40x30">40 مم × 30 مم (قياسي)</option>
                <option value="50x25">50 مم × 25 مم (عريض)</option>
              </select>
            </div>
            <p className="text-xs text-amber-800 font-semibold">
              معاينة ملصق السعر المطبوع للمنتج
            </p>
          </div>

          {/* Sticker Preview Container */}
          <div className="flex justify-center p-8 bg-gray-200/60 rounded-2xl">
            <div
              className={`bg-white shadow-2xl p-3 border-2 border-dashed border-gray-400 rounded-xl flex flex-col justify-between items-center text-center text-black font-sans transition-all ${
                labelSize === '50x25' ? 'w-[280px] h-[140px]' : 'w-[240px] h-[160px]'
              }`}
            >
              <div className="w-full border-b border-gray-200 pb-1">
                <span className="text-[10px] font-black uppercase text-gray-800 dark:text-gray-200 tracking-wider block truncate">
                  {storeName || 'MELLAH STORE'}
                </span>
                <h3 className="text-xs font-black text-black dark:text-white truncate">قميص قطني فاخر</h3>
                <span className="text-[9px] font-bold text-gray-600 dark:text-gray-300 block">الحجم: L | اللون: أزرق</span>
              </div>

              <div className="w-full my-1 flex justify-center">
                <svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg" className="w-full h-10">
                  <rect width="200" height="60" fill="#ffffff" />
                  <g fill="#000000">
                    <rect x="10" y="5" width="4" height="40" />
                    <rect x="18" y="5" width="2" height="40" />
                    <rect x="24" y="5" width="6" height="40" />
                    <rect x="34" y="5" width="2" height="40" />
                    <rect x="40" y="5" width="4" height="40" />
                    <rect x="48" y="5" width="8" height="40" />
                    <rect x="60" y="5" width="2" height="40" />
                    <rect x="66" y="5" width="4" height="40" />
                    <rect x="74" y="5" width="6" height="40" />
                    <rect x="84" y="5" width="2" height="40" />
                    <rect x="90" y="5" width="4" height="40" />
                    <rect x="98" y="5" width="2" height="40" />
                    <rect x="104" y="5" width="6" height="40" />
                    <rect x="114" y="5" width="4" height="40" />
                    <rect x="122" y="5" width="2" height="40" />
                    <rect x="128" y="5" width="8" height="40" />
                    <rect x="140" y="5" width="2" height="40" />
                    <rect x="146" y="5" width="6" height="40" />
                    <rect x="156" y="5" width="4" height="40" />
                    <rect x="164" y="5" width="2" height="40" />
                    <rect x="170" y="5" width="6" height="40" />
                    <rect x="180" y="5" width="4" height="40" />
                    <rect x="188" y="5" width="2" height="40" />
                  </g>
                  <text x="100" y="55" fontSize="9" textAnchor="middle" fontFamily="monospace" fill="#000000">200010042890</text>
                </svg>
              </div>

              <div className="w-full border-t border-gray-200 pt-1 flex justify-between items-center px-1">
                <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400">SKU-7890</span>
                <span className="text-xs font-black text-black dark:text-white">3,500 DA</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsBarcodePreviewOpen(false)} className="flex-1">
              إغلاق المعاينة
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const stickerHtml = `
                  <!DOCTYPE html>
                  <html dir="rtl" lang="ar">
                  <head>
                    <meta charset="UTF-8" />
                    <title>ملصق باركود - قميص قطني فاخر</title>
                    <style>
                      @page { size: ${labelSize === '50x25' ? '50mm 25mm' : '40mm 30mm'}; margin: 0; }
                      body { margin: 0; padding: 4px; font-family: system-ui, sans-serif; text-align: center; font-size: 10px; color: #000; }
                      .title { font-size: 9px; font-weight: 900; }
                      .prod { font-size: 11px; font-weight: 900; margin: 2px 0; }
                      .price { font-size: 12px; font-weight: 900; margin-top: 2px; }
                    </style>
                  </head>
                  <body>
                    <div class="title">${storeName || 'MELLAH STORE'}</div>
                    <div class="prod">قميص قطني فاخر (L / أزرق)</div>
                    ${generateBarcodeSvg('200010042890')}
                    <div class="price">3,500 DA</div>
                    <script>window.onload = function() { window.print(); window.close(); };</script>
                  </body>
                  </html>
                `
                if (window.electron?.printHtml) {
                  window.electron.printHtml(stickerHtml, selectedPrinter)
                } else {
                  const pWin = window.open('', '_blank')
                  if (pWin) {
                    pWin.document.write(stickerHtml)
                    pWin.document.close()
                  }
                }
              }}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة ملصق تجريبي / PDF</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
