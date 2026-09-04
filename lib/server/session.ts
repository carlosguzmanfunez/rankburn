/**
 * Signed session infrastructure, shared by the administrator and advertiser
 * scopes.
 *
 * Design rules:
 *
 *  - The client never states who it is. A session is an HMAC-signed, httpOnly
 *    cookie the browser can neither read nor forge, and the user is always
 *    resolved from it on the server. A `userId` in a request body is input,
 *    never identity.
 *
 *  - Scopes are separated cryptographically, not by convention. The scope is
 *    part of the signed payload and is re-checked on every read, so an
 *    administrator cookie cannot be replayed as an advertiser one, or the
 *    reverse. Being an advertiser never implies being an administrator.
 *
 *  - Missing configuration fails CLOSED. Without a session secret, sign-in is
 *    unavailable rather than open.
 *
 *  - Passwords are stored only as a salted scrypt hash. There is no code path
 *    that can recover a password, and comparison is constant-time.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { config } from './config'

/** Which part of the product a session grants access to. */
export type SessionScope = 'admin' | 'advertiser'

export type SignedSession = {
  /** Subject: the user id this session belongs to. */
  sub: string
  email: string
  scope: SessionScope
  /** Unix seconds. */
  exp: number
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function unb64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Constant-time comparison that does not leak length through early exit. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'compare').update(a).digest()
  const hb = createHmac('sha256', 'compare').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function encodeSession(session: SignedSession): string | null {
  const secret = config.sessionSecret
  if (!secret) return null
  const body = b64url(JSON.stringify(session))
  return `${body}.${sign(body, secret)}`
}

/**
 * Verifies a token AND that it was issued for the expected scope.
 *
 * The scope check is what keeps the two session types apart while they share a
 * signing secret: a valid admin token presented to an advertiser route fails
 * here, because its payload says `admin`.
 */
export function decodeSession(
  token: string | undefined,
  expectedScope: SessionScope,
): SignedSession | null {
  const secret = config.sessionSecret
  if (!secret || !token) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!safeEqual(signature, sign(body, secret))) return null

  try {
    const parsed = JSON.parse(unb64url(body)) as SignedSession
    if (parsed.scope !== expectedScope) return null
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) {
      return null
    }
    if (typeof parsed.sub !== 'string' || parsed.sub.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Password hashing                                                           */
/* -------------------------------------------------------------------------- */

const SCRYPT_KEY_LENGTH = 64
const SCRYPT_COST = 16_384

/** `scrypt$<cost>$<salt-hex>$<hash-hex>`, self-describing so cost can change. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
  }).toString('hex')
  return `scrypt$${SCRYPT_COST}$${salt}$${derived}`
}

/**
 * Constant-time password verification.
 *
 * Returns false for any malformed stored value rather than throwing, so a
 * corrupted row denies access instead of crashing the sign-in route.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false

  const cost = Number(parts[1])
  const salt = parts[2]
  const expected = parts[3]
  if (!Number.isInteger(cost) || cost <= 0 || !salt || !expected) return false

  try {
    const derived = scryptSync(password, salt, expected.length / 2, {
      N: cost,
    }).toString('hex')
    const a = Buffer.from(derived, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
