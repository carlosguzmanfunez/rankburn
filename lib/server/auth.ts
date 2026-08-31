/**
 * Server-side authentication and authorization.
 *
 * Design rules:
 *  - The client can never grant itself a role. The role lives inside an
 *    HMAC-signed, httpOnly cookie that the browser cannot forge or read.
 *  - Every moderation action re-checks authorization on the server. Hiding a
 *    link is not access control.
 *  - Missing configuration fails CLOSED. If `RANKBURN_SESSION_SECRET`,
 *    `RANKBURN_ADMIN_PASSWORD` or `RANKBURN_ADMIN_EMAILS` are absent, admin
 *    sign-in is unavailable rather than open.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { adminAuthConfigured, config } from './config'
import type { UserRole } from './types'

export const SESSION_COOKIE = 'rankburn_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8

export type Session = {
  sub: string
  email: string
  role: UserRole
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

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function encodeSession(session: Session): string | null {
  const secret = config.sessionSecret
  if (!secret) return null
  const body = b64url(JSON.stringify(session))
  return `${body}.${sign(body, secret)}`
}

export function decodeSession(token: string | undefined): Session | null {
  const secret = config.sessionSecret
  if (!secret || !token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!safeEqual(signature, sign(body, secret))) return null
  try {
    const parsed = JSON.parse(unb64url(body)) as Session
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Reads and verifies the current session, if any. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  return decodeSession(jar.get(SESSION_COOKIE)?.value)
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
