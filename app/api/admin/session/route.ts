import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminAuthConfigured } from '@/lib/server/config'
import { endSession, startSession, verifyAdminCredentials } from '@/lib/server/auth'
import { recordAudit } from '@/lib/server/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Signs an administrator in. Fails closed when auth is not configured. */
export async function POST(request: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
  {
    error:
      'Administrator sign-in is not configured on this deployment.',
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

  const input = body as { email?: string; password?: string }
  if (typeof input.email !== 'string' || typeof input.password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const session = verifyAdminCredentials(input.email, input.password)
  if (!session) {
    // Deliberately uniform message: do not reveal which factor failed.
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const started = await startSession(session)
  if (!started) {
    return NextResponse.json({ error: 'Could not start session' }, { status: 500 })
  }

  recordAudit({
    action: 'ADMIN_SIGN_IN',
    entityType: 'session',
    entityId: session.sub,
    entityLabel: session.email,
    actorId: session.sub,
    actorLabel: session.email,
  })

  return NextResponse.json({ ok: true })
}

/** Signs the current administrator out. */
export async function DELETE() {
  await endSession()
  return NextResponse.json({ ok: true })
}
