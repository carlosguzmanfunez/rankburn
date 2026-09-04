/**
 * Environment configuration.
 *
 * No secret ever has a default value. If a secret is missing the feature that
 * needs it stays disabled and fails closed - it is never replaced with a
 * placeholder that would silently weaken security.
 */

export type PaymentProviderId = 'paypal' | 'disabled'

function env(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Parses a positive integer env value, falling back when absent or invalid. */
function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  get sessionSecret(): string | undefined {
    return env('RANKBURN_SESSION_SECRET')
  },
  get adminEmails(): string[] {
    return (env('RANKBURN_ADMIN_EMAILS') ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  },
  get adminPassword(): string | undefined {
    return env('RANKBURN_ADMIN_PASSWORD')
  },
  get paypal() {
    return {
      clientId: env('PAYPAL_CLIENT_ID'),
      clientSecret: env('PAYPAL_CLIENT_SECRET'),
      webhookId: env('PAYPAL_WEBHOOK_ID'),
      apiBase: env('PAYPAL_API_BASE') ?? 'https://api-m.sandbox.paypal.com',
    }
  },
  get paymentProvider(): PaymentProviderId {
    const p = this.paypal
    if (p.clientId && p.clientSecret && p.webhookId) return 'paypal'
    return 'disabled'
  },
  get siteUrl(): string {
    return env('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000'
  },
  /**
   * Legends qualification thresholds.
   *
   * Historical merit is position held over time, NOT spending power, so there
   * is deliberately no minimum Burn Rate here. Defaults are the approved
   * product rule; a run qualifies on any ONE of them:
   *
   *   Global Rank #1     >= 10 cumulative minutes
   *   Category Rank #1   >= 20 cumulative minutes
   *   Global Top 3       >= 60 cumulative minutes
   *
   * Overridable per environment, but these are the product defaults.
   */
  get legendsPolicy() {
    return {
      minMinutesAtGlobalOne: positiveInt(
        env('FLIPPEAK_LEGENDS_MIN_MINUTES_GLOBAL_ONE'),
        10,
      ),
      minMinutesAtCategoryOne: positiveInt(
        env('FLIPPEAK_LEGENDS_MIN_MINUTES_CATEGORY_ONE'),
        20,
      ),
      minMinutesInTopThree: positiveInt(
        env('FLIPPEAK_LEGENDS_MIN_MINUTES_TOP_THREE'),
        60,
      ),
      topTierRank: positiveInt(env('FLIPPEAK_LEGENDS_TOP_TIER_RANK'), 3),
    }
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
  },
}

/** True when admin sign-in is configured well enough to be safe to expose. */
export function adminAuthConfigured(): boolean {
  return Boolean(
    config.sessionSecret &&
      config.adminPassword &&
      config.adminEmails.length > 0,
  )
}
