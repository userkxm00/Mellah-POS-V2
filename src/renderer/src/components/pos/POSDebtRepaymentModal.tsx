import React, { useState, useEffect } from 'react'
import { Wallet, CreditCard, CheckCircle2 } from 'lucide-react'
import { Modal, Input } from '@/components/ui'
import { generateUUID } from '@/lib/uuid'
import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { resolveActiveShiftId } from '@/lib/shiftUtils'
import type { PaymentMethod } from '@/types/database'

interface POSDebtRepaymentModalProps {
  isOpen: boolean
  onClose: () => void
  customer: {
    id: string
    full_name: string
    phone?: string | null
    total_debt_dzd?: number
  } | null
  onPaymentSuccess: () => void
}

export function POSDebtRepaymentModal({
  isOpen,
  onClose,
  customer,
  onPaymentSuccess,
}: POSDebtRepaymentModalProps): React.JSX.Element | null {
  const t = useLanguageStore((s) => s.t)
  const addToast = useToastStore((s) => s.addToast)

  const [amountInput, setAmountInput] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notesInput, setNotesInput] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Reset inputs when modal opens
  useEffect(() => {
    if (isOpen && customer) {
      const currentDebt = customer.total_debt_dzd ?? 0
      setAmountInput(currentDebt > 0 ? currentDebt.toString() : '')
      setPaymentMethod('cash')
      setNotesInput('')
    }
  }, [isOpen, customer])

  if (!isOpen || !customer) return null

  const debt = Math.max(0, customer.total_debt_dzd ?? 0)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const amount = Number.parseFloat(amountInput)

    if (!amount || amount <= 0) {
      addToast({ message: t('يرجى كتابة مبلغ تسديد صحيح'), variant: 'error' })
      return
    }

    const shiftId = await resolveActiveShiftId(DEFAULT_BRANCH_ID)
    if (!shiftId) {
      addToast({
        message: t('لا توجد وردية مفتوحة حالياً! يرجى فتح وردية في الصندوق أولاً قبل تسديد الديون.'),
        variant: 'error',
        duration: 4000,
      })
      return
    }

    setIsSubmitting(true)
    try {
      const paymentId = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.execute(
        `INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, amount_dzd, payment_method, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          DEFAULT_BRANCH_ID,
          shiftId,
          customer.id,
          amount,
          paymentMethod,
          notesInput.trim() || null,
          now,
        ]
      )

      addToast({
        message: `${t('تم تسجيل تسديد مبلغ')} ${amount.toLocaleString('ar-DZ')} ${t('دج للزبون')} "${customer.full_name}" ${t('بنجاح')}`,
        variant: 'success',
        duration: 3500,
      })

      onPaymentSuccess()
      onClose()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POSDebtRepaymentModal] Error recording payment:', err)
      addToast({ message: t('فشل تسجيل عملية تسديد الدين'), variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('تسديد دين زبون مباشر من الـ POS')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {/* Customer Header Info */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-text-tertiary font-bold">{t('الزبون المضلل:')}</p>
            <h3 className="text-sm font-black text-text-primary dark:text-slate-100">{customer.full_name}</h3>
            {customer.phone && (
              <p className="text-xs text-text-secondary font-mono">{customer.phone}</p>
            )}
          </div>
          <div className="text-left space-y-0.5">
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block">{t('إجمالي الدين المسجل:')}</span>
            <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">
              {debt.toLocaleString('ar-DZ')} دج
            </span>
          </div>
        </div>

        {/* Repayment Amount Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-text-secondary dark:text-slate-300 flex items-center justify-between">
            <span>{t('مبلغ التسديد الحالي (دج):')}</span>
            {debt > 0 && (
              <button
                type="button"
                onClick={() => setAmountInput(debt.toString())}
                className="text-[11px] text-accent font-bold hover:underline"
              >
                {t('تسديد كامل الدين')} ({debt.toLocaleString('ar-DZ')} دج)
              </button>
            )}
          </label>
          <Input
            type="number"
            min={1}
            max={debt > 0 ? debt : undefined}
            step="any"
            required
            placeholder={t('أدخل المبلغ المسدد بالدينار...')}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="text-base font-black bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 focus:bg-white"
          />
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-text-secondary dark:text-slate-300">
            {t('طريقة الدفع:')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all btn-press ${
                paymentMethod === 'cash'
                  ? 'bg-accent/10 border-accent text-accent font-black'
                  : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-text-secondary'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>{t('نقداً (كاش)')}</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all btn-press ${
                paymentMethod === 'card'
                  ? 'bg-accent/10 border-accent text-accent font-black'
                  : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-text-secondary'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>{t('بطاقة بنكية')}</span>
            </button>
          </div>
        </div>

        {/* Optional Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-text-secondary dark:text-slate-300">
            {t('ملاحظات إضافية (اختياري):')}
          </label>
          <Input
            placeholder={t('مثال: تسديد جزئي متبقي من الحذاء...')}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            className="text-xs bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-text-secondary"
          >
            {t('إلغاء')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl text-xs font-black bg-accent hover:bg-accent-hover text-white shadow-ambient flex items-center gap-1.5 disabled:opacity-50 btn-press"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? t('جاري التسديد...') : t('تأكيد وتسجيل التسديد')}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
