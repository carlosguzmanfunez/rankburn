import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getAdvertiserSession } from '@/lib/server/advertiser-auth'
import { DatabaseNotConfiguredError, getDb } from '@/lib/server/db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
} from '@/lib/server/db/schema'
import { settleAll } from '@/lib/server/budget-engine'
import { toPublicListing } from '@/lib/server/ranking'
import { mapBudget, mapCampaign, mapProduct, mapStats } from '@/lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * My Campaigns: everything this advertiser owns, in every status.
 *
 * This is the counterpart to `/api/market`, and the distinction is the whole
 * point of the endpoint:
 *
 *   /api/market      answers "who is competing?"      - public, ACTIVE/PAUSED/EXHAUSTED
 *   /api/me/campaigns answers "what do I own?"        - private, every status
 *
 * A campaign that has just been created is APPROVED and unfunded. It is not in
 * the Live Market yet and must not be, but it belongs to its owner right away
 * and has to be visible to them immediately. Public visibility and ownership
 * are independent questions.
 *
 * Scoped by the session subject. No advertiser id is read from the request.
 */
export async function GET() {
  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  try {
    const now = new Date()
    // Settle first so remaining budget and status are current rather than
    // whatever they were at the last write.
    await settleAll(now)

    const db = getDb()
    const rows = await db
      .select({
        campaign: campaigns,
        product: products,
        budget: advertisingBudgets,
        stats: campaignStats,
      })
      .from(campaigns)
      .innerJoin(products, eq(products.id, campaigns.productId))
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .innerJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
      .where(eq(campaigns.advertiserId, session.sub))
      .orderBy(desc(campaigns.createdAt))

    const campaignsForOwner = rows.map((row) => {
      const listing = toPublicListing({
        campaign: mapCampaign(row.campaign),
        product: mapProduct(row.product),
        budget: mapBudget(row.budget),
        stats: mapStats(row.stats),
      })

      return {
        ...listing,
        // Owner-only context. Never present on the public market payload.
        rejectionReason: row.campaign.rejectionReason ?? null,
        previousCampaignId: row.campaign.previousCampaignId ?? null,
        // Whether the market can currently see it, stated explicitly so the
        // dashboard never has to re-derive the public rule.
        publiclyVisible:
          row.campaign.status === 'ACTIVE' ||
          row.campaign.status === 'PAUSED' ||
          row.campaign.status === 'EXHAUSTED',
        awaitingFunding:
          row.campaign.status === 'APPROVED' && row.budget.activeCents === 0,
      }
    })

    return NextResponse.json(
      { generatedAt: now.toISOString(), campaigns: campaignsForOwner },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to load owned campaigns', error)
    return NextResponse.json(
      { error: 'Could not load your campaigns.' },
      { status: 500 },
    )
  }
}
