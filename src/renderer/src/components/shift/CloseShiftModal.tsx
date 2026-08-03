import React, { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { Modal, Input } from '@/components/ui'
import { useShiftStore } from '@/stores/shiftStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency } from '@/lib/format'
import { sendShiftClosedTelegramNotification } from '@/services/telegramService'

interface CloseShiftModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

function getShiftDifferenceBadgeText(diff: number): string {
  if (diff === 0) return '0 DA (متطابق)'
  if (diff > 0) return `+ ${formatCurrency(diff)} (فائض)`
  return `- ${formatCurrency(Math.abs(diff))} (عجز)`
}

function getShiftDifferenceBadgeStyle(diff: number): string {
  if (diff === 0) return 'bg-success/10 text-success border-success/20'
  if (diff > 0) return 'bg-warning/10 text-warning border-warning/20'
  return 'bg-danger/10 text-danger border-danger/20'
}

function getShiftCloseToastMessage(diff: number): string {
  if (diff === 0) return 'متطابق 100%'
  if (diff > 0) return `فائض بمبلغ ${formatCurrency(diff)}`
  return `عجز بمبلغ ${formatCurrency(Math.abs(diff))}`
}

export function CloseShiftModal({ isOpen, onClose }: CloseShiftModalProps): React.JSX.Element | null {
  const activeShift = useShiftStore((s) => s.activeShift)
  const closeShift = useShiftStore((s) => s.closeShift)
  const isLoading = useShiftStore((s) => s.isLoading)
  const addToast = useToastStore((s) => s.addToast)

  const [cashSalesTotal, setCashSalesTotal] = useState<number>(0)
  const [cardSalesTotal, setCardSalesTotal] = useState<number>(0)
  const [cashRepaymentsTotal, setCashRepaymentsTotal] = useState<number>(0)
  const [closingCashInput, setClosingCashInput] = useState<string>('')
  const [isFetchingSummary, setIsFetchingSummary] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && activeShift) {
      setIsFetchingSummary(true)
      Promise.all([
        window.electron.db.query<{ cash_total: number; card_total: number }>(
          `SELECT 
             COALESCE(SUM(cash_amount_dzd), 0) as cash_total,
             COALESCE(SUM(card_amount_dzd), 0) as card_total
           FROM sales 
           WHERE shift_id = ? AND status = 'completed'`,
          [activeShift.id]
        ),
        window.electron.db.query<{ repayments_total: number }>(
          `SELECT COALESCE(SUM(amount_dzd), 0) as repayments_total
           FROM customer_payments
           WHERE shift_id = ? AND payment_method = 'cash'`,
          [activeShift.id]
        ).catch(() => [{ repayments_total: 0 }]),
      ])
        .then(([salesRows, repayRows]) => {
          const cash = salesRows[0]?.cash_total ?? 0
          const card = salesRows[0]?.card_total ?? 0
          const repayments = repayRows[0]?.repayments_total ?? 0
          setCashSalesTotal(cash)
          setCardSalesTotal(card)
          setCashRepaymentsTotal(repayments)
          // Mirror shiftStore.closeShift() formula: opening + cashSales + repayments
          const expected = (activeShift.opening_cash_dzd || 0) + cash + repayments
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
  // Mirror shiftStore.closeShift() formula exactly: opening + cashSales + cashRepayments
  const expectedCash = openingCash + cashSalesTotal + cashRepaymentsTotal
  const closingCashNum = Number.parseFloat(closingCashInput) || 0
  const difference = closingCashNum - expectedCash

  const handleConfirmClose = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (Number.isNaN(closingCashNum) || closingCashNum < 0) {
      addToast({ message: 'يرجى إدخال مبلغ العد الفعلي للصندوق بشكل صحيح', variant: 'error' })
      return
    }

    try {
      const res = await closeShift(closingCashNum)
      const diffText = getShiftCloseToastMessage(res.difference)

      const activeUser = useAuthStore.getState().currentUser
      const activeBranch = useAuthStore.getState().currentBranch
      const nowIso = new Date().toISOString()

      sendShiftClosedTelegramNotification({
        branchName: activeBranch?.name || 'الفرع الرئيسي',
        cashierName: activeUser?.full_name || 'الكاشير',
        totalSalesDzd: cashSalesTotal + cardSalesTotal,
        cashSalesDzd: cashSalesTotal,
        cardSalesDzd: cardSalesTotal,
        expectedCashDzd: res.expectedCash,
        closingCashDzd: closingCashNum,
        differenceDzd: res.difference,
        openedAt: activeShift.opened_at,
        closedAt: nowIso,
      }).catch(() => {})

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
      <form onSubmit={handleConfirmClose} className="space-y-6 select-none">
        {/* Summary metrics cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <p className="text-xs font-bold text-text-tertiary mb-1">المبلغ الأولي</p>
            <p className="currency text-text-primary font-black text-lg">
              {formatCurrency(openingCash)}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <p className="text-xs font-bold text-text-tertiary mb-1">مبيعات الكاش في الوردية</p>
            <p className="currency text-success font-black text-lg">
              + {formatCurrency(cashSalesTotal)}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20">
            <p className="text-xs text-accent mb-1 font-bold">المبلغ المتوقع في الصندوق</p>
            <p className="currency text-accent font-black text-xl">
              {formatCurrency(expectedCash)}
            </p>
          </div>
        </div>

        {/* Debt repayments row (only shown if repayments exist in this shift) */}
        {cashRepaymentsTotal > 0 && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex justify-between">
            <span>تسديدات ديون كاش (Customer Repayments):</span>
            <span className="currency font-black">+ {formatCurrency(cashRepaymentsTotal)}</span>
          </div>
        )}

        {cardSalesTotal > 0 && (
          <p className="text-xs font-bold text-text-tertiary">
            ملاحظة: مبيعات البطاقة الحسابية ({formatCurrency(cardSalesTotal)}) غير محسوبة ضمن الكاش الفعلي للصندوق.
          </p>
        )}

        {/* Input for actual count */}
        <div className="space-y-3 pt-2 border-t border-gray-200/80">
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
          <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <span className="text-sm font-bold text-text-secondary">الفرق (العد الفعلي - المتوقع):</span>
            <span
              className={`currency font-black text-sm px-3 py-1 rounded-full border ${getShiftDifferenceBadgeStyle(difference)}`}
            >
              {getShiftDifferenceBadgeText(difference)}
            </span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading || isFetchingSummary}
            className="flex-1 py-3.5 rounded-2xl bg-danger hover:bg-danger-hover text-white text-sm font-extrabold shadow-ambient transition-all btn-press flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>تأكيد قفل الصندوق والإغلاق</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-3.5 rounded-2xl bg-gray-100 text-text-secondary text-sm font-bold btn-press"
          >
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}
