import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createCheckout, checkoutEnabled } from '@/lib/server/payments'
import { DEMO_ADVERTISER_ID } from '@/lib/server/store'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Starts a checkout for digital advertising placement and exposure.
 *
 * This returns an approval URL only. No advertising budget is created here -
 * that happens after the payment provider confirms the capture to our server.
 */
export async function POST(request: NextRequest) {
  if (!checkoutEnabled()) {
    return NextResponse.json(
      {
        error:
          'Checkout is disabled on this deployment because no payment provider is configured.',
      },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as { campaignId?: string; amount?: number }
  if (typeof input.campaignId !== 'string' || typeof input.amount !== 'number') {
    return NextResponse.json({ error: 'Missing campaignId or amount' }, { status: 400 })
  }

  try {
    const result = await createCheckout({
      campaignId: input.campaignId,
      advertiserId: DEMO_ADVERTISER_ID,
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
    })
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Failed to create checkout', error)
    return NextResponse.json(
      { error: 'Could not start checkout' },
      { status: 500 },
    )
  }
}
