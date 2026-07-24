/**
 * Extensible Payment Provider Adapter Architecture for Mellah POS.
 * Designed to seamlessly support Cash, Algerian CIB / Edahabia TPE,
 * and future digital/SATIM/BaridiMob/International payment integrations without code refactoring.
 */

export interface PaymentRequest {
  saleId: string
  amountDzd: number
  paymentMethod: 'cash' | 'card' | 'mixed'
  cashAmountDzd?: number
  cardAmountDzd?: number
  terminalReference?: string
}

export interface PaymentResponse {
  success: boolean
  transactionId: string
  provider: string
  message: string
  timestamp: string
  rawPayload?: Record<string, unknown>
}

export interface PaymentGatewayAdapter {
  providerId: string
  providerName: string
  processPayment: (request: PaymentRequest) => Promise<PaymentResponse>
  verifyStatus?: (transactionId: string) => Promise<boolean>
}

/** 1. Default Algerian Cash Payment Adapter */
export class CashPaymentAdapter implements PaymentGatewayAdapter {
  providerId = 'cash_local'
  providerName = 'الدفع النقدي (الكاش)'

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    return {
      success: true,
      transactionId: `CASH-${Date.now()}`,
      provider: this.providerId,
      message: `تم استلام المبلغ نقداً: ${request.amountDzd} دج`,
      timestamp: new Date().toISOString(),
    }
  }
}

/** 2. Algerian CIB / Edahabia TPE Terminal Manual Adapter */
export class CIBEdahabiaManualAdapter implements PaymentGatewayAdapter {
  providerId = 'cib_edahabia_manual'
  providerName = 'نهائي CIB / البطاقة الذهبية (TPE يدوي)'

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    return {
      success: true,
      transactionId: request.terminalReference || `TPE-${Date.now()}`,
      provider: this.providerId,
      message: `تمت المعاملة بنجاح عبر موزع CIB/الذهبية بمبلغ ${request.amountDzd} دج`,
      timestamp: new Date().toISOString(),
    }
  }
}

/** 3. Plug-and-Play Future SATIM / BaridiMob Electronic API Gateway */
export class SatimEdahabiaOnlineAdapter implements PaymentGatewayAdapter {
  providerId = 'satim_baridimob_api'
  providerName = 'بوابة بريد الجزائر SATIM / BaridiMob (مستقبلي)'

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Structure ready for REST API calls to SATIM / BaridiMob webhooks
    return {
      success: true,
      transactionId: `SATIM-ONLINE-${Date.now()}`,
      provider: this.providerId,
      message: `تم الربط والتمرير عبر بوابة SATIM بمبلغ ${request.amountDzd} دج`,
      timestamp: new Date().toISOString(),
    }
  }
}

/** Payment Registry Manager */
class PaymentRegistry {
  private adapters: Map<string, PaymentGatewayAdapter> = new Map()

  constructor() {
    this.registerAdapter(new CashPaymentAdapter())
    this.registerAdapter(new CIBEdahabiaManualAdapter())
    this.registerAdapter(new SatimEdahabiaOnlineAdapter())
  }

  registerAdapter(adapter: PaymentGatewayAdapter): void {
    this.adapters.set(adapter.providerId, adapter)
  }

  getAdapter(providerId: string): PaymentGatewayAdapter {
    return this.adapters.get(providerId) || this.adapters.get('cash_local')!
  }

  listAdapters(): Array<{ id: string; name: string }> {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.providerId,
      name: a.providerName,
    }))
  }
}

export const paymentRegistry = new PaymentRegistry()
