/**
 * Request rate limiting.
 *
 * READ THIS BEFORE TRUSTING IT
 * ----------------------------
 * This limiter is per-process and in-memory. On a serverless platform each
 * warm instance keeps its own counters, so the effective limit is roughly
 * `limit x instance count`, and counters reset on cold start.
 *
 * That is genuinely useful against the thing it is aimed at - a single client
 * hammering one endpoint - and it is a real improvement over no limit at all.
 * It is NOT a defence against a distributed attacker, and it must be replaced
 * by a shared store (Redis, Upstash, or the platform's own edge limiter)
 * before this is treated as a security control.
 *
 * It is deliberately dependency-free so it cannot fail closed on a network
 * call and take the whole endpoint down with it.
 */

type Bucket = {
  count: number
  resetAt: number
}

const BUCKETS_KEY = '__flippeak_rate_limit__'

function buckets(): Map<string, Bucket> {
  const holder = globalThis as unknown as Record<
    string,
    Map<string, Bucket> | undefined
  >
  if (!holder[BUCKETS_KEY]) holder[BUCKETS_KEY] = new Map()
  return holder[BUCKETS_KEY]
}

/** Removes expired buckets so a long-lived instance cannot grow unbounded. */
function sweep(store: Map<string, Bucket>, now: number): void {
  if (store.size < 5_000) return
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
}

export type RateLimitRule = {
  /** Distinguishes buckets belonging to different endpoints. */
  name: string
  limit: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
  now = Date.now(),
): RateLimitResult {
  const store = buckets()
  sweep(store, now)

  const key = `${rule.name}:${identifier}`
  const existing = store.get(key)

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs })
    return {
      allowed: true,
      remaining: rule.limit - 1,
      retryAfterSeconds: 0,
    }
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSeconds: 0,
  }
}

/**
 * Best-effort client identifier.
 *
 * Proxy headers are spoofable, so this is a throttling key, never an identity
 * or an authorisation input. `x-forwarded-for` may carry a chain; the first
 * entry is the closest thing to the origin client that we can see.
 */
export function clientKey(request: Request): string {
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Standard 429 body plus the header clients need to back off correctly. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Slow down and try again shortly.',
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
        'Cache-Control': 'no-store',
      },
    },
  )
}

/** Rules, kept together so the whole throttling posture is readable at once. */
export const RATE_LIMITS = {
  /** Sign-in is the brute-force surface: a shared password guards moderation. */
  adminSignIn: { name: 'admin-signin', limit: 5, windowMs: 5 * 60_000 },
  /** Advertiser sign-in: same brute-force surface, per account credentials. */
  authSignIn: { name: 'auth-signin', limit: 8, windowMs: 5 * 60_000 },
  /** Registration writes a user row and runs an expensive scrypt hash. */
  authRegister: { name: 'auth-register', limit: 5, windowMs: 60 * 60_000 },
  /** Each call writes real product + campaign + budget + stats rows. */
  campaignCreate: { name: 'campaign-create', limit: 10, windowMs: 60 * 60_000 },
  /** Each call creates a new commercial run. */
  runAgain: { name: 'run-again', limit: 10, windowMs: 60 * 60_000 },
  /** Each call contacts the payment provider. */
  checkout: { name: 'checkout', limit: 15, windowMs: 60 * 60_000 },
  /** High volume by design, but every call writes an event row. */
  analyticsEvent: { name: 'analytics-event', limit: 120, windowMs: 60_000 },
  /** Burn Rate changes settle budget, so they are not free. */
  burnRate: { name: 'burn-rate', limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>
