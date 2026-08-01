import React from 'react'
import { Keyboard } from 'lucide-react'

interface ShortcutGroup {
  category: string
  shortcuts: Array<{ key: string; description: string }>
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const shortcutGroups: ShortcutGroup[] = [
  {
    category: 'واجهة البيع السريع (POS)',
    shortcuts: [
      { key: 'F2', description: 'إتمام البيع والدفع الفوري' },
      { key: 'F4', description: 'التركيز على مربع بحث السلع والباركود' },
      { key: 'F12', description: 'تعليق الطلب الحالي لحين عودة الزبون' },
      { key: 'ESC', description: 'تفريغ السلة وإلغاء الطلب الحالي' },
    ]
  },
  {
    category: 'الأوامر والنظام العام',
    shortcuts: [
      { key: 'Ctrl + K', description: 'فتح لوحة الأوامر والتنقل السريع (Command Palette)' },
      { key: '?', description: 'عرض دليل اختصارات الكيبورد الشامل' },
      { key: 'Esc', description: 'إغلاق أي نافذة منبثقة أو حوار' },
    ]
  },
  {
    category: 'الطباعة والسجلات',
    shortcuts: [
      { key: 'Ctrl + P', description: 'إعادة طباعة آخر فاتورة مبيعات' },
      { key: 'Ctrl + F', description: 'البحث المباشر في الجداول والقوائم' },
    ]
  }
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps): React.JSX.Element | null {
  if (!isOpen) return null

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[999999] bg-black/55 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        role="presentation"
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-layered-lg overflow-hidden p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-200/60 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-accent/10 dark:bg-accent/20 text-accent rounded-2xl flex items-center justify-center">
              <Keyboard className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#1C2B3A] dark:text-slate-100">اختصارات الكيبورد (Keyboard Shortcuts)</h2>
              <p className="text-xs text-[#6B7A8D] dark:text-slate-400">جميع الاختصارات السريعة المتاحة لزيادة سرعة الكاشير والعمليات</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-[#6B7A8D] dark:text-slate-400 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {shortcutGroups.map((group, gIdx) => (
            <div key={gIdx} className="bg-gray-50/70 dark:bg-slate-800/40 rounded-2xl p-4 border border-gray-200/50 dark:border-slate-800/60">
              <h3 className="text-xs font-bold text-accent dark:text-accent-light uppercase tracking-wider mb-3">
                {group.category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {group.shortcuts.map((sc, sIdx) => (
                  <div
                    key={sIdx}
                    className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-slate-800 shadow-layered-sm"
                  >
                    <span className="text-xs font-medium text-[#1C2B3A] dark:text-slate-200">{sc.description}</span>
                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-xs font-mono font-bold text-accent dark:text-slate-300 rounded-lg border border-gray-300/60 dark:border-slate-700 shadow-inner flex-shrink-0">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-3 border-t border-gray-200/60 dark:border-slate-800 flex justify-between items-center text-xs text-[#6B7A8D] dark:text-slate-400">
          <span>يمكنك الضغط على <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 rounded font-mono border">?</kbd> في أي وقت لإظهار هذه النافذة</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl shadow-hero-glow transition-all active:scale-[0.98]"
          >
            موافق
          </button>
        </div>
      </div>
    </div>
  )
}
