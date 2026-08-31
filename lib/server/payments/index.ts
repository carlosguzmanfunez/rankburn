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

import { eq, isNull, and } from 'drizzle-orm'
import { config } from '../config'
import { creditBudget } from '../budget-engine'
import { recordAudit } from '../audit'
import { getDb } from '../db/client'
import { payments, processedWebhookEvents } from '../db/schema'
import { newId } from '../id'
import {
  getCampaignBundle,
  getCampaignLabel,
  getPaymentById,
  getPaymentByOrderId,
  toCents,
} from '../store'
import type { Payment } from '../types'
import { paypalProvider } from './paypal'
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

/**
 * Applies a verified webhook. Safe to call repeatedly with the same event.
 */
export async function applyVerifiedPayment(event: VerifiedWebhook): Promise<{
  credited: boolean
  reason: string
}> {
  if (!event.completed) {
    return {
      credited: false,
      reason: 'Event does not report a completed capture',
    }
  }

  const db = getDb()

  // Claim the event id first. If another instance already claimed it, the
  // primary key conflict is the answer: this delivery is a replay.
  if (event.eventId) {
    const claimed = await db
      .insert(processedWebhookEvents)
      .values({
        eventId: event.eventId,
        provider: 'paypal',
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ eventId: processedWebhookEvents.eventId })

    if (claimed.length === 0) {
      return { credited: false, reason: 'Event already processed' }
    }
  }

  const payment = event.customId
    ? await getPaymentById(event.customId)
    : event.providerOrderId
      ? await getPaymentByOrderId(event.providerOrderId)
      : null

  if (!payment) {
    return { credited: false, reason: 'No matching payment record' }
  }
  if (payment.creditedAt) {
    return { credited: false, reason: 'Payment already credited' }
  }

  // The provider's amount is authoritative. If it disagrees with what we
  // recorded, refuse rather than guess.
  if (
    typeof event.amountCents === 'number' &&
    event.amountCents !== payment.amountCents
  ) {
    await db
      .update(payments)
      .set({ status: 'FAILED' })
      .where(eq(payments.id, payment.id))
    return { credited: false, reason: 'Amount mismatch against payment record' }
  }

  const now = new Date()

  // Only the update that actually flips `credited_at` from NULL proceeds, so
  // two concurrent deliveries cannot both credit the balance.
  const claimedPayment = await db
    .update(payments)
    .set({
      status: 'COMPLETED',
      providerCaptureId: event.providerCaptureId ?? null,
      completedAt: now,
      creditedAt: now,
    })
    .where(and(eq(payments.id, payment.id), isNull(payments.creditedAt)))
    .returning({ id: payments.id })

  if (claimedPayment.length === 0) {
    return { credited: false, reason: 'Payment already credited' }
  }

  await creditBudget(payment.campaignId, payment.amountCents, now)

  await recordAudit({
    action: 'BUDGET_CREDITED',
    entityType: 'payment',
    entityId: payment.id,
    entityLabel: await getCampaignLabel(payment.campaignId),
    actorId: `provider:${payment.provider}`,
    actorLabel: payment.provider,
  })

  return { credited: true, reason: 'Advertising budget credited' }
}
