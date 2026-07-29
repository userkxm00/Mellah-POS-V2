import React, { useEffect, useState, useMemo, useRef } from 'react'

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: 'ملاحة' | 'منتجات' | 'زبائن' | 'إجراءات سريعة'
  icon: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (path: string) => void
}

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [products, setProducts] = useState<Array<{ id: string; name: string; barcode: string; price: number }>>([])
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch quick products/customers on mount/open
  useEffect(() => {
    if (!isOpen) return

    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)

    let isMounted = true
    const fetchData = async () => {
      try {
        if (window.electron?.db) {
          const prods = await window.electron.db.query<{ id: string; name: string; barcode: string; price: number }>(
            `SELECT id, name, COALESCE(barcode, '') as barcode, price FROM products LIMIT 50`
          )
          const custs = await window.electron.db.query<{ id: string; name: string; phone: string }>(
            `SELECT id, name, COALESCE(phone, '') as phone FROM customers LIMIT 30`
          )
          if (isMounted) {
            setProducts(prods)
            setCustomers(custs)
          }
        }
      } catch (err) {// eslint-disable-next-line no-console
      console.error("[CommandPalette]", err); // Fallback gracefully
      }
    }
    fetchData()
    return () => { isMounted = false }
  }, [isOpen])

  // Static navigation items
  const staticItems: CommandItem[] = useMemo(() => [
    {
      id: 'nav-pos',
      title: 'واجهة البيع السريع (POS)',
      subtitle: 'الانتقال إلى كاشير البيع وإصدار الفواتير',
      category: 'ملاحة',
      icon: '🛒',
      action: () => { onNavigate?.('/pos'); onClose() }
    },
    {
      id: 'nav-products',
      title: 'إدارة المنتجات والمخزون',
      subtitle: 'عرض السلع والأثمنة وتعديل الستوك',
      category: 'ملاحة',
      icon: '📦',
      action: () => { onNavigate?.('/products'); onClose() }
    },
    {
      id: 'nav-customers',
      title: 'الزبائن والديون (Ledger)',
      subtitle: 'إدارة حسابات الزبائن وتسديد الديون',
      category: 'ملاحة',
      icon: '👤',
      action: () => { onNavigate?.('/customers'); onClose() }
    },
    {
      id: 'nav-reports',
      title: 'التقارير والتحليلات المالية',
      subtitle: 'مؤشرات الأرباح والمبيعات الحية',
      category: 'ملاحة',
      icon: '📊',
      action: () => { onNavigate?.('/reports'); onClose() }
    },
    {
      id: 'nav-sales',
      title: 'سجل المبيعات والفواتير',
      subtitle: 'استعراض الفواتير وإعادة الطباعة',
      category: 'ملاحة',
      icon: '🧾',
      action: () => { onNavigate?.('/sales'); onClose() }
    },
    {
      id: 'nav-settings',
      title: 'إعدادات النظام والنسخ الاحتياطي',
      subtitle: 'تخصيص المظهر، الصوت والباكاب التلقائي',
      category: 'ملاحة',
      icon: '⚙️',
      action: () => { onNavigate?.('/settings'); onClose() }
    },
    {
      id: 'action-add-prod',
      title: 'إضافة منتج جديد',
      subtitle: 'فتح نافذة إضافة سلعة جديدة للمحل',
      category: 'إجراءات سريعة',
      icon: '➕',
      action: () => { onNavigate?.('/products/new'); onClose() }
    },
    {
      id: 'action-maintenance',
      title: 'الصيانة والتحديثات',
      subtitle: 'فحص سلامة قاعدة البيانات والتحديث الذاتي',
      category: 'إجراءات سريعة',
      icon: '🔧',
      action: () => { onNavigate?.('/maintenance'); onClose() }
    }
  ], [onNavigate, onClose])

  // Filtered list based on search query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staticItems

    const navMatches = staticItems.filter(
      item => item.title.toLowerCase().includes(q) || (item.subtitle && item.subtitle.toLowerCase().includes(q))
    )

    const prodMatches: CommandItem[] = products
      .filter(p => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
      .slice(0, 8)
      .map(p => ({
        id: `prod-${p.id}`,
        title: p.name,
        subtitle: `باركود: ${p.barcode || '—'} | السعر: ${p.price} د.ج`,
        category: 'منتجات',
        icon: '🏷️',
        action: () => { onNavigate?.(`/products/${p.id}`); onClose() }
      }))

    const custMatches: CommandItem[] = customers
      .filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      .slice(0, 5)
      .map(c => ({
        id: `cust-${c.id}`,
        title: c.name,
        subtitle: `الهاتف: ${c.phone || '—'}`,
        category: 'زبائن',
        icon: '📱',
        action: () => { onNavigate?.('/customers'); onClose() }
      }))

    return [...navMatches, ...prodMatches, ...custMatches]
  }, [query, staticItems, products, customers, onNavigate, onClose])

  // Handle keyboard arrow navigation inside Command Palette
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredItems, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-md flex items-start justify-center pt-20 px-4 animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-hero-glow overflow-hidden flex flex-col max-h-[80vh] transition-all duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Search Input */}
        <div className="p-4 border-b border-gray-200/70 dark:border-slate-800/80 flex items-center gap-3 bg-gray-50/50 dark:bg-slate-800/40">
          <span className="text-xl text-text-tertiary">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="ابحث عن صفحة، منتج، زبون، أو إجراء سريع... (Ctrl+K)"
            className="flex-1 bg-transparent border-none outline-none text-base font-medium text-[#1C2B3A] dark:text-slate-100 placeholder-[#6B7A8D] dark:placeholder-slate-500"
          />
          <kbd className="hidden sm:inline-block px-2.5 py-1 bg-gray-200/60 dark:bg-slate-800 text-xs font-mono font-semibold text-text-secondary dark:text-slate-400 rounded-lg border border-gray-300/60 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-[#6B7A8D] dark:text-slate-400">
              <p className="text-sm font-medium">لم يتم العثور على أي نتائج مطابقة لـ "{query}"</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-accent/10 dark:bg-accent/20 border border-accent/30 text-accent font-semibold shadow-layered-sm'
                      : 'hover:bg-gray-100/80 dark:hover:bg-slate-800/60 text-[#1C2B3A] dark:text-slate-200'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{item.title}</p>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-200/50 dark:bg-slate-800 text-[#6B7A8D] dark:text-slate-400 flex-shrink-0">
                        {item.category}
                      </span>
                    </div>
                    {item.subtitle && (
                      <p className="text-xs text-[#6B7A8D] dark:text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2.5 bg-gray-100/60 dark:bg-slate-800/60 border-t border-gray-200/60 dark:border-slate-800 flex items-center justify-between text-xs text-[#6B7A8D] dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded shadow-layered-sm">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded shadow-layered-sm">↓</kbd> للتنقل</span>
            <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded shadow-layered-sm">↵</kbd> للاختيار</span>
          </div>
          <span>اضغط <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border rounded shadow-layered-sm">Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </div>
  )
}
