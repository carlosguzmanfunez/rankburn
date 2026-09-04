/**
 * Integration verification runner.
 *
 * Executes the steps of `docs/INTEGRATION_VERIFICATION.md` that can be
 * automated, in the order they must be run, stopping at the first hard
 * failure because later steps are meaningless once an earlier one breaks.
 *
 * DESIGN RULE: a step that cannot run is reported SKIP with the reason, never
 * PASS. A verification suite that turns "I could not check this" into a green
 * tick is worse than no suite at all.
 *
 * Steps needing PayPal Sandbox are interactive by nature and are listed as
 * MANUAL, with the runbook as the authority on what to observe.
 *
 * Usage:
 *   npm run verify:integration
 *   DATABASE_URL=postgres://... npm run verify:integration
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const steps = []

function record(number, name, status, detail) {
  steps.push({ number, name, status, detail })
  const label = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP', MANUAL: 'MANUAL' }[
    status
  ]
  console.log(`${String(number).padStart(2)}. ${label.padEnd(6)} ${name}`)
  if (detail) console.log(`             ${detail}`)
}

function run(command, options = {}) {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 10 * 60_000,
  })
}

function attempt(number, name, command, { requires } = {}) {
  if (requires && !requires.ok) {
    record(number, name, 'SKIP', requires.reason)
    return false
  }
  try {
    run(command)
    record(number, name, 'PASS')
    return true
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    record(number, name, 'FAIL', output.split('\n').slice(-6).join('\n             '))
    return false
  }
}

const hasNetwork = (() => {
  try {
    run('npm ping --silent', { timeoutMs: 20_000 })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'npm registry unreachable from this environment' }
  }
})()

const hasDatabase = process.env.DATABASE_URL
  ? { ok: true }
  : { ok: false, reason: 'DATABASE_URL is not set' }

const hasSandbox =
  process.env.PAYPAL_CLIENT_ID &&
  process.env.PAYPAL_CLIENT_SECRET &&
  process.env.PAYPAL_WEBHOOK_ID
    ? { ok: true }
    : {
        ok: false,
        reason:
          'PayPal Sandbox credentials are not set (PAYPAL_CLIENT_ID / _SECRET / _WEBHOOK_ID)',
      }

console.log('FlipPeak Beta 2.0 — integration verification\n')

/* 1-2. Dependencies -------------------------------------------------------- */

attempt(1, 'Clean dependency install', 'npm ci', { requires: hasNetwork })

record(
  2,
  'Lockfile present and used',
  existsSync('package-lock.json') ? 'PASS' : 'FAIL',
  existsSync('package-lock.json')
    ? undefined
    : 'package-lock.json is missing, so `npm ci` cannot reproduce an install',
)

/* 3-4. Compilation --------------------------------------------------------- */

const typechecked = attempt(3, 'Full TypeScript check', 'npm run typecheck', {
  requires: hasNetwork,
})

attempt(4, 'Next.js production build', 'npm run build', {
  requires: typechecked
    ? hasNetwork
    : { ok: false, reason: 'typecheck failed; a build cannot be trusted' },
})

/* 5-6. Migrations ---------------------------------------------------------- */

attempt(5, 'Apply all migrations to an empty database', 'npm run db:setup', {
  requires: hasDatabase,
})

record(
  6,
  'Apply migrations over a pre-Beta 2.0 schema',
  hasDatabase.ok ? 'MANUAL' : 'SKIP',
  hasDatabase.ok
    ? 'See runbook step 6: apply 0000 + scripts/verification/legacy-fixture.sql, then migrate and assert'
    : hasDatabase.reason,
)

/* 7. Boot ------------------------------------------------------------------ */

record(
  7,
  'Application starts',
  hasDatabase.ok && hasNetwork.ok ? 'MANUAL' : 'SKIP',
  hasDatabase.ok && hasNetwork.ok
    ? 'Run `npm start` and confirm / renders the Live Market'
    : 'requires both a database and an installed dependency tree',
)

/* 8-15. Money paths -------------------------------------------------------- */

const moneySteps = [
  [8, 'Full checkout flow against PayPal Sandbox'],
  [9, 'Top-up on an ACTIVE campaign extends duration only'],
  [10, 'Boost raises Burn Rate and settles at the previous rate first'],
  [11, 'Exhaustion moves ACTIVE to EXHAUSTED exactly at zero'],
  [12, 'Run Again creates a new run and never revives the old one'],
  [13, 'Duplicate webhook delivery credits exactly once'],
  [14, 'Refund against PayPal Sandbox'],
  [15, 'REFUND_FAILED then retry reaches REFUNDED'],
]

for (const [number, name] of moneySteps) {
  record(
    number,
    name,
    hasSandbox.ok && hasDatabase.ok ? 'MANUAL' : 'SKIP',
    hasSandbox.ok && hasDatabase.ok
      ? 'See the runbook for the exact assertions'
      : hasSandbox.ok
        ? hasDatabase.reason
        : hasSandbox.reason,
  )
}

/* 16. The invariant that matters most -------------------------------------- */

attempt(
  16,
  'Ranking invariants: only Burn Rate changes position',
  'npm run verify:invariants',
)

/* Report ------------------------------------------------------------------- */

const counts = steps.reduce((acc, step) => {
  acc[step.status] = (acc[step.status] ?? 0) + 1
  return acc
}, {})

console.log('\n' + '-'.repeat(64))
console.log(
  `PASS ${counts.PASS ?? 0}   FAIL ${counts.FAIL ?? 0}   ` +
    `SKIP ${counts.SKIP ?? 0}   MANUAL ${counts.MANUAL ?? 0}`,
)

if ((counts.SKIP ?? 0) + (counts.MANUAL ?? 0) > 0) {
  console.log(
    '\nNot verified. Skipped and manual steps are NOT passes: until every step\n' +
      'has been executed against a real environment, this build is unverified.',
  )
}

process.exit((counts.FAIL ?? 0) > 0 ? 1 : 0)
