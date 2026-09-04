/**
 * PayPal provider.
 *
 * This talks to the real PayPal Orders v2 and webhook-verification APIs. It
 * is inert until `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and
 * `PAYPAL_WEBHOOK_ID` are present: no credentials are invented, and no code
 * path pretends a payment succeeded.
 *
 * `PAYPAL_API_BASE` defaults to the sandbox host. Point it at the live host
 * only after PayPal has confirmed the production business model in writing.
 */

import { config } from '../config'
import {
  PaymentProviderNotConfiguredError,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
  type CaptureResult,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type VerifiedWebhook,
} from './provider'

type PayPalLink = { href?: string; rel?: string }

function amountString(cents: number): string {
  return (cents / 100).toFixed(2)
}

async function accessToken(): Promise<string> {
  const { clientId, clientSecret, apiBase } = config.paypal
  if (!clientId || !clientSecret) {
    throw new PaymentProviderNotConfiguredError('paypal')
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`PayPal token request failed (${response.status})`)
  }
  const json = (await response.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('PayPal token response had no token')
  return json.access_token
}

export const paypalProvider: PaymentProvider = {
  id: 'paypal',

  isConfigured() {
    const { clientId, clientSecret, webhookId } = config.paypal
    return Boolean(clientId && clientSecret && webhookId)
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!this.isConfigured()) {
      throw new PaymentProviderNotConfiguredError('paypal')
    }
    const token = await accessToken()
    const response = await fetch(`${config.paypal.apiBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Makes order creation safe to retry without double-charging.
        'PayPal-Request-Id': request.paymentId,
      },
      cache: 'no-store',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            // Our own payment id, echoed back on the webhook so the credit
            // is matched to a record we created rather than to user input.
            custom_id: request.paymentId,
            reference_id: request.campaignId,
            description: SERVICE_DESCRIPTION,
            amount: {
              currency_code: request.currency,
              value: amountString(request.amountCents),
            },
          },
        ],
        application_context: {
          brand_name: SERVICE_NAME,
          user_action: 'PAY_NOW',
          return_url: request.returnUrl,
          cancel_url: request.cancelUrl,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`PayPal order creation failed (${response.status})`)
    }

    const json = (await response.json()) as {
      id?: string
      links?: PayPalLink[]
    }
    const approval = json.links?.find((link) => link.rel === 'approve')?.href
    if (!json.id || !approval) {
      throw new Error('PayPal order response was missing an approval link')
    }
    return { providerOrderId: json.id, approvalUrl: approval }
  },

  async capturePayment(providerOrderId: string): Promise<CaptureResult> {
    if (!this.isConfigured()) {
      throw new PaymentProviderNotConfiguredError('paypal')
    }
    const token = await accessToken()
    const response = await fetch(
      `${config.paypal.apiBase}/v2/checkout/orders/${providerOrderId}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      },
    )
    if (!response.ok) {
      throw new Error(`PayPal capture failed (${response.status})`)
    }
    const json = (await response.json()) as {
      status?: string
      purchase_units?: {
        payments?: {
          captures?: {
            id?: string
            status?: string
            amount?: { value?: string; currency_code?: string }
          }[]
        }
      }[]
    }
    const capture = json.purchase_units?.[0]?.payments?.captures?.[0]
    const value = capture?.amount?.value
    return {
      providerCaptureId: capture?.id ?? '',
      amountCents: value ? Math.round(Number(value) * 100) : 0,
      currency: capture?.amount?.currency_code ?? 'USD',
      completed: json.status === 'COMPLETED' && capture?.status === 'COMPLETED',
    }
  },

  async refundCapture(request: RefundRequest): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'PayPal is not configured on this deployment' }
    }
    if (!request.providerCaptureId) {
      return { ok: false, reason: 'No provider capture id to refund' }
    }

    try {
      const token = await accessToken()
      const response = await fetch(
        `${config.paypal.apiBase}/v2/payments/captures/${request.providerCaptureId}/refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            // Our payment id is the idempotency key, so a retried refund for
            // the same payment returns the original refund instead of issuing
            // a second one.
            'PayPal-Request-Id': `refund-${request.paymentId}`,
          },
          cache: 'no-store',
          body: JSON.stringify({
            amount: {
              currency_code: request.currency,
              value: amountString(request.amountCents),
            },
            note_to_payer: request.reason,
          }),
        },
      )

      const json = (await response.json().catch(() => null)) as {
        id?: string
        status?: string
        message?: string
      } | null

      if (!response.ok) {
        return {
          ok: false,
          reason: `PayPal refund failed (${response.status})${
            json?.message ? `: ${json.message}` : ''
          }`,
        }
      }

      // PayPal reports PENDING for refunds it has accepted but not yet
      // settled. Both COMPLETED and PENDING mean the money is on its way back
      // and must not be refunded again.
      if (json?.status !== 'COMPLETED' && json?.status !== 'PENDING') {
        return {
          ok: false,
          reason: `PayPal refund returned status ${json?.status ?? 'unknown'}`,
        }
      }

      if (!json.id) {
        return { ok: false, reason: 'PayPal refund response had no refund id' }
      }

      return { ok: true, providerRefundId: json.id }
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error ? error.message : 'PayPal refund request failed',
      }
    }
  },

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifiedWebhook | null> {
    const { webhookId, apiBase } = config.paypal
    if (!this.isConfigured() || !webhookId) return null

    let event: {
      id?: string
      event_type?: string
      resource?: {
        id?: string
        status?: string
        custom_id?: string
        supplementary_data?: { related_ids?: { order_id?: string } }
        amount?: { value?: string; currency_code?: string }
      }
    }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return null
    }

    const token = await accessToken()
    const verification = await fetch(
      `${apiBase}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: event,
        }),
      },
    )

    if (!verification.ok) return null
    const result = (await verification.json()) as {
      verification_status?: string
    }
    if (result.verification_status !== 'SUCCESS') return null

    const value = event.resource?.amount?.value
    return {
      eventId: event.id ?? '',
      eventType: event.event_type ?? '',
      customId: event.resource?.custom_id,
      providerOrderId:
        event.resource?.supplementary_data?.related_ids?.order_id,
      providerCaptureId: event.resource?.id,
      amountCents: value ? Math.round(Number(value) * 100) : undefined,
      currency: event.resource?.amount?.currency_code,
      completed:
        event.event_type === 'PAYMENT.CAPTURE.COMPLETED' &&
        event.resource?.status === 'COMPLETED',
    }
  },
}
