import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, ClipboardList, Search, User } from 'lucide-react'
import { Card, Input, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { useToastStore } from '@/stores/toastStore'

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
    } catch {
      addToast({ message: 'فشل تحميل سجل التدقيق والعمليات', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

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
    let color = 'bg-accent/10 text-accent border-accent/20'
    if (action.includes('delete') || action.includes('void')) color = 'bg-danger/10 text-danger border-danger/20'
    else if (action.includes('create') || action.includes('completed')) color = 'bg-success/10 text-success border-success/20'
    else if (action.includes('update') || action.includes('pin')) color = 'bg-warning/10 text-warning border-warning/20'

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${color}`}>
        {action}
      </span>
    )
  }

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'created_at',
      header: 'التاريخ والوقت',
      render: (row) => (
        <span className="text-xs font-mono text-text-secondary">
          {new Date(row.created_at).toLocaleString('ar-DZ')}
        </span>
      ),
    },
    {
      key: 'user_name',
      header: 'المستخدم / المنفذ',
      render: (row) => (
        <div className="flex items-center gap-1.5 font-bold text-xs text-text-primary">
          <User className="w-3.5 h-3.5 text-accent" />
          <span>{row.user_name ?? 'النظام الآلي'}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'نوع العملية (Action)',
      render: (row) => actionBadge(row.action),
    },
    {
      key: 'entity_name',
      header: 'القسم / النطاق',
      render: (row) => <span className="text-xs font-bold text-text-secondary">{row.entity_name}</span>,
    },
    {
      key: 'details',
      header: 'تفاصيل العملية والتغييرات',
      render: (row) => <span className="text-xs text-text-primary font-semibold">{row.details ?? '-'}</span>,
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>إغلاق النافذة</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-accent" />
            <span>سجل التغييرات والعمليات (Audit Log Viewer)</span>
          </h1>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200/80 shadow-sm">
        <div className="w-full md:w-80">
          <Input
            placeholder="ابحث بالاسم، التفاصيل، أو العملية..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-gray-50 border-gray-200 text-xs"
            icon={<Search className="w-3.5 h-3.5 text-text-tertiary" />}
          />
        </div>

        <div className="text-xs font-bold text-text-secondary">
          إجمالي الحركات المسجلة: <span className="text-accent font-black text-sm">{filteredLogs.length}</span> عملية
        </div>
      </div>

      {/* Audit Log Table */}
      <Card padding="compact" className="overflow-hidden border border-gray-200/80">
        <Table
          columns={columns}
          data={filteredLogs}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد حركات مسجلة في سجل التدقيق بعد"
        />
      </Card>
    </div>
  )
}
