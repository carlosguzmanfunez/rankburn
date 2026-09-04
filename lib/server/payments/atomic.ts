/**
 * FlipPeak Beta 2.0 payment application.
 *
 * Provider verification happens before this function. Once a verified event
 * arrives, event idempotency, payment claim, budget credit and activation are
 * committed in ONE database transaction.
 */

import { and, eq, isNull, notInArray, or } from 'drizzle-orm'
import { recordAudit } from '../audit'
import { creditBudgetInTransaction } from '../budget-engine'
import { getDb } from '../db/client'
import {
  campaigns,
  payments,
  processedWebhookEvents,
  products,
} from '../db/schema'
import type { VerifiedWebhook } from './provider'

/**
 * Describes captured funds that must be returned to the payer because the run
 * they were authorised for is closed. The refund itself happens AFTER this
 * transaction commits: it is an outbound network call and must never be made
 * while holding row locks.
 */
export type PendingRefund = {
  paymentId: string
  campaignLabel: string
  provider: string
  providerCaptureId: string | null
  amountCents: number
  currency: string
  /** Terminal state that made the campaign unfundable. Drives the audit trail. */
  cause: 'EXHAUSTED' | 'REJECTED'
  reason: string
}

export type ApplyPaymentOutcome = {
  credited: boolean
  reason: string
  refund?: PendingRefund
}

export async function applyVerifiedPaymentAtomic(
  event: VerifiedWebhook,
): Promise<ApplyPaymentOutcome> {
  if (!event.completed) {
    return {
      credited: false,
      reason: 'Event does not report a completed capture',
    }
  }

  const db = getDb()
  const now = new Date()

  return db.transaction(async (tx) => {
    if (event.eventId) {
      const claimedEvent = await tx
        .insert(processedWebhookEvents)
        .values({
          eventId: event.eventId,
          provider: 'paypal',
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ eventId: processedWebhookEvents.eventId })

      if (claimedEvent.length === 0) {
        return { credited: false, reason: 'Event already processed' }
      }
    }

    // Permanent conditions below return instead of throwing. A throw rolls
    // the transaction back and answers the provider with an error, which makes
    // PayPal redeliver the event for days. Redelivery can only help a
    // TRANSIENT fault; for a permanent one it is pure noise and hides the real
    // problem. Permanent conditions are therefore recorded and acknowledged.
    if (!event.customId && !event.providerOrderId) {
      return {
        credited: false,
        reason: 'Verified payment event carried no payment identifier',
      }
    }

    const paymentRows = await tx
      .select({
        id: payments.id,
        campaignId: payments.campaignId,
        provider: payments.provider,
        amountCents: payments.amountCents,
        currency: payments.currency,
        creditedAt: payments.creditedAt,
        campaignStatus: campaigns.status,
        campaignName: products.name,
      })
      .from(payments)
      .innerJoin(campaigns, eq(campaigns.id, payments.campaignId))
      .innerJoin(products, eq(products.id, campaigns.productId))
      .where(
        event.customId && event.providerOrderId
          ? or(
              eq(payments.id, event.customId),
              eq(payments.providerOrderId, event.providerOrderId),
            )
          : event.customId
            ? eq(payments.id, event.customId)
            : eq(payments.providerOrderId, event.providerOrderId as string),
      )
      .limit(1)
      .for('update')

    const payment = paymentRows[0]
    if (!payment) {
      await recordAudit(
        {
          action: 'PAYMENT_EVENT_UNMATCHED',
          entityType: 'payment',
          entityId:
            event.customId ?? event.providerOrderId ?? event.eventId ?? 'unknown',
          entityLabel: 'Unmatched provider event',
          actorId: 'provider:paypal',
          actorLabel: 'paypal',
          reason:
            'A verified capture arrived that matches no payment record on this deployment.',
        },
        tx,
      )
      return {
        credited: false,
        reason: 'No matching payment record',
      }
    }

    if (payment.creditedAt) {
      return { credited: false, reason: 'Payment already credited' }
    }

    if (
      typeof event.amountCents === 'number' &&
      event.amountCents !== payment.amountCents
    ) {
      await tx
        .update(payments)
        .set({ status: 'FAILED' })
        .where(eq(payments.id, payment.id))

      return {
        credited: false,
        reason: 'Amount mismatch against payment record',
      }
    }

    // No pre-check on campaign status here: creditBudgetInTransaction() is the
    // single authority on what is fundable, and it distinguishes a closed run
    // (refundable) from a state that must never have produced a payment.

    const credit = await creditBudgetInTransaction(
      tx,
      payment.campaignId,
      payment.amountCents,
      now,
    )

    if (!credit.ok) {
      if (credit.refundable) {
        // General funding rule: the campaign reached a terminal non-fundable
        // state (run exhausted, or campaign rejected) while these funds were
        // already captured. Money authorised for THIS campaign must not credit
        // it, must not revive it, and must not be silently moved elsewhere.
        // It is returned to the payer.
        //
        // This commits rather than throws on purpose: the settlement and the
        // webhook-event claim are correct and must persist, and a redelivery
        // could never succeed, so retrying forever would be pointless.
        //
        // The claim below is the refund idempotency guard. Only one execution
        // can move the payment into REFUND_PENDING, so one payment can never
        // produce two refunds even if this path is reached concurrently.
        const claimedForRefund = await tx
          .update(payments)
          .set({
            status: 'REFUND_PENDING',
            providerCaptureId: event.providerCaptureId ?? null,
            completedAt: now,
          })
          .where(
            and(
              eq(payments.id, payment.id),
              isNull(payments.creditedAt),
              isNull(payments.refundedAt),
              notInArray(payments.status, [
                'REFUND_PENDING',
                'REFUND_FAILED',
                'REFUNDED',
              ]),
            ),
          )
          .returning({ id: payments.id })

        if (claimedForRefund.length === 0) {
          return {
            credited: false,
            reason: 'Payment is already in a refund state',
          }
        }

        const cause = credit.terminalCause ?? 'EXHAUSTED'

        await recordAudit(
          {
            action: `PAYMENT_REFUND_REQUIRED_CAMPAIGN_${cause}`,
            entityType: 'payment',
            entityId: payment.id,
            entityLabel: payment.campaignName,
            actorId: `provider:${payment.provider}`,
            actorLabel: payment.provider,
            reason: credit.message,
          },
          tx,
        )

        return {
          credited: false,
          reason: credit.message,
          refund: {
            paymentId: payment.id,
            campaignLabel: payment.campaignName,
            provider: payment.provider,
            providerCaptureId: event.providerCaptureId ?? null,
            amountCents: payment.amountCents,
            currency: payment.currency,
            cause,
            reason: credit.message,
          },
        }
      }

      // Not fundable and not refundable under an approved rule (for example a
      // REJECTED campaign). The money stays captured and uncredited, and the
      // audit entry is the operator's queue. Acknowledged rather than thrown,
      // because redelivering the same event can never change the outcome.
      await recordAudit(
        {
          action: 'PAYMENT_BLOCKED_CAMPAIGN_NOT_FUNDABLE',
          entityType: 'payment',
          entityId: payment.id,
          entityLabel: payment.campaignName,
          actorId: `provider:${payment.provider}`,
          actorLabel: payment.provider,
          reason: `${credit.code}: ${credit.message}`,
        },
        tx,
      )

      return { credited: false, reason: credit.message }
    }

    const claimedPayment = await tx
      .update(payments)
      .set({
        status: 'COMPLETED',
        providerCaptureId: event.providerCaptureId ?? null,
        completedAt: now,
        creditedAt: now,
      })
      .where(
        and(
          eq(payments.id, payment.id),
          isNull(payments.creditedAt),
        ),
      )
      .returning({ id: payments.id })

    if (claimedPayment.length === 0) {
      throw new Error('Payment lost its credit claim during transaction')
    }

    await recordAudit(
      {
        action: 'BUDGET_CREDITED',
        entityType: 'payment',
        entityId: payment.id,
        entityLabel: payment.campaignName,
        actorId: `provider:${payment.provider}`,
        actorLabel: payment.provider,
      },
      tx,
    )

    return {
      credited: true,
      reason: 'Advertising budget credited atomically',
    }
  })
}
