import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, ClipboardList, Search, User } from 'lucide-react'
import { Card, Input, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface AuditLogRow {
  id: string
  user_id: string
  action: string
  entity_name: string
  entity_id: string | null
  details: string | null
  created_at: string
  user_name: string | null
}

export function AuditLogPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [actionFilter] = useState<string>('')

  const addToast = useToastStore((s) => s.addToast)

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<AuditLogRow>(
        `SELECT a.id, a.user_id, a.action, a.entity_name, a.entity_id, a.details, a.created_at,
                u.full_name as user_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT 200`
      )
      setLogs(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[AuditLogPage]", err); addToast({ message: t('فشل تحميل سجل التدقيق والعمليات'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.trim().toLowerCase()
    const matchesQuery =
      q === '' ||
      (log.user_name && log.user_name.toLowerCase().includes(q)) ||
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q))

    const matchesAction = actionFilter ? log.action === actionFilter : true
    return matchesQuery && matchesAction
  })

  const actionBadge = (action: string): React.ReactNode => {
    let color = 'bg-accent/10 dark:bg-accent/20 text-accent border-accent/20 dark:border-accent/30'
    if (action.includes('delete') || action.includes('void')) color = 'bg-danger/10 dark:bg-danger/20 text-danger border-danger/20 dark:border-danger/30'
    else if (action.includes('create') || action.includes('completed')) color = 'bg-success/10 dark:bg-success/20 text-success border-success/20 dark:border-success/30'
    else if (action.includes('update') || action.includes('pin')) color = 'bg-warning/10 dark:bg-warning/20 text-warning border-warning/20 dark:border-warning/30'

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${color}`}>
        {action}
      </span>
    )
  }

  const [sortKey, setSortKey] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: string): void => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const valA = a[sortKey as keyof AuditLogRow] ?? ''
    const valB = b[sortKey as keyof AuditLogRow] ?? ''

    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'created_at',
      header: t('التاريخ والوقت'),
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-text-secondary">
          {new Date(row.created_at).toLocaleString('ar-DZ')}
        </span>
      ),
    },
    {
      key: 'user_name',
      header: t('المستخدم / المنفذ'),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary">
          <User className="w-3.5 h-3.5 text-accent" />
          <span>{row.user_name ?? t('النظام الآلي')}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: t('نوع العملية (Action)'),
      sortable: true,
      render: (row) => actionBadge(row.action),
    },
    {
      key: 'entity_name',
      header: t('القسم / النطاق'),
      sortable: true,
      render: (row) => <span className="text-xs font-bold text-text-secondary">{row.entity_name}</span>,
    },
    {
      key: 'details',
      header: t('تفاصيل العملية والتغييرات'),
      render: (row) => <span className="text-xs text-text-primary font-semibold">{row.details ?? '-'}</span>,
    },
  ]

  const isSecondaryWindow = typeof window !== 'undefined' && window.location.search.includes('module=')

  return (
    <div className="p-6 md:p-8 w-full max-w-none space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 btn-press cursor-pointer shrink-0"
            title={isSecondaryWindow ? t('إغلاق النافذة') : t('العودة')}
          >
            <ArrowRight className="w-4 h-4 transform rtl:rotate-0 ltr:rotate-180" />
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-accent" />
            <span>{t('سجل التغييرات والعمليات (Audit Log Viewer)')}</span>
          </h1>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200/80 shadow-sm">
        <div className="w-full md:w-80">
          <Input
            placeholder={t('ابحث بالاسم، التفاصيل، أو العملية...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-50 border-gray-200 text-xs"
            icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
          />
        </div>

        <div className="text-xs font-bold text-text-secondary">
          {t('إجمالي الحركات المسجلة:')} <span className="text-accent font-black text-sm">{filteredLogs.length}</span> {t('عملية')}
        </div>
      </div>

      {/* Audit Log Table */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={sortedLogs}
          loading={isLoading}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyType="search"
          emptyMessage={t('لا توجد حركات مسجلة في سجل التدقيق تطابق البحث')}
        />
      </Card>
    </div>
  )
}
