import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Input, Modal, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { useToastStore } from '@/stores/toastStore'

interface BranchItem {
  id: string
  name: string
  address: string | null
  created_at: string
}

export function BranchesPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const [name, setName] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const loadBranches = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electron.db.query<BranchItem>(
        'SELECT id, name, address, created_at FROM branches WHERE deleted_at IS NULL ORDER BY created_at ASC'
      )
      setBranches(rows)
    } catch {
      addToast({ message: 'فشل تحميل قائمة الفروع', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  const handleAddBranch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) {
      addToast({ message: 'يرجى كتابة اسم الفرع', variant: 'error' })
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

      addToast({ message: 'تم إضافة الفرع بنجاح!', variant: 'success' })
      setIsModalOpen(false)
      setName('')
      setAddress('')
      await loadBranches()
    } catch {
      addToast({ message: 'فشل إضافة الفرع', variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<BranchItem>[] = [
    {
      key: 'name',
      header: 'اسم الفرع',
      render: (row) => <span className="font-bold text-text-primary">{row.name}</span>,
    },
    {
      key: 'address',
      header: 'العنوان / الموقع',
      render: (row) => <span className="text-text-secondary text-xs">{row.address ?? 'غير محدد'}</span>,
    },
    {
      key: 'created_at',
      header: 'تاريخ الإنشاء',
      render: (row) => (
        <span className="text-xs text-text-tertiary font-mono">
          {new Date(row.created_at).toLocaleDateString('ar-DZ')}
        </span>
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
          <h1 className="text-2xl font-bold text-text-primary">إدارة فروع المتجر (Multi-Branch)</h1>
        </div>

        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          + إضافة فرع جديد
        </Button>
      </div>

      <Card padding="compact">
        <Table
          columns={columns}
          data={branches}
          loading={isLoading}
          rowKey={(row) => row.id}
        />
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة فرع جديد للمتجر">
        <form onSubmit={handleAddBranch} className="space-y-4">
          <Input
            label="اسم الفرع"
            placeholder="مثال: فرع وهران — حي العثمانية"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="عنوان الفرع التفصيلي"
            placeholder="مثال: شارع العربي بن مهيدي، وهران"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" className="flex-1" loading={isSubmitting}>
              حفظ الفرع
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
