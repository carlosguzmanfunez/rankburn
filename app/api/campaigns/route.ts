import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CATEGORIES, type CategoryId } from '@/lib/rankburn-data'
import { recordAudit } from '@/lib/server/audit'
import { getDb, DatabaseNotConfiguredError } from '@/lib/server/db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
  users,
} from '@/lib/server/db/schema'
import { newId, slugify } from '@/lib/server/id'
import { DEMO_ADVERTISER_ID, slugsInUse, utcDateKey } from '@/lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isCategory(value: unknown): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value)
}

/** Builds a unique slug without a read-modify-write race on every attempt. */
async function uniqueSlug(base: string): Promise<string> {
  const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)]
  const taken = await slugsInUse(candidates)
  const free = candidates.find((candidate) => !taken.has(candidate))
  return free ?? `${base}-${Date.now().toString(36)}`
}

/**
 * Submits a new product for review.
 *
 * A submission enters the queue as PENDING with zero advertising budget. It
 * cannot rank, cannot consume, and gains budget only after a moderator
 * approves it AND a payment is confirmed by the provider.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as {
    name?: string
    website?: string
    category?: string
    tagline?: string
    description?: string
    hue?: number
  }

  const name = input.name?.trim()
  if (!name || name.length < 2 || name.length > 60) {
    return NextResponse.json(
      { error: 'Product name is required' },
      { status: 400 },
    )
  }
  if (!isCategory(input.category)) {
    return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
  }

  const baseSlug = slugify(name)
  if (!baseSlug) {
    return NextResponse.json(
      { error: 'Product name is not usable' },
      { status: 400 },
    )
  }

  try {
    const db = getDb()
    const slug = await uniqueSlug(baseSlug)
    const now = new Date()
    const productId = newId('prod')
    const campaignId = newId('camp')

    await db.transaction(async (tx) => {
      // The demo advertiser may not exist yet on a database that was never
      // seeded, and campaigns carry a foreign key to it.
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

      await tx.insert(products).values({
        id: productId,
        ownerId: DEMO_ADVERTISER_ID,
        slug,
        name,
        tagline: input.tagline?.trim().slice(0, 120) || `${name} on FlipPeak.`,
        description:
          input.description?.trim().slice(0, 600) ||
          `${name} is competing for advertising placement on FlipPeak.`,
        category: input.category as CategoryId,
        website: input.website?.trim().slice(0, 120) || `${slug}.com`,
        hue:
          typeof input.hue === 'number' && input.hue >= 0 && input.hue < 360
            ? Math.floor(input.hue)
            : 42,
        createdAt: now,
      })

      await tx.insert(campaigns).values({
        id: campaignId,
        productId,
        advertiserId: DEMO_ADVERTISER_ID,
        status: 'PENDING',
        flagged: false,
        burnRateCentsPerHour: 3500,
        createdAt: now,
        lastSettledAt: now,
        balanceChangedAt: now,
      })

      await tx.insert(advertisingBudgets).values({
        campaignId,
        activeCents: 0,
        lifetimeFundedCents: 0,
        lifetimeUsedCents: 0,
        usedTodayCents: 0,
        usedTodayDate: utcDateKey(now),
        updatedAt: now,
      })

      await tx.insert(campaignStats).values({
        campaignId,
        impressions: 0,
        visitors: 0,
        outboundClicks: 0,
        verifiedOutboundClicks: 0,
        peakRank: 99,
        minutesAtOne: 0,
        joinedLabel: 'Today',
        rankHistory: '[99]',
      })
    })

    await recordAudit({
      action: 'CAMPAIGN_SUBMITTED',
      entityType: 'campaign',
      entityId: campaignId,
      entityLabel: name,
      actorId: DEMO_ADVERTISER_ID,
      actorLabel: 'advertiser',
    })

    return NextResponse.json(
      { campaignId, slug, status: 'PENDING' },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to submit campaign', error)
    return NextResponse.json(
      { error: 'Could not submit this product' },
      { status: 500 },
    )
  }
}
