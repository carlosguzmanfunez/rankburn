import { NextResponse } from 'next/server'
import {
  endAdvertiserSession,
  getAdvertiserSession,
  startAdvertiserSession,
  verifyAdvertiserCredentials,
} from '@/lib/server/advertiser-auth'
import { DatabaseNotConfiguredError } from '@/lib/server/db/client'
import {
  RATE_LIMITS,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
} from '@/lib/server/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Who am I? Resolved from the cookie, never from the request. */
export async function GET() {
  const session = await getAdvertiserSession()
  if (!session) {
    return NextResponse.json({ advertiser: null }, { status: 200 })
  }
  return NextResponse.json({
    advertiser: { id: session.sub, email: session.email },
  })
}

/** Sign in. */
export async function POST(request: Request) {
  const limit = checkRateLimit(RATE_LIMITS.authSignIn, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      password?: unknown
    } | null

    const email = typeof body?.email === 'string' ? body.email : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    const account = await verifyAdvertiserCredentials(email, password)
    if (!account) {
      // One message for every failure mode. Distinguishing "no such account"
      // from "wrong password" would turn this into an enumeration oracle.
      return NextResponse.json(
        { error: 'Incorrect email or password.' },
        { status: 401 },
      )
    }

    const started = await startAdvertiserSession(account)
    if (!started) {
      return NextResponse.json(
        { error: 'Sessions are unavailable on this deployment.' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      advertiser: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
      },
    })
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Advertiser sign-in failed', error)
    return NextResponse.json({ error: 'Could not sign in.' }, { status: 500 })
  }
}

/** Sign out. */
export async function DELETE() {
  await endAdvertiserSession()
  return NextResponse.json({ ok: true })
}
