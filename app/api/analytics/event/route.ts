import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { recordAnalyticsEvent } from '@/lib/server/analytics'
import { getOrCreateVisitorKey } from '@/lib/server/visitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Records impressions, visitors and outbound clicks.
 *
 * Clicks are measured here and never billed: recording an outbound click does
 * not touch any advertising budget.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as {
    type?: string
    campaignId?: string
    surface?: string
    path?: string
  }
  const visitorKey = await getOrCreateVisitorKey()

  if (input.type === 'visitor' && typeof input.path === 'string') {
    await recordAnalyticsEvent({ type: 'visitor', path: input.path }, visitorKey)
    return NextResponse.json({ ok: true })
  }

  if (
    (input.type === 'impression' || input.type === 'outbound_click') &&
    typeof input.campaignId === 'string'
  ) {
    const result = await recordAnalyticsEvent(
      input.type === 'impression'
        ? {
            type: 'impression',
            campaignId: input.campaignId,
            surface: input.surface,
          }
        : { type: 'outbound_click', campaignId: input.campaignId },
      visitorKey,
    )
    return NextResponse.json({ ok: result.recorded, anomaly: result.anomaly })
  }

  return NextResponse.json({ error: 'Unsupported event' }, { status: 400 })
}
