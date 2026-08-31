/**
 * Ranking.
 *
 * One rule decides placement:
 *
 *     higher active advertising budget = higher placement
 *
 * Ties are broken deterministically so the board never flickers between two
 * equal campaigns:
 *   1. active advertising budget, descending
 *   2. the moment the campaign reached its current balance, ascending
 *      (whoever got there first holds the better spot)
 *   3. campaign id, ascending (stable final tie-break)
 *
 * The ordering is done by PostgreSQL, on server state. The browser renders
 * the result; it cannot change it. Only ACTIVE campaigns with budget left
 * rank: PENDING, REJECTED, PAUSED and EXHAUSTED are excluded by the query.
 */

import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import type { CategoryId } from '@/lib/rankburn-data'
import { settleAll } from './budget-engine'
import { getDb } from './db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
  rankSnapshots,
} from './db/schema'
import { newId } from './id'
import {
  listCampaignBundles,
  mapBudget,
  mapCampaign,
  mapProduct,
  mapStats,
  toDollars,
  type CampaignBundle,
} from './store'
import type { Campaign, PublicListing } from './types'

/** A campaign is publicly rankable only while it is ACTIVE with budget left. */
export function isRankable(campaign: Campaign, activeCents: number): boolean {
  return campaign.status === 'ACTIVE' && activeCents > 0
}

export type RankedListing = {
  listing: PublicListing
  rank: number
  categoryRank: number
}

/** Builds the browser-facing view of a campaign from a loaded bundle. */
export function toPublicListing(bundle: CampaignBundle): PublicListing {
  const { campaign, product, budget, stats } = bundle
  return {
    id: campaign.id,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    website: product.website,
    hue: product.hue,
    budget: toDollars(budget.activeCents),
    burnRate: toDollars(campaign.burnRateCentsPerHour),
    totalSpend: toDollars(budget.lifetimeUsedCents),
    spentToday: toDollars(budget.usedTodayCents),
    visitors: stats.visitors,
    impressions: stats.impressions,
    clicks: stats.outboundClicks,
    joined: stats.joinedLabel,
    peakRank: stats.peakRank,
    hoursAtOne: stats.hoursAtOne,
    isNew: stats.joinedLabel === 'Today' ? true : undefined,
    paused: campaign.status === 'PAUSED' ? true : undefined,
    status: campaign.status,
    rankHistory: stats.rankHistory.length > 0 ? stats.rankHistory : [99],
  }
}

/**
 * The authoritative live board. Settles every campaign first so balances
 * reflect real elapsed time, then lets PostgreSQL order what remains
 * rankable using the published tie-break.
 */
export async function getLiveRanking(
  now = new Date(),
): Promise<RankedListing[]> {
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
    .innerJoin(products, eq(campaigns.productId, products.id))
    .innerJoin(
      advertisingBudgets,
      eq(advertisingBudgets.campaignId, campaigns.id),
    )
    .innerJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(
      and(eq(campaigns.status, 'ACTIVE'), gt(advertisingBudgets.activeCents, 0)),
    )
    .orderBy(
      desc(advertisingBudgets.activeCents),
      asc(campaigns.balanceChangedAt),
      asc(campaigns.id),
    )

  const perCategory = new Map<string, number>()
  return rows.map((row, index) => {
    const bundle: CampaignBundle = {
      campaign: mapCampaign(row.campaign),
      product: mapProduct(row.product),
      budget: mapBudget(row.budget),
      stats: mapStats(row.stats),
    }
    const category = bundle.product.category
    const categoryRank = (perCategory.get(category) ?? 0) + 1
    perCategory.set(category, categoryRank)
    return {
      listing: toPublicListing(bundle),
      rank: index + 1,
      categoryRank,
    }
  })
}

/**
 * Where a given active budget would place right now. Used before checkout so
 * the projection comes from server data rather than browser state.
 */
export async function projectPlacement(
  activeCents: number,
  category: CategoryId,
  excludeCampaignId?: string,
  now = new Date(),
): Promise<{ overallRank: number; categoryRank: number }> {
  const ranking = (await getLiveRanking(now)).filter(
    (entry) => entry.listing.id !== excludeCampaignId,
  )
  let overallRank = 1
  let categoryRank = 1
  for (const entry of ranking) {
    if (Math.round(entry.listing.budget * 100) > activeCents) {
      overallRank += 1
      if (entry.listing.category === category) categoryRank += 1
    }
  }
  return { overallRank, categoryRank }
}

/** Every campaign, including non-rankable ones. Moderation view only. */
export async function getAllListings(
  now = new Date(),
): Promise<PublicListing[]> {
  await settleAll(now)
  const bundles = await listCampaignBundles()
  return bundles.map(toPublicListing)
}

/** How often placement history is written. */
const SNAPSHOT_INTERVAL_MINUTES = 5
const SNAPSHOT_INTERVAL_MS = SNAPSHOT_INTERVAL_MINUTES * 60 * 1000
const RANK_HISTORY_LENGTH = 12

/**
 * Records placement history, at most once per interval.
 *
 * This is what makes the rank chart real rather than seeded, and it is the
 * evidence trail showing an advertiser the placement they actually received.
 */
export async function recordRankSnapshot(
  ranking: RankedListing[],
  now = new Date(),
): Promise<void> {
  if (ranking.length === 0) return
  const db = getDb()

  const latest = await db
    .select({ createdAt: rankSnapshots.createdAt })
    .from(rankSnapshots)
    .orderBy(desc(rankSnapshots.createdAt))
    .limit(1)

  const lastAt = latest[0]?.createdAt
  if (lastAt && now.getTime() - new Date(lastAt).getTime() < SNAPSHOT_INTERVAL_MS) {
    return
  }

  await db.transaction(async (tx) => {
    for (const entry of ranking) {
      await tx.insert(rankSnapshots).values({
        id: newId('snap'),
        campaignId: entry.listing.id,
        rank: entry.rank,
        categoryRank: entry.categoryRank,
        activeCents: Math.round(entry.listing.budget * 100),
        createdAt: now,
      })

      const history = [...entry.listing.rankHistory, entry.rank].slice(
        -RANK_HISTORY_LENGTH,
      )

      await tx
        .update(campaignStats)
        .set({
          rankHistory: JSON.stringify(history),
          peakRank: sql`least(${campaignStats.peakRank}, ${entry.rank})`,
          minutesAtOne:
            entry.rank === 1
              ? sql`${campaignStats.minutesAtOne} + ${SNAPSHOT_INTERVAL_MINUTES}`
              : sql`${campaignStats.minutesAtOne}`,
        })
        .where(eq(campaignStats.campaignId, entry.listing.id))
    }
  })
}
