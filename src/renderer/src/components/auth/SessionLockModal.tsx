import React, { useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'
import { Modal } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'

interface SessionLockModalProps {
  readonly isOpen: boolean
  readonly onUnlock: () => void
}

export function SessionLockModal({ isOpen, onUnlock }: SessionLockModalProps): React.JSX.Element | null {
  const currentUser = useAuthStore((s) => s.currentUser)
  const addToast = useToastStore((s) => s.addToast)

  const [pin, setPin] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !currentUser) return null

  const handleNumClick = (num: string): void => {
    if (pin.length < 6) {
      setPin((prev) => prev + num)
      setError(null)
    }
  }

  const handleDelete = (): void => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  const handleUnlock = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (!pin || pin.length < 4) {
      setError('يرجى إدخال رمز PIN المكون من 4 إلى 6 أرقام')
      return
    }

    setIsVerifying(true)
    setError(null)
    try {
      const res = await window.electron.verifyPin(pin, currentUser.id)
      if (res) {
        setPin('')
        addToast({ message: 'تم فتح الشاشة وإلغاء القفل بنجاح', variant: 'success' })
        onUnlock()
      } else {
        setError('رمز PIN غير صحيح، يرجى المحاولة مجدداً')
        setPin('')
      }
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[SessionLockModal]", err); setError('حدث خطأ أثناء التحقق من الرمز')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="" size="md">
      <div className="py-4 px-2 space-y-6 text-center select-none">
        {/* Avatar & Header */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center text-accent mb-3 shadow-ambient">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-text-primary">الشاشة مقفولة لحماية الخصوصية</h2>
          <p className="text-xs font-bold text-text-secondary mt-1">
            أهلاً <span className="text-accent">{currentUser.full_name}</span>، أدخل رمز الـ PIN لإلغاء القفل
          </p>
        </div>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 dir-ltr">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > idx
                  ? 'bg-accent border-accent scale-110 shadow-ambient-sm'
                  : 'border-gray-300 bg-gray-50'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-bold flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              type="button"
              key={num}
              onClick={() => handleNumClick(num)}
              className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200/80 active:bg-accent active:text-white text-lg font-black text-text-primary transition-all btn-press shadow-ambient-sm"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-text-secondary transition-all btn-press"
          >
            مسح
          </button>
          <button
            type="button"
            onClick={() => handleNumClick('0')}
            className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-accent active:text-white text-lg font-black text-text-primary transition-all btn-press shadow-ambient-sm"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleUnlock()}
            disabled={isVerifying || pin.length < 4}
            className="py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white text-xs font-black shadow-ambient transition-all btn-press disabled:opacity-50"
          >
            دخول
          </button>
        </div>
      </div>
    </Modal>
  )
}
