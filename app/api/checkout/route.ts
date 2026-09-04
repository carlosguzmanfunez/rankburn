import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createCheckout, checkoutEnabled } from '@/lib/server/payments'
import {
  getCampaignBundle,
} from '@/lib/server/store'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'
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

/**
 * Starts PayPal Sandbox checkout for a campaign budget.
 *
 * Beta 2.0 policy:
 * - checkout funds APPROVED (first funding), ACTIVE (top-up) and PAUSED
 *   campaigns;
 * - a top-up extends remaining duration only. It never changes Global Rank or
 *   Category Rank, and it never changes Burn Rate: position is raised solely
 *   through the Burn Rate endpoint, which only allows increases;
 * - funding a PAUSED campaign leaves it PAUSED. It is never auto-resumed;
 * - PENDING has not cleared automatic preflight yet;
 * - EXHAUSTED runs are terminal and must use Run Again, which creates a new
 *   run. Money never revives a closed run;
 * - REJECTED campaigns are not fundable;
 * - advertiser ownership is checked server-side;
 * - Burn Rate is never taken from this route.
 */
const FUNDABLE_STATUSES = ['APPROVED', 'ACTIVE', 'PAUSED'] as const

function notFundableReason(status: string): string {
  switch (status) {
    case 'EXHAUSTED':
      return 'This run has ended. Use Run Again to start a new run; adding budget cannot reopen a closed run.'
    case 'REJECTED':
      return 'This campaign is not eligible for funding.'
    default:
      return 'Campaign must pass automatic preflight before checkout.'
  }
}
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(RATE_LIMITS.checkout, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  // Identity comes from the session, never from the request body.
  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  if (!checkoutEnabled()) {
    return NextResponse.json(
      { error: 'Checkout is disabled on this deployment.' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as {
    campaignId?: unknown
    amount?: unknown
  }

  if (
    typeof input.campaignId !== 'string' ||
    typeof input.amount !== 'number'
  ) {
    return NextResponse.json(
      { error: 'Missing campaignId or amount' },
      { status: 400 },
    )
  }

  try {
    const bundle = await getCampaignBundle(input.campaignId)

    if (!bundle) {
      return NextResponse.json(
        { error: OWNERSHIP_DENIED.error },
        { status: OWNERSHIP_DENIED.status },
      )
    }

    // Same answer as "no such campaign". A 403 here would confirm the id
    // exists, which is exactly what an IDOR probe is looking for.
    if (bundle.campaign.advertiserId !== session.sub) {
      return NextResponse.json(
        { error: OWNERSHIP_DENIED.error },
        { status: OWNERSHIP_DENIED.status },
      )
    }

    const fundable = (FUNDABLE_STATUSES as readonly string[]).includes(
      bundle.campaign.status,
    )

    if (!fundable) {
      return NextResponse.json(
        { error: notFundableReason(bundle.campaign.status) },
        { status: 409 },
      )
    }


    const result = await createCheckout({
      campaignId: bundle.campaign.id,
      advertiserId: session.sub,
      amountDollars: input.amount,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      )
    }

    return NextResponse.json({
      paymentId: result.payment.id,
      approvalUrl: result.session.approvalUrl,
      campaignStatus: bundle.campaign.status,
    })
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 },
      )
    }

    console.error('Failed to create checkout', error)
    return NextResponse.json(
      { error: 'Could not start checkout' },
      { status: 500 },
    )
  }
}
