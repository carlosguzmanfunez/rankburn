/**
 * Moderation service.
 *
 * State rules enforced here, on the server, inside a transaction:
 *  - PAUSED campaigns do not consume advertising budget and do not appear in
 *    public rankings. All of their data is kept and they can be resumed.
 *  - FLAGGED and PAUSED are independent. A flagged campaign keeps running
 *    unless a moderator also pauses it.
 *  - REJECTED campaigns never rank again.
 *  - A rejection always requires a reason.
 *  - Approval alone does not create advertising budget. Budget is only
 *    credited by a provider-confirmed payment.
 */

import { eq } from 'drizzle-orm'
import { recordModeration } from './audit'
import { settleCampaign } from './budget-engine'
import { getDb } from './db/client'
import { advertisingBudgets, campaigns } from './db/schema'
import { getCampaignLabel } from './store'
import type { CampaignStatus, ModerationAction } from './types'

export type ModerationResult =
  | { ok: true; status: CampaignStatus }
  | { ok: false; error: string; status: number }

type Actor = { id: string; label: string }

export async function applyModeration(
  campaignId: string,
  action: ModerationAction,
  actor: Actor,
  reason?: string,
): Promise<ModerationResult> {
  const trimmedReason = reason?.trim() || undefined

  if (action === 'REJECT' && !trimmedReason) {
    return {
      ok: false,
      error: 'A reason is required before rejecting a campaign',
      status: 400,
    }
  }

  const now = new Date()

  // Settle before any state change so pausing never bills the paused window.
  await settleCampaign(campaignId, now)

  const db = getDb()
  const label = await getCampaignLabel(campaignId)

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: campaigns.id,
        status: campaigns.status,
        activeCents: advertisingBudgets.activeCents,
      })
      .from(campaigns)
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .where(eq(campaigns.id, campaignId))
      .limit(1)
      .for('update')

    const row = rows[0]
    if (!row) {
      return { ok: false as const, error: 'Campaign not found', status: 404 }
    }

    const current = row.status as CampaignStatus
    const hasBudget = row.activeCents > 0
    const patch: Record<string, unknown> = {}
    let nextStatus = current

    switch (action) {
      case 'APPROVE': {
        if (current !== 'PENDING') {
          return {
            ok: false as const,
            error: 'Only pending campaigns can be approved',
            status: 409,
          }
        }
        nextStatus = hasBudget ? 'ACTIVE' : 'EXHAUSTED'
        patch.approvedAt = now
        patch.rejectionReason = null
        // Start the burn clock now, not at submission time.
        patch.lastSettledAt = now
        patch.balanceChangedAt = now
        break
      }
      case 'REJECT': {
        nextStatus = 'REJECTED'
        patch.rejectionReason = trimmedReason
        break
      }
      case 'FLAG': {
        patch.flagged = true
        patch.flagReason = trimmedReason ?? null
        break
      }
      case 'UNFLAG': {
        patch.flagged = false
        patch.flagReason = null
        break
      }
      case 'PAUSE': {
        if (current === 'REJECTED' || current === 'PENDING') {
          return {
            ok: false as const,
            error: 'Only live campaigns can be paused',
            status: 409,
          }
        }
        nextStatus = 'PAUSED'
        break
      }
      case 'RESUME': {
        if (current !== 'PAUSED') {
          return {
            ok: false as const,
            error: 'Only paused campaigns can be resumed',
            status: 409,
          }
        }
        nextStatus = hasBudget ? 'ACTIVE' : 'EXHAUSTED'
        // Reset the clock so the paused period is never back-billed.
        patch.lastSettledAt = now
        break
      }
      default: {
        return {
          ok: false as const,
          error: 'Unknown moderation action',
          status: 400,
        }
      }
    }

    patch.status = nextStatus

    await tx.update(campaigns).set(patch).where(eq(campaigns.id, campaignId))

    await recordModeration(
      {
        campaignId,
        campaignLabel: label,
        action,
        moderatorId: actor.id,
        moderatorLabel: actor.label,
        reason: trimmedReason,
      },
      tx,
    )

    return { ok: true as const, status: nextStatus }
  })
}
