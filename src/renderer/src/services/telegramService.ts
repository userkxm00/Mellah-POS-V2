import { DEFAULT_BRANCH_ID } from '@/stores/shiftStore'

export interface TelegramCredentials {
  botToken: string
  chatIds: string[]
  notifyAppLaunch: boolean
  notifySale: boolean
  notifyShift: boolean
}

export interface ShiftNotificationParams {
  branchName: string
  cashierName: string
  openingCashDzd: number
  openedAt: string
  botToken?: string
  chatId?: string
}

export interface SaleItemTelegram {
  name: string
  variantName?: string
  quantity: number
  unitPriceDzd: number
  totalPriceDzd: number
  imageUrl?: string | null
}

export interface SaleNotificationParams {
  invoiceNumber?: string
  branchName: string
  cashierName: string
  customerName?: string | null
  paymentMethod: string
  subtotalDzd: number
  discountDzd: number
  totalDzd: number
  paidAmountDzd: number
  remainingChangeDzd: number
  items: SaleItemTelegram[]
  createdAt: string
  primaryImageUrl?: string | null
}

export interface AppLaunchNotificationParams {
  branchName: string
  userName: string
  appVersion?: string
}

/**
 * Parses comma, space, or newline-separated Chat IDs into a clean array of unique non-empty IDs.
 */
export function parseChatIds(rawInput: string | null | undefined): string[] {
  if (!rawInput) return []
  return Array.from(
    new Set(
      rawInput
        .split(/[\s,\n\r;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  )
}

async function fetchDbTelegramSettings(): Promise<{
  botToken?: string
  rawChatIds?: string
  notifyAppLaunch?: boolean
  notifySale?: boolean
  notifyShift?: boolean
}> {
  try {
    if (typeof window === 'undefined' || !window.electron?.db) return {}
    const rows = await window.electron.db.query<{
      telegram_bot_token: string | null
      telegram_chat_ids: string | null
      telegram_notify_app_launch: number | null
      telegram_notify_sale: number | null
      telegram_notify_shift: number | null
    }>(
      `SELECT telegram_bot_token, telegram_chat_ids, telegram_notify_app_launch, telegram_notify_sale, telegram_notify_shift FROM store_settings WHERE branch_id = ?`,
      [DEFAULT_BRANCH_ID]
    )

    if (rows.length === 0) return {}
    const r = rows[0]
    return {
      botToken: r.telegram_bot_token || undefined,
      rawChatIds: r.telegram_chat_ids || undefined,
      notifyAppLaunch: r.telegram_notify_app_launch !== null ? r.telegram_notify_app_launch === 1 : undefined,
      notifySale: r.telegram_notify_sale !== null ? r.telegram_notify_sale === 1 : undefined,
      notifyShift: r.telegram_notify_shift !== null ? r.telegram_notify_shift === 1 : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Fetches Telegram configuration credentials from DB store_settings with localStorage fallback.
 */
export async function getTelegramCredentials(): Promise<TelegramCredentials> {
  const dbSettings = await fetchDbTelegramSettings()

  let botToken = dbSettings.botToken || localStorage.getItem('mellah_telegram_bot_token') || import.meta.env.VITE_TELEGRAM_BOT_TOKEN || ''
  const rawChatIds = dbSettings.rawChatIds || localStorage.getItem('mellah_telegram_chat_ids') || localStorage.getItem('mellah_telegram_chat_id') || import.meta.env.VITE_TELEGRAM_CHAT_ID || ''
  const notifyAppLaunch = dbSettings.notifyAppLaunch ?? (localStorage.getItem('mellah_telegram_notify_app_launch') !== 'false')
  const notifySale = dbSettings.notifySale ?? (localStorage.getItem('mellah_telegram_notify_sale') !== 'false')
  const notifyShift = dbSettings.notifyShift ?? (localStorage.getItem('mellah_telegram_notify_shift') !== 'false')

  if (botToken && typeof window !== 'undefined' && window.electron?.safeStorage?.decrypt) {
    try {
      botToken = await window.electron.safeStorage.decrypt(botToken)
    } catch {
      // Fallback if unencrypted
    }
  }

  return {
    botToken: botToken.trim(),
    chatIds: parseChatIds(rawChatIds),
    notifyAppLaunch,
    notifySale,
    notifyShift,
  }
}

/**
 * Escapes special Markdown characters in user-controlled input string to prevent injection/formatting breakage.
 */
export function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/([\\_*[\]()~`>#+=\-|{}.!])/g, '\\$1')
}

/**
 * Converts a base64 Data URL (e.g. data:image/jpeg;base64,...) to a Blob for multipart form upload.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

/**
 * Sends a message or photo payload to all configured Telegram Chat IDs in parallel.
 */
async function sendToTelegramAll(
  botToken: string,
  chatIds: string[],
  captionText: string,
  imageUrl?: string | null
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!botToken || chatIds.length === 0) {
    return { success: false, count: 0, error: 'Telegram credentials missing or no chat IDs configured.' }
  }

  const results = await Promise.allSettled(
    chatIds.map(async (chatId) => {
      // 1. Send HTTP(S) image URL
      if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        const photoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`
        const res = await fetch(photoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: captionText,
            parse_mode: 'Markdown',
          }),
        })
        const data = await res.json()
        if (data.ok) return true
      }

      // 2. Send Base64 Data URL image via multipart FormData
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        try {
          const imageBlob = await dataUrlToBlob(imageUrl)
          const formData = new FormData()
          formData.append('chat_id', chatId)
          formData.append('photo', imageBlob, 'product.jpg')
          formData.append('caption', captionText)
          formData.append('parse_mode', 'Markdown')

          const photoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`
          const res = await fetch(photoUrl, {
            method: 'POST',
            body: formData,
          })
          const data = await res.json()
          if (data.ok) return true
        } catch (err) {
          // Fall back to text message if blob conversion fails
        }
      }

      // 3. Fallback text-only message send
      const msgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
      const res = await fetch(msgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: captionText,
          parse_mode: 'Markdown',
        }),
      })
      const data = await res.json()
      if (data.ok) return true
      throw new Error(data.description || 'API Send Error')
    })
  )

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
  const firstFailure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
  const errorMsg = firstFailure ? (firstFailure.reason as Error)?.message || 'Send Failed' : undefined

  return { success: successCount > 0, count: successCount, error: successCount === 0 ? errorMsg : undefined }
}

/**
 * Send automated App Launch notification to Telegram managers.
 */
export async function sendAppLaunchTelegramNotification(
  params: AppLaunchNotificationParams
): Promise<{ success: boolean; count: number }> {
  try {
    const creds = await getTelegramCredentials()
    if (!creds.notifyAppLaunch || !creds.botToken || creds.chatIds.length === 0) {
      return { success: false, count: 0 }
    }

    const formattedTime = new Date().toLocaleString('ar-DZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const messageText = [
      `*إشعار إقلاع وتشغيل النظام — MELLAH POS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*الفرع:* ${params.branchName}`,
      `*المستخدم المكون:* ${params.userName}`,
      `*التاريخ والوقت:* ${formattedTime}`,
      `*إصدار التطبيق:* ${params.appVersion || 'v1.0.1 (Windows)'}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*تم فتح تشغيل برنامج MELLAH POS بنجاح وجاهزية استقبال واستكمال المبيعات تامة.*`,
    ].join('\n')

    return await sendToTelegramAll(creds.botToken, creds.chatIds, messageText)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Telegram] Failed to send app launch notification:', err)
    return { success: false, count: 0 }
  }
}

/**
 * Send automated Shift Opened notification to Telegram managers.
 */
export async function sendShiftOpenedTelegramNotification(
  params: ShiftNotificationParams
): Promise<{ success: boolean; message?: string }> {
  try {
    const creds = await getTelegramCredentials()
    const token = params.botToken || creds.botToken
    const chatIds = params.chatId ? [params.chatId] : creds.chatIds

    if (!creds.notifyShift || !token || chatIds.length === 0) {
      return { success: false, message: 'Telegram credentials missing' }
    }

    const formattedTime = new Date(params.openedAt).toLocaleString('ar-DZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const messageText = [
      `*إشعار بداية وردية جديدة — MELLAH POS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*الفرع:* ${params.branchName}`,
      `*الكاشير:* ${params.cashierName}`,
      `*سيولة الفتح (الفكة):* ${params.openingCashDzd.toLocaleString()} دج`,
      `*وقت الفتح:* ${formattedTime}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*تم فتح الصندوق وجاهزية خدمة الزبائن.*`,
    ].join('\n')

    const res = await sendToTelegramAll(token, chatIds, messageText)
    return { success: res.success, message: res.error }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

export interface ShiftCloseNotificationParams {
  branchName: string
  cashierName: string
  totalSalesDzd: number
  cashSalesDzd: number
  cardSalesDzd: number
  expectedCashDzd: number
  closingCashDzd: number
  differenceDzd: number
  openedAt: string
  closedAt: string
}

/**
 * Send automated Shift Closed Summary notification to Telegram managers.
 */
export async function sendShiftClosedTelegramNotification(
  params: ShiftCloseNotificationParams
): Promise<{ success: boolean; message?: string }> {
  try {
    const creds = await getTelegramCredentials()
    if (!creds.notifyShift || !creds.botToken || creds.chatIds.length === 0) {
      return { success: false, message: 'Telegram notifications disabled or unconfigured' }
    }

    const differenceText =
      params.differenceDzd === 0
        ? '0 دج (متطابق 100%)'
        : params.differenceDzd > 0
        ? `+${params.differenceDzd.toLocaleString()} دج (فائض في الصندوق)`
        : `${params.differenceDzd.toLocaleString()} دج (عجز في الصندوق)`

    const messageText = [
      `*إشعار غلق الوردية اليومية — MELLAH POS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*المتجر / الفرع:* ${params.branchName}`,
      `*الكاشير:* ${params.cashierName}`,
      `*مجموع المبيعات الإجمالي اليوم:* ${params.totalSalesDzd.toLocaleString()} دج`,
      `*السيولة النقدية (الكاش):* ${params.cashSalesDzd.toLocaleString()} دج`,
      `*المدفوع بالبطاقة / CIB:* ${params.cardSalesDzd.toLocaleString()} دج`,
      `*الفارق في الصندوق:* ${differenceText}`,
      `*وقت الفتح:* ${new Date(params.openedAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}`,
      `*وقت الغلق:* ${new Date(params.closedAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*تم إغلاق الصندوق وتصفية حساب الوردية بنجاح.*`,
    ].join('\n')

    const res = await sendToTelegramAll(creds.botToken, creds.chatIds, messageText)
    return { success: res.success, message: res.error }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

/**
 * Send automated Sale Completed notification with item details and product image to Telegram managers.
 */
export async function sendSaleCompletedTelegramNotification(
  params: SaleNotificationParams
): Promise<{ success: boolean; count: number }> {
  try {
    const creds = await getTelegramCredentials()
    if (!creds.notifySale || !creds.botToken || creds.chatIds.length === 0) {
      return { success: false, count: 0 }
    }

    const formattedTime = new Date(params.createdAt || Date.now()).toLocaleString('ar-DZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const paymentLabel =
      params.paymentMethod === 'cash'
        ? 'نقداً'
        : params.paymentMethod === 'card'
        ? 'بطاقة بانكية'
        : params.paymentMethod === 'credit'
        ? 'بالتقسيط / دَين'
        : 'مختلط'

    // Format list of sold items
    const itemsFormatted = params.items
      .map(
        (item) =>
          `• *${escapeMarkdown(item.name)}* ${item.variantName ? `(${escapeMarkdown(item.variantName)})` : ''} × ${item.quantity} = *${item.totalPriceDzd.toLocaleString()} دج*`
      )
      .join('\n')

    // Find first product item with an image URL if not explicitly provided
    const primaryImg =
      params.primaryImageUrl ||
      params.items.find((i) => i.imageUrl && i.imageUrl.length > 5)?.imageUrl ||
      null

    const messageText = [
      `*إشعار فاتورة بيع جديدة — MELLAH POS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*الفاتورة:* ${params.invoiceNumber ? `#${escapeMarkdown(params.invoiceNumber)}` : 'جديدة'}`,
      `*الفرع:* ${escapeMarkdown(params.branchName)}`,
      `*الكاشير:* ${escapeMarkdown(params.cashierName)}`,
      `*الزبون:* ${escapeMarkdown(params.customerName || 'زبون عابر')}`,
      `*طريقة الدفع:* ${paymentLabel}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*السلع المباعة:*`,
      itemsFormatted || 'لا توجد عناصر',
      `━━━━━━━━━━━━━━━━━━━━`,
      `*المجموع النهائي:* *${params.totalDzd.toLocaleString()} دج*`,
      params.discountDzd > 0 ? `*الخصم:* ${params.discountDzd.toLocaleString()} دج` : null,
      `*المبلغ المدفوع:* ${params.paidAmountDzd.toLocaleString()} دج`,
      params.remainingChangeDzd > 0 ? `*المتبقي للزبون:* ${params.remainingChangeDzd.toLocaleString()} دج` : null,
      `*الوقت:* ${escapeMarkdown(formattedTime)}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*شكراً لاستخدامكم نظام MELLAH POS الذكي.*`,
    ]
      .filter(Boolean)
      .join('\n')

    return await sendToTelegramAll(creds.botToken, creds.chatIds, messageText, primaryImg)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Telegram] Failed to send sale notification:', err)
    return { success: false, count: 0 }
  }
}

/**
 * Sends a test message immediately to verify Telegram credentials in Settings.
 */
export async function sendTestTelegramNotification(
  botToken: string,
  rawChatIds: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const chatIds = parseChatIds(rawChatIds)
  if (!botToken.trim() || chatIds.length === 0) {
    return { success: false, count: 0, error: 'يرجى إدخال التوكن ومعرف شات واحد على الأقل.' }
  }

  const testMessage = [
    `*رسالة تجريبية — MELLAH POS*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*ربط بوت تلغرام يعمل بنجاح تام!*`,
    `*عدد المحادثات المستهدفة:* ${chatIds.length} معرف`,
    `*الوقت:* ${new Date().toLocaleString('ar-DZ')}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*النظام جاهز لإرسال إشعارات الإقلاع والورديات والمبيعات بنجاح.*`,
  ].join('\n')

  return await sendToTelegramAll(botToken.trim(), chatIds, testMessage)
}
