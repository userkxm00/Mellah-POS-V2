
export interface ReceiptItem {
  product_name: string
  size?: string | null
  color?: string | null
  quantity: number
  unit_price: number
}

export interface ReceiptData {
  storeName: string
  branchAddress?: string
  receiptId: string
  date: string
  cashierName: string
  customerName?: string
  items: ReceiptItem[]
  subtotalDzd?: number
  discountDzd?: number
  totalDzd: number
  paymentMethod: string
  footerText?: string
}

export type ReceiptLanguage = 'ar' | 'fr' | 'en'

export interface ReceiptPrintOptions {
  printerName?: string
  paperWidth?: '80mm' | '58mm'
  language?: ReceiptLanguage
}

export const RECEIPT_TRANSLATIONS: Record<ReceiptLanguage, {
  receiptTitle: string
  receiptNo: string
  date: string
  cashier: string
  customer: string
  item: string
  qty: string
  price: string
  subtotal: string
  discount: string
  total: string
  paymentMethod: string
  cash: string
  card: string
  split: string
  dir: 'rtl' | 'ltr'
  alignStart: string
  alignEnd: string
  defaultFooter: string
}> = {
  ar: {
    receiptTitle: 'فاتورة مبيعات',
    receiptNo: 'رقم الفاتورة',
    date: 'التاريخ',
    cashier: 'الكاشير',
    customer: 'الزبون',
    item: 'المنتج',
    qty: 'الكمية',
    price: 'السعر (DA)',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم الممنوح',
    total: 'الإجمالي النهائي',
    paymentMethod: 'طريقة الدفع',
    cash: 'نقداً',
    card: 'بطاقة CIB',
    split: 'مزدوج',
    dir: 'rtl',
    alignStart: 'right',
    alignEnd: 'left',
    defaultFooter: 'شكراً لزيارتكم! البضاعة المباعة ترجع أو تبدل خلال 7 أيام مع إحضار الفاتورة.',
  },
  fr: {
    receiptTitle: 'TICKET DE CAISSE',
    receiptNo: 'Ticket N°',
    date: 'Date',
    cashier: 'Caissier',
    customer: 'Client',
    item: 'Article',
    qty: 'Qté',
    price: 'Prix (DA)',
    subtotal: 'Sous-Total',
    discount: 'Remise Accordée',
    total: 'TOTAL NET',
    paymentMethod: 'Mode de Paiement',
    cash: 'Espèces',
    card: 'Carte CIB',
    split: 'Mixte',
    dir: 'ltr',
    alignStart: 'left',
    alignEnd: 'right',
    defaultFooter: 'Merci pour votre visite! Les articles peuvent être échangés sous 7 jours sur présentation du ticket.',
  },
  en: {
    receiptTitle: 'SALES RECEIPT',
    receiptNo: 'Receipt #',
    date: 'Date',
    cashier: 'Cashier',
    customer: 'Customer',
    item: 'Item',
    qty: 'Qty',
    price: 'Price (DA)',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'NET TOTAL',
    paymentMethod: 'Payment Method',
    cash: 'Cash',
    card: 'CIB Card',
    split: 'Split',
    dir: 'ltr',
    alignStart: 'left',
    alignEnd: 'right',
    defaultFooter: 'Thank you for shopping! Items can be returned or exchanged within 7 days with valid receipt.',
  },
}

export function generateBarcodeSvg(barcodeText: string): string {
  const safeText = (barcodeText || '').replace(/[^a-zA-Z0-9_-]/g, '')
  return `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 40px;">
    <rect width="200" height="60" fill="#ffffff" />
    <g fill="#000000">
      <rect x="10" y="5" width="4" height="40" />
      <rect x="18" y="5" width="2" height="40" />
      <rect x="24" y="5" width="6" height="40" />
      <rect x="34" y="5" width="2" height="40" />
      <rect x="40" y="5" width="4" height="40" />
      <rect x="48" y="5" width="8" height="40" />
      <rect x="60" y="5" width="2" height="40" />
      <rect x="66" y="5" width="4" height="40" />
      <rect x="74" y="5" width="6" height="40" />
      <rect x="84" y="5" width="2" height="40" />
      <rect x="90" y="5" width="4" height="40" />
      <rect x="98" y="5" width="2" height="40" />
      <rect x="104" y="5" width="6" height="40" />
      <rect x="114" y="5" width="4" height="40" />
      <rect x="122" y="5" width="2" height="40" />
      <rect x="128" y="5" width="8" height="40" />
      <rect x="140" y="5" width="2" height="40" />
      <rect x="146" y="5" width="6" height="40" />
      <rect x="156" y="5" width="4" height="40" />
      <rect x="164" y="5" width="2" height="40" />
      <rect x="170" y="5" width="6" height="40" />
      <rect x="180" y="5" width="4" height="40" />
      <rect x="188" y="5" width="2" height="40" />
    </g>
    <text x="100" y="55" font-size="9" text-anchor="middle" font-family="monospace" fill="#000000">${safeText}</text>
  </svg>`
}

export function buildReceiptHtml(
  data: ReceiptData,
  options?: ReceiptPrintOptions
): string {
  const paperWidth = options?.paperWidth ?? '80mm'
  const lang: ReceiptLanguage = options?.language ?? (localStorage.getItem('mellah_receipt_language') as ReceiptLanguage) ?? 'ar'
  const t = RECEIPT_TRANSLATIONS[lang] || RECEIPT_TRANSLATIONS.ar

  const bodyWidth = paperWidth === '58mm' ? '54mm' : '78mm'
  const fontSize = paperWidth === '58mm' ? '10px' : '11px'

  return `
    <!DOCTYPE html>
    <html dir="${t.dir}" lang="${lang}">
    <head>
      <meta charset="UTF-8" />
      <title>${t.receiptTitle} - ${data.receiptId}</title>
      <style>
        @page {
          size: ${paperWidth} auto;
          margin: 0;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: 8px 4px;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: ${fontSize};
          color: #000;
          line-height: 1.3;
          direction: ${t.dir};
        }
        .text-center { text-align: center; }
        .text-start { text-align: ${t.alignStart}; }
        .text-end { text-align: ${t.alignEnd}; }
        .bold { font-weight: bold; }
        .title { font-size: ${paperWidth === '58mm' ? '14px' : '16px'}; font-weight: 900; margin-bottom: 2px; }
        .subtitle { font-size: 9px; color: #333; margin-bottom: 6px; }
        .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
        .info-row { display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 2px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .items-table th { text-align: ${t.alignStart}; font-size: 9px; border-bottom: 1px solid #000; padding-bottom: 2px; }
        .items-table td { font-size: 9px; padding: 3px 0; vertical-align: top; }
        .total-box { font-size: 13px; font-weight: 900; display: flex; justify-content: space-between; margin: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
        .footer { font-size: 8px; text-align: center; margin-top: 8px; color: #444; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <div class="title">${data.storeName}</div>
        <div class="subtitle">${data.branchAddress ?? ''}</div>
      </div>

      <div class="divider"></div>

      <div class="info-row">
        <span>${t.receiptNo}: <b>#${data.receiptId.slice(0, 8)}</b></span>
        <span>${t.date}: ${new Date(data.date).toLocaleTimeString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="info-row">
        <span>${t.cashier}: <b>${data.cashierName}</b></span>
        ${data.customerName ? `<span>${t.customer}: <b>${data.customerName}</b></span>` : ''}
      </div>

      <div class="divider"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 50%">${t.item}</th>
            <th style="width: 15%" class="text-center">${t.qty}</th>
            <th style="width: 35%" class="text-end">${t.price}</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item) => `
            <tr>
              <td class="text-start">
                <div class="bold">${item.product_name}</div>
                ${item.size || item.color ? `<div style="font-size: 8px; color: #555;">${item.size ?? ''} ${item.color ?? ''}</div>` : ''}
              </td>
              <td class="text-center bold">${item.quantity}</td>
              <td class="text-end bold">${(item.quantity * item.unit_price).toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      ${data.discountDzd && data.discountDzd > 0 ? `
        <div class="info-row" style="font-size: 10px;">
          <span>${t.subtotal}:</span>
          <span>${(data.subtotalDzd ?? (data.totalDzd + data.discountDzd)).toLocaleString()} DA</span>
        </div>
        <div class="info-row" style="font-size: 10px; color: #b91c1c;">
          <span>${t.discount}:</span>
          <span>-${data.discountDzd.toLocaleString()} DA</span>
        </div>
      ` : ''}

      <div class="total-box">
        <span>${t.total}:</span>
        <span>${data.totalDzd.toLocaleString()} DA</span>
      </div>

      <div class="info-row">
        <span>${t.paymentMethod}:</span>
        <span class="bold">${data.paymentMethod === 'cash' ? t.cash : data.paymentMethod === 'card' ? t.card : t.split}</span>
      </div>

      <div class="divider"></div>

      <div class="footer">
        <p>${data.footerText ?? t.defaultFooter}</p>
        <div style="margin-top: 6px; text-align: center;">
          ${generateBarcodeSvg(data.receiptId)}
        </div>
        <p style="font-family: monospace; font-size: 8px; margin-top: 4px;">MELLAH POS — Instant Direct Receipt</p>
      </div>
    </body>
    </html>
  `
}

export async function printThermalReceipt(
  data: ReceiptData,
  options?: ReceiptPrintOptions
): Promise<boolean> {
  const receiptHtml = buildReceiptHtml(data, options)

  if (window.electron?.printHtml) {
    return await window.electron.printHtml(receiptHtml, options?.printerName)
  }

  // Web fallback window print
  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (printWindow) {
    printWindow.document.write(receiptHtml)
    printWindow.document.close()
    return true
  }
  return false
}

export interface ReturnReceiptData {
  storeName: string
  returnId: string
  originalSaleId: string
  date: string
  cashierName: string
  items: ReceiptItem[]
  refundTotalDzd: number
  refundMethod: string
  reason: string
}

export async function printThermalReturnReceipt(
  data: ReturnReceiptData,
  options?: ReceiptPrintOptions
): Promise<boolean> {
  const paperWidth = options?.paperWidth ?? '80mm'
  const bodyWidth = paperWidth === '58mm' ? '54mm' : '78mm'

  const returnHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>وصل مرتجع بضاعة - ${data.returnId}</title>
      <style>
        @page { size: ${paperWidth} auto; margin: 0; }
        body { width: ${bodyWidth}; margin: 0 auto; padding: 8px 4px; font-family: system-ui, sans-serif; font-size: 10px; color: #000; direction: rtl; }
        .text-center { text-align: center; }
        .bold { font-weight: bold; }
        .title { font-size: 14px; font-weight: 900; }
        .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
        .info-row { display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 2px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
        .items-table th { text-align: right; border-bottom: 1px solid #000; }
        .total-box { font-size: 12px; font-weight: 900; display: flex; justify-content: space-between; margin: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <div class="title">${data.storeName}</div>
        <div style="font-weight: 900; font-size: 11px; margin-top: 2px;">وصل إرجاع بضاعة</div>
      </div>
      <div class="divider"></div>
      <div class="info-row"><span>رقم المرتجع: <b>#${data.returnId.slice(0, 8)}</b></span><span>التاريخ: ${new Date(data.date).toLocaleTimeString('ar-DZ')}</span></div>
      <div class="info-row"><span>الوصل الأصلي: <b>#${data.originalSaleId.slice(0, 8)}</b></span><span>الكاشير: <b>${data.cashierName}</b></span></div>
      <div class="divider"></div>
      <table class="items-table">
        <thead>
          <tr><th>المنتج الإرجاع</th><th style="text-align: center;">الكمية</th><th style="text-align: left;">المبلغ (DA)</th></tr>
        </thead>
        <tbody>
          ${data.items.map((i) => `
            <tr>
              <td><b>${i.product_name}</b> ${i.size || i.color ? `(${i.size ?? ''} ${i.color ?? ''})` : ''}</td>
              <td style="text-align: center;"><b>${i.quantity}</b></td>
              <td style="text-align: left;"><b>${(i.quantity * i.unit_price).toLocaleString()}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="total-box">
        <span>إجمالي المبلغ المسترد:</span>
        <span>${data.refundTotalDzd.toLocaleString()} DA</span>
      </div>
      <div class="info-row">
        <span>طريقة الاسترداد: <b>${data.refundMethod === 'cash' ? 'كاش (نقداً)' : 'رصيد متجر'}</b></span>
      </div>
      <div class="info-row"><span>السبب: ${data.reason || 'إرجاع بضاعة'}</span></div>
      <div class="divider"></div>
      <div class="text-center" style="font-size: 8px;">Mellah POS — Verified Return</div>
    </body>
    </html>
  `

  if (window.electron?.printHtml) {
    return await window.electron.printHtml(returnHtml, options?.printerName)
  }
  return true
}

export interface CustomerCardData {
  customerName: string
  customerPhone?: string | null
  barcode: string
  loyaltyPoints?: number
}

export function buildCustomerCardHtml(
  data: CustomerCardData,
  storeSettings?: { store_name?: string; loyalty_enabled?: boolean; barcode_label_size?: string }
): string {
  const storeName = storeSettings?.store_name || 'بوتيك الملاح للملابس'
  const isLoyaltyEnabled = storeSettings?.loyalty_enabled ?? false
  const labelSize = storeSettings?.barcode_label_size || '50x25'
  const dims =
    labelSize === '50x25'
      ? { page: '50mm 25mm', width: '50mm', height: '25mm' }
      : labelSize === '38x25'
        ? { page: '38mm 25mm', width: '38mm', height: '25mm' }
        : { page: '40mm 30mm', width: '40mm', height: '30mm' }

  const barcodeSvg = generateBarcodeSvg(data.barcode)

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كارت الزبون - ${data.customerName}</title>
      <style>
        @page {
          size: ${dims.page};
          margin: 0;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
          }
        }
        body {
          width: ${dims.width};
          height: ${dims.height};
          margin: 0 auto;
          padding: 1mm;
          box-sizing: border-box;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #ffffff;
          color: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
          overflow: hidden;
        }
        .header {
          font-size: 8px;
          font-weight: 900;
          border-bottom: 0.8pt solid #000;
          width: 100%;
          padding-bottom: 1px;
          margin-bottom: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .customer-name {
          font-size: 9.5px;
          font-weight: 900;
          line-height: 1.1;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }
        .customer-phone {
          font-size: 7.5px;
          font-weight: 800;
          font-family: monospace;
          color: #111;
          margin-bottom: 1px;
        }
        .barcode-container {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0 auto;
        }
        .barcode-container svg {
          width: 95%;
          height: 24px;
        }
        .points-badge {
          font-size: 7px;
          font-weight: 800;
          background: #f0f0f0;
          border: 0.5pt solid #888;
          border-radius: 2px;
          padding: 0.5px 3px;
        }
      </style>
    </head>
    <body>
      <div class="header">${storeName}</div>
      <div class="customer-name">${data.customerName}</div>
      ${data.customerPhone ? `<div class="customer-phone">${data.customerPhone}</div>` : ''}
      <div class="barcode-container">
        ${barcodeSvg}
      </div>
      ${isLoyaltyEnabled && data.loyaltyPoints !== undefined ? `<div class="points-badge">النقاط: ${data.loyaltyPoints} نقطة</div>` : ''}
    </body>
    </html>
  `
}

export async function printCustomerCardLabel(
  data: CustomerCardData,
  storeSettings?: { store_name?: string; loyalty_enabled?: boolean },
  printerName?: string
): Promise<boolean> {
  const html = buildCustomerCardHtml(data, storeSettings)
  if (typeof window !== 'undefined' && window.electron?.printHtml) {
    return await window.electron.printHtml(html, printerName || localStorage.getItem('mellah_printer_name') || undefined)
  } else if (typeof window !== 'undefined') {
    const printWindow = window.open('', '_blank', 'width=300,height=300')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
      printWindow.close()
      return true
    }
  }
  return false
}
