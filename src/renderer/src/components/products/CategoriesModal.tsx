import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'

interface CategoryRow {
  id: string
  name: string
}

interface CategoriesModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onCategoryChanged: () => void
}

export function CategoriesModal({
  isOpen,
  onClose,
  onCategoryChanged,
}: CategoriesModalProps): React.JSX.Element | null {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [newCatName, setNewCatName] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  const fetchCategories = useCallback(async () => {
    try {
      const rows = await window.electron.db.query<CategoryRow>(
        'SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name'
      )
      setCategories(rows)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CategoriesModal]", err); addToast({ message: 'فشل تحميل الفئات', variant: 'error' })
    }
  }, [addToast])

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen, fetchCategories])

  const handleAddCategory = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const name = newCatName.trim()
    if (!name) return

    setIsLoading(true)
    try {
      const id = generateUUID()
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'INSERT INTO categories (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, DEFAULT_BRANCH_ID, name, now, now]
      )
      addToast({ message: 'تم إضافة الفئة بنجاح', variant: 'success' })
      setNewCatName('')
      await fetchCategories()
      onCategoryChanged()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CategoriesModal]", err); addToast({ message: 'فشل إضافة الفئة', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    const name = editingName.trim()
    if (!name) return

    setIsLoading(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE categories SET name = ?, updated_at = ? WHERE id = ?',
        [name, now, id]
      )
      addToast({ message: 'تم تحديث اسم الفئة بنجاح', variant: 'success' })
      setEditingId(null)
      await fetchCategories()
      onCategoryChanged()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CategoriesModal]", err); addToast({ message: 'فشل تحديث الفئة', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('هل أنت تأكد من رغبتك في حذف هذه الفئة؟')) return

    setIsLoading(true)
    try {
      const now = new Date().toISOString()
      await window.electron.db.execute(
        'UPDATE categories SET deleted_at = ? WHERE id = ?',
        [now, id]
      )
      addToast({ message: 'تم حذف الفئة', variant: 'info' })
      await fetchCategories()
      onCategoryChanged()
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[CategoriesModal]", err); addToast({ message: 'فشل حذف الفئة', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إدارة فئات المنتجات">
      <div className="space-y-5">
        {/* Add new category form */}
        <form onSubmit={handleAddCategory} className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="إضافة فئة جديدة"
              placeholder="مثال: ملابس أطفال..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" loading={isLoading}>
            + إضافة
          </Button>
        </form>

        {/* Categories list */}
        <div className="space-y-2 max-h-60 overflow-auto border-t border-border-light pt-3">
          <label className="text-xs font-semibold text-text-tertiary">الفئات الحالية ({categories.length}):</label>
          {categories.length === 0 ? (
            <p className="text-xs text-text-tertiary p-3 text-center">لا توجد فئات</p>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-border-light text-sm"
              >
                {editingId === c.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 px-2.5 py-1 rounded border border-accent text-xs bg-white"
                      autoFocus
                    />
                    <Button size="sm" variant="primary" onClick={() => handleSaveEdit(c.id)}>
                      حفظ
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                      إلغاء
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold text-text-primary">{c.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id)
                          setEditingName(c.name)
                        }}
                        className="p-1 rounded text-text-tertiary hover:text-accent text-xs"
                      >
                        ✏️ تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="p-1 rounded text-text-tertiary hover:text-danger text-xs"
                      >
                        🗑️ حذف
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
