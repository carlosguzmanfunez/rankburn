import { NextResponse } from 'next/server'
import { getAdvertiserSession } from '@/lib/server/advertiser-auth'
import { recordAudit } from '@/lib/server/audit'
import { DatabaseNotConfiguredError, getDb } from '@/lib/server/db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  products,
} from '@/lib/server/db/schema'
import { newId, slugify } from '@/lib/server/id'
import {
  RATE_LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from '@/lib/server/rate-limit'
import { slugsInUse, utcDateKey } from '@/lib/server/store'
import { validateCampaignPreflight } from '@/lib/flippeak/campaign-preflight'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function uniqueSlug(base: string): Promise<string> {
  const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)]
  const taken = await slugsInUse(candidates)
  return (
    candidates.find((candidate) => !taken.has(candidate)) ??
    `${base}-${Date.now().toString(36)}`
  )
}

/**
 * Creates a campaign for the authenticated advertiser.
 *
 * Ownership is taken from the session and nowhere else. The request body has
 * no `ownerId` / `advertiserId` field, and if one were sent it would be
 * ignored: a client cannot choose or forge who owns a campaign.
 *
 * The campaign starts APPROVED with zero balance. That means:
 *   - it is immediately visible to its owner in My Campaigns;
 *   - it is NOT in the Live Market, and must not be, until a verified payment
 *     funds it and it becomes ACTIVE.
 *
 * Automatic preflight replaces a mandatory human queue before payment. Human
 * moderation is post-publication or for exceptions.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(RATE_LIMITS.campaignCreate, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json(
      { error: 'Sign in to create a campaign.' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const preflight = validateCampaignPreflight({
    name: typeof body.name === 'string' ? body.name : '',
    website: typeof body.website === 'string' ? body.website : '',
    category: typeof body.category === 'string' ? body.category : '',
    subtype: typeof body.subtype === 'string' ? body.subtype : '',
    burnRateCentsPerHour:
      typeof body.burnRateCentsPerHour === 'number'
        ? body.burnRateCentsPerHour
        : Number.NaN,
  })

  if (!preflight.ok) {
    return NextResponse.json(
      {
        error: 'Campaign needs changes before checkout.',
        code: 'PREFLIGHT_FAILED',
        issues: preflight.issues,
      },
      { status: 422 },
    )
  }

  try {
    const db = getDb()
    const now = new Date()
    const productId = newId('prod')
    const campaignId = newId('camp')
    const slug = await uniqueSlug(slugify(preflight.normalized.name))

    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: productId,
        ownerId: session.sub,
        slug,
        name: preflight.normalized.name,
        tagline: `${preflight.normalized.name} on FlipPeak.`,
        description: `${preflight.normalized.name} is competing on FlipPeak.`,
        category: preflight.normalized.category,
        subtype: preflight.normalized.subtype,
        website: preflight.normalized.website,
        hue: 42,
        createdAt: now,
      })

      await tx.insert(campaigns).values({
        id: campaignId,
        advertiserId: session.sub,
        productId,
        status: 'APPROVED',
        flagged: false,
        burnRateCentsPerHour: preflight.normalized.burnRateCentsPerHour,
        burnRateChangedAt: now,
        approvedAt: now,
        lastSettledAt: now,
        balanceChangedAt: now,
        createdAt: now,
      })

      await tx.insert(advertisingBudgets).values({
        campaignId,
        activeCents: 0,
        usedTodayCents: 0,
        usedTodayDate: utcDateKey(now),
        lifetimeUsedCents: 0,
        lifetimeFundedCents: 0,
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
        minutesAtCategoryOne: 0,
        minutesInTopThree: 0,
        joinedLabel: 'Today',
        rankHistory: '[99]',
      })

      await recordAudit(
        {
          action: 'CAMPAIGN_AUTO_APPROVED',
          entityType: 'campaign',
          entityId: campaignId,
          entityLabel: preflight.normalized.name,
          actorId: session.sub,
          actorLabel: 'Campaign Preflight Validation',
        },
        tx,
      )
    })

    return NextResponse.json(
      {
        campaignId,
        slug,
        status: 'APPROVED',
        preflight: 'PASSED',
        checkoutReady: true,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to create campaign', error)
    return NextResponse.json(
      { error: 'Could not create campaign' },
      { status: 500 },
    )
  }
}
