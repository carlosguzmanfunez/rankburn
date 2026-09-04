import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { DatabaseNotConfiguredError, getDb } from '@/lib/server/db/client'
import { campaigns } from '@/lib/server/db/schema'
import {
  ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR,
  MIN_BURN_RATE_CENTS_PER_HOUR,
  increaseBurnRate,
} from '@/lib/server/budget-engine'
import {
  OWNERSHIP_DENIED,
  getAdvertiserSession,
} from '@/lib/server/advertiser-auth'
import {
  RATE_LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from '@/lib/server/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * Beta 2.0 temporary advertiser write boundary.
 *
 * IMPORTANT:
 * The current repository does not yet have advertiser authentication.
 * Until that exists, this route only allows campaigns owned by the existing
 * demo advertiser identity. Do not relax this into an unauthenticated public
 * mutation.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const limit = checkRateLimit(RATE_LIMITS.burnRate, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const burnRateCentsPerHour = (
    body as { burnRateCentsPerHour?: unknown }
  ).burnRateCentsPerHour

  if (
    !Number.isInteger(burnRateCentsPerHour) ||
    (burnRateCentsPerHour as number) <
      MIN_BURN_RATE_CENTS_PER_HOUR ||
    (burnRateCentsPerHour as number) >
      ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR
  ) {
    return NextResponse.json(
      { error: 'Burn Rate must be an integer between 100 and 100000 cents/hour.' },
      { status: 400 },
    )
  }

  try {
    const { id } = await context.params
    const db = getDb()

    const ownerRows = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    const owner = ownerRows[0]
    if (!owner) {
      return NextResponse.json(
        { error: OWNERSHIP_DENIED.error },
        { status: OWNERSHIP_DENIED.status },
      )
    }

    // Same answer as "no such campaign". A 403 here would confirm the id
    // exists, which is exactly what an IDOR probe is looking for.
    if (owner.advertiserId !== session.sub) {
      return NextResponse.json(
        { error: OWNERSHIP_DENIED.error },
        { status: OWNERSHIP_DENIED.status },
      )
    }

    const result = await increaseBurnRate(
      id,
      burnRateCentsPerHour as number,
    )

    if (result.ok) {
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const statusByCode: Record<
      typeof result.code,
      number
    > = {
      NOT_FOUND: 404,
      NOT_ACTIVE: 409,
      EXHAUSTED: 409,
      INVALID_RATE: 400,
      RATE_NOT_HIGHER: 409,
    }

    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: statusByCode[result.code] },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 },
      )
    }
    console.error('Failed to increase Burn Rate', error)
    return NextResponse.json(
      { error: 'Could not update Burn Rate' },
      { status: 500 },
    )
  }
}
