import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowRight,
  Wrench,
  Database,
  HardDrive,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Download,
  Info,
  Zap,
  Activity,
} from 'lucide-react'
import { Card } from '@/components/ui'
import { useLanguageStore } from '@/stores/languageStore'
import { useToastStore } from '@/stores/toastStore'

type TaskStatus = 'idle' | 'running' | 'success' | 'error'

interface MaintenanceTask {
  id: string
  label: string
  labelFr: string
  description: string
  descriptionFr: string
  icon: React.ReactNode
  status: TaskStatus
  error?: string
}

export function MaintenancePage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const _langVersion = useLanguageStore((s) => s.version)
  const addToast = useToastStore((s) => s.addToast)

  const [appVersion, setAppVersion] = useState<string>('...')
  const [dbSizeMB, setDbSizeMB] = useState<string>('...')
  const [isRunningFull, setIsRunningFull] = useState(false)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

  const [tasks, setTasks] = useState<MaintenanceTask[]>([
    {
      id: 'integrity',
      label: t('فحص سلامة قاعدة البيانات'),
      labelFr: 'Vérification d\'intégrité de la base',
      description: t('يتحقق من عدم وجود تلف أو بيانات معطوبة في قاعدة البيانات المحلية.'),
      descriptionFr: 'Vérifie qu\'il n\'y a pas de corruption dans la base de données locale.',
      icon: <Shield className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'vacuum',
      label: t('ضغط وتحسين قاعدة البيانات'),
      labelFr: 'Compacter et optimiser la base',
      description: t('يُعيد تنظيم ملف القاعدة ويحرر المساحة غير المستخدمة لتسريع الأداء.'),
      descriptionFr: 'Réorganise le fichier de base de données et libère l\'espace inutilisé.',
      icon: <Database className="w-5 h-5" />,
      status: 'idle',
    },
    {
      id: 'cache',
      label: t('تنظيف الملفات المؤقتة والكاش'),
      labelFr: 'Nettoyer les fichiers temporaires et le cache',
      description: t('يحذف ملفات الكاش المؤقتة التي قد تسبب بطء أو مشاكل في العرض.'),
      descriptionFr: 'Supprime les fichiers temporaires pouvant causer des ralentissements.',
      icon: <Trash2 className="w-5 h-5" />,
      status: 'idle',
    },
  ])

  const loadSystemInfo = useCallback(async () => {
    try {
      if (window.electron?.appInfo) {
        const ver = await window.electron.appInfo.getVersion()
        setAppVersion(ver)
        const size = await window.electron.appInfo.getDbSize()
        setDbSizeMB((size / (1024 * 1024)).toFixed(2))
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[MaintenancePage]", err); setAppVersion('N/A')
      setDbSizeMB('N/A')
    }
  }, [])

  useEffect(() => {
    loadSystemInfo()
  }, [loadSystemInfo])

  const setTaskStatus = (id: string, status: TaskStatus, error?: string): void => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status, error } : task))
    )
  }

  const runSingleTask = async (taskId: string): Promise<void> => {
    setTaskStatus(taskId, 'running')
    try {
      let result: { success: boolean; error?: string }
      switch (taskId) {
        case 'integrity':
          result = await window.electron.maintenance.integrityCheck()
          break
        case 'vacuum':
          result = await window.electron.maintenance.vacuum()
          break
        case 'cache':
          result = await window.electron.maintenance.clearCache()
          break
        default:
          result = { success: false, error: 'Unknown task' }
      }
      if (result.success) {
        setTaskStatus(taskId, 'success')
      } else {
        setTaskStatus(taskId, 'error', result.error)
      }
    } catch (err) {
      setTaskStatus(taskId, 'error', (err as Error).message)
    }
  }

  const runFullMaintenance = async (): Promise<void> => {
    setIsRunningFull(true)
    // Reset all tasks
    setTasks((prev) => prev.map((t2) => ({ ...t2, status: 'idle' as TaskStatus, error: undefined })))

    for (const task of tasks) {
      await runSingleTask(task.id)
      // Small visual delay between tasks
      await new Promise((resolve) => setTimeout(resolve, 400))
    }

    setIsRunningFull(false)
    await loadSystemInfo()

    const allPassed = tasks.every((t2) => t2.status !== 'error')
    addToast({
      message: allPassed
        ? t('تمت الصيانة الشاملة بنجاح ✅')
        : t('انتهت الصيانة مع بعض التحذيرات ⚠️'),
      variant: allPassed ? 'success' : 'warning',
    })
  }

  const handleCheckUpdate = async (): Promise<void> => {
    setIsCheckingUpdate(true)
    try {
      const ver = await window.electron?.updater?.checkForUpdates()
      if (ver) {
        setUpdateVersion(ver)
        addToast({ message: `${t('تحديث جديد متوفر')}: v${ver}`, variant: 'info' })
      } else {
        setUpdateVersion(null)
        addToast({ message: t('أنت تستخدم أحدث إصدار ✅'), variant: 'success' })
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[MaintenancePage]", err); addToast({ message: t('فشل فحص التحديثات'), variant: 'error' })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const getStatusIcon = (status: TaskStatus): React.ReactNode => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-accent animate-spin" />
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-success" />
      case 'error':
        return <XCircle className="w-4 h-4 text-danger" />
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
    }
  }

  const getStatusBg = (status: TaskStatus): string => {
    switch (status) {
      case 'running':
        return 'border-accent/30 bg-accent/5'
      case 'success':
        return 'border-success/30 bg-success/5'
      case 'error':
        return 'border-danger/30 bg-danger/5'
      default:
        return 'border-gray-200/80 bg-white dark:bg-slate-900 dark:border-slate-800'
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-6 pb-12 select-none dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => {
              if (onBack) onBack()
            }}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('إغلاق النافذة')}</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary">{t('الصيانة والتحديثات')}</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            {t('أدوات الفحص والإصلاح وتحديث النظام')}
          </p>
        </div>

        <button
          onClick={runFullMaintenance}
          disabled={isRunningFull}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-accent hover:bg-accent-hover text-white text-sm font-bold shadow-ambient transition-all btn-press disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunningFull ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Zap className="w-4.5 h-4.5" />
          )}
          <span>{isRunningFull ? t('جاري الصيانة الشاملة...') : t('صيانة شاملة')}</span>
        </button>
      </div>

      {/* System Info Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-accent/5 to-transparent border border-accent/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/15">
              <Info className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('إصدار التطبيق')}</p>
              <p className="text-lg font-black text-text-primary">v{appVersion}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-500/5 to-transparent border border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15">
              <HardDrive className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('حجم قاعدة البيانات')}</p>
              <p className="text-lg font-black text-text-primary">{dbSizeMB} MB</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-success/5 to-transparent border border-success/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-success/15">
              <Activity className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary font-bold">{t('حالة النظام')}</p>
              <p className="text-lg font-black text-success">{t('يعمل بشكل طبيعي')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Maintenance Tasks */}
      <div>
        <h2 className="text-lg font-black text-text-primary mb-3 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-accent" />
          {t('أدوات الصيانة والإصلاح')}
        </h2>
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={`p-4 border transition-all duration-300 ${getStatusBg(task.status)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${
                    task.status === 'success'
                      ? 'bg-success/15 text-success'
                      : task.status === 'error'
                        ? 'bg-danger/15 text-danger'
                        : task.status === 'running'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-gray-100 text-text-secondary'
                  }`}>
                    {task.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-text-primary">{t(task.label)}</p>
                      {getStatusIcon(task.status)}
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">{t(task.description)}</p>
                    {task.status === 'error' && task.error && (
                      <p className="text-xs text-danger mt-1 font-semibold">❌ {task.error}</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => runSingleTask(task.id)}
                  disabled={task.status === 'running' || isRunningFull}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs transition-colors btn-press disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {task.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{t('تشغيل')}</span>
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Updates Section */}
      <div>
        <h2 className="text-lg font-black text-text-primary mb-3 flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" />
          {t('التحديثات')}
        </h2>
        <Card className="p-5 border border-gray-200/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/15">
                <Download className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">
                  {t('فحص التحديثات')}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {updateVersion
                    ? `${t('تحديث جديد متوفر')}: v${updateVersion}`
                    : t('تحقق من وجود إصدارات أحدث من Mellah POS.')}
                </p>
              </div>
            </div>

            <button
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press disabled:opacity-50"
            >
              {isCheckingUpdate ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{isCheckingUpdate ? t('جاري الفحص...') : t('فحص التحديثات')}</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
