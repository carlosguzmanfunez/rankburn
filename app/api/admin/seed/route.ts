import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/server/auth'
import { seedDatabase } from '@/lib/server/db/seed'
import { recordAudit } from '@/lib/server/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Loads the development demo dataset.
 *
 * Two independent guards: an administrator session, and an explicit
 * `RANKBURN_ALLOW_SEED=true` flag. Leave the flag unset in production so this
 * endpoint cannot write demo rows into a live market.
 */
export async function POST() {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  if (process.env.RANKBURN_ALLOW_SEED !== 'true') {
    return NextResponse.json(
      { error: 'Seeding is disabled. Set RANKBURN_ALLOW_SEED=true to enable.' },
      { status: 403 },
    )
  }

  const result = await seedDatabase()

  if (result.seeded) {
    await recordAudit({
      action: 'DATABASE_SEEDED',
      entityType: 'system',
      entityId: 'seed',
      entityLabel: 'Demo dataset',
      actorId: session.sub,
      actorLabel: session.email,
    })
  }

  return NextResponse.json(result)
}
