import React, { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  isDirty?: boolean
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  isDirty = false,
}: ModalProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [isDirty, onClose])

  // Focus trap & Escape listener
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleRequestClose()
        return
      }

      if (e.key === 'Tab' && contentRef.current) {
        const focusables = contentRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [handleRequestClose]
  )

  const hasFocusedOnOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'

      if (!hasFocusedOnOpenRef.current && contentRef.current) {
        hasFocusedOnOpenRef.current = true
        const firstEditable = contentRef.current.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, select, button:not([aria-label])'
        )
        if (firstEditable) {
          firstEditable.focus()
        } else {
          const fallback = contentRef.current.querySelector<HTMLElement>('button')
          if (fallback) fallback.focus()
        }
      }
    } else {
      hasFocusedOnOpenRef.current = false
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          handleRequestClose()
        }
      }}
    >
      {/* Dimmed & Blurred Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-150 animate-fade-in" />

      {/* Modal Card with scale(0.96)->scale(1) entrance */}
      <div
        ref={contentRef}
        tabIndex={-1}
        className={[
          'relative w-full bg-white dark:bg-slate-900 rounded-3xl shadow-layered-deep border border-white/20 dark:border-slate-800',
          'transition-all duration-150 transform animate-scale-in',
          'focus:outline-none overflow-hidden z-10',
          sizeStyles[size],
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
            <h2 className="text-base font-black text-[#1C2B3A] dark:text-slate-100 tracking-tight">{title}</h2>
            <button
              onClick={handleRequestClose}
              className="p-2 rounded-xl text-[#6B7A8D] dark:text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors btn-press focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="إغلاق النافذة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="p-6 max-h-[85vh] overflow-y-auto">{children}</div>
      </div>

      {/* Discard Unsaved Changes Confirmation Overlay */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-layered-deep border border-gray-200 dark:border-slate-800 space-y-4 text-center animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto border border-warning/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#1C2B3A] dark:text-slate-100">تجاهل التغييرات؟</h3>
              <p className="text-xs font-medium text-[#6B7A8D] dark:text-slate-400 mt-1">
                توجد بيانات غير محفوظة في النموذج. هل أنت تأكد من رغبتك في الإغلاق وتجاهل التعديلات؟
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl bg-gray-100 dark:bg-slate-800 text-[#1C2B3A] dark:text-slate-200 text-xs font-extrabold hover:bg-gray-200 transition-colors"
              >
                متابعة التعديل
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false)
                  onClose()
                }}
                className="flex-1 py-2.5 rounded-2xl bg-danger text-white text-xs font-extrabold hover:bg-danger-hover transition-colors shadow-sm btn-press"
              >
                تجاهل وتأكيد الإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
