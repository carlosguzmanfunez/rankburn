/**
 * Administrator authentication and authorization.
 *
 * Signing, scope separation and constant-time comparison live in
 * `./session.ts`, shared with the advertiser scope. This module holds only
 * what is specific to administrators.
 *
 * Design rules:
 *  - The client can never grant itself a role. The role lives inside an
 *    HMAC-signed, httpOnly cookie that the browser cannot forge or read.
 *  - Every moderation action re-checks authorization on the server. Hiding a
 *    link is not access control.
 *  - Missing configuration fails CLOSED. If `RANKBURN_SESSION_SECRET`,
 *    `RANKBURN_ADMIN_PASSWORD` or `RANKBURN_ADMIN_EMAILS` are absent, admin
 *    sign-in is unavailable rather than open.
 *  - The `admin` scope is baked into the signed payload, so an advertiser
 *    session can never be presented as an administrator one.
 */

import { cookies } from 'next/headers'
import { adminAuthConfigured, config } from './config'
import {
  decodeSession,
  encodeSession,
  safeEqual,
  type SignedSession,
} from './session'
import type { UserRole } from './types'

export const SESSION_COOKIE = 'rankburn_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8

export type Session = SignedSession & {
  role: UserRole
}

/** Reads and verifies the current administrator session, if any. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const decoded = decodeSession(jar.get(SESSION_COOKIE)?.value, 'admin')
  return decoded ? (decoded as Session) : null
}

/** True only for a verified session carrying an administrative role. */
export function isAdminSession(session: Session | null): boolean {
  return session?.role === 'ADMIN' || session?.role === 'MODERATOR'
}

export async function requireAdminSession(): Promise<Session | null> {
  const session = await getSession()
  return isAdminSession(session) ? session : null
}

/**
 * Verifies administrator credentials. Both the email allowlist and the shared
 * password must match; neither has a fallback value.
 */
export function verifyAdminCredentials(
  email: string,
  password: string,
): Session | null {
  if (!adminAuthConfigured()) return null
  const normalized = email.trim().toLowerCase()
  if (!config.adminEmails.includes(normalized)) return null
  const expected = config.adminPassword
  if (!expected || !safeEqual(password, expected)) return null
  return {
    sub: `admin:${normalized}`,
    email: normalized,
    scope: 'admin',
    role: 'ADMIN',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
}

export async function startSession(session: Session): Promise<boolean> {
  const token = encodeSession(session)
  if (!token) return false
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return true
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
