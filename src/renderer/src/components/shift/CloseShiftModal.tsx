import React, { useState, useEffect } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { useShiftStore } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency } from '@/lib/format'

interface CloseShiftModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CloseShiftModal({ isOpen, onClose }: CloseShiftModalProps): React.JSX.Element | null {
  const activeShift = useShiftStore((s) => s.activeShift)
  const closeShift = useShiftStore((s) => s.closeShift)
  const isLoading = useShiftStore((s) => s.isLoading)
  const addToast = useToastStore((s) => s.addToast)

  const [cashSalesTotal, setCashSalesTotal] = useState<number>(0)
  const [cardSalesTotal, setCardSalesTotal] = useState<number>(0)
  const [closingCashInput, setClosingCashInput] = useState<string>('')
  const [isFetchingSummary, setIsFetchingSummary] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && activeShift) {
      setIsFetchingSummary(true)
      window.electron.db
        .query<{ payment_method: string; total: number }>(
          `SELECT payment_method, SUM(total_dzd) as total 
           FROM sales 
           WHERE shift_id = ? AND status = 'completed' 
           GROUP BY payment_method`,
          [activeShift.id]
        )
        .then((rows) => {
          let cash = 0
          let card = 0
          for (const r of rows) {
            if (r.payment_method === 'cash' || r.payment_method === 'mixed') {
              cash += r.total
            } else if (r.payment_method === 'card') {
              card += r.total
            }
          }
          setCashSalesTotal(cash)
          setCardSalesTotal(card)
          const expected = (activeShift.opening_cash_dzd || 0) + cash
          setClosingCashInput(String(expected))
        })
        .catch(() => {
          addToast({ message: 'فشل جلب ملخص الوردية', variant: 'error' })
        })
        .finally(() => {
          setIsFetchingSummary(false)
        })
    }
  }, [isOpen, activeShift, addToast])

  if (!activeShift) return null

  const openingCash = activeShift.opening_cash_dzd || 0
  const expectedCash = openingCash + cashSalesTotal
  const closingCashNum = parseFloat(closingCashInput) || 0
  const difference = closingCashNum - expectedCash

  const handleConfirmClose = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (isNaN(closingCashNum) || closingCashNum < 0) {
      addToast({ message: 'يرجى إدخال مبلغ العد الفعلي للصندوق بشكل صحيح', variant: 'error' })
      return
    }

    try {
      const res = await closeShift(closingCashNum)
      const diffText =
        res.difference === 0
          ? 'متطابق 100%'
          : res.difference > 0
            ? `فائض بمبلغ ${formatCurrency(res.difference)}`
            : `عجز بمبلغ ${formatCurrency(Math.abs(res.difference))}`

      addToast({
        message: `تم قفل الصندوق بنجاح! النتيجة: ${diffText}`,
        variant: res.difference === 0 ? 'success' : 'warning',
      })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل إغلاق الوردية'
      addToast({ message: msg, variant: 'error' })
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="قفل الصندوق — إغلاق الدوام" size="lg">
      <form onSubmit={handleConfirmClose} className="space-y-6">
        {/* Summary metrics cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gray-50 border border-border-light">
            <p className="text-xs text-text-tertiary mb-1">المبلغ الأولي</p>
            <p className="currency text-text-primary font-bold text-lg">
              {formatCurrency(openingCash)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 border border-border-light">
            <p className="text-xs text-text-tertiary mb-1">مبيعات الكاش في الوردية</p>
            <p className="currency text-success font-bold text-lg">
              + {formatCurrency(cashSalesTotal)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-accent-light border border-accent/20">
            <p className="text-xs text-accent mb-1 font-medium">المبلغ المتوقع في الصندوق</p>
            <p className="currency text-accent font-extrabold text-xl">
              {formatCurrency(expectedCash)}
            </p>
          </div>
        </div>

        {cardSalesTotal > 0 && (
          <p className="text-xs text-text-tertiary">
            ملاحظة: مبيعات البطاقة الحسابية ({formatCurrency(cardSalesTotal)}) غير محسوبة ضمن الكاش الفعلي للصندوق.
          </p>
        )}

        {/* Input for actual count */}
        <div className="space-y-3 pt-2 border-t border-border-light">
          <Input
            label="العد الفعلي للكاش الموجود في الصندوق الان (DA)"
            type="number"
            min="0"
            step="50"
            value={closingCashInput}
            onChange={(e) => setClosingCashInput(e.target.value)}
            disabled={isFetchingSummary}
            required
            autoFocus
          />

          {/* Difference badge */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-border-light">
            <span className="text-sm font-medium text-text-secondary">الفرق (العد الفعلي - المتوقع):</span>
            <span
              className={`currency font-extrabold text-lg px-3 py-1 rounded-lg ${
                difference === 0
                  ? 'bg-success-light text-success'
                  : difference > 0
                    ? 'bg-warning-light text-warning'
                    : 'bg-danger-light text-danger'
              }`}
            >
              {difference === 0
                ? '0 DA (متطابق)'
                : difference > 0
                  ? `+ ${formatCurrency(difference)} (فائض)`
                  : `- ${formatCurrency(Math.abs(difference))} (عجز)`}
            </span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            variant="danger"
            className="flex-1"
            loading={isLoading || isFetchingSummary}
            size="lg"
          >
            تأكيد قفل الصندوق والإغلاق
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            size="lg"
          >
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  )
}
