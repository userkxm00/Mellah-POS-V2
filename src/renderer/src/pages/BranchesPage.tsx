import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Building2, MapPin, Edit3, Trash2 } from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { recordAuditLog } from '@/services/auditLogService'

interface BranchItem {
  id: string
  name: string
  address: string | null
  created_at: string
}

export function BranchesPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // Add branch state
  const [name, setName] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Edit branch state
  const [editingBranch, setEditingBranch] = useState<BranchItem | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editAddress, setEditAddress] = useState<string>('')
  const [isEditSaving, setIsEditSaving] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadBranches = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<BranchItem>(
        'SELECT id, name, address, created_at FROM branches WHERE deleted_at IS NULL ORDER BY created_at ASC'
      )
      setBranches(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[BranchesPage]", err); addToast({ message: t('فشل تحميل قائمة الفروع'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  const handleAddBranch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) {
      addToast({ message: t('يرجى كتابة اسم الفرع'), variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO branches (id, name, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, name.trim(), address.trim() || null, now, now]
      )

      addToast({ message: t('تم إضافة الفرع بنجاح!'), variant: 'success' })
      recordAuditLog('branch_created', 'branches', `إضافة فرع: ${name.trim()}`, id).catch(() => {})
      setIsModalOpen(false)
      setName('')
      setAddress('')
      await loadBranches()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[BranchesPage]", err); addToast({ message: t('فشل إضافة الفرع'), variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenEdit = (branch: BranchItem): void => {
    setEditingBranch(branch)
    setEditName(branch.name)
    setEditAddress(branch.address ?? '')
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingBranch || !editName.trim()) return
    setIsEditSaving(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE branches SET name = ?, address = ?, updated_at = ? WHERE id = ?',
        [editName.trim(), editAddress.trim() || null, now, editingBranch.id]
      )
      addToast({ message: `${t('تم تحديث بيانات الفرع')} "${editName.trim()}"`, variant: 'success' })
      recordAuditLog('branch_updated', 'branches', `تعديل فرع: ${editName.trim()}`, editingBranch.id).catch(() => {})
      setEditingBranch(null)
      await loadBranches()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[BranchesPage]", err); addToast({ message: t('فشل تحديث بيانات الفرع'), variant: 'error' })
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteBranch = async (id: string, name: string): Promise<void> => {
    if (branches.length <= 1) {
      addToast({ message: t('لا يمكن حذف الفرع الأخير للنظام'), variant: 'error' })
      return
    }
    if (!window.confirm(`${t('هل أنت متأكد من رغبتك في حذف الفرع')} (${name})؟`)) return

    try {
      const now = new Date().toISOString()
      await window.electron.db.execute('UPDATE branches SET deleted_at = ? WHERE id = ?', [now, id])
      addToast({ message: t('تم أرشفة الفرع'), variant: 'info' })
      recordAuditLog('branch_deleted', 'branches', `حذف فرع: ${name}`, id).catch(() => {})
      await loadBranches()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[BranchesPage]", err); addToast({ message: t('فشل حذف الفرع'), variant: 'error' })
    }
  }

  const columns: Column<BranchItem>[] = [
    {
      key: 'name',
      header: t('اسم الفرع'),
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-text-primary text-sm">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'address',
      header: t('العنوان / الموقع'),
      render: (row) => (
        <span className="flex items-center gap-1 text-text-secondary text-xs font-semibold">
          <MapPin className="w-3.5 h-3.5 text-text-tertiary" />
          <span>{row.address ?? t('غير محدد')}</span>
        </span>
      ),
    },
    {
      key: 'created_at',
      header: t('تاريخ الإنشاء'),
      render: (row) => (
        <span className="text-xs text-text-tertiary font-mono">
          {new Date(row.created_at).toLocaleDateString('ar-DZ')}
        </span>
      ),
    },
    {
      key: 'id',
      header: t('الإجراءات'),
      align: 'left',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleOpenEdit(row)}
            className="flex items-center gap-1 text-xs text-warning font-bold hover:bg-warning/10 px-2.5 py-1 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t('تعديل')}</span>
          </button>
          <button
            onClick={() => handleDeleteBranch(row.id, row.name)}
            className="flex items-center gap-1 text-xs text-danger font-bold hover:bg-danger/10 px-2.5 py-1 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('حذف')}</span>
          </button>
        </div>
      ),
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
            <ArrowRight className={`w-4 h-4 transform transition-transform ${document.documentElement.dir === 'rtl' ? '' : 'rotate-180'}`} />
          </button>
          <h1 className="text-2xl font-black text-text-primary dark:text-slate-100">{t('إدارة الفروع والمحلات')}</h1>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <Plus className="w-4 h-4" />
          <span>{t('إضافة فرع جديد')}</span>
        </button>
      </div>

      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={branches}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyType="search"
          emptyMessage={t('لا تملك فروعاً إضافية حالياً')}
        />
      </Card>

      {/* Add Branch Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('إضافة فرع جديد')}>
        <form onSubmit={handleAddBranch} className="space-y-4">
          <Input
            label={t('اسم الفرع')}
            placeholder={t('مثال: فرع وهران — حي السلام')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label={t('العنوان التفصيلي')}
            placeholder={t('مثال: شارع العربي بن مهيدي، وهران')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press"
            >
              {t('حفظ الفرع')}
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-text-secondary dark:text-slate-300 text-sm font-bold btn-press"
            >
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Branch Modal */}
      <Modal isOpen={editingBranch !== null} onClose={() => setEditingBranch(null)} title={`${t('تعديل فرع')} — ${editingBranch?.name ?? ''}`}>
        <div className="space-y-4">
          <Input
            label={t('اسم الفرع')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label={t('العنوان التفصيلي')}
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveEdit}
              disabled={isEditSaving}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press"
            >
              {t('حفظ التعديلات')}
            </button>
            <button
              onClick={() => setEditingBranch(null)}
              className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-text-secondary dark:text-slate-300 text-sm font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
