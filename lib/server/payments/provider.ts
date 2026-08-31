/**
 * Payment provider abstraction.
 *
 * PayPal is the first provider, but nothing outside `payments/paypal.ts`
 * knows that. Adding or replacing a provider means implementing this
 * interface, not editing the checkout or budget code.
 *
 * The commercial description of what is being sold is fixed here so it stays
 * identical in the UI, in the provider's records and on the buyer's
 * statement:
 *
 *     RankBurn Digital Advertising
 *     Digital Advertising Placement and Exposure
 */

export const SERVICE_NAME = 'RankBurn Digital Advertising'
export const SERVICE_DESCRIPTION = 'Digital Advertising Placement and Exposure'

export type CheckoutRequest = {
  paymentId: string
  campaignId: string
  campaignName: string
  amountCents: number
  currency: string
  returnUrl: string
  cancelUrl: string
}

export type CheckoutSession = {
  providerOrderId: string
  /** where the buyer must be sent to approve the payment */
  approvalUrl: string
}

export type CaptureResult = {
  providerCaptureId: string
  amountCents: number
  currency: string
  /** true only when the provider states the funds are captured */
  completed: boolean
}

/**
 * The verified outcome of a provider webhook. `paymentId` is resolved from
 * the provider's own record of the order, never from a browser parameter.
 */
export type VerifiedWebhook = {
  eventId: string
  eventType: string
  /** our own payment id, echoed back by the provider */
  customId?: string
  providerOrderId?: string
  providerCaptureId?: string
  amountCents?: number
  currency?: string
  completed: boolean
}

export type PaymentProvider = {
  readonly id: string
  /** false when credentials are missing - checkout must then stay disabled */
  isConfigured(): boolean
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  capturePayment(providerOrderId: string): Promise<CaptureResult>
  /**
   * Verifies a webhook against the provider's signature scheme. Returning
   * null means the request could not be trusted and must be ignored.
   */
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifiedWebhook | null>
}

export class PaymentProviderNotConfiguredError extends Error {
  constructor(providerId: string) {
    super(
      `Payment provider "${providerId}" is not configured. ` +
        'Set the required environment variables before enabling checkout.',
    )
    this.name = 'PaymentProviderNotConfiguredError'
  }
}
