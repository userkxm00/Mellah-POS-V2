import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Plus, Trash2, Crown, Briefcase, UserCheck, Edit3, KeyRound } from 'lucide-react'
import { Card, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { recordAuditLog } from '@/services/auditLogService'
import type { UserRole } from '@/types/database'

interface UserItem {
  id: string
  full_name: string
  role: UserRole
  pin_hash: string
  created_at: string
}

export function UsersPage({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const [users, setUsers] = useState<UserItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // Add user form
  const [fullName, setFullName] = useState<string>('')
  const [role, setRole] = useState<UserRole>('cashier')
  const [pin, setPin] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Edit user
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editRole, setEditRole] = useState<UserRole>('cashier')
  const [isEditSaving, setIsEditSaving] = useState<boolean>(false)

  // Change PIN
  const [changePinUser, setChangePinUser] = useState<UserItem | null>(null)
  const [newPin, setNewPin] = useState<string>('')
  const [confirmPin, setConfirmPin] = useState<string>('')
  const [isPinSaving, setIsPinSaving] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<UserItem>(
        'SELECT id, full_name, role, pin_hash, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
      )
      setUsers(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[UsersPage]", err); addToast({ message: t('فشل تحميل قائمة المستخدمين'), variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast, t])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleAddUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!fullName.trim()) {
      addToast({ message: t('الرجاء إدخال اسم المستخدم الكامل'), variant: 'error' })
      return
    }
    if (pin.length < 4) {
      addToast({ message: t('رمز PIN يجب أن يكون 4 أرقام على الأقل'), variant: 'error' })
      return
    }
    setIsSubmitting(true)
    try {
      const userId = generateUUID()
      const now = new Date().toISOString()
      const hashedPin = await window.electron.hashPin(pin)

      await window.electron.db.execute(
        `INSERT INTO users (id, branch_id, full_name, role, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, DEFAULT_BRANCH_ID, fullName.trim(), role, hashedPin, now, now]
      )

      addToast({ message: `${t('تم إضافة')} ${fullName.trim()} ${t('بنجاح')} ✅`, variant: 'success' })
      recordAuditLog('user_created', 'users', `إضافة مستخدم: ${fullName.trim()} (${role})`, userId).catch(() => {})
      setFullName('')
      setRole('cashier')
      setPin('')
      setIsModalOpen(false)
      await loadUsers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[UsersPage]", err); addToast({ message: t('فشل إضافة المستخدم'), variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`${t('هل أنت متأكد من رغبتك في حذف المستخدم')} (${name})؟`)) return
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute('UPDATE users SET deleted_at = ? WHERE id = ?', [now, id])
      addToast({ message: t('تم حذف المستخدم'), variant: 'info' })
      recordAuditLog('user_deleted', 'users', `حذف المستخدم: ${name}`, id).catch(() => {})
      await loadUsers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[UsersPage]", err); addToast({ message: t('فشل حذف المستخدم'), variant: 'error' })
    }
  }

  // Edit user handler
  const handleOpenEdit = (user: UserItem): void => {
    setEditingUser(user)
    setEditName(user.full_name)
    setEditRole(user.role)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingUser || !editName.trim()) return
    setIsEditSaving(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE users SET full_name = ?, role = ?, updated_at = ? WHERE id = ?',
        [editName.trim(), editRole, now, editingUser.id]
      )
      addToast({ message: `${t('تم تحديث بيانات المستخدم')} "${editName.trim()}" ✅`, variant: 'success' })
      recordAuditLog('user_updated', 'users', `تعديل المستخدم: ${editName.trim()} (${editRole})`, editingUser.id).catch(() => {})
      setEditingUser(null)
      await loadUsers()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[UsersPage]", err); addToast({ message: t('فشل تحديث بيانات المستخدم'), variant: 'error' })
    } finally {
      setIsEditSaving(false)
    }
  }

  // Change PIN handler
  const handleChangePin = async (): Promise<void> => {
    if (!changePinUser) return
    if (newPin.length < 4) {
      addToast({ message: t('رمز PIN الجديد يجب أن يكون 4 أرقام على الأقل'), variant: 'error' })
      return
    }
    if (newPin !== confirmPin) {
      addToast({ message: t('رمز PIN الجديد وتأكيده غير متطابقين'), variant: 'error' })
      return
    }
    setIsPinSaving(true)
    try {
      const hashedPin = await window.electron.hashPin(newPin)
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?',
        [hashedPin, now, changePinUser.id]
      )
      addToast({ message: `${t('تم تغيير رمز PIN لـ')} "${changePinUser.full_name}" ✅`, variant: 'success' })
      recordAuditLog('user_pin_changed', 'users', `تغيير PIN: ${changePinUser.full_name}`, changePinUser.id).catch(() => {})
      setChangePinUser(null)
      setNewPin('')
      setConfirmPin('')
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[UsersPage]", err); addToast({ message: t('فشل تغيير رمز PIN'), variant: 'error' })
    } finally {
      setIsPinSaving(false)
    }
  }
  const [sortKey, setSortKey] = useState<string>('full_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string): void => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const sortedUsers = [...users].sort((a, b) => {
    const valA = a[sortKey as keyof UserItem] ?? ''
    const valB = b[sortKey as keyof UserItem] ?? ''

    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA))
  })

  const columns: Column<UserItem>[] = [
    {
      key: 'full_name',
      header: t('الاسم الكامل'),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent font-black text-xs flex items-center justify-center border border-accent/20">
            {row.full_name.charAt(0)}
          </div>
          <span className="font-extrabold text-text-primary text-sm">{row.full_name}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('الدور / الصلاحية'),
      sortable: true,
      render: (row) => {
        const labels: Record<UserRole, { title: string; icon: React.ReactNode; style: string }> = {
          admin: { title: t('مدير نظام'), icon: <Crown className="w-3.5 h-3.5" />, style: 'bg-accent/10 text-accent border-accent/20' },
          manager: { title: t('مشرف فرع'), icon: <Briefcase className="w-3.5 h-3.5" />, style: 'bg-warning/10 text-warning border-warning/20' },
          cashier: { title: t('كاشير'), icon: <UserCheck className="w-3.5 h-3.5" />, style: 'bg-success/10 text-success border-success/20' },
        }
        const info = labels[row.role]
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${info.style}`}>
            {info.icon}
            <span>{info.title}</span>
          </span>
        )
      },
    },
    {
      key: 'pin_hash',
      header: t('رمز PIN'),
      render: () => <span className="font-mono text-xs font-bold text-text-secondary">•••• ({t('مشفر Bcrypt')})</span>,
    },
    {
      key: 'actions',
      header: t('الإجراءات'),
      align: 'left',
      render: (row) => (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-end gap-1">
          <button
            onClick={() => handleOpenEdit(row)}
            aria-label={t('تعديل المستخدم')}
            className="flex items-center gap-1 text-xs text-accent font-bold hover:bg-accent/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t('تعديل')}</span>
          </button>
          <button
            onClick={() => { setChangePinUser(row); setNewPin(''); setConfirmPin('') }}
            aria-label={t('تغيير رمز PIN')}
            className="flex items-center gap-1 text-xs text-warning font-bold hover:bg-warning/10 px-2 py-1 rounded-lg transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t('تغيير PIN')}</span>
          </button>
          <button
            onClick={() => handleDeleteUser(row.id, row.full_name)}
            aria-label={t('حذف المستخدم')}
            className="flex items-center gap-1 text-xs text-danger font-bold hover:bg-danger/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('حذف')}</span>
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12 select-none">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('إغلاق النافذة')}</span>
          </button>
          <h1 className="text-2xl font-black text-text-primary">{t('إدارة المستخدمين والأدوار')}</h1>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-ambient transition-all btn-press"
        >
          <Plus className="w-4 h-4" />
          <span>{t('إضافة مستخدم جديد')}</span>
        </button>
      </div>

      <Card padding="compact" className="overflow-hidden border border-gray-200/80 dark:border-slate-800">
        <Table
          columns={columns}
          data={sortedUsers}
          loading={isLoading}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyType="search"
          emptyMessage={t('لا يوجد مستخدمين حالياً')}
        />
      </Card>

      {/* Add User Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('إضافة مستخدم جديد')}>
        <form onSubmit={handleAddUser} className="space-y-4">
          <Input label={t('الاسم الكامل')} placeholder={t('مثال: كريم حماني')} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-primary">{t('الدور والصلاحية')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-4 py-2.5 rounded-xl text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-accent font-bold">
              <option value="cashier">{t('كاشير (نقطة البيع فقط)')}</option>
              <option value="manager">{t('مشرف (مبيعات + مخزون + تقارير)')}</option>
              <option value="admin">{t('مدير (صلاحيات كاملة)')}</option>
            </select>
          </div>
          <Input label={t('رمز PIN (4 أرقام لتسجيل الدخول)')} type="password" maxLength={6} placeholder={t('مثال: 5555')} value={pin} onChange={(e) => setPin(e.target.value)} required />
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press">حفظ المستخدم</button>
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={editingUser !== null} onClose={() => setEditingUser(null)} title={`${t('تعديل بيانات')} — ${editingUser?.full_name ?? ''}`}>
        <div className="space-y-4">
          <Input label={t('الاسم الكامل')} value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-primary">{t('الدور والصلاحية')}</label>
            <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="w-full px-4 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-accent font-bold">
              <option value="cashier">{t('كاشير')}</option>
              <option value="manager">{t('مشرف')}</option>
              <option value="admin">{t('مدير')}</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSaveEdit} disabled={isEditSaving} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-ambient btn-press">{t('حفظ التعديلات')}</button>
            <button onClick={() => setEditingUser(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">{t('إلغاء')}</button>
          </div>
        </div>
      </Modal>

      {/* Change PIN Modal */}
      <Modal isOpen={changePinUser !== null} onClose={() => setChangePinUser(null)} title={`${t('تغيير رمز PIN')} — ${changePinUser?.full_name ?? ''}`}>
        <div className="space-y-4">
          <Input label={t('رمز PIN الجديد')} type="password" maxLength={6} placeholder="أدخل 4-6 أرقام" value={newPin} onChange={(e) => setNewPin(e.target.value)} autoFocus />
          <Input label={t('تأكيد رمز PIN الجديد')} type="password" maxLength={6} placeholder="أعد إدخال الرمز" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
          {newPin && confirmPin && newPin !== confirmPin && (
            <p className="text-xs text-danger font-bold">{t('الرمزان غير متطابقين')}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleChangePin} disabled={isPinSaving || newPin.length < 4 || newPin !== confirmPin} className="flex-1 py-3 rounded-xl bg-warning text-white text-sm font-bold shadow-ambient btn-press disabled:opacity-50">{t('تغيير PIN')}</button>
            <button onClick={() => setChangePinUser(null)} className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-sm font-bold btn-press">{t('إلغاء')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
