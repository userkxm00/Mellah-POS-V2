import React, { useState } from 'react'
import { Package, AlertTriangle } from 'lucide-react'
import { Modal, Button, Input } from '@/components/ui'
import { addStockMovement } from '@/services/productService'
import { useToastStore } from '@/stores/toastStore'

interface StockAdjustmentModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly variantId: string | null
  readonly variantTitle: string
  readonly onSuccess: () => void
}

export function StockAdjustmentModal({
  isOpen,
  onClose,
  variantId,
  variantTitle,
  onSuccess,
}: StockAdjustmentModalProps): React.JSX.Element | null {
  const [type, setType] = useState<'restock' | 'adjustment'>('restock')
  const [quantity, setQuantity] = useState<string>('1')
  const [note, setNote] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  if (!isOpen || !variantId) return null

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const qtyNum = Number.parseInt(quantity, 10)
    if (Number.isNaN(qtyNum) || qtyNum === 0) {
      addToast({ message: 'يرجى إدخال كمية صحيحة غير صفرية', variant: 'error' })
      return
    }

    setIsLoading(true)
    try {
      // If adjustment and cashier typed positive number for deduction, make it negative
      const qtyChange = type === 'adjustment' && qtyNum > 0 ? -qtyNum : qtyNum
      await addStockMovement(variantId, type, qtyChange, note)

      addToast({ message: 'تم تسجيل الحركة ورصيد المخزون بنجاح!', variant: 'success' })
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل التعديل'
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`تعديل مخزون — ${variantTitle}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">نوع الحركة:</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`py-2 px-3 rounded-xl text-xs font-bold border btn-press flex items-center justify-center gap-1.5 ${
                type === 'restock'
                  ? 'bg-success-light text-success border-success/30'
                  : 'bg-white text-text-secondary border-border'
              }`}
              onClick={() => setType('restock')}
            >
              <Package className="w-3.5 h-3.5" />
              <span>إضافة شحنة جديدة (+ restock)</span>
            </button>
            <button
              type="button"
              className={`py-2 px-3 rounded-xl text-xs font-bold border btn-press flex items-center justify-center gap-1.5 ${
                type === 'adjustment'
                  ? 'bg-danger-light text-danger border-danger/30'
                  : 'bg-white text-text-secondary border-border'
              }`}
              onClick={() => setType('adjustment')}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>تسوية/خصم مخزون (- adjustment)</span>
            </button>
          </div>
        </div>

        <Input
          label={type === 'restock' ? 'الكمية المضافة (+)' : 'الكمية المخصومة (-)'}
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          autoFocus
        />

        <Input
          label="سبب التعديل / ملاحظة"
          placeholder={type === 'restock' ? 'مثال: توريد شحنة جديدة من المورد' : 'مثال: بضاعة تالفة أو جرد سنوي'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" className="flex-1" loading={isLoading}>
            حفظ في سجل الحركة
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  )
}
