import { NextResponse } from 'next/server'
import { enqueueExpiryWarnings } from '@/lib/server/expiry-warning'

function authorized(request: Request) {
  const expected = process.env.RANKBURN_CRON_SECRET
  if (!expected) return false

  const auth = request.headers.get('authorization')
  return auth === `Bearer ${expected}`
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const result = await enqueueExpiryWarnings(new Date())
  return NextResponse.json(result)
}
