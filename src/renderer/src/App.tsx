import React, { useState } from 'react'
import { POSCheckoutPage } from '@/pages/POSCheckoutPage'
import { ProductsPage } from '@/pages/ProductsPage'

export function App(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<'pos' | 'products'>('pos')

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Top Page Switcher floating pill on non-active views or inside POS header */}
      {currentPage === 'products' ? (
        <ProductsPage onNavigateToPos={() => setCurrentPage('pos')} />
      ) : (
        <div className="relative h-full flex flex-col">
          {/* Injecting navigation link into POS Header via wrapper or button */}
          <div className="absolute top-3.5 left-56 z-20">
            <button
              onClick={() => setCurrentPage('products')}
              className="px-3 py-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-border-light text-xs font-bold text-text-primary hover:bg-white hover:text-accent shadow-ambient-sm transition-all duration-200 btn-press"
            >
              📦 إدارة المنتجات والمخزون
            </button>
          </div>
          <POSCheckoutPage />
        </div>
      )}
    </div>
  )
}

export default App
