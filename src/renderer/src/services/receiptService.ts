
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

export interface ReceiptPrintOptions {
  printerName?: string
  paperWidth?: '80mm' | '58mm'
}

export async function printThermalReceipt(
  data: ReceiptData,
  options?: ReceiptPrintOptions
): Promise<boolean> {
  const paperWidth = options?.paperWidth ?? '80mm'
  const bodyWidth = paperWidth === '58mm' ? '54mm' : '78mm'
  const fontSize = paperWidth === '58mm' ? '10px' : '11px'

  const receiptHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>فاتورة مبيعات - ${data.receiptId}</title>
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
          direction: rtl;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .bold { font-weight: bold; }
        .title { font-size: ${paperWidth === '58mm' ? '14px' : '16px'}; font-weight: 900; margin-bottom: 2px; }
        .subtitle { font-size: 9px; color: #333; margin-bottom: 6px; }
        .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
        .info-row { display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 2px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .items-table th { text-align: right; font-size: 9px; border-bottom: 1px solid #000; padding-bottom: 2px; }
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
        <span>رقم الفاتورة: <b>${data.receiptId.slice(0, 8)}</b></span>
        <span>التاريخ: ${new Date(data.date).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="info-row">
        <span>الكاشير: <b>${data.cashierName}</b></span>
        ${data.customerName ? `<span>الزبون: <b>${data.customerName}</b></span>` : ''}
      </div>

      <div class="divider"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 50%">المنتج</th>
            <th style="width: 15%" class="text-center">الكمية</th>
            <th style="width: 35%" class="text-left">السعر (DA)</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item) => `
            <tr>
              <td>
                <div class="bold">${item.product_name}</div>
                ${item.size || item.color ? `<div style="font-size: 8px; color: #555;">${item.size ?? ''} ${item.color ?? ''}</div>` : ''}
              </td>
              <td class="text-center bold">${item.quantity}</td>
              <td class="text-left bold">${(item.quantity * item.unit_price).toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      ${data.discountDzd && data.discountDzd > 0 ? `
        <div class="info-row" style="font-size: 10px;">
          <span>المجموع الفرعي:</span>
          <span>${(data.subtotalDzd ?? (data.totalDzd + data.discountDzd)).toLocaleString()} DA</span>
        </div>
        <div class="info-row" style="font-size: 10px; color: #b91c1c;">
          <span>الخصم الممنوح:</span>
          <span>-${data.discountDzd.toLocaleString()} DA</span>
        </div>
      ` : ''}

      <div class="total-box">
        <span>الإجمالي النهائي:</span>
        <span>${data.totalDzd.toLocaleString()} DA</span>
      </div>

      <div class="info-row">
        <span>طريقة الدفع:</span>
        <span class="bold">${data.paymentMethod === 'cash' ? 'نقداً' : data.paymentMethod === 'card' ? 'بطاقة CIB' : 'مزدوج'}</span>
      </div>

      <div class="divider"></div>

      <div class="footer">
        <p>${data.footerText ?? 'شكراً لزيارتكم! البضاعة المباعة ترجع أو تبدل خلال 7 أيام مع إحضار الفاتورة.'}</p>
        <p style="font-family: monospace; font-size: 8px; margin-top: 4px;">MELLAH POS — System Generated</p>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `

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
        <div style="font-weight: 900; font-size: 11px; margin-top: 2px;">↩️ وصل إرجاع بضاعة</div>
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
