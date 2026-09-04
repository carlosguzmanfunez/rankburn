/**
 * Offline invariant checks.
 *
 * These exercise the REAL application modules, not a reimplementation. What
 * they cover is the pure logic: settlement arithmetic, ranking rules, tier
 * rotation, Legends policy, funding bounds, session scope isolation and
 * password handling.
 *
 * WHAT THEY DO NOT COVER
 * ----------------------
 * Anything that touches PostgreSQL, PayPal or a running server. Step 16 of the
 * integration runbook - "no financial scenario changes the ranking except a
 * Burn Rate change" - is only partly provable here: this file proves the
 * ranking FUNCTION ignores money, and the runbook proves the deployed system
 * does. Both are needed.
 *
 * Run: npm run verify:invariants
 */

const results = []
let failures = 0

function check(group, name, fn) {
  try {
    fn()
    results.push({ group, name, ok: true })
  } catch (error) {
    failures += 1
    results.push({ group, name, ok: false, detail: error.message })
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${expected}, got ${actual})`)
  }
}

const budget = await import('../../lib/server/budget-engine.ts')
const ranking = await import('../../lib/server/ranking.ts')
const legends = await import('../../lib/server/legends-engine.ts')
const preflight = await import('../../lib/flippeak/campaign-preflight.ts')
const session = await import('../../lib/server/session.ts')
const rateLimit = await import('../../lib/server/rate-limit.ts')

const HOUR = 3_600_000
const MS_PER_HOUR = 3_600_000

/* -------------------------------------------------------------------------- */
/* Burn Rate bounds                                                           */
/* -------------------------------------------------------------------------- */

check('bounds', 'minimum Burn Rate is $1/h', () => {
  assertEqual(budget.MIN_BURN_RATE_CENTS_PER_HOUR, 100, 'minimum')
})

check('bounds', 'maximum Burn Rate is $1,000/h', () => {
  assertEqual(budget.ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR, 100_000, 'maximum')
})

check('bounds', 'preflight rejects below the floor', () => {
  const result = preflight.validateCampaignPreflight({
    name: 'Test',
    website: 'example.com',
    category: 'ai',
    subtype: 'ai-tool',
    burnRateCentsPerHour: 99,
  })
  assert(!result.ok, 'a Burn Rate below $1/h must be rejected')
})

check('bounds', 'preflight rejects above the ceiling', () => {
  const result = preflight.validateCampaignPreflight({
    name: 'Test',
    website: 'example.com',
    category: 'ai',
    subtype: 'ai-tool',
    burnRateCentsPerHour: 100_001,
  })
  assert(!result.ok, 'a Burn Rate above $1,000/h must be rejected')
})

check('bounds', 'preflight accepts a bare hostname', () => {
  const result = preflight.validateCampaignPreflight({
    name: 'Test',
    website: 'example.com',
    category: 'ai',
    subtype: 'ai-tool',
    burnRateCentsPerHour: 3_500,
  })
  assert(result.ok, 'a bare hostname is what people type and must be accepted')
  assert(
    result.normalized.website.startsWith('https://'),
    'the stored website must be normalised to an absolute URL',
  )
})

/* -------------------------------------------------------------------------- */
/* Settlement arithmetic                                                      */
/* -------------------------------------------------------------------------- */

check('settlement', 'consumes exactly rate x time', () => {
  const consumed = budget.computeConsumption(
    'ACTIVE',
    1_000_000,
    3_600,
    0,
    HOUR,
  )
  assertEqual(consumed, 3_600, 'one hour at 3600 cents/hour')
})

check('settlement', 'never consumes more than the balance', () => {
  const consumed = budget.computeConsumption(
    'ACTIVE',
    500,
    100_000,
    0,
    10 * HOUR,
  )
  assertEqual(consumed, 500, 'consumption is capped at the remaining balance')
})

check('settlement', 'a non-ACTIVE campaign consumes nothing', () => {
  for (const status of [
    'PENDING',
    'APPROVED',
    'PAUSED',
    'EXHAUSTED',
    'REJECTED',
  ]) {
    const consumed = budget.computeConsumption(
      status,
      1_000_000,
      10_000,
      0,
      HOUR,
    )
    assertEqual(consumed, 0, `${status} must not consume budget`)
  }
  // Control: the same call with ACTIVE must consume, otherwise the assertions
  // above would pass for the wrong reason.
  assert(
    budget.computeConsumption('ACTIVE', 1_000_000, 10_000, 0, HOUR) > 0,
    'the control case must consume, or this test proves nothing',
  )
})

check('settlement', 'a zero or negative window consumes nothing', () => {
  assertEqual(
    budget.computeConsumption('ACTIVE', 1_000_000, 10_000, HOUR, HOUR),
    0,
    'no elapsed time',
  )
  assertEqual(
    budget.computeConsumption('ACTIVE', 1_000_000, 10_000, HOUR, 0),
    0,
    'a clock moving backwards must never bill',
  )
})

check('settlement', 'sub-cent accrual does not round up', () => {
  // 100 cents/hour for one second accrues 0.027 cents. Rounding up would let
  // frequent settlement passes bill far more than the elapsed time.
  const consumed = budget.computeConsumption('ACTIVE', 100_000, 100, 0, 1_000)
  assertEqual(consumed, 0, 'a fraction of a cent must not become a whole cent')
})

check('settlement', 'repeated small settlements do not overbill', () => {
  // The remainder carry-forward is what makes this hold: settling once per
  // second for an hour must bill the same as settling once for that hour.
  const rate = 137
  let balance = 1_000_000
  let billed = 0
  let settledToMs = 0

  for (let second = 1; second <= 3_600; second += 1) {
    const nowMs = second * 1_000
    const consumed = budget.computeConsumption(
      'ACTIVE',
      balance,
      rate,
      settledToMs,
      nowMs,
    )
    billed += consumed
    balance -= consumed
    // The clock only advances by the time the consumed cents paid for. This
    // is the carry-forward that prevents systematic under-consumption.
    if (consumed > 0) {
      settledToMs += Math.ceil((consumed * MS_PER_HOUR) / rate)
    }
  }

  assert(
    billed <= rate,
    `per-second settlement billed ${billed}, above the ${rate} cents/hour rate`,
  )
  assert(
    billed >= rate - 1,
    `per-second settlement billed only ${billed}, under the ${rate} cents/hour rate`,
  )
})

check('settlement', 'exhaustion is exact, never negative', () => {
  const balance = 250
  const consumed = budget.computeConsumption(
    'ACTIVE',
    balance,
    100_000,
    0,
    HOUR,
  )
  assertEqual(balance - consumed, 0, 'the balance lands exactly on zero')
})

/* -------------------------------------------------------------------------- */
/* Ranking: Burn Rate is the only competitive factor                          */
/* -------------------------------------------------------------------------- */

function listing(overrides) {
  return {
    id: 'c1',
    name: 'C',
    slug: 'c',
    category: 'ai',
    subtype: 'ai-tool',
    website: 'https://example.com',
    hue: 10,
    budget: 100,
    burnRate: 10,
    status: 'ACTIVE',
    paused: false,
    totalSpend: 0,
    spentToday: 0,
    visitors: 0,
    clicks: 0,
    impressions: 0,
    joined: 'Today',
    peakRank: 99,
    minutesAtOne: 0,
    minutesAtCategoryOne: 0,
    minutesInTopThree: 0,
    hoursAtOne: 0,
    rankHistory: [99],
    ...overrides,
  }
}

check('ranking', 'dense rank: equal Burn Rate shares a rank', () => {
  const entries = ranking.buildRankedEntries([
    listing({ id: 'a', burnRate: 60 }),
    listing({ id: 'b', burnRate: 60 }),
    listing({ id: 'c', burnRate: 45 }),
  ])
  assertEqual(entries[0].rank, 1, 'first at 60')
  assertEqual(entries[1].rank, 1, 'second at 60 shares the tier')
  assertEqual(entries[2].rank, 2, 'dense rank does not skip after a tie')
})

check('ranking', 'money does not change the order', () => {
  // Same Burn Rates, wildly different spend, budget, age and engagement.
  const entries = ranking.buildRankedEntries([
    listing({
      id: 'poor',
      burnRate: 60,
      budget: 1,
      totalSpend: 0,
      spentToday: 0,
      clicks: 0,
      visitors: 0,
      impressions: 0,
    }),
    listing({
      id: 'rich',
      burnRate: 45,
      budget: 999_999,
      totalSpend: 999_999,
      spentToday: 999_999,
      clicks: 99_999,
      visitors: 99_999,
      impressions: 99_999,
    }),
  ])
  assertEqual(entries[0].listing.id, 'poor', 'the higher Burn Rate ranks first')
  assertEqual(entries[0].rank, 1, 'rank follows Burn Rate alone')
  assertEqual(entries[1].listing.id, 'rich', 'spending more does not outrank')
})

check('ranking', 'category rank is dense within its category', () => {
  const entries = ranking.buildRankedEntries([
    listing({ id: 'a', burnRate: 60, category: 'ai' }),
    listing({ id: 'b', burnRate: 50, category: 'tech' }),
    listing({ id: 'c', burnRate: 40, category: 'ai' }),
  ])
  const byId = Object.fromEntries(entries.map((e) => [e.listing.id, e]))
  assertEqual(byId.a.categoryRank, 1, 'top of ai')
  assertEqual(byId.b.categoryRank, 1, 'top of tech, independent of global rank')
  assertEqual(byId.c.categoryRank, 2, 'second in ai')
})

check('ranking', 'ties break deterministically by id, not by money', () => {
  const first = ranking.buildRankedEntries([
    listing({ id: 'zeta', burnRate: 60, totalSpend: 1_000_000 }),
    listing({ id: 'alpha', burnRate: 60, totalSpend: 0 }),
  ])
  assertEqual(
    first[0].listing.id,
    'alpha',
    'the tiebreak is the id, so it is stable and unbuyable',
  )
})

/* -------------------------------------------------------------------------- */
/* Tier rotation                                                              */
/* -------------------------------------------------------------------------- */

check('rotation', 'rotates every 20 seconds', () => {
  assertEqual(ranking.TIER_ROTATION_MS, 20_000, 'rotation window')
})

check('rotation', 'is deterministic for a given instant', () => {
  const at = 1_700_000_000_000
  assertEqual(
    ranking.getTierSpotlightIndex(3, at),
    ranking.getTierSpotlightIndex(3, at),
    'the same instant must always select the same member',
  )
})

check('rotation', 'advances by one member per window', () => {
  const at = 1_700_000_000_000
  const before = ranking.getTierSpotlightIndex(3, at)
  const after = ranking.getTierSpotlightIndex(3, at + 20_000)
  assertEqual(after, (before + 1) % 3, 'one step per rotation window')
})

check('rotation', 'a single-member tier never rotates away', () => {
  for (let i = 0; i < 10; i += 1) {
    assertEqual(
      ranking.getTierSpotlightIndex(1, i * 20_000),
      0,
      'a tier of one always shows its only member',
    )
  }
})

/* -------------------------------------------------------------------------- */
/* Legends policy                                                             */
/* -------------------------------------------------------------------------- */

const POLICY = {
  minMinutesAtGlobalOne: 10,
  minMinutesAtCategoryOne: 20,
  minMinutesInTopThree: 60,
  topTierRank: 3,
}

function performance(overrides) {
  return {
    campaignId: 'c1',
    peakRank: 1,
    peakBurnRateCentsPerHour: 100,
    minutesAtGlobalOne: 0,
    minutesAtCategoryOne: 0,
    minutesInTopThree: 0,
    runFinished: true,
    sanctioned: false,
    ...overrides,
  }
}

check('legends', 'global #1 for 10 minutes qualifies', () => {
  const result = legends.qualifyForLegends(
    performance({ minutesAtGlobalOne: 10 }),
    POLICY,
  )
  assert(result.qualified, 'should qualify')
  assertEqual(result.criterion, 'global-rank-one', 'criterion')
})

check('legends', 'category #1 for 20 minutes qualifies', () => {
  const result = legends.qualifyForLegends(
    performance({ peakRank: 4, minutesAtCategoryOne: 20 }),
    POLICY,
  )
  assert(result.qualified, 'category leadership is its own path')
  assertEqual(result.criterion, 'category-rank-one', 'criterion')
})

check('legends', 'top 3 for 60 minutes qualifies', () => {
  const result = legends.qualifyForLegends(
    performance({ peakRank: 3, minutesInTopThree: 60 }),
    POLICY,
  )
  assert(result.qualified, 'sustained top-3 is its own path')
  assertEqual(result.criterion, 'top-three-sustained', 'criterion')
})

check('legends', 'a cheap campaign that held #1 qualifies', () => {
  // The whole point of removing the Burn Rate gate: merit is position held,
  // not spending power. $1/h is the floor.
  const result = legends.qualifyForLegends(
    performance({ peakBurnRateCentsPerHour: 100, minutesAtGlobalOne: 10 }),
    POLICY,
  )
  assert(result.qualified, 'spending little must not disqualify')
})

check('legends', 'an expensive campaign that held nothing does not qualify', () => {
  const result = legends.qualifyForLegends(
    performance({
      peakBurnRateCentsPerHour: 100_000,
      peakRank: 9,
      minutesAtGlobalOne: 0,
      minutesAtCategoryOne: 0,
      minutesInTopThree: 0,
    }),
    POLICY,
  )
  assert(!result.qualified, 'spending a lot must not buy recognition')
})

check('legends', 'an unfinished run never qualifies', () => {
  const result = legends.qualifyForLegends(
    performance({ minutesAtGlobalOne: 600, runFinished: false }),
    POLICY,
  )
  assert(!result.qualified, 'Legends is historical')
  assertEqual(result.reason, 'run-not-finished', 'reason')
})

check('legends', 'a sanctioned campaign never qualifies', () => {
  const result = legends.qualifyForLegends(
    performance({ minutesAtGlobalOne: 600, sanctioned: true }),
    POLICY,
  )
  assert(!result.qualified, 'flagged or rejected campaigns are not eligible')
})

check('legends', 'retention is 48 hours', () => {
  assertEqual(legends.LEGENDS_RETENTION_MS, 48 * 3_600_000, 'retention window')
})

/* -------------------------------------------------------------------------- */
/* Session scope isolation                                                    */
/* -------------------------------------------------------------------------- */

process.env.RANKBURN_SESSION_SECRET =
  process.env.RANKBURN_SESSION_SECRET ?? 'verification-harness-secret'

function mint(scope) {
  return session.encodeSession({
    sub: 'user-1',
    email: 'a@b.test',
    scope,
    exp: Math.floor(Date.now() / 1000) + 600,
  })
}

check('session', 'an advertiser token is accepted by the advertiser scope', () => {
  assert(
    session.decodeSession(mint('advertiser'), 'advertiser') !== null,
    'a valid same-scope token must be accepted',
  )
})

check('session', 'an admin token is rejected by the advertiser scope', () => {
  assert(
    session.decodeSession(mint('admin'), 'advertiser') === null,
    'scope confusion would make every advertiser an administrator',
  )
})

check('session', 'an advertiser token is rejected by the admin scope', () => {
  assert(
    session.decodeSession(mint('advertiser'), 'admin') === null,
    'an advertiser must never reach moderation',
  )
})

check('session', 'a tampered payload is rejected', () => {
  const token = mint('advertiser')
  const [body, signature] = token.split('.')
  const forged = Buffer.from(
    JSON.stringify({
      sub: 'someone-else',
      email: 'x@y.test',
      scope: 'advertiser',
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    'utf8',
  ).toString('base64url')
  assert(
    session.decodeSession(`${forged}.${signature}`, 'advertiser') === null,
    'swapping the subject must invalidate the signature',
  )
  assert(body.length > 0, 'sanity')
})

check('session', 'an expired token is rejected', () => {
  const expired = session.encodeSession({
    sub: 'user-1',
    email: 'a@b.test',
    scope: 'advertiser',
    exp: Math.floor(Date.now() / 1000) - 1,
  })
  assert(
    session.decodeSession(expired, 'advertiser') === null,
    'expiry must be enforced',
  )
})

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

check('password', 'the correct password verifies', () => {
  const stored = session.hashPassword('correct horse battery staple')
  assert(
    session.verifyPassword('correct horse battery staple', stored),
    'round-trip must succeed',
  )
})

check('password', 'a wrong password does not verify', () => {
  const stored = session.hashPassword('correct horse battery staple')
  assert(!session.verifyPassword('wrong', stored), 'must reject')
})

check('password', 'the plaintext never appears in the stored value', () => {
  const stored = session.hashPassword('correct horse battery staple')
  assert(
    !stored.includes('correct horse battery staple'),
    'the password must not be recoverable from storage',
  )
})

check('password', 'the same password hashes differently each time', () => {
  const a = session.hashPassword('same password')
  const b = session.hashPassword('same password')
  assert(a !== b, 'a per-account salt must make hashes unique')
})

check('password', 'a malformed stored value denies rather than throws', () => {
  assert(!session.verifyPassword('x', 'garbage'), 'malformed row')
  assert(!session.verifyPassword('x', ''), 'empty hash, as the demo user has')
})

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

check('rate-limit', 'allows up to the limit then blocks', () => {
  const rule = { name: `test-${Math.random()}`, limit: 3, windowMs: 60_000 }
  const now = Date.now()
  for (let i = 0; i < 3; i += 1) {
    assert(
      rateLimit.checkRateLimit(rule, 'client-a', now).allowed,
      `request ${i + 1} should be allowed`,
    )
  }
  const blocked = rateLimit.checkRateLimit(rule, 'client-a', now)
  assert(!blocked.allowed, 'the fourth request must be blocked')
  assert(blocked.retryAfterSeconds > 0, 'a Retry-After hint must be supplied')
})

check('rate-limit', 'buckets are per client', () => {
  const rule = { name: `test-${Math.random()}`, limit: 1, windowMs: 60_000 }
  const now = Date.now()
  rateLimit.checkRateLimit(rule, 'client-a', now)
  assert(
    rateLimit.checkRateLimit(rule, 'client-b', now).allowed,
    'one client must not exhaust another client budget',
  )
})

check('rate-limit', 'the window resets', () => {
  const rule = { name: `test-${Math.random()}`, limit: 1, windowMs: 1_000 }
  const now = Date.now()
  rateLimit.checkRateLimit(rule, 'client-a', now)
  assert(
    rateLimit.checkRateLimit(rule, 'client-a', now + 1_001).allowed,
    'the bucket must expire',
  )
})

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

let currentGroup = null
for (const result of results) {
  if (result.group !== currentGroup) {
    currentGroup = result.group
    console.log(`\n${currentGroup}`)
  }
  console.log(
    `  ${result.ok ? 'pass' : 'FAIL'}  ${result.name}${
      result.ok ? '' : `\n        ${result.detail}`
    }`,
  )
}

console.log(
  `\n${results.length - failures}/${results.length} invariant checks passed.`,
)
console.log(
  'Scope: pure logic only. Database, provider and end-to-end behaviour are',
)
console.log('covered by docs/INTEGRATION_VERIFICATION.md, not by this file.')

process.exit(failures > 0 ? 1 : 0)
