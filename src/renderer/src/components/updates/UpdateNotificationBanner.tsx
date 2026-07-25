import React, { useState, useEffect } from 'react'
import { Download, RefreshCw, CheckCircle2, X, Loader2 } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'

interface UpdatePayload {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
}

export function UpdateNotificationBanner(): React.JSX.Element | null {
  const t = useLanguageStore((s) => s.t)
  const [update, setUpdate] = useState<UpdatePayload>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electron?.updater?.onUpdateStatus) return
    const unsub = window.electron.updater.onUpdateStatus((payload) => {
      setUpdate(payload as UpdatePayload)
      setDismissed(false)
    })
    return unsub
  }, [])

  const handleDownload = async (): Promise<void> => {
    await window.electron?.updater?.downloadUpdate()
  }

  const handleInstall = (): void => {
    window.electron?.updater?.installUpdate()
  }

  // Don't show for idle, not-available, checking or background error states
  if (
    update.status === 'idle' ||
    update.status === 'not-available' ||
    update.status === 'checking' ||
    update.status === 'error' ||
    dismissed
  ) {
    return null
  }

  const getBannerStyle = (): string => {
    switch (update.status) {
      case 'available':
        return 'bg-gradient-to-l from-accent/10 via-accent/5 to-transparent border-accent/30'
      case 'downloading':
        return 'bg-gradient-to-l from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/30'
      case 'downloaded':
        return 'bg-gradient-to-l from-success/10 via-success/5 to-transparent border-success/30'
      default:
        return ''
    }
  }

  return (
    <div
      className={`w-full px-5 py-3 border-b flex items-center justify-between gap-4 select-none animate-in slide-in-from-top-2 ${getBannerStyle()}`}
    >
      <div className="flex items-center gap-3">
        {update.status === 'available' && (
          <>
            <div className="p-2 rounded-xl bg-accent/15">
              <Download className="w-4.5 h-4.5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">
                {t('تحديث جديد متوفر')} — v{update.version}
              </p>
              <p className="text-xs text-text-tertiary">
                {t('يتوفر إصدار جديد من Mellah POS. حمّله الآن لتحسين الأداء والأمان.')}
              </p>
            </div>
          </>
        )}

        {update.status === 'downloading' && (
          <>
            <div className="p-2 rounded-xl bg-blue-500/15">
              <Loader2 className="w-4.5 h-4.5 text-blue-500 animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-text-primary">
                {t('جاري تحميل التحديث...')} {update.progress ?? 0}%
              </p>
              <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${update.progress ?? 0}%` }}
                />
              </div>
            </div>
          </>
        )}

        {update.status === 'downloaded' && (
          <>
            <div className="p-2 rounded-xl bg-success/15">
              <CheckCircle2 className="w-4.5 h-4.5 text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">
                {t('التحديث جاهز للتثبيت')} — v{update.version}
              </p>
              <p className="text-xs text-text-tertiary">
                {t('اضغط على الزر لإعادة التشغيل وتثبيت التحديث.')}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {update.status === 'available' && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('تحميل التحديث')}</span>
          </button>
        )}

        {update.status === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold shadow-ambient transition-all btn-press"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('إعادة التشغيل والتثبيت')}</span>
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg hover:bg-gray-200/80 text-text-tertiary transition-colors"
          title={t('إغلاق')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
