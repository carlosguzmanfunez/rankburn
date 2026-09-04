import { NextResponse } from 'next/server'
import { desc, eq, gt } from 'drizzle-orm'
import { DatabaseNotConfiguredError, getDb } from '@/lib/server/db/client'
import { campaigns, legendEntries, products } from '@/lib/server/db/schema'
import { LEGENDS_RETENTION_MS } from '@/lib/server/legends-engine'

export const runtime = 'nodejs'
// Without this, Next treats a parameterless GET as a static prerender
// candidate and opens a database connection during `next build`.
export const dynamic = 'force-dynamic'

/**
 * Legends is historical recognition only.
 *
 * Entries here never participate in the Live Market and never influence Global
 * Rank or Category Rank. Expired entries are filtered in SQL rather than
 * deleted, so the record of a qualifying run survives its display window.
 */
export async function GET() {
  const now = new Date()

  try {
    const db = getDb()

    const rows = await db
      .select({
        campaignId: legendEntries.campaignId,
        productName: products.name,
        productSlug: products.slug,
        category: products.category,
        subtype: products.subtype,
        peakRank: legendEntries.peakRank,
        peakBurnRateCentsPerHour: legendEntries.peakBurnRateCentsPerHour,
        timeAtPeakSeconds: legendEntries.timeAtPeakSeconds,
        qualifiedAt: legendEntries.qualifiedAt,
        expiresAt: legendEntries.expiresAt,
      })
      .from(legendEntries)
      .innerJoin(campaigns, eq(campaigns.id, legendEntries.campaignId))
      .innerJoin(products, eq(products.id, campaigns.productId))
      .where(gt(legendEntries.expiresAt, now))
      .orderBy(
        legendEntries.peakRank,
        desc(legendEntries.timeAtPeakSeconds),
        desc(legendEntries.peakBurnRateCentsPerHour),
      )

    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        retentionHours: LEGENDS_RETENTION_MS / 3_600_000,
        legends: rows,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to load Legends', error)
    return NextResponse.json(
      { error: 'Could not load Legends' },
      { status: 500 },
    )
  }
}
