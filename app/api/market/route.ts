import { NextResponse } from 'next/server'
import { getAllListings, getLiveRanking, recordRankSnapshot } from '@/lib/server/ranking'
import { getPlatformAnalytics } from '@/lib/server/analytics'
import { checkoutEnabled } from '@/lib/server/payments'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The public, server-derived state of the live advertising market.
 *
 * Balances are settled from elapsed wall-clock time on every request, so this
 * is correct even if no browser has been open for days.
 */
export async function GET() {
  try {
    const ranking = await getLiveRanking()
    // Placement history, throttled internally to one write per interval.
    await recordRankSnapshot(ranking)

    const listings = await getAllListings()
    const analytics = await getPlatformAnalytics()

    const totalActiveBudget = ranking.reduce(
      (sum, entry) => sum + entry.listing.budget,
      0,
    )

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        totalActiveBudget: Number(totalActiveBudget.toFixed(2)),
        checkoutEnabled: checkoutEnabled(),
        ranked: ranking.map((entry) => ({
          rank: entry.rank,
          categoryRank: entry.categoryRank,
          listing: entry.listing,
        })),
        listings,
        analytics,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to build market snapshot', error)
    return NextResponse.json(
      { error: 'Could not load the market' },
      { status: 500 },
    )
  }
}
