/**
 * Anonymous visitor key.
 *
 * A rotating opaque identifier stored in an httpOnly cookie. It is not tied to
 * an account and no IP address or device fingerprint is stored, so analytics
 * can count distinct sessions without building a profile of a person.
 */

import { cookies } from 'next/headers'
import { newId } from './id'
import { config } from './config'

const VISITOR_COOKIE = 'rankburn_vk'
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 30

export async function getOrCreateVisitorKey(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(VISITOR_COOKIE)?.value
  if (existing) return existing
  const key = newId('vk')
  jar.set(VISITOR_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: VISITOR_TTL_SECONDS,
  })
  return key
}
