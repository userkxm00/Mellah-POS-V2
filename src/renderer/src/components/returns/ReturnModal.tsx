import React, { useState } from 'react'
import { Search, Banknote, Tag, RefreshCw } from 'lucide-react'
import { Modal, Button, Input, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import { lookupSaleForReturn, processReturn, type SaleReturnLookupResult, type SaleReturnLookupItem } from '@/services/returnService'
import { printThermalReturnReceipt } from '@/services/receiptService'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { formatCurrency } from '@/lib/format'
import { useToastStore } from '@/stores/toastStore'

interface ReturnModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSuccess: () => void
}

export function ReturnModal({ isOpen, onClose, onSuccess }: ReturnModalProps): React.JSX.Element | null {
  const [saleInput, setSaleInput] = useState<string>('')
  const [saleData, setSaleData] = useState<SaleReturnLookupResult | null>(null)
  const [returnQtyMap, setReturnQtyMap] = useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = useState<'cash' | 'store_credit' | 'exchange'>('cash')
  const [reason, setReason] = useState<string>('')
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)
  const storeSettings = useStoreSettingsStore((s) => s.settings)

  const handleSearchSale = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!saleInput.trim()) return

    setIsSearching(true)
    try {
      const data = await lookupSaleForReturn(saleInput)
      setSaleData(data)
      // Initialize return quantities to 0
      const initialMap: Record<string, number> = {}
      for (const item of data.items) {
        initialMap[item.variant_id] = 0
      }
      setReturnQtyMap(initialMap)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل البحث عن الوصل'
      addToast({ message: msg, variant: 'error' })
      setSaleData(null)
    } finally {
      setIsSearching(false)
    }
  }

  const handleQuantityChange = (variantId: string, qty: number, max: number): void => {
    const val = Math.max(0, Math.min(qty, max))
    setReturnQtyMap((prev) => ({ ...prev, [variantId]: val }))
  }

  const calculateTotalRefund = (): number => {
    if (!saleData) return 0
    return saleData.items.reduce((acc, item) => {
      const qty = returnQtyMap[item.variant_id] || 0
      return acc + item.unit_price_dzd * qty
    }, 0)
  }

  const handleConfirmReturn = async (): Promise<void> => {
    if (!saleData) return
    const totalRefund = calculateTotalRefund()
    if (totalRefund <= 0) {
      addToast({ message: 'يرجى تحديد كمية منتج واحد على الأقل لإرجاعه', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const returnItems = Object.entries(returnQtyMap).map(([variant_id, quantity]) => {
        const item = saleData.items.find((i) => i.variant_id === variant_id)
        return {
          variant_id,
          quantity,
          unit_price_dzd: item?.unit_price_dzd ?? 0,
        }
      })

      const returnId = await processReturn(saleData.sale_id, returnItems, refundMethod, reason)

      // Print Thermal Return Receipt
      const printerName = localStorage.getItem('mellah_printer_name') ?? undefined
      const paperWidth = (localStorage.getItem('mellah_paper_width') as '80mm' | '58mm') ?? '80mm'
      printThermalReturnReceipt(
        {
          storeName: storeSettings.store_name,
          returnId,
          originalSaleId: saleData.sale_id,
          date: new Date().toISOString(),
          cashierName: saleData.cashier_name,
          items: returnItems.map((ri) => {
            const matched = saleData.items.find((item) => item.variant_id === ri.variant_id)
            return {
              product_name: matched?.product_name ?? 'منتج',
              size: matched?.size,
              color: matched?.color,
              quantity: ri.quantity,
              unit_price: ri.unit_price_dzd,
            }
          }),
          refundTotalDzd: totalRefund,
          refundMethod,
          reason: reason.trim() || 'مرتجع بضاعة',
        },
        { printerName, paperWidth }
      ).catch(() => {
        addToast({
          message: 'تعذرت طباعة وصل المرتجع — تم تسجيل المرتجع بنجاح، يمكنك إعادة الطباعة من سجل المرتجعات',
          variant: 'warning',
          duration: 6000,
        })
      })

      addToast({
        message: `تم تسجيل المرتجع وتوليد وصل الإرجاع الحراري بنجاح! 🧾`,
        variant: 'success',
      })
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسوية المرتجع'
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const itemColumns: Column<SaleReturnLookupItem>[] = [
    {
      key: 'product_name',
      header: 'المنتج والخيار',
      render: (row) => (
        <div>
          <p className="font-bold text-text-primary text-xs">{row.product_name}</p>
          <p className="text-[11px] text-text-tertiary">
            {row.size ? `مقاس: ${row.size} ` : ''}
            {row.color ? `لون: ${row.color}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'unit_price_dzd',
      header: 'سعر الشراء',
      render: (row) => <span className="currency font-bold text-xs">{formatCurrency(row.unit_price_dzd)}</span>,
    },
    {
      key: 'quantity_purchased',
      header: 'الكمية المباعة',
      render: (row) => <span className="text-xs font-semibold">{row.quantity_purchased}</span>,
    },
    {
      key: 'max_returnable',
      header: 'المتاح للإرجاع',
      render: (row) => (
        <span
          className={`text-xs font-bold ${
            row.max_returnable === 0 ? 'text-danger' : 'text-success'
          }`}
        >
          {row.max_returnable} قطعة
        </span>
      ),
    },
    {
      key: 'return_qty',
      header: 'الكمية المراد إرجاعها',
      render: (row) => {
        const currentQty = returnQtyMap[row.variant_id] || 0
        return (
          <input
            type="number"
            min="0"
            max={row.max_returnable}
            disabled={row.max_returnable === 0}
            value={currentQty}
            onChange={(e) =>
              handleQuantityChange(
                row.variant_id,
                Number.parseInt(e.target.value, 10) || 0,
                row.max_returnable
              )
            }
            className="w-20 px-2 py-1 rounded border border-border text-xs font-bold text-accent bg-white"
          />
        )
      },
    },
  ]

  const totalRefund = calculateTotalRefund()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إرجاع بضاعة واسترداد مبلغ (Return & Refund)" size="lg">
      <div className="space-y-5">
        {/* Receipt Lookup Form */}
        <form onSubmit={handleSearchSale} className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="ابحث برقم الوصل (Receipt ID / Barcode)"
              placeholder="أدخل رقم الوصل أو امسح الباركود..."
              value={saleInput}
              onChange={(e) => setSaleInput(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button type="submit" variant="primary" loading={isSearching} className="flex items-center gap-1.5">
            <Search className="w-4 h-4" />
            <span>بحث</span>
          </Button>
        </form>

        {/* Sale Summary & Items Table */}
        {saleData && (
          <div className="space-y-4 pt-2 border-t border-border-light">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-border-light text-xs">
              <div>
                <span className="text-text-tertiary">الكاشير: </span>
                <span className="font-bold text-text-primary">{saleData.cashier_name}</span>
              </div>
              <div>
                <span className="text-text-tertiary">التاريخ: </span>
                <span className="font-mono text-text-primary">
                  {new Date(saleData.created_at).toLocaleString('ar-DZ')}
                </span>
              </div>
              <div>
                <span className="text-text-tertiary">طريقة الدفع: </span>
                <span className="font-bold text-accent">{saleData.payment_method}</span>
              </div>
            </div>

            <Table
              columns={itemColumns}
              data={saleData.items}
              rowKey={(row) => row.variant_id}
            />

            {/* Refund options */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary">طريقة الاسترداد:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border btn-press flex items-center gap-1.5 ${
                      refundMethod === 'cash'
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-text-secondary border-border'
                    }`}
                    onClick={() => setRefundMethod('cash')}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>إرجاع نقداً (كاش)</span>
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border btn-press flex items-center gap-1.5 ${
                      refundMethod === 'store_credit'
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-text-secondary border-border'
                    }`}
                    onClick={() => setRefundMethod('store_credit')}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>رصيد متجر (Store Credit)</span>
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border btn-press flex items-center gap-1.5 ${
                      refundMethod === 'exchange'
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-text-secondary border-border'
                    }`}
                    onClick={() => setRefundMethod('exchange')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>استبدال (Exchange)</span>
                  </button>
                </div>
              </div>

              <Input
                label="سبب الإرجاع"
                placeholder="مثال: مقاس غير مناسب، عيب تصنيع..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              {/* Total Refund Display */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-accent-light border border-accent/20">
                <span className="text-sm font-bold text-text-primary">إجمالي المبلغ المسترد:</span>
                <span className="currency-lg text-accent text-xl">{formatCurrency(totalRefund)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                className="flex-1"
                disabled={totalRefund <= 0}
                loading={isSubmitting}
                onClick={handleConfirmReturn}
              >
                ✓ تأكيد الإرجاع واستعادة البضاعة للمخزون
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
