/**
 * Ownership boundary audit.
 *
 * Verifies statically that every private route resolves identity from the
 * session and never from the request, and that no product route depends on the
 * demo advertiser identity.
 *
 * This is a structural check, not a substitute for the end-to-end scenarios
 * (user A cannot touch user B's campaign), which need a running database.
 *
 * Usage: npm run audit:ownership
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Routes that MUST resolve an advertiser session before doing anything. */
const PRIVATE_ROUTES = [
  'app/api/me/campaigns/route.ts',
  'app/api/campaigns/route.ts',
  'app/api/campaigns/[id]/burn-rate/route.ts',
  'app/api/campaigns/[id]/run-again/route.ts',
  'app/api/checkout/route.ts',
]

/** Routes that are public by design and must NOT gate on a session. */
const PUBLIC_ROUTES = [
  'app/api/market/route.ts',
  'app/api/market/projection/route.ts',
  'app/api/legends/route.ts',
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') walk(path, out)
    } else if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      out.push(path)
    }
  }
  return out
}
const normalizePath = (file) => file.replaceAll('\\', '/')

const problems = []
const checks = []

for (const route of PRIVATE_ROUTES) {
  const src = readFileSync(route, 'utf8')

  checks.push(route)

  if (!src.includes('getAdvertiserSession')) {
    problems.push(`${route}: private route does not resolve an advertiser session`)
  }

  if (!/session\.sub/.test(src)) {
    problems.push(`${route}: does not scope anything by session.sub`)
  }

  // The identity must never be taken from the payload.
  if (/body\.(advertiserId|ownerId|userId)/.test(src)) {
    problems.push(`${route}: reads an identity field from the request body`)
  }

  if (src.includes('DEMO_ADVERTISER_ID')) {
    problems.push(`${route}: still depends on the demo advertiser identity`)
  }
}

for (const route of PUBLIC_ROUTES) {
  const src = readFileSync(route, 'utf8')
  checks.push(route)
  if (src.includes('getAdvertiserSession')) {
    problems.push(`${route}: public route gates on an advertiser session`)
  }
}

// Nothing outside seeds and the store definition may reference the demo user.
const DEMO_ALLOWED = new Set(['lib/server/store.ts', 'lib/server/db/seed.ts'])
for (const file of [...walk('app'), ...walk('lib'), ...walk('components')]) {
  const src = readFileSync(file, 'utf8')
const normalizedFile = normalizePath(file)
  if (src.includes('DEMO_ADVERTISER_ID') && !DEMO_ALLOWED.has(normalizedFile)) {
    problems.push(`${file}: references DEMO_ADVERTISER_ID outside seed/dev code`)
  }
  if (/OWNED_COMPANY_ID/.test(src) && normalizedFile !== 'lib/rankburn-data.ts') {
    problems.push(`${file}: OWNED_COMPANY_ID must not determine ownership`)
  }
}

// A session cookie must be httpOnly wherever it is set.
for (const file of walk('lib/server')) {
  const src = readFileSync(file, 'utf8')
  for (const match of src.matchAll(/jar\.set\([^)]*\{([^}]*)\}/gs)) {
    if (!/httpOnly:\s*true/.test(match[1])) {
      problems.push(`${file}: a session cookie is set without httpOnly`)
    }
  }
}

for (const problem of problems) console.log(`FAIL  ${problem}`)

console.log(`\nChecked ${checks.length} routes and the demo-identity boundary.`)
console.log(
  problems.length === 0
    ? 'PASS: ownership is resolved from the session everywhere it must be.'
    : `FAIL: ${problems.length} ownership problem(s).`,
)

process.exit(problems.length > 0 ? 1 : 0)
