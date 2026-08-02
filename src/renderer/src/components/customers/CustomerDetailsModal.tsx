import React from 'react'
import { Phone, Barcode, CreditCard, Printer, History, Edit3, X } from 'lucide-react'
import { Modal, Button } from '@/components/ui'
import { useLanguageStore } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { formatCurrency } from '@/lib/format'

export interface CustomerDetailsItem {
  id: string
  full_name: string
  phone: string | null
  barcode: string | null
  loyalty_points: number
  store_credit_balance: number
  total_debt_dzd: number
  created_at: string
  total_spent_dzd: number
  total_sales_count: number
}

interface CustomerDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  customer: CustomerDetailsItem | null
  onOpenBarcodeModal: (customer: CustomerDetailsItem) => void
  onPayDebt: (customer: CustomerDetailsItem) => void
  onEditCustomer: (customer: CustomerDetailsItem) => void
  onViewHistory: (customer: CustomerDetailsItem) => void
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  isOpen,
  onClose,
  customer,
  onOpenBarcodeModal,
  onPayDebt,
  onEditCustomer,
  onViewHistory,
}) => {
  const t = useLanguageStore((s) => s.t)
  const storeSettings = useStoreSettingsStore((s) => s.settings)

  if (!customer) return null

  const spent = customer.total_spent_dzd || 0
  const tier =
    spent >= 500000
      ? { label: t('عضوية VIP'), color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' }
      : spent >= 200000
        ? { label: t('عضوية ذهبية'), color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
        : spent >= 50000
          ? { label: t('عضوية فضية'), color: 'bg-slate-500/10 text-slate-600 border-slate-500/20' }
          : { label: t('عضوية عادية'), color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('الملف الشخصي للزبون:')} ${customer.full_name}`}
      size="lg"
    >
      <div className="space-y-6 py-2">
        {/* Header Profile Summary */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700">
          <div className="w-14 h-14 rounded-2xl bg-accent text-white font-black text-xl flex items-center justify-center shadow-ambient">
            {customer.full_name.charAt(0)}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-text-primary dark:text-slate-100">{customer.full_name}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-text-tertiary">
              <span className="flex items-center gap-1 font-mono">
                <Phone className="w-3.5 h-3.5" />
                {customer.phone || t('بدون رقم هاتف')}
              </span>
              <span className="flex items-center gap-1 font-mono text-accent">
                <Barcode className="w-3.5 h-3.5" />
                {customer.barcode || t('بدون باركود')}
              </span>
            </div>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-accent/5 border border-accent/20">
            <p className="text-[11px] font-bold text-text-tertiary mb-1">{t('إجمالي المشتريات')}</p>
            <p className="text-lg font-black text-accent">{formatCurrency(spent)}</p>
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">{t('عدد الزيارات')}</p>
            <p className="text-lg font-black text-blue-600 dark:text-blue-400">{customer.total_sales_count} {t('زيارات')}</p>
          </div>

          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mb-1">{t('الديون المستحقة')}</p>
            <p className="text-lg font-black text-red-600 dark:text-red-400">{formatCurrency(customer.total_debt_dzd)}</p>
          </div>

          {storeSettings.loyalty_enabled ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1">{t('نقاط الولاء')}</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400">{customer.loyalty_points} {t('نقطة')}</p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">{t('رصيد المتجر')}</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(customer.store_credit_balance)}</p>
            </div>
          )}
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onOpenBarcodeModal(customer)
            }}
            className="w-full flex items-center justify-center gap-2 py-3 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>{t('معاينة وطباعة ملصق الباركود')}</span>
          </Button>

          {customer.total_debt_dzd > 0 ? (
            <Button
              variant="primary"
              onClick={() => {
                onClose()
                onPayDebt(customer)
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              <CreditCard className="w-4 h-4" />
              <span>{t('تسديد الدين الخالي')} ({formatCurrency(customer.total_debt_dzd)})</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                onClose()
                onViewHistory(customer)
              }}
              className="w-full flex items-center justify-center gap-2 py-3 font-bold"
            >
              <History className="w-4 h-4" />
              <span>{t('عرض سجل المعاملات')}</span>
            </Button>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-800 pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onEditCustomer(customer)
            }}
            className="flex items-center gap-1.5 text-xs text-warning font-bold"
          >
            <Edit3 className="w-4 h-4" />
            <span>{t('تعديل بيانات الزبون')}</span>
          </Button>

          <Button variant="secondary" onClick={onClose}>
            <X className="w-4 h-4 ml-1" />
            {t('إغلاق')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
