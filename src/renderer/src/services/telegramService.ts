export interface ShiftNotificationParams {
  branchName: string
  cashierName: string
  openingCashDzd: number
  openedAt: string
  botToken?: string
  chatId?: string
}

/**
 * Sends an automated Telegram notification to the store owner when a shift is opened.
 * Formatted cleanly in Markdown with opening time, branch name, cashier, and starting cash.
 */
export async function sendShiftOpenedTelegramNotification(
  params: ShiftNotificationParams
): Promise<{ success: boolean; message?: string }> {
  try {
    const token =
      params.botToken ||
      localStorage.getItem('mellah_telegram_bot_token') ||
      import.meta.env.VITE_TELEGRAM_BOT_TOKEN
    const chatId =
      params.chatId ||
      localStorage.getItem('mellah_telegram_chat_id') ||
      import.meta.env.VITE_TELEGRAM_CHAT_ID

    if (!token || !chatId) {
      // eslint-disable-next-line no-console
      console.log('📱 [Telegram] Notification skipped: bot_token or chat_id not configured.')
      return { success: false, message: 'Telegram bot credentials not configured' }
    }

    const formattedTime = new Date(params.openedAt).toLocaleString('ar-DZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const messageText = [
      `🏪 *إشعار إشهار بداية دوام جديد — MELLAH POS*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📍 *الفرع:* ${params.branchName}`,
      `👤 *الكاشير:* ${params.cashierName}`,
      `💵 *سيولة الفتح (الفكة):* ${params.openingCashDzd.toLocaleString()} دج`,
      `⏰ *وقت التغيير:* ${formattedTime}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ *تم فتح الوردية والصندوق وجاهزية استقبال الزبائن.*`,
    ].join('\n')

    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-[#1C2B3A]': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown',
      }),
    })

    const data = await res.json()
    if (data.ok) {
      // eslint-disable-next-line no-console
      console.log('📱 [Telegram] Shift opening notification sent successfully to store owner!')
      return { success: true }
    } else {
      // eslint-disable-next-line no-console
      console.warn('📱 [Telegram] API response error:', data)
      return { success: false, message: data.description }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('📱 [Telegram] Failed to send shift notification:', err)
    return { success: false, message: (err as Error).message }
  }
}
