import React, { useState, useEffect } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { Store, ShieldCheck, Printer, CheckCircle2, Sparkles } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'
import { recordAuditLog } from '@/services/auditLogService'

export function FirstRunWizardModal(): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [step, setStep] = useState<number>(1)

  // Step 1: Store Info
  const [storeName, setStoreName] = useState<string>('بوتيك الملاح للملابس')
  const [storePhone, setStorePhone] = useState<string>('0550000000')

  // Step 2: Admin PIN
  const [adminPin, setAdminPin] = useState<string>('1234')

  // Step 3: Thermal Printer
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm')
  const [printers, setPrinters] = useState<Array<{ name: string; isDefault: boolean }>>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>('')

  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    const isCompleted = localStorage.getItem('mellah_first_run_completed') === 'true'
    if (!isCompleted) {
      setIsOpen(true)
      // Fetch available printers
      if (window.electron?.getPrinters) {
        window.electron.getPrinters().then((list) => {
          setPrinters(list)
          const def = list.find((p) => p.isDefault)
          if (def) setSelectedPrinter(def.name)
        }).catch(() => {})
      }
    }
  }, [])

  if (!isOpen) return null

  const handleFinish = async (): Promise<void> => {
    try {
      const now = new Date().toISOString()
      // 1. Save store settings to DB
      const branchId = 'b1111111-1111-4111-8111-111111111111'
      await window.electron.db.execute(
        `INSERT INTO store_settings (branch_id, store_name, store_phone, default_language, updated_at)
         VALUES (?, ?, ?, 'ar', ?)
         ON CONFLICT(branch_id) DO UPDATE SET
           store_name=excluded.store_name,
           store_phone=excluded.store_phone,
           updated_at=excluded.updated_at`,
        [branchId, storeName.trim(), storePhone.trim() || null, now]
      )

      // 2. Update Admin user's PIN if valid
      if (adminPin.trim().length >= 4) {
        const hashedPin = await window.electron.hashPin(adminPin.trim())
        await window.electron.db.execute(
          `UPDATE users SET pin_hash = ?, updated_at = ? WHERE role = 'admin'`,
          [hashedPin, now]
        )
      }
    } catch {
      // Fallback
    }

    localStorage.setItem('mellah_store_name', storeName)
    localStorage.setItem('mellah_store_phone', storePhone)
    localStorage.setItem('mellah_paper_width', paperWidth)
    if (selectedPrinter) {
      localStorage.setItem('mellah_printer_name', selectedPrinter)
    }
    localStorage.setItem('mellah_first_run_completed', 'true')

    await recordAuditLog('first_run_setup', 'system', `تمت تهيئة النظام بنجاح لمتجر "${storeName}"`)

    addToast({
      message: `مرحباً بك في Mellah POS! تمت تهيئة المتجر (${storeName}) بنجاح.`,
      variant: 'success',
      duration: 5000,
    })

    setIsOpen(false)
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="🧙‍♂️ مرحباً بك! معالج الإعداد التلقائي لأول مرة">
      <div className="space-y-6 select-none dir-rtl">
        {/* Step Indicator Badges */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200 text-xs font-bold">
          <span className={`flex items-center gap-1.5 ${step === 1 ? 'text-accent font-black' : 'text-text-tertiary'}`}>
            <Store className="w-4 h-4" /> 1. بيانات المتجر
          </span>
          <span className={`flex items-center gap-1.5 ${step === 2 ? 'text-accent font-black' : 'text-text-tertiary'}`}>
            <ShieldCheck className="w-4 h-4" /> 2. أمان الأدمن
          </span>
          <span className={`flex items-center gap-1.5 ${step === 3 ? 'text-accent font-black' : 'text-text-tertiary'}`}>
            <Printer className="w-4 h-4" /> 3. طابعة الفواتير
          </span>
        </div>

        {/* STEP 1: STORE DETAILS */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-accent/10 text-accent rounded-xl text-xs font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>مرحباً بك في نظام الملاح POS! يرجى إدخال معلومات محلك التجاري.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">اسم المتجر / المحل:</label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثلاً: بوتيك الملاح للملابس"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">رقم الهاتف للطباعة بالفاتورة:</label>
              <Input
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="05XXXXXXXX"
              />
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (!storeName.trim()) {
                    addToast({ message: 'يرجى كتابة اسم المتجر', variant: 'error' })
                    return
                  }
                  setStep(2)
                }}
              >
                المتابعة للخطوة التالية
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: ADMIN SECURITY */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 text-amber-900 rounded-xl text-xs font-bold border border-amber-200">
              سيتم استخدام رمز الـ PIN لحماية الحساب الإداري وإلغاء قفل الجلسة والتقارير.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">رمز PIN الإداري (افتراضي: 1234):</label>
              <Input
                type="password"
                maxLength={6}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="****"
              />
            </div>

            <div className="flex justify-between pt-3">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                السابق
              </Button>
              <Button type="button" variant="primary" onClick={() => setStep(3)}>
                المتابعة لاختيار الطابعة
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: PRINTER CONFIGURATION */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-primary">عرض ورق الطابعة الحرارية:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaperWidth('80mm')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paperWidth === '80mm' ? 'bg-accent text-white border-accent' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <Printer className="w-5 h-5" />
                  <span>طابعة قياسية 80mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth('58mm')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    paperWidth === '58mm' ? 'bg-accent text-white border-accent' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <Printer className="w-5 h-5" />
                  <span>طابعة صغيرة 58mm</span>
                </button>
              </div>
            </div>

            {printers.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">اختر طابعة الفواتير الحرارية:</label>
                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200"
                >
                  <option value="">الطابعة الافتراضية للوندوز</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-between pt-3">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                السابق
              </Button>
              <Button type="button" variant="primary" onClick={handleFinish} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>إكمال الإعداد وبدء البيع!</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
