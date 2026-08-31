/**
 * Deterministic advertising budget engine, backed by PostgreSQL.
 *
 * Budget consumption is a pure function of:
 *   campaign status + active budget + burn rate + last settled timestamp + now
 *
 * Nothing depends on a browser being open. Settling a campaign untouched for
 * three days produces the same result as settling it every second for three
 * days, because consumption derives from elapsed wall-clock time rather than
 * accumulated ticks.
 *
 * Concurrency: every mutation runs inside a transaction that takes a row lock
 * (`SELECT ... FOR UPDATE`) on the campaign and its budget before reading the
 * balance it is about to change. Two instances settling or crediting the same
 * campaign at once serialise instead of double-spending.
 *
 * Only ACTIVE campaigns consume. Clicks never consume - exposure is what is
 * being sold.
 */

import { and, eq, gt, sql } from 'drizzle-orm'
import { getDb, type Executor } from './db/client'
import {
  advertisingBudgets,
  budgetUsageEvents,
  campaigns,
} from './db/schema'
import { newId } from './id'
import { utcDateKey } from './store'
import type { Campaign } from './types'

const MS_PER_HOUR = 3_600_000

/**
 * Pure computation: how much a campaign should have consumed between two
 * timestamps. Kept synchronous and dependency-free so it can be unit-tested
 * directly - this is the function where a bug costs real money.
 */
export function computeConsumption(
  status: Campaign['status'],
  activeCents: number,
  burnRateCentsPerHour: number,
  fromMs: number,
  toMs: number,
): number {
  if (status !== 'ACTIVE') return 0
  if (activeCents <= 0) return 0
  if (burnRateCentsPerHour <= 0) return 0
  const elapsedMs = toMs - fromMs
  if (elapsedMs <= 0) return 0
  const raw = (burnRateCentsPerHour * elapsedMs) / MS_PER_HOUR
  // Floor to whole cents so repeated settlement can never over-consume.
  return Math.min(activeCents, Math.floor(raw))
}

type SettleRow = {
  id: string
  status: string
  burnRateCentsPerHour: number
  lastSettledAt: Date
  activeCents: number
  usedTodayCents: number
  usedTodayDate: string
  lifetimeUsedCents: number
}

/**
 * Applies one settlement to a locked row set. Called inside a transaction.
 * Returns the consumed amount so callers can report it.
 */
async function applySettlement(
  tx: Executor,
  row: SettleRow,
  now: Date,
): Promise<number> {
  const fromMs = new Date(row.lastSettledAt).getTime()
  const toMs = now.getTime()

  const consumedCents = computeConsumption(
    row.status as Campaign['status'],
    row.activeCents,
    row.burnRateCentsPerHour,
    fromMs,
    toMs,
  )
  if (consumedCents <= 0) return 0

  /**
   * Advance the clock by exactly the time the consumed cents represent, not
   * all the way to `now`.
   *
   * Consumption is floored to whole cents, so settling to `now` would discard
   * the sub-cent remainder on every pass. Frequent settlement would then
   * under-consume - measured at ~1.2% per day at a non-integral burn rate.
   * Carrying the remainder forward makes the result independent of how often
   * settlement runs, which is the whole point of a deterministic engine.
   *
   * Rounded up rather than down so any residual error (measured under 0.05%
   * per day) leaves the advertiser with slightly more exposure than paid for,
   * never less. Erring toward over-charging would be the wrong direction.
   */
  const consumedMs = Math.ceil(
    (consumedCents * MS_PER_HOUR) / row.burnRateCentsPerHour,
  )
  const settledTo = new Date(Math.min(toMs, fromMs + consumedMs))

  const dayKey = utcDateKey(now)
  const rolledOver = row.usedTodayDate !== dayKey
  const nextActive = row.activeCents - consumedCents

  await tx
    .update(advertisingBudgets)
    .set({
      activeCents: nextActive,
      lifetimeUsedCents: row.lifetimeUsedCents + consumedCents,
      usedTodayCents: rolledOver
        ? consumedCents
        : row.usedTodayCents + consumedCents,
      usedTodayDate: dayKey,
      updatedAt: now,
    })
    .where(eq(advertisingBudgets.campaignId, row.id))

  await tx
    .update(campaigns)
    .set({
      lastSettledAt: settledTo,
      balanceChangedAt: now,
      // A campaign that runs out stops ranking, but keeps all of its data
      // and can return to ACTIVE when new budget is confirmed.
      status: nextActive <= 0 ? 'EXHAUSTED' : row.status,
    })
    .where(eq(campaigns.id, row.id))

  await tx.insert(budgetUsageEvents).values({
    id: newId('use'),
    campaignId: row.id,
    amountCents: consumedCents,
    fromAt: new Date(fromMs),
    toAt: settledTo,
    createdAt: now,
  })

  return consumedCents
}

/**
 * Only selects campaigns where enough time has elapsed to consume at least
 * one cent. Without this guard every page view would write to every campaign
 * row for a zero-value update.
 */
function dueForSettlement(now: Date) {
  return sql`extract(epoch from (${now}::timestamptz - ${campaigns.lastSettledAt})) * ${campaigns.burnRateCentsPerHour} >= 3600`
}

/** Brings a single campaign up to date. Idempotent for a given `now`. */
export async function settleCampaign(
  campaignId: string,
  now = new Date(),
): Promise<number> {
  const db = getDb()
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: campaigns.id,
        status: campaigns.status,
        burnRateCentsPerHour: campaigns.burnRateCentsPerHour,
        lastSettledAt: campaigns.lastSettledAt,
        activeCents: advertisingBudgets.activeCents,
        usedTodayCents: advertisingBudgets.usedTodayCents,
        usedTodayDate: advertisingBudgets.usedTodayDate,
        lifetimeUsedCents: advertisingBudgets.lifetimeUsedCents,
      })
      .from(campaigns)
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .where(eq(campaigns.id, campaignId))
      .limit(1)
      .for('update')

    const row = rows[0]
    if (!row) return 0
    return applySettlement(tx, row, now)
  })
}

/**
 * Settles every campaign that owes consumption. Called before any read that
 * reports balances or placement.
 */
export async function settleAll(now = new Date()): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: campaigns.id,
        status: campaigns.status,
        burnRateCentsPerHour: campaigns.burnRateCentsPerHour,
        lastSettledAt: campaigns.lastSettledAt,
        activeCents: advertisingBudgets.activeCents,
        usedTodayCents: advertisingBudgets.usedTodayCents,
        usedTodayDate: advertisingBudgets.usedTodayDate,
        lifetimeUsedCents: advertisingBudgets.lifetimeUsedCents,
      })
      .from(campaigns)
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .where(
        and(
          eq(campaigns.status, 'ACTIVE'),
          gt(advertisingBudgets.activeCents, 0),
          dueForSettlement(now),
        ),
      )
      .for('update')

    for (const row of rows) {
      await applySettlement(tx, row, now)
    }
  })
}

/**
 * Credits confirmed advertising budget. This is the ONLY way a balance goes
 * up. It is called from the payment layer after a provider-verified capture,
 * never from a browser request carrying an amount.
 */
export async function creditBudget(
  campaignId: string,
  amountCents: number,
  now = new Date(),
): Promise<boolean> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return false

  const db = getDb()
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: campaigns.id,
        status: campaigns.status,
        burnRateCentsPerHour: campaigns.burnRateCentsPerHour,
        lastSettledAt: campaigns.lastSettledAt,
        activeCents: advertisingBudgets.activeCents,
        usedTodayCents: advertisingBudgets.usedTodayCents,
        usedTodayDate: advertisingBudgets.usedTodayDate,
        lifetimeUsedCents: advertisingBudgets.lifetimeUsedCents,
        lifetimeFundedCents: advertisingBudgets.lifetimeFundedCents,
      })
      .from(campaigns)
      .innerJoin(
        advertisingBudgets,
        eq(advertisingBudgets.campaignId, campaigns.id),
      )
      .where(eq(campaigns.id, campaignId))
      .limit(1)
      .for('update')

    const row = rows[0]
    if (!row) return false

    // Settle first so the funded amount is not retroactively burned by the
    // period before it arrived.
    const consumed = await applySettlement(tx, row, now)
    const activeAfterSettle = row.activeCents - consumed

    await tx
      .update(advertisingBudgets)
      .set({
        activeCents: activeAfterSettle + amountCents,
        lifetimeFundedCents: row.lifetimeFundedCents + amountCents,
        updatedAt: now,
      })
      .where(eq(advertisingBudgets.campaignId, campaignId))

    // Funding revives an exhausted campaign, but never overrides moderation:
    // PAUSED, PENDING and REJECTED are left exactly as they are.
    const revive =
      row.status === 'EXHAUSTED' || activeAfterSettle + amountCents > 0
        ? row.status === 'EXHAUSTED'
          ? 'ACTIVE'
          : row.status
        : row.status

    await tx
      .update(campaigns)
      .set({
        status: revive,
        balanceChangedAt: now,
        lastSettledAt: now,
      })
      .where(eq(campaigns.id, campaignId))

    return true
  })
}
