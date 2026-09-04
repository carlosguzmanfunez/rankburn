/**
 * Advertiser identity, sessions and ownership.
 *
 * This is the authorization boundary for everything an advertiser owns. Two
 * rules hold everywhere in this file:
 *
 *   1. Identity comes from the session cookie, never from the request. A
 *      `userId` or `advertiserId` in a body or query string is untrusted
 *      input.
 *
 *   2. Ownership is re-checked on the server for every sensitive operation.
 *      Hiding a button is not access control.
 *
 * Separate from the administrator scope on purpose: an advertiser is never an
 * administrator, and the `advertiser` scope claim inside the signed cookie is
 * what enforces that even though both scopes share a signing secret.
 */

import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { config } from './config'
import { getDb, type Executor } from './db/client'
import { campaigns, users } from './db/schema'
import { newId } from './id'
import {
  decodeSession,
  encodeSession,
  hashPassword,
  verifyPassword,
  type SignedSession,
} from './session'

export const ADVERTISER_SESSION_COOKIE = 'flippeak_advertiser'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14

export type AdvertiserSession = SignedSession & { scope: 'advertiser' }

export type AdvertiserAccount = {
  id: string
  email: string
  displayName: string
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export async function getAdvertiserSession(): Promise<AdvertiserSession | null> {
  const jar = await cookies()
  const decoded = decodeSession(
    jar.get(ADVERTISER_SESSION_COOKIE)?.value,
    'advertiser',
  )
  return decoded ? (decoded as AdvertiserSession) : null
}

export async function startAdvertiserSession(
  account: AdvertiserAccount,
): Promise<boolean> {
  const token = encodeSession({
    sub: account.id,
    email: account.email,
    scope: 'advertiser',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })
  if (!token) return false

  const jar = await cookies()
  jar.set(ADVERTISER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return true
}

export async function endAdvertiserSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(ADVERTISER_SESSION_COOKIE)
}

/* -------------------------------------------------------------------------- */
/* Credentials                                                                */
/* -------------------------------------------------------------------------- */

export type RegisterResult =
  | { ok: true; account: AdvertiserAccount }
  | { ok: false; code: 'EMAIL_TAKEN' | 'NOT_CONFIGURED'; message: string }

export function advertiserAuthConfigured(): boolean {
  return Boolean(config.sessionSecret)
}

export async function registerAdvertiser(
  email: string,
  password: string,
  displayName: string,
): Promise<RegisterResult> {
  if (!advertiserAuthConfigured()) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'Accounts are unavailable on this deployment.',
    }
  }

  const db = getDb()
  const normalized = email.trim().toLowerCase()
  const now = new Date()

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  if (existing.length > 0) {
    return {
      ok: false,
      code: 'EMAIL_TAKEN',
      message: 'An account already exists for that email address.',
    }
  }

  const id = newId('user')
  await db.insert(users).values({
    id,
    email: normalized,
    displayName: displayName.trim() || normalized.split('@')[0],
    role: 'ADVERTISER',
    passwordHash: hashPassword(password),
    createdAt: now,
  })

  return { ok: true, account: { id, email: normalized, displayName } }
}

/**
 * Verifies credentials.
 *
 * Returns null for "no such account", "no password set" and "wrong password"
 * alike: distinguishing them would turn sign-in into an account-enumeration
 * oracle. The demo advertiser has no password hash, so it can never match.
 */
export async function verifyAdvertiserCredentials(
  email: string,
  password: string,
): Promise<AdvertiserAccount | null> {
  if (!advertiserAuthConfigured()) return null

  const db = getDb()
  const normalized = email.trim().toLowerCase()

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  const row = rows[0]
  if (!row?.passwordHash) return null
  if (!verifyPassword(password, row.passwordHash)) return null

  return { id: row.id, email: row.email, displayName: row.displayName }
}

/* -------------------------------------------------------------------------- */
/* Ownership                                                                  */
/* -------------------------------------------------------------------------- */

export type OwnershipDenial = {
  /**
   * 404, always.
   *
   * A 403 would confirm that the id exists, which is exactly the information
   * an IDOR probe is looking for. An advertiser asking about a campaign that
   * is not theirs gets the same answer as one asking about a campaign that
   * does not exist at all.
   */
  status: 404
  error: string
}

export const OWNERSHIP_DENIED: OwnershipDenial = {
  status: 404,
  error: 'Campaign not found.',
}

/**
 * Confirms the campaign exists AND belongs to this advertiser, in one query.
 *
 * Both conditions are in the WHERE clause deliberately: fetching first and
 * comparing afterwards invites a caller to use the fetched row before the
 * comparison happens.
 */
export async function ownsCampaign(
  advertiserId: string,
  campaignId: string,
  executor: Executor = getDb(),
): Promise<boolean> {
  const rows = await executor
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.advertiserId, advertiserId),
      ),
    )
    .limit(1)

  return rows.length > 0
}
