# FlipPeak Beta 2.0 — Integration Verification Runbook

This is the block that separates integrated code from validated software.

Everything before this point is implementation. Nothing here has been executed
against a real environment, so until these steps pass, **Beta 2.0 is not
verified and must not be called production-ready.**

## Rules

1. Run the steps **in order**. A later step is meaningless if an earlier one
   failed, because it will be testing a system that was already broken.
2. **PayPal stays in Sandbox.** `PAYPAL_API_BASE` must remain
   `https://api-m.sandbox.paypal.com` throughout.
3. If a step fails: fix it, then re-run **that step and every step after it**.
   A fix invalidates everything downstream of it.
4. A step you could not run is **not** a pass. Record it as skipped.

## Automated helpers

```bash
npm run verify:integration   # runs what can be automated, skips the rest loudly
npm run verify:invariants    # pure-logic invariants; no database needed
npm run audit:schema         # Drizzle field-name drift
npm run audit:ownership      # ownership boundary and demo-identity boundary
```

`verify:integration` reports SKIP or MANUAL for anything it cannot execute. It
never converts "I could not check this" into a green tick.

---

## 1. Clean dependency install

```bash
rm -rf node_modules
npm ci
```

**Expect:** completes with no `ERESOLVE` and no missing peer errors.

**Watch for:** `swr`, `@base-ui/react@^1.5.0` and `lucide-react@^1.16.0` were
never resolved against a real registry in development. If any of them fails to
resolve, correct the version in `package.json` and re-run from step 1.
`shadcn` is listed as a runtime dependency and is a CLI; moving it to
`devDependencies` is safe and reduces install size.

---

## 2. Lockfile

**Expect:** `package-lock.json` exists, is committed, and `npm ci` used it
without rewriting it.

```bash
git status --porcelain package-lock.json   # must be empty after npm ci
```

If `npm ci` modified it, the lockfile was stale and the install in step 1 was
not reproducible.

---

## 3. Full TypeScript check

```bash
npm run typecheck
```

**Expect:** zero errors.

**Note:** development verified this against hand-written type stubs, not the
real packages. Drizzle's real generic types are stricter than the stubs in
places, so **new errors here are expected and are real findings**, particularly
around `.set()` / `.values()` payloads and joined select shapes.

---

## 4. Production build

```bash
npm run build
```

**Expect:** build completes; no route is prerendered that touches the database.

**Watch for:** any route handler that opens a connection during build. Every
GET route should carry `export const dynamic = 'force-dynamic'`. If the build
fails with "Failed to collect page data", that is the cause.

---

## 5. Migrations on an empty database

```bash
createdb flippeak_verify
DATABASE_URL=postgres://.../flippeak_verify npm run db:setup
```

**Expect:** migrations 0000 to 0009 apply in order and are recorded in
`_rankburn_migrations`.

**Then verify idempotency** — the property `0000_init.sql` claims:

```bash
DATABASE_URL=... npm run db:setup   # second run
```

**Expect:** no error. Migration 0004 adds a constraint without `IF NOT EXISTS`;
it is guarded only by the migration ledger, so if the ledger is ever cleared
this will fail. That is a known fragility, not a passing condition.

---

## 6. Migrations over a pre-Beta 2.0 schema

The step that proves the chain upgrades **real rows**, not just an empty schema.

```bash
createdb flippeak_legacy
psql $LEGACY_URL -f lib/server/db/migrations/0000_init.sql
psql $LEGACY_URL -f scripts/verification/legacy-fixture.sql
DATABASE_URL=$LEGACY_URL npm run db:setup    # applies 0001-0009
```

**Assertions:**

```sql
-- 0006: no legacy category survives
SELECT count(*) FROM products
WHERE category IN ('marketing','seo','devtools','sales','productivity');
-- expect 0

-- 0006: the mapping is the documented one
SELECT id, category, subtype FROM products WHERE id LIKE 'legacy-%' ORDER BY id;
-- legacy-ai -> ai, legacy-devtools -> tech, legacy-marketing -> startups,
-- legacy-productivity -> apps, legacy-sales -> startups, legacy-seo -> tech

-- 0003: a never-funded campaign is not stranded in a terminal state
SELECT status FROM campaigns WHERE id = 'legacy-productivity';
-- expect APPROVED, not EXHAUSTED

-- 0008: the sustained-position backfill is a floor, never an over-credit
SELECT minutes_at_one, minutes_at_category_one, minutes_in_top_three
FROM campaign_stats WHERE campaign_id = 'legacy-ai';
-- expect 90, 90, 90

-- 0007: an existing credited payment is untouched and satisfies the new CHECK
SELECT status, credited_at IS NOT NULL AS credited, refunded_at
FROM payments WHERE id = 'legacy-payment';
-- expect COMPLETED, true, NULL

-- 0009: one email is one account, case-insensitively
INSERT INTO users (id,email,display_name,role) VALUES ('x','LEGACY@example.test','X','ADVERTISER');
-- expect a unique-violation error
```

---

## 7. Application starts

```bash
npm start
```

**Expect:** `/` renders the Live Market with seeded campaigns.

**If the market is empty**, the seed Burn Rates are below the `$1/h` floor and
`getLiveRanking()` is filtering everything out. Seeded rates should span
`$3/h` to `$60/h` with three shared tiers.

---

## 8. Full checkout flow (Sandbox)

1. Create an account at `/signin`.
2. Build a campaign at `/advertise` and launch it.
3. **Before paying:** open `/dashboard`.

**Expect:** the campaign appears immediately as APPROVED, labelled visible to
you only. It must **not** appear in the Live Market.

This is the ownership/visibility separation. If an APPROVED campaign is missing
from My Campaigns, the dashboard is reading the public market again.

4. Complete payment in Sandbox.

**Expect:** webhook verified, budget credited once, status ACTIVE, campaign now
in the Live Market at its Burn Rate.

```sql
SELECT status, credited_at, refunded_at FROM payments WHERE campaign_id = '<id>';
SELECT status, burn_rate_cents_per_hour FROM campaigns WHERE id = '<id>';
SELECT active_cents, lifetime_funded_cents FROM advertising_budgets WHERE campaign_id = '<id>';
```

---

## 9. Top-up on an ACTIVE campaign

Record Global Rank, Category Rank and Burn Rate. Then top up and pay.

**Expect:**
- `active_cents` increases by the paid amount;
- `burn_rate_cents_per_hour` is **unchanged**;
- Global Rank and Category Rank are **unchanged**;
- estimated runtime increases.

**This is the core economic invariant.** If rank moved, budget is leaking into
position and everything else is void.

Also confirm `last_settled_at` did **not** jump to the top-up instant: resetting
it would discard the sub-cent remainder carry on every recharge.

---

## 10. Boost

Raise Burn Rate from the dashboard.

**Expect:**
- consumption up to the change instant is billed at the **old** rate;
- consumption after it is billed at the **new** rate;
- `burn_rate_changed_at` updates;
- rank recalculates on the next ranking refresh;
- a **decrease** is rejected (409), at any value.

```sql
SELECT cents, burn_rate_cents_per_hour, created_at
FROM budget_usage_events WHERE campaign_id = '<id>' ORDER BY created_at;
```

The event immediately before the change must carry the old rate.

---

## 11. Exhaustion

Fund a campaign with a small balance at a high Burn Rate so it drains in
minutes. Wait for it to run out.

**Expect:**
- `active_cents` lands on exactly `0`, never negative;
- status becomes `EXHAUSTED`;
- it leaves the Live Market;
- it remains visible in My Campaigns and in the historical leaderboards;
- a Legends entry appears **only** if it met a sustained-position criterion.

---

## 12. Run Again

**Expect:**
- a **new** campaign id, `previous_campaign_id` pointing at the exhausted run;
- the exhausted run stays `EXHAUSTED` and is never modified;
- the new run starts `APPROVED` with zero balance;
- Burn Rate is inherited.

**Duplicate protection:** call Run Again twice without paying.

**Expect:** the second call returns the same campaign id with `reused: true`.
One user intent must not leave a trail of orphan campaigns.

---

## 13. Duplicate webhook delivery

Resend a past delivery from the PayPal developer dashboard.

**Expect:**
- HTTP 200;
- budget credited **exactly once**;
- one row in `processed_webhook_events`;
- `credited_at` unchanged from the first delivery.

```sql
SELECT count(*) FROM processed_webhook_events WHERE event_id = '<event id>';
SELECT lifetime_funded_cents FROM advertising_budgets WHERE campaign_id = '<id>';
```

Also post the unsigned fixtures directly:

```bash
curl -X POST $APP/api/payments/paypal/webhook \
  -H 'content-type: application/json' \
  -d @scripts/verification/fixtures/capture-unmatched.json
```

**Expect 400** — unsigned input is not trusted. That rejection is the test.

---

## 14. Refund (Sandbox)

**Status today: IMPLEMENTED / NOT E2E VERIFIED.** This path moves real money
back and has never been executed.

Provoke it: start checkout on an ACTIVE campaign with a nearly empty balance,
let the run exhaust while the payment is in flight, then complete payment.

**Expect, in order:**

| # | Check |
|---|---|
| 1 | Payment captured in Sandbox |
| 2 | Campaign already EXHAUSTED when the webhook arrives |
| 3 | `payments.status` becomes `REFUND_PENDING` |
| 4 | A real refund call reaches PayPal Sandbox |
| 5 | Refund confirmed; `status` `REFUNDED`, `provider_refund_id` set |
| 6 | Campaign stays `EXHAUSTED` |
| 7 | `active_cents` and `lifetime_funded_cents` do **not** increase |
| 8 | A duplicate webhook produces **no second refund** |
| 9 | A provider failure leaves `REFUND_FAILED`, not a lost record |
| 10 | Retry from `REFUND_FAILED` reaches `REFUNDED` |
| 11 | Audit trail complete |

```sql
SELECT action, entity_id, reason, created_at FROM audit_logs
WHERE entity_id = '<payment id>' ORDER BY created_at;
-- expect PAYMENT_REFUND_REQUIRED_CAMPAIGN_EXHAUSTED then
--        PAYMENT_REFUNDED_CAMPAIGN_EXHAUSTED

SELECT (credited_at IS NULL) AND (refunded_at IS NOT NULL) AS correct
FROM payments WHERE id = '<payment id>';
-- expect true; the CHECK constraint forbids both being set
```

Repeat for a `REJECTED` campaign. Expect the same flow with
`PAYMENT_REFUNDED_CAMPAIGN_REJECTED`.

---

## 15. REFUND_FAILED → retry → REFUNDED

Force a provider failure (revoke refund permission on the Sandbox app, or point
`PAYPAL_API_BASE` at an unreachable host for one delivery).

**Expect:**
- `status` `REFUND_FAILED` with a populated `refund_failure_reason`;
- `refunded_at` still `NULL`;
- the operator can retry and reach `REFUNDED`;
- the retry does **not** produce a second refund at the provider.

---

## 16. Ranking is unaffected by every financial scenario

The invariant the whole product rests on.

```bash
npm run verify:invariants
```

That proves the ranking **function** ignores money. It does not prove the
deployed system does, so also, against the live database:

Take a snapshot before and after steps 9 to 15:

```sql
SELECT c.id, c.burn_rate_cents_per_hour
FROM campaigns c
JOIN advertising_budgets b ON b.campaign_id = c.id
WHERE c.status = 'ACTIVE' AND b.active_cents > 0
  AND c.burn_rate_cents_per_hour >= 100
ORDER BY c.burn_rate_cents_per_hour DESC, c.id ASC;
```

**Expect:** the ordering changed **only** where `burn_rate_cents_per_hour`
changed. A top-up, a refund, an exhaustion, a Run Again, a duplicate webhook
and an analytics event must all leave the order untouched.

Any reordering not explained by a Burn Rate change is a **critical** finding:
it means money bought position.

---

## Sign-off

Beta 2.0 may be called verified only when steps 1 to 16 have all been executed
and passed against a real environment, with PayPal in Sandbox.

| Step | Status | Date | Notes |
|---|---|---|---|
| 1 Clean install | | | |
| 2 Lockfile | | | |
| 3 Typecheck | | | |
| 4 Build | | | |
| 5 Migrations, empty | | | |
| 6 Migrations, legacy | | | |
| 7 Boot | | | |
| 8 Checkout | | | |
| 9 Top-up | | | |
| 10 Boost | | | |
| 11 Exhaustion | | | |
| 12 Run Again | | | |
| 13 Duplicate webhook | | | |
| 14 Refund | | | |
| 15 Refund retry | | | |
| 16 Ranking invariant | | | |
