/**
 * Payment service.
 *
 * The single rule this file exists to enforce:
 *
 *   A confirmed payment creates or increases Advertising Budget ONLY after
 *   the provider has confirmed it to our server.
 *
 * Never trusted as proof of payment:
 *   - browser query parameters, including `paymentSuccess=true`
 *   - client redirects returning from the provider
 *   - any client-held balance
 *   - an amount sent by the browser
 *
 * The browser chooses an amount; the server records it on a payment row it
 * created, and only credits budget when a verified webhook reports that exact
 * payment as completed.
 *
 * Idempotency is enforced twice, at the database level:
 *   1. `processed_webhook_events.event_id` is a primary key, so a redelivered
 *      provider event cannot be applied again.
 *   2. `payments.credited_at` is checked and set inside the same transaction
 *      that credits the balance.
 */

import { eq } from 'drizzle-orm'
import { config } from '../config'
import { recordAudit } from '../audit'
import { getDb } from '../db/client'
import { payments } from '../db/schema'
import { newId } from '../id'
import {
  getCampaignBundle,
  getPaymentById,
  toCents,
} from '../store'
import type { Payment } from '../types'
import { applyVerifiedPaymentAtomic } from './atomic'
import { paypalProvider } from './paypal'
import { settlePendingRefund } from './refunds'
import {
  SERVICE_DESCRIPTION,
  type CheckoutSession,
  type PaymentProvider,
  type VerifiedWebhook,
} from './provider'

export { SERVICE_DESCRIPTION, SERVICE_NAME } from './provider'

/** Minimum and maximum advertising budget accepted in a single purchase. */
export const MIN_BUDGET_CENTS = 1_000
export const MAX_BUDGET_CENTS = 1_000_000

export function getPaymentProvider(): PaymentProvider | null {
  if (config.paymentProvider === 'paypal' && paypalProvider.isConfigured()) {
    return paypalProvider
  }
  return null
}

export function checkoutEnabled(): boolean {
  return getPaymentProvider() !== null
}

export type CreateCheckoutResult =
  | { ok: true; payment: Payment; session: CheckoutSession }
  | { ok: false; error: string; status: number }

/**
 * Validates the requested amount server-side, records a CREATED payment, and
 * asks the provider for an approval URL. No budget moves here.
 */
export async function createCheckout(input: {
  campaignId: string
  advertiserId: string
  amountDollars: number
}): Promise<CreateCheckoutResult> {
  const bundle = await getCampaignBundle(input.campaignId)
  if (!bundle) {
    return { ok: false, error: 'Campaign not found', status: 404 }
  }

  const amountCents = toCents(input.amountDollars)
  if (
    !Number.isFinite(input.amountDollars) ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_BUDGET_CENTS ||
    amountCents > MAX_BUDGET_CENTS
  ) {
    return { ok: false, error: 'Invalid advertising budget amount', status: 400 }
  }

  const provider = getPaymentProvider()
  if (!provider) {
    return {
      ok: false,
      error:
        'Checkout is not available: no payment provider is configured on this deployment.',
      status: 503,
    }
  }

  const db = getDb()
  const paymentId = newId('pay')
  const now = new Date()

  await db.insert(payments).values({
    id: paymentId,
    campaignId: bundle.campaign.id,
    advertiserId: input.advertiserId,
    provider: provider.id,
    amountCents,
    currency: 'USD',
    status: 'CREATED',
    description: SERVICE_DESCRIPTION,
    createdAt: now,
  })

  try {
    const session = await provider.createCheckout({
      paymentId,
      campaignId: bundle.campaign.id,
      campaignName: bundle.product.name,
      amountCents,
      currency: 'USD',
      returnUrl: `${config.siteUrl}/advertise/return?payment=${paymentId}`,
      cancelUrl: `${config.siteUrl}/advertise?checkout=cancelled`,
    })

    await db
      .update(payments)
      .set({ providerOrderId: session.providerOrderId, status: 'PENDING' })
      .where(eq(payments.id, paymentId))

    await recordAudit({
      action: 'CHECKOUT_CREATED',
      entityType: 'payment',
      entityId: paymentId,
      entityLabel: bundle.product.name,
      actorId: input.advertiserId,
      actorLabel: 'advertiser',
    })

    const payment = await getPaymentById(paymentId)
    if (!payment) {
      return { ok: false, error: 'Payment record disappeared', status: 500 }
    }
    return { ok: true, payment, session }
  } catch (error) {
    await db
      .update(payments)
      .set({ status: 'FAILED' })
      .where(eq(payments.id, paymentId))
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not start checkout',
      status: 502,
    }
  }
}
export async function capturePendingPayment(paymentId: string): Promise<{
  ok: boolean
  error?: string
}> {
  const payment = await getPaymentById(paymentId)

  if (!payment) {
    return { ok: false, error: 'Payment not found' }
  }

  if (payment.status === 'COMPLETED' || payment.creditedAt) {
    return { ok: true }
  }

  if (payment.status !== 'PENDING') {
    return { ok: false, error: `Payment is ${payment.status}` }
  }

  if (!payment.providerOrderId) {
    return { ok: false, error: 'Payment has no provider order id' }
  }

  const provider = getPaymentProvider()

  if (!provider) {
    return { ok: false, error: 'Payment provider is not configured' }
  }

  try {
    const capture = await provider.capturePayment(payment.providerOrderId)

    if (!capture.completed) {
      return { ok: false, error: 'Provider did not confirm the capture' }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Payment capture failed',
    }
  }
}
/**
 * Applies a verified webhook. Safe to call repeatedly with the same event.
 *
 * Two phases, in this order and never merged:
 *   1. one database transaction claims the event, credits budget or claims the
 *      payment for refund, and commits;
 *   2. if the run was closed, the refund is issued outside that transaction,
 *      because it is an outbound network call.
 */
export async function applyVerifiedPayment(
  event: VerifiedWebhook,
): Promise<{ credited: boolean; reason: string }> {
  const outcome = await applyVerifiedPaymentAtomic(event)

  if (!outcome.refund) {
    return { credited: outcome.credited, reason: outcome.reason }
  }

  const refund = await settlePendingRefund(
    outcome.refund,
    getPaymentProvider(),
  )
  return { credited: false, reason: refund.reason }
}
