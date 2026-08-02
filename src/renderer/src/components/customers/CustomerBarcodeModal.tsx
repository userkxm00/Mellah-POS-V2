import React from 'react'
import { Printer, Eye, X, CheckCircle2 } from 'lucide-react'
import { Modal, Button } from '@/components/ui'
import { useLanguageStore } from '@/stores/languageStore'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useToastStore } from '@/stores/toastStore'
import { generateBarcodeSvg, printCustomerCardLabel } from '@/services/receiptService'

interface CustomerBarcodeModalProps {
  isOpen: boolean
  onClose: () => void
  customer: {
    full_name: string
    phone?: string | null
    barcode?: string | null
    loyalty_points?: number
  } | null
}

export const CustomerBarcodeModal: React.FC<CustomerBarcodeModalProps> = ({
  isOpen,
  onClose,
  customer,
}) => {
  const t = useLanguageStore((s) => s.t)
  const storeSettings = useStoreSettingsStore((s) => s.settings)
  const addToast = useToastStore((s) => s.addToast)
  const [isPrinting, setIsPrinting] = React.useState<boolean>(false)

  if (!customer) return null

  const customerBarcode = customer.barcode || '9900000001'
  const barcodeSvg = generateBarcodeSvg(customerBarcode)

  const handlePrint = async (): Promise<void> => {
    setIsPrinting(true)
    try {
      const success = await printCustomerCardLabel(
        {
          customerName: customer.full_name,
          customerPhone: customer.phone,
          barcode: customerBarcode,
          loyaltyPoints: customer.loyalty_points,
        },
        storeSettings,
        storeSettings.label_printer_name || undefined
      )

      if (success) {
        addToast({
          message: `${t('تم إرسال ملصق الزبون للطابعة الحرارية بنجاح')} (${storeSettings.label_printer_name || t('الطابعة الافتراضية')})`,
          variant: 'success',
        })
        onClose()
      } else {
        addToast({
          message: t('تعذر إرسال ملصق الزبون إلى طابعة الباركود'),
          variant: 'warning',
        })
      }
    } catch (err) {
      addToast({
        message: t('حدث خطأ أثناء الطباعة الحرارية'),
        variant: 'error',
      })
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('معاينة وطباعة ملصق الباركود للزبون (40mm × 30mm)')}
      size="md"
    >
      <div className="space-y-6 py-2">
        {/* Live Sticker Preview Card */}
        <div className="flex flex-col items-center justify-center p-6 bg-gray-100 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
          <div className="text-xs font-bold text-text-tertiary mb-2 flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-accent" />
            <span>{t('معاينة حية على حجم الملصق الحراري (40mm × 30mm)')}</span>
          </div>

          {/* 40mm x 30mm Compact Simulated Label Frame */}
          <div className="w-[180px] h-[135px] bg-white text-black p-2 rounded border-2 border-dashed border-gray-300 shadow-md flex flex-col justify-between items-center text-center select-none font-sans overflow-hidden">
            <div className="w-full text-[9.5px] font-black border-b border-black pb-0.5 tracking-tight truncate">
              {storeSettings.store_name}
            </div>

            <div className="w-full my-0.5">
              <div className="text-[11px] font-black leading-tight truncate">{customer.full_name}</div>
              {customer.phone && (
                <div className="text-[8.5px] font-mono font-extrabold text-gray-800">{customer.phone}</div>
              )}
            </div>

            {/* High-Density Barcode SVG */}
            <div
              className="w-full flex items-center justify-center my-0.5"
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            />

            {storeSettings.loyalty_enabled && customer.loyalty_points !== undefined && (
              <div className="text-[8px] font-black bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300">
                النقاط: {customer.loyalty_points} نقطة
              </div>
            )}
          </div>
        </div>

        {/* Printer Selection Status Info */}
        <div className="p-3.5 rounded-xl bg-accent/5 border border-accent/20 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-accent" />
            <span className="font-bold text-text-secondary">{t('طابعة الملصقات المحددة:')}</span>
            <span className="font-black text-accent">
              {storeSettings.label_printer_name || t('الطابعة الافتراضية (Default Printer)')}
            </span>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 ml-1" />
            {t('إلغاء')}
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Printer className="w-4 h-4 ml-1" />
            {t('طباعة الملصق الحراري')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
