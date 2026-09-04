import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CATEGORIES, type CategoryId } from '@/lib/rankburn-data'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'
import {
  ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR,
  MIN_BURN_RATE_CENTS_PER_HOUR,
  projectBurnRatePlacement,
} from '@/lib/server/ranking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isCategory(value: string | null): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value)
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams
  const rawRate = search.get('burnRateCentsPerHour')
  const category = search.get('category')
  const excludeCampaignId =
    search.get('excludeCampaignId')?.trim() || undefined

  const burnRateCentsPerHour = Number(rawRate)

  if (
    !Number.isInteger(burnRateCentsPerHour) ||
    burnRateCentsPerHour < MIN_BURN_RATE_CENTS_PER_HOUR ||
    burnRateCentsPerHour >
      ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR
  ) {
    return NextResponse.json(
      { error: 'Invalid Burn Rate' },
      { status: 400 },
    )
  }

  if (!isCategory(category)) {
    return NextResponse.json(
      { error: 'Unknown category' },
      { status: 400 },
    )
  }

  try {
    const projection = await projectBurnRatePlacement(
      burnRateCentsPerHour,
      category,
      excludeCampaignId,
    )

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        projection,
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
    console.error('Failed to project market placement', error)
    return NextResponse.json(
      { error: 'Could not project market placement' },
      { status: 500 },
    )
  }
}
