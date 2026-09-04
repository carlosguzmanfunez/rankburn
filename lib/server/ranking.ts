/**
 * FlipPeak Beta 2.0 — authoritative Burn Rate ranking.
 *
 * Competitive rule:
 *   higher burnRateCentsPerHour = stronger position
 *
 * Budget NEVER determines position. Equal Burn Rates share the same dense rank.
 * A stable campaign-id order exists only to make tier rendering/rotation
 * deterministic; it has no competitive meaning.
 */

import { and, asc, desc, eq, gt, gte } from 'drizzle-orm'
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

export const MIN_BURN_RATE_CENTS_PER_HOUR = 100
export const STANDARD_MAX_BURN_RATE_CENTS_PER_HOUR = 10_000
export const ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR = 100_000
export const TIER_ROTATION_MS = 20_000

/** ACTIVE + funded + at least $1/h. */
export function isRankable(
  campaign: Campaign,
  activeCents: number,
): boolean {
  return (
    campaign.status === 'ACTIVE' &&
    activeCents > 0 &&
    campaign.burnRateCentsPerHour >= MIN_BURN_RATE_CENTS_PER_HOUR
  )
}

export type RankedListing = {
  listing: PublicListing
  /** Dense global rank. Equal Burn Rates share this value. */
  rank: number
  /** Dense rank inside the listing's main category. */
  categoryRank: number
  /** Number of campaigns sharing the global Burn Rate tier. */
  tierSize: number
  /** Number sharing the Burn Rate tier inside this category. */
  categoryTierSize: number
}

export type PlacementRelationship =
  | 'SOLE_LEADER'
  | 'JOIN_LEADER_TIER'
  | 'JOIN_TIER'
  | 'TAKE_POSITION'
  | 'BELOW_LEADER'

export type PlacementProjection = {
  burnRateCentsPerHour: number
  overallRank: number
  categoryRank: number
  globalTierSize: number
  categoryTierSize: number
  globalLeaderBurnRateCentsPerHour: number | null
  categoryLeaderBurnRateCentsPerHour: number | null
  nextGlobalBurnRateCentsPerHour: number | null
  nextCategoryBurnRateCentsPerHour: number | null
  relationship: PlacementRelationship
}

export function toPublicListing(bundle: CampaignBundle): PublicListing {
  const { campaign, product, budget, stats } = bundle
  return {
    id: campaign.id,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    subtype: product.subtype,
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
    minutesAtOne: stats.minutesAtOne,
    minutesAtCategoryOne: stats.minutesAtCategoryOne,
    minutesInTopThree: stats.minutesInTopThree,
    hoursAtOne: stats.hoursAtOne,
    isNew: stats.joinedLabel === 'Today' ? true : undefined,
    paused: campaign.status === 'PAUSED' ? true : undefined,
    status: campaign.status,
    rankHistory: stats.rankHistory.length > 0 ? stats.rankHistory : [99],
  }
}

type LoadedRow = {
  campaign: typeof campaigns.$inferSelect
  product: typeof products.$inferSelect
  budget: typeof advertisingBudgets.$inferSelect
  stats: typeof campaignStats.$inferSelect
}

function toBundle(row: LoadedRow): CampaignBundle {
  return {
    campaign: mapCampaign(row.campaign),
    product: mapProduct(row.product),
    budget: mapBudget(row.budget),
    stats: mapStats(row.stats),
  }
}

/**
 * Authoritative live board.
 *
 * PostgreSQL orders by Burn Rate DESC. ID is a deterministic technical order
 * inside equal-rate tiers only. Dense rank is assigned in application code.
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
      and(
        eq(campaigns.status, 'ACTIVE'),
        gt(advertisingBudgets.activeCents, 0),
        gte(
          campaigns.burnRateCentsPerHour,
          MIN_BURN_RATE_CENTS_PER_HOUR,
        ),
      ),
    )
    .orderBy(
      desc(campaigns.burnRateCentsPerHour),
      asc(campaigns.id),
    )

  return buildRankedEntries(rows.map(toBundle).map(toPublicListing))
}

/**
 * Assigns dense Global Rank and dense Category Rank to an ordered listing set.
 *
 * Pure and exported so the ranking rule can be verified without a database.
 * This is the ONLY place the rule is expressed.
 *
 * The rule, in full:
 *
 *   - order by Burn Rate descending, then by id ascending;
 *   - equal Burn Rate means the same rank (dense, so ranks never skip);
 *   - Category Rank is the same rule applied within each category;
 *   - nothing else participates. Budget, spend, clicks, impressions,
 *     visitors, age and amount paid are all absent by construction, not by
 *     being weighted at zero.
 *
 * The id tiebreak exists so the tier rotation has a stable member order. It
 * carries no competitive meaning and cannot be bought.
 */
export function buildRankedEntries(
  listings: PublicListing[],
): RankedListing[] {
  const ordered = [...listings].sort(
    (a, b) => b.burnRate - a.burnRate || a.id.localeCompare(b.id),
  )

  const globalTierSizes = new Map<number, number>()
  const categoryTierSizes = new Map<string, number>()

  for (const listing of ordered) {
    const rate = listing.burnRate
    globalTierSizes.set(rate, (globalTierSizes.get(rate) ?? 0) + 1)

    const categoryKey = `${listing.category}:${rate}`
    categoryTierSizes.set(
      categoryKey,
      (categoryTierSizes.get(categoryKey) ?? 0) + 1,
    )
  }

  let globalDenseRank = 0
  let previousGlobalRate: number | null = null

  const categoryState = new Map<
    string,
    { previousRate: number | null; denseRank: number }
  >()

  return ordered.map((listing) => {
    const rate = listing.burnRate

    if (previousGlobalRate !== rate) {
      globalDenseRank += 1
      previousGlobalRate = rate
    }

    const category = listing.category
    const state = categoryState.get(category) ?? {
      previousRate: null,
      denseRank: 0,
    }

    if (state.previousRate !== rate) {
      state.denseRank += 1
      state.previousRate = rate
    }
    categoryState.set(category, state)

    return {
      listing,
      rank: globalDenseRank,
      categoryRank: state.denseRank,
      tierSize: globalTierSizes.get(rate) ?? 1,
      categoryTierSize: categoryTierSizes.get(`${category}:${rate}`) ?? 1,
    }
  })
}

/**
 * Deterministic global tier spotlight.
 * All clients using the same authoritative timestamp select the same member.
 */
export function getTierSpotlightIndex(
  memberCount: number,
  authoritativeNowMs: number,
): number {
  if (memberCount <= 1) return 0
  const slot = Math.floor(authoritativeNowMs / TIER_ROTATION_MS)
  return slot % memberCount
}

function distinctRates(
  ranking: RankedListing[],
  category?: CategoryId,
): number[] {
  return [
    ...new Set(
      ranking
        .filter((entry) =>
          category ? entry.listing.category === category : true,
        )
        .map((entry) => Math.round(entry.listing.burnRate * 100)),
    ),
  ].sort((a, b) => b - a)
}

/**
 * Burn-Rate-based market projection.
 *
 * Existing equal-rate campaigns are counted as tier peers, not as campaigns
 * occupying separate ranks.
 */
export async function projectBurnRatePlacement(
  burnRateCentsPerHour: number,
  category: CategoryId,
  excludeCampaignId?: string,
  now = new Date(),
): Promise<PlacementProjection> {
  if (
    !Number.isInteger(burnRateCentsPerHour) ||
    burnRateCentsPerHour < MIN_BURN_RATE_CENTS_PER_HOUR ||
    burnRateCentsPerHour > ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR
  ) {
    throw new RangeError('Burn Rate must be between $1/h and $1,000/h')
  }

  const ranking = (await getLiveRanking(now)).filter(
    (entry) => entry.listing.id !== excludeCampaignId,
  )

  const globalRates = distinctRates(ranking)
  const categoryRates = distinctRates(ranking, category)

  const overallRank =
    1 + globalRates.filter((rate) => rate > burnRateCentsPerHour).length
  const categoryRank =
    1 + categoryRates.filter((rate) => rate > burnRateCentsPerHour).length

  const globalTierSize = ranking.filter(
    (entry) =>
      Math.round(entry.listing.burnRate * 100) === burnRateCentsPerHour,
  ).length

  const categoryTierSize = ranking.filter(
    (entry) =>
      entry.listing.category === category &&
      Math.round(entry.listing.burnRate * 100) === burnRateCentsPerHour,
  ).length

  const globalLeaderBurnRateCentsPerHour = globalRates[0] ?? null
  const categoryLeaderBurnRateCentsPerHour = categoryRates[0] ?? null

  const nextGlobalBurnRateCentsPerHour =
    [...globalRates]
      .reverse()
      .find((rate) => rate > burnRateCentsPerHour) ?? null

  const nextCategoryBurnRateCentsPerHour =
    [...categoryRates]
      .reverse()
      .find((rate) => rate > burnRateCentsPerHour) ?? null

  let relationship: PlacementRelationship = 'BELOW_LEADER'

  if (
    globalLeaderBurnRateCentsPerHour === null ||
    burnRateCentsPerHour > globalLeaderBurnRateCentsPerHour
  ) {
    relationship = 'SOLE_LEADER'
  } else if (
    burnRateCentsPerHour === globalLeaderBurnRateCentsPerHour
  ) {
    relationship =
      globalTierSize > 0 ? 'JOIN_LEADER_TIER' : 'SOLE_LEADER'
  } else if (globalTierSize > 0) {
    relationship = 'JOIN_TIER'
  } else if (
    nextGlobalBurnRateCentsPerHour !== null &&
    burnRateCentsPerHour >
      (globalRates[overallRank] ?? Number.NEGATIVE_INFINITY)
  ) {
    relationship = 'TAKE_POSITION'
  }

  return {
    burnRateCentsPerHour,
    overallRank,
    categoryRank,
    globalTierSize,
    categoryTierSize,
    globalLeaderBurnRateCentsPerHour,
    categoryLeaderBurnRateCentsPerHour,
    nextGlobalBurnRateCentsPerHour,
    nextCategoryBurnRateCentsPerHour,
    relationship,
  }
}

/** Every campaign, including non-rankable ones. Moderation view only. */
export async function getAllListings(
  now = new Date(),
): Promise<PublicListing[]> {
  await settleAll(now)
  const bundles = await listCampaignBundles()
  return bundles.map(toPublicListing)
}

/**
 * Statuses a visitor is allowed to see.
 *
 *   ACTIVE     currently competing
 *   PAUSED     temporarily out of the market, still a real placement
 *   EXHAUSTED  a finished run, which the historical leaderboards report on
 *
 * PENDING and APPROVED are submissions that have never been public, and
 * REJECTED campaigns must not be republished by any surface. None of the three
 * belong in an unauthenticated response.
 */
const PUBLICLY_VISIBLE_STATUSES: ReadonlySet<Campaign['status']> = new Set([
  'ACTIVE',
  'PAUSED',
  'EXHAUSTED',
])

/**
 * What the public market endpoint may return.
 *
 * `getAllListings()` is the moderation view and must never be served
 * unauthenticated: it exposes submissions and rejected campaigns.
 */
export async function getPublicListings(
  now = new Date(),
): Promise<PublicListing[]> {
  await settleAll(now)
  const bundles = await listCampaignBundles()
  return bundles
    .filter((bundle) => PUBLICLY_VISIBLE_STATUSES.has(bundle.campaign.status))
    .map(toPublicListing)
}

const SNAPSHOT_INTERVAL_MINUTES = 5
const SNAPSHOT_INTERVAL_MS = SNAPSHOT_INTERVAL_MINUTES * 60 * 1000
const RANK_HISTORY_LENGTH = 12
/** What counts as the global Top 3 for sustained-position tracking. */
const TOP_TIER_RANK = 3

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
  if (
    lastAt &&
    now.getTime() - new Date(lastAt).getTime() < SNAPSHOT_INTERVAL_MS
  ) {
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
        burnRateCentsPerHour: Math.round(entry.listing.burnRate * 100),
        createdAt: now,
      })

      const history = [...entry.listing.rankHistory, entry.rank].slice(
        -RANK_HISTORY_LENGTH,
      )

      await tx
        .update(campaignStats)
        .set({
          rankHistory: JSON.stringify(history),
          peakRank: Math.min(entry.listing.peakRank, entry.rank),
          // Accumulate on the RAW minutes. The previous version rebuilt the
          // value from the whole-hour projection, so every write truncated
          // the sub-hour remainder and the counter could never cross an hour
          // boundary. A campaign at #1 stayed at "0h" forever.
          // Three sustained-position counters, all accumulated on their RAW
          // stored value. Legends qualification reads these, so a truncating
          // round-trip here would quietly make recognition unreachable.
          minutesAtOne:
            entry.rank === 1
              ? entry.listing.minutesAtOne + SNAPSHOT_INTERVAL_MINUTES
              : entry.listing.minutesAtOne,
          minutesAtCategoryOne:
            entry.categoryRank === 1
              ? entry.listing.minutesAtCategoryOne + SNAPSHOT_INTERVAL_MINUTES
              : entry.listing.minutesAtCategoryOne,
          minutesInTopThree:
            entry.rank <= TOP_TIER_RANK
              ? entry.listing.minutesInTopThree + SNAPSHOT_INTERVAL_MINUTES
              : entry.listing.minutesInTopThree,
        })
        .where(eq(campaignStats.campaignId, entry.listing.id))
    }
  })
}
