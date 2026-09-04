/**
 * Analytics.
 *
 * Four distinct concepts, deliberately not collapsed into one number:
 *
 *  impressions              a campaign was rendered on a surface
 *  visitors                 a distinct anonymous session browsing RankBurn
 *  outbound clicks          someone clicked through to the advertiser
 *  verified outbound clicks the subset that passed anomaly checks
 *
 * Nothing here consumes advertising budget. Clicks are measured, not billed.
 *
 * `verified` is always false in this version. The column, the counter and the
 * anomaly hook exist so traffic-quality scoring can be added later without a
 * migration or a change to the event contract.
 */

import { and, count, eq, gte, sql } from 'drizzle-orm'
import { getDb } from './db/client'
import {
  campaignStats,
  impressions,
  outboundClicks,
  visitorEvents,
} from './db/schema'
import { newId } from './id'
import { campaignExists } from './store'

/** Minimum gap between two counted outbound clicks from one visitor. */
const CLICK_DEDUPE_WINDOW_MS = 10_000

export type AnalyticsEventInput =
  | { type: 'impression'; campaignId: string; surface?: string }
  | { type: 'visitor'; path: string }
  | { type: 'outbound_click'; campaignId: string }

export type AnomalySignal = 'duplicate_click' | 'unknown_campaign' | null

/**
 * Cheap first-pass anomaly screening. Real detection needs rate limits, IP
 * reputation and device signals this MVP does not have, so this only rejects
 * the obvious case: the same visitor click-spamming the same campaign within
 * a few seconds.
 */
async function screenOutboundClick(
  campaignId: string,
  visitorKey: string,
  now: Date,
): Promise<AnomalySignal> {
  const db = getDb()
  const cutoff = new Date(now.getTime() - CLICK_DEDUPE_WINDOW_MS)
  const rows = await db
    .select({ total: count() })
    .from(outboundClicks)
    .where(
      and(
        eq(outboundClicks.campaignId, campaignId),
        eq(outboundClicks.visitorKey, visitorKey),
        gte(outboundClicks.createdAt, cutoff),
      ),
    )
  return (rows[0]?.total ?? 0) > 0 ? 'duplicate_click' : null
}

export async function recordAnalyticsEvent(
  input: AnalyticsEventInput,
  visitorKey: string,
  now = new Date(),
): Promise<{ recorded: boolean; anomaly: AnomalySignal }> {
  const db = getDb()

  if (input.type === 'visitor') {
    await db.insert(visitorEvents).values({
      id: newId('vis'),
      visitorKey,
      path: input.path.slice(0, 200),
      createdAt: now,
    })
    return { recorded: true, anomaly: null }
  }

  if (!(await campaignExists(input.campaignId))) {
    return { recorded: false, anomaly: 'unknown_campaign' }
  }

  if (input.type === 'impression') {
    await db.insert(impressions).values({
      id: newId('imp'),
      campaignId: input.campaignId,
      visitorKey,
      surface: input.surface ?? 'unknown',
      createdAt: now,
    })
    await db
      .update(campaignStats)
      .set({ impressions: sql`${campaignStats.impressions} + 1` })
      .where(eq(campaignStats.campaignId, input.campaignId))
    return { recorded: true, anomaly: null }
  }

  const anomaly = await screenOutboundClick(input.campaignId, visitorKey, now)

  await db.insert(outboundClicks).values({
    id: newId('clk'),
    campaignId: input.campaignId,
    visitorKey,
    verified: false,
    createdAt: now,
  })

  // Anomalous clicks are stored for auditing but never inflate the counter
  // the advertiser sees.
  if (!anomaly) {
    await db
      .update(campaignStats)
      .set({ outboundClicks: sql`${campaignStats.outboundClicks} + 1` })
      .where(eq(campaignStats.campaignId, input.campaignId))
  }

  return { recorded: true, anomaly }
}

export type PlatformAnalytics = {
  impressions: number
  visitors: number
  outboundClicks: number
  verifiedOutboundClicks: number
  ctr: number
}

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const db = getDb()
  const rows = await db
    .select({
      impressions: sql<number>`coalesce(sum(${campaignStats.impressions}), 0)::int`,
      visitors: sql<number>`coalesce(sum(${campaignStats.visitors}), 0)::int`,
      outboundClicks: sql<number>`coalesce(sum(${campaignStats.outboundClicks}), 0)::int`,
      verifiedOutboundClicks: sql<number>`coalesce(sum(${campaignStats.verifiedOutboundClicks}), 0)::int`,
    })
    .from(campaignStats)

  const totals = rows[0] ?? {
    impressions: 0,
    visitors: 0,
    outboundClicks: 0,
    verifiedOutboundClicks: 0,
  }

  return {
    impressions: totals.impressions,
    visitors: totals.visitors,
    outboundClicks: totals.outboundClicks,
    verifiedOutboundClicks: totals.verifiedOutboundClicks,
    ctr:
      totals.visitors > 0
        ? (totals.outboundClicks / totals.visitors) * 100
        : 0,
  }
}
