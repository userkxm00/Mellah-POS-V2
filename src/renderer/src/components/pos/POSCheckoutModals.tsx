import React from 'react'
import { Modal, Input, Button } from '@/components/ui'
import { RotateCcw, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { OpenShiftModal } from '@/components/shift/OpenShiftModal'
import { CloseShiftModal } from '@/components/shift/CloseShiftModal'
import { SessionLockModal } from '@/components/auth/SessionLockModal'

interface HeldCartItem {
  id: string
  customerName?: string
  heldAt: string
  subtotalDzd: number
  items: unknown[]
}

interface POSCheckoutModalsProps {
  readonly isHeldModalOpen: boolean
  readonly setIsHeldModalOpen: (open: boolean) => void
  readonly heldCarts: HeldCartItem[]
  readonly handleRestoreCart: (id: string) => void
  readonly deleteCart: (id: string) => void

  readonly isManagerPinOpen: boolean
  readonly setIsManagerPinOpen: (open: boolean) => void
  readonly discountDzd: number
  readonly managerPin: string
  readonly setManagerPin: (pin: string) => void
  readonly handleVerifyManagerPin: () => void
  readonly isVerifyingPin: boolean

  readonly isShiftLoading: boolean
  readonly activeShift: unknown
  readonly isCloseShiftOpen: boolean
  readonly setIsCloseShiftOpen: (open: boolean) => void

  readonly isQuickAddCustomerOpen: boolean
  readonly setIsQuickAddCustomerOpen: (open: boolean) => void
  readonly handleQuickAddCustomer: (e: React.FormEvent) => void
  readonly newCustName: string
  readonly setNewCustName: (name: string) => void
  readonly newCustPhone: string
  readonly setNewCustPhone: (phone: string) => void

  readonly isMixedModalOpen: boolean
  readonly setIsMixedModalOpen: (open: boolean) => void
  readonly cartTotal: number
  readonly mixedCashInput: string
  readonly setMixedCashInput: (val: string) => void
  readonly mixedCardInput: string
  readonly setMixedCardInput: (val: string) => void
  readonly setMixedAmounts: (cash: number, card: number) => void

  readonly isLocked: boolean
  readonly setIsLocked: (locked: boolean) => void
  readonly t: (key: string) => string
  readonly addToast: (toast: { message: string; variant: 'success' | 'warning' | 'error' | 'info'; duration?: number }) => void
}

export function POSCheckoutModals({
  isHeldModalOpen,
  setIsHeldModalOpen,
  heldCarts,
  handleRestoreCart,
  deleteCart,
  isManagerPinOpen,
  setIsManagerPinOpen,
  discountDzd,
  managerPin,
  setManagerPin,
  handleVerifyManagerPin,
  isVerifyingPin,
  isShiftLoading,
  activeShift,
  isCloseShiftOpen,
  setIsCloseShiftOpen,
  isQuickAddCustomerOpen,
  setIsQuickAddCustomerOpen,
  handleQuickAddCustomer,
  newCustName,
  setNewCustName,
  newCustPhone,
  setNewCustPhone,
  isMixedModalOpen,
  setIsMixedModalOpen,
  cartTotal,
  mixedCashInput,
  setMixedCashInput,
  mixedCardInput,
  setMixedCardInput,
  setMixedAmounts,
  isLocked,
  setIsLocked,
  t,
  addToast,
}: POSCheckoutModalsProps): React.JSX.Element {
  return (
    <>
      {/* Held Carts Modal */}
      <Modal isOpen={isHeldModalOpen} onClose={() => setIsHeldModalOpen(false)} title={t('السلات المعلقة والمؤقتة (Hold Carts)')} size="md">
        <div className="space-y-4">
          {heldCarts.length === 0 ? (
            <p className="text-xs text-center py-6 text-text-tertiary font-bold">لا توجد سلات معلقة حالياً.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {heldCarts.map((hc) => (
                <div key={hc.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-xs text-text-primary block">
                      {hc.customerName ? `الزبون: ${hc.customerName}` : `سلة معلقة #${hc.id.slice(-4)}`}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono block">
                      {new Date(hc.heldAt).toLocaleTimeString('ar-DZ')} • {hc.items.length} منتجات
                    </span>
                    <span className="currency text-accent font-black text-xs block mt-0.5">
                      {formatCurrency(hc.subtotalDzd)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestoreCart(hc.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold shadow-ambient flex items-center gap-1 btn-press"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استرجاع</span>
                    </button>
                    <button
                      onClick={() => deleteCart(hc.id)}
                      className="p-1.5 rounded-lg text-danger hover:bg-danger-light"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Manager PIN Modal */}
      <Modal isOpen={isManagerPinOpen} onClose={() => setIsManagerPinOpen(false)} title={t('موافقة المدير على الخصم الكبير')} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-amber-900 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200">
            الخصم المطبق كبير ({formatCurrency(discountDzd)}). يرجى إدخال PIN المدير للموافقة وإتمام البيع.
          </p>

          <Input
            type="password"
            maxLength={6}
            placeholder="****"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            autoFocus
          />

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleVerifyManagerPin}
              disabled={isVerifyingPin || managerPin.length < 4}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-xs font-bold shadow-ambient btn-press disabled:opacity-50"
            >
              موافقة وإتمام البيع
            </button>
            <button
              onClick={() => setIsManagerPinOpen(false)}
              className="px-5 py-3 rounded-xl bg-gray-100 text-text-secondary text-xs font-bold btn-press"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      {/* Shift Modals */}
      <OpenShiftModal isOpen={!isShiftLoading && activeShift === null} />
      <CloseShiftModal isOpen={isCloseShiftOpen} onClose={() => setIsCloseShiftOpen(false)} />

      {/* Quick Add Customer Modal */}
      <Modal isOpen={isQuickAddCustomerOpen} onClose={() => setIsQuickAddCustomerOpen(false)} title={t('إضافة زبون جديد فوراً')}>
        <form onSubmit={handleQuickAddCustomer} className="space-y-4">
          <Input label={t('اسم الزبون الكامل')} placeholder={t('مثلاً: محمد الأمين')} value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
          <Input label={t('رقم الهاتف')} placeholder="06XXXXXXXX" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsQuickAddCustomerOpen(false)}>{t('إلغاء')}</Button>
            <Button type="submit" variant="primary">{t('حفظ واختيار الزبون')}</Button>
          </div>
        </form>
      </Modal>

      {/* Mixed Payment Modal */}
      <Modal isOpen={isMixedModalOpen} onClose={() => setIsMixedModalOpen(false)} title={t('حاسبة التقسيم للدفع المختلط (نقداً + CIB)')}>
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold text-text-secondary flex justify-between">
            <span>إجمالي الفاتورة المستحق:</span>
            <span className="text-accent font-black text-sm">{formatCurrency(cartTotal)}</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mixed-cash-input" className="text-xs font-bold text-text-primary">المبلغ المدفوع كاش (نقداً):</label>
            <Input
              id="mixed-cash-input"
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCashInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCashInput(val)
                const cashNum = Number.parseFloat(val) || 0
                const cardNum = Math.max(0, cartTotal - cashNum)
                setMixedCardInput(cardNum > 0 ? String(cardNum) : '')
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mixedCardInput" className="text-xs font-bold text-text-primary">المبلغ المدفوع بالبطاقة (CIB):</label>
            <Input
              id="mixedCardInput"
              type="number"
              placeholder={`مثلاً: ${cartTotal / 2}`}
              value={mixedCardInput}
              onChange={(e) => {
                const val = e.target.value
                setMixedCardInput(val)
                const cardNum = Number.parseFloat(val) || 0
                const cashNum = Math.max(0, cardNum > 0 ? cartTotal - cardNum : 0)
                setMixedCashInput(cashNum > 0 ? String(cashNum) : '')
              }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsMixedModalOpen(false)}>إلغاء</Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                const cash = Number.parseFloat(mixedCashInput) || 0
                const card = Number.parseFloat(mixedCardInput) || 0
                if (cash <= 0 || card <= 0 || Math.abs(cash + card - cartTotal) > 0.01) {
                  addToast({
                    message: t('مجموع الدفع النقدي والبطاقة يجب أن يساوي إجمالي الفاتورة وأن يكون كلاهما أكبر من الصفر'),
                    variant: 'error',
                  })
                  return
                }
                setMixedAmounts(cash, card)
                setIsMixedModalOpen(false)
                addToast({ message: t('تم حفظ تقسيم الدفع المختلط بنجاح!'), variant: 'success' })
              }}
            >
              اعتماد التقسيم
            </Button>
          </div>
        </div>
      </Modal>

      <SessionLockModal isOpen={isLocked} onUnlock={() => setIsLocked(false)} />
    </>
  )
}
