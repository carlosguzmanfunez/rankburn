import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { applyVerifiedPayment, getPaymentProvider } from '@/lib/server/payments'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PayPal webhook endpoint.
 *
 * The raw body is verified against PayPal's signature before anything is
 * read from it. An unverified request is discarded without touching any
 * advertising budget. This is the only inbound path that can increase a
 * balance.
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider()
  if (!provider) {
    return NextResponse.json(
      { error: 'No payment provider configured' },
      { status: 503 },
    )
  }

  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value: string, key: string) => {
    headers[key.toLowerCase()] = value
  })

  try {
    const verified = await provider.verifyWebhook(headers, rawBody)
    if (!verified) {
      return NextResponse.json(
        { error: 'Webhook verification failed' },
        { status: 400 },
      )
    }

    const result = await applyVerifiedPayment(verified)
    return NextResponse.json({
      credited: result.credited,
      reason: result.reason,
    })
  } catch (error) {
    // Anything reaching here is TRANSIENT by construction: permanent
    // conditions are acknowledged with a 200 inside applyVerifiedPayment().
    // A 5xx is therefore a genuine request to redeliver, not a way to bury a
    // failure the provider can never resolve.
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }

    console.error('Failed to apply verified payment webhook', error)
    return NextResponse.json(
      { error: 'Could not apply the payment; retry delivery.' },
      { status: 500 },
    )
  }
}
