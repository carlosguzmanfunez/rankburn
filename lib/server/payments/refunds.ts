/**
 * Refunds for payments that can never fund the run they were authorised for.
 *
 * FlipPeak Beta 2.0 rule:
 *
 *   A payment authorised for one run must never end up financing a different
 *   run without the payer's explicit consent.
 *
 * So when a verified capture arrives for a run that has already closed, the
 * money is returned to the original payment method. It is not credited to the
 * closed run (that would revive it), and it is not silently moved to a new
 * Run Again campaign (that would spend the payer's money on a different
 * commercial entity than the one they chose).
 *
 * This runs AFTER the payment transaction commits, on purpose. A refund is an
 * outbound network call: performing it inside the transaction would hold row
 * locks across a remote request, and a rollback could not undo it anyway.
 *
 * Idempotency has two independent layers:
 *   1. `payments.status` is moved to REFUND_PENDING by a single conditional
 *      UPDATE inside the payment transaction, so only one execution reaches
 *      this module for a given payment;
 *   2. every state transition here is claimed with a conditional UPDATE that
 *      requires `refunded_at IS NULL`, and the provider call carries the
 *      payment id as its idempotency key.
 *
 * The provider is injected rather than resolved here, so this module does not
 * import back into `payments/index.ts` and create a cycle.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { recordAudit } from '../audit'
import { getDb } from '../db/client'
import { payments } from '../db/schema'
import type { PendingRefund } from './atomic'
import type { PaymentProvider } from './provider'

export type RefundOutcome = {
  refunded: boolean
  reason: string
}

async function markRefundFailed(
  refund: PendingRefund,
  reason: string,
): Promise<RefundOutcome> {
  const db = getDb()

  await db
    .update(payments)
    .set({
      status: 'REFUND_FAILED',
      refundFailureReason: reason,
    })
    .where(and(eq(payments.id, refund.paymentId), isNull(payments.refundedAt)))

  await recordAudit({
    action: 'PAYMENT_REFUND_FAILED',
    entityType: 'payment',
    entityId: refund.paymentId,
    entityLabel: refund.campaignLabel,
    actorId: `provider:${refund.provider}`,
    actorLabel: refund.provider,
    reason,
  })

  return { refunded: false, reason }
}

/**
 * Attempts the refund and records the outcome.
 *
 * Never throws: a failure leaves the payment in REFUND_FAILED with a reason,
 * which is an operator queue, not a lost record.
 */
export async function settlePendingRefund(
  refund: PendingRefund,
  provider: PaymentProvider | null,
): Promise<RefundOutcome> {
  if (!refund.providerCaptureId) {
    return markRefundFailed(
      refund,
      'No provider capture id was available, so the refund could not be issued automatically.',
    )
  }

  if (!provider) {
    return markRefundFailed(
      refund,
      'No payment provider is configured, so the refund could not be issued automatically.',
    )
  }

  const result = await provider.refundCapture({
    paymentId: refund.paymentId,
    providerCaptureId: refund.providerCaptureId,
    amountCents: refund.amountCents,
    currency: refund.currency,
    reason:
      refund.cause === 'REJECTED'
        ? 'The campaign this payment was for was rejected.'
        : 'The advertising run this payment was for had already ended.',
  })

  if (!result.ok) {
    return markRefundFailed(refund, result.reason)
  }

  const db = getDb()
  const now = new Date()

  // `refunded_at IS NULL` is the final guard: if a concurrent execution
  // already recorded the refund, this claims nothing and we do not audit a
  // second refund for the same payment.
  const claimed = await db
    .update(payments)
    .set({
      status: 'REFUNDED',
      providerRefundId: result.providerRefundId,
      refundedAt: now,
      refundFailureReason: null,
    })
    .where(and(eq(payments.id, refund.paymentId), isNull(payments.refundedAt)))
    .returning({ id: payments.id })

  if (claimed.length === 0) {
    return {
      refunded: true,
      reason: 'Refund was already recorded for this payment',
    }
  }

  await recordAudit({
    action: `PAYMENT_REFUNDED_CAMPAIGN_${refund.cause}`,
    entityType: 'payment',
    entityId: refund.paymentId,
    entityLabel: refund.campaignLabel,
    actorId: `provider:${refund.provider}`,
    actorLabel: refund.provider,
    reason: refund.reason,
  })

  return {
    refunded: true,
    reason:
      refund.cause === 'REJECTED'
        ? 'The campaign was rejected, so the payment was refunded to the original payment method.'
        : 'The run had already ended, so the payment was refunded to the original payment method.',
  }
}
