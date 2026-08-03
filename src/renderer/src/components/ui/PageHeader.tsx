import React from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'

interface PageHeaderProps {
  readonly title: string
  readonly onBack?: () => void
  readonly onNavigateToPos?: () => void
  readonly moduleId?: string
  readonly children?: React.JSX.Element | React.JSX.Element[]
}

export function PageHeader({ title, onBack, onNavigateToPos, moduleId, children }: PageHeaderProps): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  const handleBackAction = (): void => {
    if (onBack) {
      onBack()
    } else if (onNavigateToPos) {
      onNavigateToPos()
    } else {
      window.close()
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
      <div className="flex items-center gap-3.5">
        <div className="flex items-center gap-2">
          {/* Circular Glass Back/Close Button */}
          <button
            type="button"
            onClick={handleBackAction}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
            title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
          >
            <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
          </button>

          {!isSecondaryWindow && moduleId && (
            <button
              type="button"
              onClick={() => {
                if (window.electron?.openModuleWindow) {
                  window.electron.openModuleWindow(moduleId)
                  if (onBack) onBack()
                  if (onNavigateToPos) onNavigateToPos()
                }
              }}
              className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
              title={t('فتح في نافذة خارجية جديدة')}
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
        <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{title}</h1>
      </div>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  )
}
