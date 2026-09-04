/**
 * Development seed.
 *
 * Loads the demo dataset so a fresh database renders a populated market.
 * This is development scaffolding, not production data: it is guarded behind
 * an administrator session and the `RANKBURN_ALLOW_SEED` flag, and it is a
 * no-op if campaigns already exist.
 */

import { count } from 'drizzle-orm'
import { COMPANIES } from '@/lib/rankburn-data'
import { getDb } from './client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
  users,
} from './schema'
import { DEMO_ADVERTISER_ID, toCents, utcDateKey } from '../store'

/**
 * The demo dataset stores bare hostnames. Everything created through the
 * campaign builder stores a normalised absolute URL, so the seed is brought to
 * the same shape and no consumer has to guess which form it received.
 */
function absoluteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/** Submissions so the moderation queue is not empty on a fresh install. */
const PENDING_FIXTURES = [
  {
    id: 'quantleap',
    name: 'QuantLeap',
    website: 'https://quantleap.finance',
    category: 'apps',
    subtype: 'productivity-app',
    tagline: 'See the work that moves the needle.',
    description:
      'QuantLeap turns operational data into prioritized work for fast-moving teams.',
    hue: 265,
    requestedBudget: 500,
  },
  {
    id: 'growthhackr',
    name: 'GrowthHackr',
    website: 'https://growthhackr.xyz',
    category: 'startups',
    subtype: 'startup',
    tagline: 'Automated experiments for growth teams.',
    description:
      'GrowthHackr proposes, launches and measures marketing experiments from one workspace.',
    hue: 12,
    requestedBudget: 1200,
  },
  {
    id: 'dataforge',
    name: 'DataForge',
    website: 'https://dataforge.io',
    category: 'tech',
    subtype: 'developer-tool',
    tagline: 'Production data workflows without the glue code.',
    description:
      'DataForge helps engineering teams build, monitor and troubleshoot data pipelines.',
    hue: 205,
    requestedBudget: 250,
  },
]

export type SeedResult = { seeded: boolean; reason: string }

export async function seedDatabase(): Promise<SeedResult> {
  const db = getDb()

  const existing = await db.select({ total: count() }).from(campaigns)
  if ((existing[0]?.total ?? 0) > 0) {
    return { seeded: false, reason: 'Database already contains campaigns' }
  }

  const now = new Date()
  const dayKey = utcDateKey(now)

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: DEMO_ADVERTISER_ID,
        email: 'advertiser@example.test',
        displayName: 'Demo Advertiser',
        role: 'ADVERTISER',
        createdAt: now,
      })
      .onConflictDoNothing()

    for (const company of COMPANIES) {
      const activeCents = toCents(company.budget)

      await tx.insert(products).values({
        id: company.id,
        ownerId: DEMO_ADVERTISER_ID,
        slug: company.slug,
        name: company.name,
        tagline: company.tagline,
        description: company.description,
        category: company.category,
        subtype: company.subtype,
        website: absoluteUrl(company.website),
        hue: company.hue,
        createdAt: now,
      })

      await tx.insert(campaigns).values({
        id: company.id,
        productId: company.id,
        advertiserId: DEMO_ADVERTISER_ID,
        status: activeCents > 0 ? 'ACTIVE' : 'EXHAUSTED',
        flagged: false,
        burnRateCentsPerHour: toCents(company.burnRate),
        createdAt: now,
        approvedAt: now,
        lastSettledAt: now,
        balanceChangedAt: now,
      })

      await tx.insert(advertisingBudgets).values({
        campaignId: company.id,
        activeCents,
        lifetimeFundedCents: toCents(company.totalSpend) + activeCents,
        lifetimeUsedCents: toCents(company.totalSpend),
        usedTodayCents: toCents(company.spentToday),
        usedTodayDate: dayKey,
        updatedAt: now,
      })

      await tx.insert(campaignStats).values({
        campaignId: company.id,
        impressions: company.visitors * 3,
        visitors: company.visitors,
        outboundClicks: company.clicks,
        verifiedOutboundClicks: 0,
        peakRank: company.peakRank,
        minutesAtOne: company.hoursAtOne * 60,
        // Time at Global Rank #1 is, by definition, also time at Category
        // Rank #1 and time inside the global Top 3. Seeded as that floor so
        // the demo data is internally consistent, never over-credited.
        minutesAtCategoryOne: company.hoursAtOne * 60,
        minutesInTopThree: company.hoursAtOne * 60,
        joinedLabel: company.joined,
        rankHistory: JSON.stringify(company.rankHistory),
      })
    }

    for (const fixture of PENDING_FIXTURES) {
      await tx.insert(products).values({
        id: fixture.id,
        ownerId: DEMO_ADVERTISER_ID,
        slug: fixture.id,
        name: fixture.name,
        tagline: fixture.tagline,
        description: fixture.description,
        category: fixture.category,
        subtype: fixture.subtype,
        website: absoluteUrl(fixture.website),
        hue: fixture.hue,
        createdAt: now,
      })

      await tx.insert(campaigns).values({
        id: fixture.id,
        productId: fixture.id,
        advertiserId: DEMO_ADVERTISER_ID,
        status: 'PENDING',
        flagged: false,
        burnRateCentsPerHour: 3500,
        createdAt: now,
        lastSettledAt: now,
        balanceChangedAt: now,
      })

      // A pending submission carries a REQUESTED amount but no funded
      // budget: approval alone must never create spendable balance. Only a
      // provider-verified payment can. `requestedBudget` on the fixture is
      // documentation of intent, deliberately not written to the balance.
      await tx.insert(advertisingBudgets).values({
        campaignId: fixture.id,
        activeCents: 0,
        lifetimeFundedCents: 0,
        lifetimeUsedCents: 0,
        usedTodayCents: 0,
        usedTodayDate: dayKey,
        updatedAt: now,
      })

      await tx.insert(campaignStats).values({
        campaignId: fixture.id,
        impressions: 0,
        visitors: 0,
        outboundClicks: 0,
        verifiedOutboundClicks: 0,
        peakRank: 99,
        minutesAtOne: 0,
        joinedLabel: 'Today',
        rankHistory: '[99]',
      })
    }
  })

  return { seeded: true, reason: 'Demo dataset loaded' }
}
