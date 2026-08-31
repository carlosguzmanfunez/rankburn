import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/server/auth'
import { getAllListings, getLiveRanking } from '@/lib/server/ranking'
import { getPlatformAnalytics } from '@/lib/server/analytics'
import { listAuditLogs } from '@/lib/server/audit'
import { countActiveAdvertisers, listCampaignBundles } from '@/lib/server/store'
import { checkoutEnabled } from '@/lib/server/payments'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Everything the moderation panel renders, in one authorized read.
 * Authorization is checked here on the server, not by hiding a link.
 */
export async function GET() {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const listings = await getAllListings()
    const ranking = await getLiveRanking()
    const analytics = await getPlatformAnalytics()
    const bundles = await listCampaignBundles()
    const activeAdvertisers = await countActiveAdvertisers()

    const byId = new Map(bundles.map((bundle) => [bundle.campaign.id, bundle]))

    const campaigns = listings.map((listing) => {
      const bundle = byId.get(listing.id)
      return {
        ...listing,
        flagged: Boolean(bundle?.campaign.flagged),
        flagReason: bundle?.campaign.flagReason,
        rejectionReason: bundle?.campaign.rejectionReason,
        submittedAt: bundle?.campaign.createdAt,
      }
    })

    const totalActiveBudget = ranking.reduce(
      (sum, entry) => sum + entry.listing.budget,
      0,
    )
    const spendToday = campaigns.reduce((sum, c) => sum + c.spentToday, 0)

    return NextResponse.json(
      {
        moderator: { id: session.sub, email: session.email },
        checkoutEnabled: checkoutEnabled(),
        overview: {
          totalActiveBudget: Number(totalActiveBudget.toFixed(2)),
          spendToday: Number(spendToday.toFixed(2)),
          activeAdvertisers,
          activeCampaigns: campaigns.filter((c) => c.status === 'ACTIVE').length,
          pendingReview: campaigns.filter((c) => c.status === 'PENDING').length,
          pausedCampaigns: campaigns.filter((c) => c.status === 'PAUSED').length,
          flaggedCampaigns: campaigns.filter((c) => c.flagged).length,
          exhaustedCampaigns: campaigns.filter((c) => c.status === 'EXHAUSTED')
            .length,
          impressions: analytics.impressions,
          visitors: analytics.visitors,
          outboundClicks: analytics.outboundClicks,
          verifiedOutboundClicks: analytics.verifiedOutboundClicks,
          ctr: Number(analytics.ctr.toFixed(2)),
        },
        campaigns,
        auditLogs: await listAuditLogs(60),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to build admin snapshot', error)
    return NextResponse.json(
      { error: 'Could not load moderation data' },
      { status: 500 },
    )
  }
}
