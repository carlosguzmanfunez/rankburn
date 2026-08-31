import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/server/auth'
import { applyModeration } from '@/lib/server/moderation'
import type { ModerationAction } from '@/lib/server/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIONS: ModerationAction[] = [
  'APPROVE',
  'REJECT',
  'FLAG',
  'UNFLAG',
  'PAUSE',
  'RESUME',
]

/**
 * Applies a moderation decision.
 *
 * Every call re-verifies the administrator session server-side. A browser
 * cannot approve, pause or flag anything by editing local state - the only
 * way state changes is through this authorized endpoint.
 */
export async function POST(request: NextRequest) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as {
    campaignId?: string
    action?: string
    reason?: string
  }

  if (typeof input.campaignId !== 'string') {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }
  const action = ACTIONS.find((candidate) => candidate === input.action)
  if (!action) {
    return NextResponse.json({ error: 'Unknown moderation action' }, { status: 400 })
  }

  const result = await applyModeration(
    input.campaignId,
    action,
    { id: session.sub, label: session.email },
    input.reason,
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, status: result.status })
}
