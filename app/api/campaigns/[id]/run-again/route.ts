import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { DatabaseNotConfiguredError, getDb } from '@/lib/server/db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
} from '@/lib/server/db/schema'
import { recordAudit } from '@/lib/server/audit'
import { newId } from '@/lib/server/id'
import { utcDateKey } from '@/lib/server/store'
import {
  OWNERSHIP_DENIED,
  getAdvertiserSession,
} from '@/lib/server/advertiser-auth'
import {
  RATE_LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from '@/lib/server/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Run Again: creates a NEW commercial run from an exhausted one.
 *
 * The exhausted record is never revived, never refunded into, and never
 * mutated. It stays as history for billing, ranking and analytics. The new run
 * starts APPROVED with zero balance and inherits only the Burn Rate.
 *
 * Beta 2.0 temporary advertiser boundary: without advertiser authentication
 * this is restricted to the demo advertiser identity, exactly like the Burn
 * Rate endpoint. Do not relax it into an unauthenticated public mutation.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limit = checkRateLimit(RATE_LIMITS.runAgain, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const db = getDb()

    const sourceRows = await db
      .select({
        campaign: campaigns,
        product: products,
      })
      .from(campaigns)
      .innerJoin(products, eq(products.id, campaigns.productId))
      .where(
        and(
          eq(campaigns.id, id),
          eq(campaigns.advertiserId, session.sub),
        ),
      )
      .limit(1)

    const source = sourceRows[0]
    if (!source) {
      // The ownership predicate is part of the query, so a campaign belonging
      // to someone else is indistinguishable from one that does not exist.
      return NextResponse.json(
        { error: OWNERSHIP_DENIED.error },
        { status: OWNERSHIP_DENIED.status },
      )
    }

    if (source.campaign.status !== 'EXHAUSTED') {
      return NextResponse.json(
        { error: 'Run Again is available only after a run is exhausted.' },
        { status: 409 },
      )
    }

    // Duplicate protection.
    //
    // If checkout failed or the browser was closed after the previous attempt,
    // an APPROVED, still-unfunded successor already exists. Creating another
    // one would leave a trail of orphan campaigns for a single user intent, so
    // the existing successor is returned instead. Once a successor is funded it
    // becomes ACTIVE and is no longer reusable, so a genuine second run is
    // still possible.
    const existingRows = await db
      .select({
        id: campaigns.id,
        burnRateCentsPerHour: campaigns.burnRateCentsPerHour,
      })
      .from(campaigns)
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .where(
        and(
          eq(campaigns.previousCampaignId, source.campaign.id),
          eq(campaigns.status, 'APPROVED'),
          eq(advertisingBudgets.lifetimeFundedCents, 0),
        ),
      )
      .orderBy(desc(campaigns.createdAt))
      .limit(1)

    const existing = existingRows[0]
    if (existing) {
      return NextResponse.json(
        {
          campaignId: existing.id,
          previousCampaignId: source.campaign.id,
          status: 'APPROVED',
          burnRateCentsPerHour: existing.burnRateCentsPerHour,
          checkoutReady: true,
          reused: true,
        },
        { status: 200 },
      )
    }

    const now = new Date()
    const newCampaignId = newId('camp')

    await db.transaction(async (tx) => {
      await tx.insert(campaigns).values({
        id: newCampaignId,
        advertiserId: source.campaign.advertiserId,
        productId: source.campaign.productId,
        status: 'APPROVED',
        burnRateCentsPerHour: source.campaign.burnRateCentsPerHour,
        burnRateChangedAt: now,
        previousCampaignId: source.campaign.id,
        approvedAt: now,
        createdAt: now,
        lastSettledAt: now,
        balanceChangedAt: now,
      })

      await tx.insert(advertisingBudgets).values({
        campaignId: newCampaignId,
        lifetimeFundedCents: 0,
        lifetimeUsedCents: 0,
        activeCents: 0,
        usedTodayCents: 0,
        usedTodayDate: utcDateKey(now),
        updatedAt: now,
      })

      await tx.insert(campaignStats).values({
        campaignId: newCampaignId,
        impressions: 0,
        visitors: 0,
        outboundClicks: 0,
        verifiedOutboundClicks: 0,
        peakRank: 99,
        minutesAtOne: 0,
        joinedLabel: 'Today',
        rankHistory: '[99]',
      })

      await recordAudit(
        {
          action: 'CAMPAIGN_RUN_AGAIN_CREATED',
          entityType: 'campaign',
          entityId: newCampaignId,
          entityLabel: source.product.name,
          actorId: source.campaign.advertiserId,
          actorLabel: 'advertiser',
          reason: `Run Again from ${source.campaign.id} at ${source.campaign.burnRateCentsPerHour} cents/hour`,
        },
        tx,
      )
    })

    return NextResponse.json(
      {
        campaignId: newCampaignId,
        previousCampaignId: source.campaign.id,
        status: 'APPROVED',
        burnRateCentsPerHour: source.campaign.burnRateCentsPerHour,
        checkoutReady: true,
        reused: false,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to create a new run', error)
    return NextResponse.json(
      { error: 'Could not create the new run.' },
      { status: 500 },
    )
  }
}
