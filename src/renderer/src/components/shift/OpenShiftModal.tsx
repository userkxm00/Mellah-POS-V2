import React, { useState } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { useShiftStore } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'

interface OpenShiftModalProps {
  isOpen: boolean
  onClose?: () => void
}

export function OpenShiftModal({ isOpen }: OpenShiftModalProps): React.JSX.Element | null {
  const [openingCash, setOpeningCash] = useState<string>('5000')
  const openShift = useShiftStore((s) => s.openShift)
  const isLoading = useShiftStore((s) => s.isLoading)
  const addToast = useToastStore((s) => s.addToast)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const cashVal = parseFloat(openingCash)
    if (isNaN(cashVal) || cashVal < 0) {
      addToast({ message: 'يرجى إدخال مبلغ فتح الصندوق بشكل صحيح', variant: 'error' })
      return
    }

    try {
      await openShift(cashVal)
      addToast({ message: 'تم فتح الصندوق وبداية وردية العمل بنجاح', variant: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل فتح الوردية'
      addToast({ message: msg, variant: 'error' })
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="فتح الصندوق — بداية الدوام">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="p-4 rounded-xl bg-accent-light border border-accent/20">
          <p className="text-sm text-text-primary leading-relaxed">
            مرحباً بك! قبل البدء في عمليات البيع، يرجى إدخال مبلغ السيولة النقدية المتوفرة في أدراج الصندوق (الفكة والسيولة الأولية).
          </p>
        </div>

        <Input
          label="المبلغ الأولي في الصندوق (DA)"
          type="number"
          min="0"
          step="100"
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="أدخل مبلغ بداية اليوم"
          required
          autoFocus
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={isLoading}
            size="lg"
          >
            تأكيد وفتح الصندوق
          </Button>
        </div>
      </form>
    </Modal>
  )
}
