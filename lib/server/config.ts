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
