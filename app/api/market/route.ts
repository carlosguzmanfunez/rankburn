import { NextResponse } from 'next/server'
import {
  getLiveRanking,
  getPublicListings,
  recordRankSnapshot,
  TIER_ROTATION_MS,
} from '@/lib/server/ranking'
import { getPlatformAnalytics } from '@/lib/server/analytics'
import { checkoutEnabled } from '@/lib/server/payments'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * FlipPeak Beta 2.0 public market snapshot.
 *
 * `generatedAtMs` is the authoritative time reference used by clients to
 * synchronize 20-second tier spotlight rotation.
 */
export async function GET() {
  try {
    const now = new Date()
    const ranking = await getLiveRanking(now)
    await recordRankSnapshot(ranking, now)

    // Public endpoint: never the moderation view. PENDING, APPROVED and
    // REJECTED campaigns are excluded server-side, not hidden by the client.
    const listings = await getPublicListings(now)
    const analytics = await getPlatformAnalytics()

    const totalActiveBudget = ranking.reduce(
      (sum, entry) => sum + entry.listing.budget,
      0,
    )

    const totalBurnRate = ranking.reduce(
      (sum, entry) => sum + entry.listing.burnRate,
      0,
    )

    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        generatedAtMs: now.getTime(),
        rotationMs: TIER_ROTATION_MS,
        totalActiveBudget: Number(totalActiveBudget.toFixed(2)),
        totalBurnRate: Number(totalBurnRate.toFixed(2)),
        checkoutEnabled: checkoutEnabled(),
        ranked: ranking.map((entry) => ({
          rank: entry.rank,
          categoryRank: entry.categoryRank,
          tierSize: entry.tierSize,
          categoryTierSize: entry.categoryTierSize,
          listing: entry.listing,
        })),
        listings,
        analytics,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 },
      )
    }
    console.error('Failed to build market snapshot', error)
    return NextResponse.json(
      { error: 'Could not load the market' },
      { status: 500 },
    )
  }
}
