import React, { useState } from 'react'
import { Banknote, CheckCircle2 } from 'lucide-react'
import { Modal, Input } from '@/components/ui'
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
      <form onSubmit={handleSubmit} className="space-y-5 select-none">
        <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-accent text-white mt-0.5">
            <Banknote className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-text-primary leading-relaxed">
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
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-sm font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد وفتح الصندوق</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
