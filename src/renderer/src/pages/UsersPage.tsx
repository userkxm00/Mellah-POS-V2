import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import type { UserRole } from '@/types/database'

interface UserItem {
  id: string
  full_name: string
  role: UserRole
  pin_hash: string
  created_at: string
}

export function UsersPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [users, setUsers] = useState<UserItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const [fullName, setFullName] = useState<string>('')
  const [role, setRole] = useState<UserRole>('cashier')
  const [pin, setPin] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<UserItem>(
        'SELECT id, full_name, role, pin_hash, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
      )
      setUsers(rows)
    } catch {
      addToast({ message: 'فشل تحميل قائمة المستخدمين', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleAddUser = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!fullName.trim()) {
      addToast({ message: 'يرجى إدخال اسم المستخدم', variant: 'error' })
      return
    }

    if (!pin.trim() || pin.length < 4) {
      addToast({ message: 'رمز PIN يجب أن يتكون من 4 أرقام على الأقل', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO users (id, branch_id, full_name, role, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, DEFAULT_BRANCH_ID, fullName.trim(), role, pin.trim(), now, now]
      )

      addToast({ message: 'تم إضافة المستخدم بنجاح!', variant: 'success' })
      setIsModalOpen(false)
      setFullName('')
      setPin('')
      setRole('cashier')
      await loadUsers()
    } catch {
      addToast({ message: 'فشل إضافة المستخدم', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`هل أنت تأكد من رغبتك في حذف المستخدم (${name})؟`)) return

    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE users SET deleted_at = ? WHERE id = ?',
        [now, id]
      )
      addToast({ message: 'تم حذف المستخدم', variant: 'info' })
      await loadUsers()
    } catch {
      addToast({ message: 'فشل حذف المستخدم', variant: 'error' })
    }
  }

  const columns: Column<UserItem>[] = [
    {
      key: 'full_name',
      header: 'الاسم الكامل',
      render: (row) => <span className="font-bold text-text-primary">{row.full_name}</span>,
    },
    {
      key: 'role',
      header: 'الدور / الصلاحية',
      render: (row) => {
        const labels: Record<UserRole, { title: string; style: string }> = {
          admin: { title: '👑 مدير نظام', style: 'bg-accent-light text-accent' },
          manager: { title: '💼 مشرف فرع', style: 'bg-warning-light text-warning' },
          cashier: { title: '👤 كاشير', style: 'bg-success-light text-success' },
        }
        const info = labels[row.role]
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${info.style}`}>
            {info.title}
          </span>
        )
      },
    },
    {
      key: 'pin_hash',
      header: 'رمز PIN',
      render: (row) => <span className="font-mono text-xs text-text-secondary">•••• ({row.pin_hash})</span>,
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      align: 'left',
      render: (row) => (
        <button
          onClick={() => handleDeleteUser(row.id, row.full_name)}
          className="text-xs text-danger font-semibold hover:underline"
        >
          🗑️ حذف
        </button>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← العودة لنقطة البيع (POS)
          </button>
          <h1 className="text-2xl font-bold text-text-primary">إدارة المستخدمين والأدوار</h1>
        </div>

        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          + إضافة مستخدم جديد
        </Button>
      </div>

      <Card padding="compact">
        <Table
          columns={columns}
          data={users}
          loading={isLoading}
          rowKey={(row) => row.id}
        />
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة مستخدم جديد">
        <form onSubmit={handleAddUser} className="space-y-4">
          <Input
            label="الاسم الكامل"
            placeholder="مثال: كريم حماني"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">الدور والصلاحية</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-4 py-2.5 rounded-xl text-sm bg-white border border-border focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="cashier">👤 كاشير (نقطة البيع فقط)</option>
              <option value="manager">💼 مشرف (مبيعات + مخزون + تقارير)</option>
              <option value="admin">👑 مدير (صلاحيات كاملة)</option>
            </select>
          </div>

          <Input
            label="رمز PIN (4 أرقام لتسجيل الدخول)"
            type="password"
            maxLength={6}
            placeholder="مثال: 5555"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" className="flex-1" loading={isSubmitting}>
              حفظ المستخدم
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
