import { NextResponse } from 'next/server'
import {
  registerAdvertiser,
  startAdvertiserSession,
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

const MIN_PASSWORD_LENGTH = 10

/**
 * Creates an advertiser account and signs it in.
 *
 * The response never contains the password, the hash, or the session token:
 * the session travels only as an httpOnly cookie the browser cannot read.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(RATE_LIMITS.authRegister, clientKey(request))
  if (!limit.allowed) return rateLimitResponse(limit)

  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      password?: unknown
      displayName?: unknown
    } | null

    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const displayName =
      typeof body?.displayName === 'string' ? body.displayName : ''

    if (!email.includes('@') || email.length > 254) {
      return NextResponse.json(
        { error: 'Enter a valid email address.' },
        { status: 400 },
      )
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        { status: 400 },
      )
    }

    const result = await registerAdvertiser(email, password, displayName)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.code === 'EMAIL_TAKEN' ? 409 : 503 },
      )
    }

    const started = await startAdvertiserSession(result.account)
    if (!started) {
      return NextResponse.json(
        { error: 'Accounts are unavailable on this deployment.' },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        advertiser: {
          id: result.account.id,
          email: result.account.email,
          displayName: result.account.displayName,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('Advertiser registration failed', error)
    return NextResponse.json(
      { error: 'Could not create the account.' },
      { status: 500 },
    )
  }
}
