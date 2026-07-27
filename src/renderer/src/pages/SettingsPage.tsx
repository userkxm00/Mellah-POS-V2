import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowRight, Save, Database, Store, Printer, Upload, AlertTriangle, Globe, Clock, FileText, Eye, Barcode, FolderOpen, RefreshCw, HardDrive, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { Card, Input, Modal, Button } from '@/components/ui'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { exportDatabaseBackup, importDatabaseBackup } from '@/services/backupService'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore, type Language } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useThemeStore } from '@/stores/themeStore'
import { soundService } from '@/services/soundService'
import { printThermalReceipt, buildReceiptHtml, generateBarcodeSvg, type ReceiptLanguage, RECEIPT_TRANSLATIONS } from '@/services/receiptService'

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

export function SettingsPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [storeName, setStoreName] = useState<string>('بوتيك الملاح للملابس')
  const [storeAddress, setStoreAddress] = useState<string>('')
  const [storePhone, setStorePhone] = useState<string>('')
  const [footerText, setFooterText] = useState<string>('شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام مع إحضار الفاتورة.')
  const [sessionTimeout, setSessionTimeout] = useState<number>(5)

  const currentLang = useLanguageStore((s) => s.language)
  const setLanguageStore = useLanguageStore((s) => s.setLanguage)
  const t = useLanguageStore((s) => s.t)

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const soundVolume = useThemeStore((s) => s.soundVolume)
  const setSoundVolume = useThemeStore((s) => s.setSoundVolume)

  // Printer & Receipt settings
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>(
    localStorage.getItem('mellah_printer_name') ?? ''
  )
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(
    (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
  )
  const [receiptLanguage, setReceiptLanguage] = useState<ReceiptLanguage>(
    (localStorage.getItem('mellah_receipt_language') as ReceiptLanguage) ?? 'ar'
  )
  const [autoPrint, setAutoPrint] = useState<boolean>(
    localStorage.getItem('mellah_auto_print') === 'true'
  )

  // Preview Modals State
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState<boolean>(false)
  const [isBarcodePreviewOpen, setIsBarcodePreviewOpen] = useState<boolean>(false)
  const [labelSize, setLabelSize] = useState<'40x30' | '50x25'>('40x30')

  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false)
  const [isRestartModalOpen, setIsRestartModalOpen] = useState<boolean>(false)
  const [initialLang, setInitialLang] = useState<Language>(currentLang)
  const [pendingBackupContent, setPendingBackupContent] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Backup directory state
  const [backupDir, setBackupDir] = useState<string>('')
  const [configuredDir, setConfiguredDir] = useState<string | null>(null)
  const [isCustomMissing, setIsCustomMissing] = useState<boolean>(false)
  const [backupCount, setBackupCount] = useState<number>(0)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null)
  const [isChangingDir, setIsChangingDir] = useState<boolean>(false)

  // Fetch printers and store settings
  const loadSettings = useCallback(async () => {
    try {
      if (window.electron?.getPrinters) {
        const printerList = await window.electron.getPrinters()
        setPrinters(printerList)
        if (!selectedPrinter && printerList.length > 0) {
          const defaultP = printerList.find((p) => p.isDefault) ?? printerList[0]
          setSelectedPrinter(defaultP.name)
        }
      }

      const rows = await window.electron.db.query<{
        store_name: string
        store_address: string | null
        store_phone: string | null
        receipt_footer_text: string
        default_language: string
        session_timeout_minutes: number | null
      }>(
        'SELECT store_name, store_address, store_phone, receipt_footer_text, default_language, session_timeout_minutes FROM store_settings WHERE branch_id = ?',
        [DEFAULT_BRANCH_ID]
      )

      if (rows.length > 0) {
        setStoreName(rows[0].store_name ?? 'بوتيك الملاح للملابس')
        setStoreAddress(rows[0].store_address ?? '')
        setStorePhone(rows[0].store_phone ?? '')
        setFooterText(rows[0].receipt_footer_text ?? '')
        if (rows[0].default_language) {
          setInitialLang(rows[0].default_language as Language)
        }
        if (rows[0].session_timeout_minutes) {
          setSessionTimeout(rows[0].session_timeout_minutes)
        }
        if (rows[0].default_language) {
          setLanguageStore(rows[0].default_language as Language)
        }
      }
    } catch {
      // Default fallback settings
    }
  }, [selectedPrinter, setLanguageStore])

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
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadBackupInfo()
  }, [loadBackupInfo])

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        `INSERT INTO store_settings (branch_id, store_name, store_address, store_phone, receipt_footer_text, default_language, session_timeout_minutes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id) DO UPDATE SET
           store_name=excluded.store_name,
           store_address=excluded.store_address,
           store_phone=excluded.store_phone,
           receipt_footer_text=excluded.receipt_footer_text,
           default_language=excluded.default_language,
           session_timeout_minutes=excluded.session_timeout_minutes,
           updated_at=excluded.updated_at`,
        [DEFAULT_BRANCH_ID, storeName.trim(), storeAddress.trim() || null, storePhone.trim() || null, footerText.trim(), currentLang, sessionTimeout, now]
      )

      localStorage.setItem('mellah_printer_name', selectedPrinter)
      localStorage.setItem('mellah_paper_width', paperWidth)
      localStorage.setItem('mellah_receipt_language', receiptLanguage)
      localStorage.setItem('mellah_auto_print', String(autoPrint))

      // Refresh store settings in Zustand store
      useStoreSettingsStore.getState().loadSettings()

      addToast({ message: 'تم حفظ إعدادات المتجر وطابعة الفواتير واللغة بنجاح! ✅', variant: 'success' })

      if (currentLang !== initialLang) {
        setIsRestartModalOpen(true)
      }
    } catch {
      addToast({ message: 'فشل حفظ الإعدادات', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestPrint = async (): Promise<void> => {
    try {
      await printThermalReceipt(
        {
          storeName: storeName || 'بوتيك الملاح للملابس',
          branchAddress: storeAddress || 'الجزائر العاصمة',
          receiptId: 'TEST-123456',
          date: new Date().toISOString(),
          cashierName: 'تجربة الطابعة',
          items: [
            { product_name: 'قميص رجالي فاخر (تجربة)', size: 'L', color: 'أزرق', quantity: 1, unit_price: 3500 },
            { product_name: 'سروال جينز عصري (تجربة)', size: '42', color: 'أسود', quantity: 1, unit_price: 4200 },
          ],
          subtotalDzd: 7700,
          discountDzd: 200,
          totalDzd: 7500,
          paymentMethod: 'cash',
        },
        { printerName: selectedPrinter || undefined, paperWidth, language: receiptLanguage }
      )
      addToast({ message: 'تم إرسال أمر الطباعة التجريبية! 🖨️', variant: 'success' })
    } catch {
      addToast({ message: 'فشل إرسال الفاتورة التجريبية للطابعة', variant: 'error' })
    }
  }

  const handleBackup = async (): Promise<void> => {
    setIsExporting(true)
    try {
      const fileName = await exportDatabaseBackup()
      addToast({ message: `تم تصدير النسخة الاحتياطية بنجاح: ${fileName}`, variant: 'success' })
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        setPendingBackupContent(content)
        setIsRestoreModalOpen(true)
      }
    }
    reader.readAsText(file)
  }

  const handleConfirmRestore = async (): Promise<void> => {
    if (!pendingBackupContent) return
    setIsImporting(true)
    try {
      const count = await importDatabaseBackup(pendingBackupContent)
      addToast({ message: `تمت استعادة البيانات بنجاح! الإجمالي: ${count} سجل`, variant: 'success' })
      setIsRestoreModalOpen(false)
      setPendingBackupContent(null)
      loadSettings()
    } catch (err) {
      addToast({ message: (err as Error).message, variant: 'error' })
    } finally {
      setIsImporting(false)
    }
  }

  const [activeTab, setActiveTab] = useState<'store' | 'printer' | 'theme' | 'backup' | 'language'>('store')

  const tabs = [
    { id: 'store', label: t('بيانات المتجر'), icon: <Store className="w-4 h-4" /> },
    { id: 'printer', label: 'طابعة الفواتير', icon: <Printer className="w-4 h-4" /> },
    { id: 'theme', label: 'المظهر والصوت', icon: <Sun className="w-4 h-4" /> },
    { id: 'backup', label: 'النسخ الاحتياطي', icon: <Database className="w-4 h-4" /> },
    { id: 'language', label: t('اللغة والأمان'), icon: <Globe className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="إغلاق النافذة والعودة"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('إغلاق النافذة')}</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('إعدادات المتجر وطابعة الفواتير واللغة والنسخ الاحتياطي')}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Modern Settings Sidebar Tabs */}
        <div className="md:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-extrabold transition-all btn-press focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === tab.id
                  ? 'bg-accent text-white shadow-hero-glow'
                  : 'bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 text-[#1C2B3A] dark:text-slate-200 hover:border-accent hover:text-accent'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Settings Content Panels */}
        <form onSubmit={handleSave} className="md:col-span-3 space-y-5">
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
                placeholder="مثال: الجزائر العاصمة، حي حسيبة بن بوعلي"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
              />
              <Input
                label={t('هاتف المتجر')}
                placeholder="مثال: 0550123456"
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
                <label className="text-xs font-bold text-text-primary dark:text-slate-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                  <span>قفل الجلسة عند التوقف (دقائق)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(parseInt(e.target.value) || 5)}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
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

              {/* Sound Controls */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-accent" />
                    <span>أصوات الكاشير (Web Audio)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => soundService.playSuccess()}
                    className="text-[10px] text-accent font-bold hover:underline"
                  >
                    🔊 تجربة الصوت
                  </button>
                </label>
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
                    <span>{soundEnabled ? 'مفعل' : 'صامت'}</span>
                  </button>

                  {soundEnabled && (
                    <div className="flex-1 flex items-center gap-2 pr-1">
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={soundVolume}
                        onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-primary dark:text-slate-200">طابعة الفواتير المتصلة بالكمبيوتر</label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">الطابعة الافتراضية للفرع</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(الافتراضية للنظام)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-primary dark:text-slate-200">عرض ورق الفاتورة الحرارية</label>
                <select
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value as '80mm' | '58mm')}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="80mm">80 مم (80mm Thermal Receipt)</option>
                  <option value="58mm">58 مم (58mm Compact Receipt)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-primary dark:text-slate-200">لغة طباعة الفاتورة (Receipt Language)</label>
                <select
                  value={receiptLanguage}
                  onChange={(e) => setReceiptLanguage(e.target.value as ReceiptLanguage)}
                  className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="ar">🇩🇿 العربية (Arabic - RTL)</option>
                  <option value="fr">🇫🇷 Français (French - LTR)</option>
                  <option value="en">🇬🇧 English (English - LTR)</option>
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

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReceiptPreviewOpen(true)}
                className="py-3 rounded-2xl bg-blue-50 border border-blue-200 text-accent hover:bg-blue-100 text-xs font-extrabold transition-all btn-press flex items-center justify-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                <span>👁️ معاينة الفاتورة الحرارية (Preview)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBarcodePreviewOpen(true)}
                className="py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-extrabold transition-all btn-press flex items-center justify-center gap-1.5"
              >
                <Barcode className="w-4 h-4" />
                <span>🏷️ معاينة ملصق الباركود (Preview)</span>
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
        </form>

        {/* Database Backup Section */}
          {activeTab === 'backup' && (
          <div className="space-y-5 animate-scale-in">
          <Card className="p-6 space-y-4 border border-gray-200/80 dark:border-slate-800">
            <h2 className="text-sm font-black text-text-primary dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
              <Database className="w-4 h-4 text-success" />
              <span>حماية البيانات والنسخ الاحتياطي</span>
            </h2>

            <p className="text-xs text-text-secondary leading-relaxed font-semibold">
              قم بتصدير نسخة احتياطية من جميع مبيعاتك ومنتجاتك وسجل الستوك لحفظها على جهازك أو فلاشة خارجية لضمان سلامة البيانات.
            </p>

            <button
              onClick={handleBackup}
              disabled={isExporting}
              className="w-full py-3.5 rounded-2xl bg-success hover:bg-success/90 text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              <span>تصدير نسخة احتياطية الآن</span>
            </button>
          </Card>

          {/* Backup Directory Configuration */}
          <Card className="p-6 space-y-4 border border-blue-200 bg-blue-50/30">
            <h2 className="text-sm font-black text-blue-900 flex items-center gap-2 pb-2 border-b border-blue-200">
              <HardDrive className="w-4 h-4 text-blue-600" />
              <span>مجلد النسخ الاحتياطي التلقائي</span>
            </h2>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-white border border-blue-100">
                <p className="text-[11px] text-text-tertiary font-semibold mb-1">المسار النشط حالياً:</p>
                <p className="text-xs text-text-primary font-bold break-all font-mono leading-relaxed" dir="ltr">{backupDir || '...'}</p>
              </div>

              {isCustomMissing && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-900 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-900">المجلد الخارجي غير متصل!</p>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      المسار المخصص (<span className="font-mono" dir="ltr">{configuredDir}</span>) غير موجود حالياً. يتم حفظ النسخ الاحتياطية مؤقتاً في المجلد المحلي.
                    </p>
                  </div>
                </div>
              )}

              {backupCount > 0 && (
                <div className="flex items-center gap-3 text-[11px] font-semibold text-blue-800">
                  <span>📁 {backupCount} نسخة محفوظة</span>
                  {lastBackupTime && <span>🕐 آخر نسخة: {lastBackupTime}</span>}
                </div>
              )}
            </div>

            <p className="text-[11px] text-blue-700 leading-relaxed font-semibold">
              يمكنك توجيه النسخ لمجلد خارجي (USB، Google Drive، OneDrive) لحماية البيانات حتى لو تعطل الجهاز.
            </p>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setIsChangingDir(true)
                  try {
                    const picked = await window.electron.backup.pickFolder()
                    if (!picked.cancelled && picked.folderPath) {
                      const result = await window.electron.backup.setDir(picked.folderPath)
                      if (result.success) {
                        addToast({ message: `تم تغيير مجلد النسخ: ${result.activeDir}`, variant: 'success' })
                        loadBackupInfo()
                      } else {
                        addToast({ message: `فشل: ${result.error}`, variant: 'error' })
                      }
                    }
                  } catch { addToast({ message: 'فشل فتح اختيار المجلد', variant: 'error' }) }
                  finally { setIsChangingDir(false) }
                }}
                disabled={isChangingDir}
                className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                <span>{isChangingDir ? 'جاري...' : 'اختر مجلد خارجي'}</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    const result = await window.electron.backup.setDir(null)
                    if (result.success) {
                      addToast({ message: 'تم الرجوع للمجلد الافتراضي ✅', variant: 'success' })
                      loadBackupInfo()
                    }
                  } catch { addToast({ message: 'فشل الرجوع للمجلد الافتراضي', variant: 'error' }) }
                }}
                className="py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-text-secondary transition-all btn-press flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>افتراضي</span>
              </button>
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
        title="تأكيد استرجاع النسخة الاحتياطية"
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
              {isImporting ? 'جاري الاسترجاع...' : 'تأكيد الاسترجاع والبدء'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 🧾 Thermal Receipt Live Preview Modal */}
      <Modal
        isOpen={isReceiptPreviewOpen}
        onClose={() => setIsReceiptPreviewOpen(false)}
        title="معاينة شكل الفاتورة الحرارية (Live Thermal Receipt Preview)"
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
                  <option value="ar">🇩🇿 العربية (Arabic)</option>
                  <option value="fr">🇫🇷 Français (French)</option>
                  <option value="en">🇬🇧 English (English)</option>
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
                  branchAddress: storeAddress || 'الجزائر العاصمة، حي حسيبة بن بوعلي',
                  receiptId: 'INV-2026-0042',
                  date: new Date().toISOString(),
                  cashierName: 'أحمد المدير',
                  customerName: 'Jean Dupont / محمد العماري',
                  items: [
                    { product_name: 'قميص قطني فاخر / Chemise Coton', size: 'L', color: 'Bleu/أزرق', quantity: 2, unit_price: 3500 },
                    { product_name: 'بنطلون جينز / Jean Classic', size: '42', color: 'Noir/أسود', quantity: 1, unit_price: 5800 },
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
              إغلاق المعاينة
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const sampleData = {
                  storeName: storeName || 'MELLAH BOUTIQUE',
                  branchAddress: storeAddress || 'الجزائر العاصمة، حي حسيبة بن بوعلي',
                  receiptId: 'INV-2026-0042',
                  date: new Date().toISOString(),
                  cashierName: 'أحمد المدير',
                  customerName: 'Jean Dupont / محمد العماري',
                  items: [
                    { product_name: 'قميص قطني فاخر / Chemise Coton', size: 'L', color: 'Bleu/أزرق', quantity: 2, unit_price: 3500 },
                    { product_name: 'بنطلون جينز / Jean Classic', size: '42', color: 'Noir/أسود', quantity: 1, unit_price: 5800 },
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

      {/* 🏷️ Barcode Sticker Live Preview Modal */}
      <Modal
        isOpen={isBarcodePreviewOpen}
        onClose={() => setIsBarcodePreviewOpen(false)}
        title="معاينة ملصق الباركود (Live Barcode Sticker Preview)"
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
                <span className="text-[10px] font-black uppercase text-gray-800 tracking-wider block truncate">
                  {storeName || 'MELLAH STORE'}
                </span>
                <h3 className="text-xs font-black text-black truncate">قميص قطني فاخر</h3>
                <span className="text-[9px] font-bold text-gray-600 block">الحجم: L | اللون: أزرق</span>
              </div>

              <div className="w-full my-1" dangerouslySetInnerHTML={{ __html: generateBarcodeSvg('200010042890') }} />

              <div className="w-full border-t border-gray-200 pt-1 flex justify-between items-center px-1">
                <span className="text-[9px] font-mono text-gray-500">SKU-7890</span>
                <span className="text-xs font-black text-black">3,500 DA</span>
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
