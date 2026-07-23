import { formatCurrency } from '@/lib/format'
import type { CartItem } from '@/stores/cartStore'

export interface ReceiptData {
  saleId: string
  branchName: string
  cashierName: string
  createdAt: string
  items: CartItem[]
  paymentMethod: string
  totalDzd: number
  storeName?: string
  footerText?: string
}

export function generateThermalReceiptHtml(data: ReceiptData): string {
  const store = data.storeName ?? 'بوتيك الملاح للملابس'
  const footer = data.footerText ?? 'شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام'

  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td style="text-align: right; padding: 4px 0;">
        <div style="font-weight: bold;">${item.product_name}</div>
        <div style="font-size: 10px; color: #555;">${item.variant_size ? 'مقاس: ' + item.variant_size : ''} ${item.variant_color ? 'لون: ' + item.variant_color : ''}</div>
      </td>
      <td style="text-align: center; padding: 4px 0; font-weight: bold;">${item.quantity}</td>
      <td style="text-align: left; padding: 4px 0; font-weight: bold;">${formatCurrency(item.unit_price_dzd * item.quantity)}</td>
    </tr>
  `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>وصل بيع - ${data.saleId}</title>
      <style>
        body {
          font-family: 'Inter', system-ui, sans-serif;
          width: 80mm;
          margin: 0 auto;
          padding: 8px;
          color: #000;
          font-size: 12px;
          background: #fff;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .bold { font-weight: bold; }
        .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <h2 style="margin: 0; font-size: 16px;">${store}</h2>
        <div style="font-size: 11px; margin-top: 2px;">${data.branchName}</div>
        <div style="font-size: 10px; color: #444;">هاتف: 0550 12 34 56</div>
      </div>

      <div class="divider"></div>

      <div style="font-size: 11px;">
        <div><b>وصل رقم:</b> <span style="font-family: monospace;">${data.saleId.slice(0, 8)}</span></div>
        <div><b>التاريخ:</b> ${new Date(data.createdAt).toLocaleString('ar-DZ')}</div>
        <div><b>الكاشير:</b> ${data.cashierName}</div>
        <div><b>طريقة الدفع:</b> ${data.paymentMethod === 'cash' ? 'نقداً' : 'بطاقة CIB'}</div>
      </div>

      <div class="divider"></div>

      <table>
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 11px;">
            <th class="text-right">المنتج</th>
            <th class="text-center">العدد</th>
            <th class="text-left">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="divider"></div>

      <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold;">
        <span>المبلغ الإجمالي:</span>
        <span>${formatCurrency(data.totalDzd)}</span>
      </div>

      <div class="divider"></div>

      <div class="text-center" style="font-size: 10px; color: #333; margin-top: 8px;">
        <div>${footer}</div>
        <div style="margin-top: 6px; font-family: monospace; font-size: 11px;">*${data.saleId.slice(0, 8)}*</div>
      </div>
    </body>
    </html>
  `
}
