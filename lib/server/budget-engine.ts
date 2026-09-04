/**
 * FlipPeak Beta 2.0 — deterministic budget engine.
 *
 * Core economic rule:
 *   Budget determines duration.
 *   Burn Rate determines competitive strength.
 *
 * Only ACTIVE campaigns consume. Burn Rate can only increase during an
 * active commercial run. An exhausted run is not auto-revived by funding;
 * Beta 2.0 uses "Run Again" as a new run/campaign.
 */

import { and, eq, gt, sql } from 'drizzle-orm'
import { getDb, type Executor } from './db/client'
import {
  advertisingBudgets,
  budgetUsageEvents,
  campaigns,
} from './db/schema'
import { newId } from './id'
import { recordLegendIfQualified } from './legends'
import { utcDateKey } from './store'
import type { Campaign } from './types'

const MS_PER_HOUR = 3_600_000

export const MIN_BURN_RATE_CENTS_PER_HOUR = 100
export const STANDARD_MAX_BURN_RATE_CENTS_PER_HOUR = 10_000
export const ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR = 100_000

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
  return Math.min(activeCents, Math.floor(raw))
}

export function estimateRuntimeMs(
  activeCents: number,
  burnRateCentsPerHour: number,
): number {
  if (activeCents <= 0 || burnRateCentsPerHour <= 0) return 0
  return Math.floor(
    (activeCents * MS_PER_HOUR) / burnRateCentsPerHour,
  )
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

  const runClosed = nextActive <= 0

  await tx
    .update(campaigns)
    .set({
      lastSettledAt: settledTo,
      status: runClosed ? 'EXHAUSTED' : row.status,
    })
    .where(eq(campaigns.id, row.id))

  if (runClosed) {
    // The run is now history, which is the only moment Legends can be
    // decided. Same transaction, so a campaign can never be EXHAUSTED without
    // its Legends decision having been made.
    //
    // Burn Rate can only increase during an active run, so the rate at
    // closing time is the run's peak by construction.
    await recordLegendIfQualified(tx, row.id, row.burnRateCentsPerHour, now)
  }

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

function dueForSettlement(now: Date) {
  const nowIso = now.toISOString()
  return sql`extract(epoch from (${nowIso}::timestamptz - ${campaigns.lastSettledAt})) * ${campaigns.burnRateCentsPerHour} >= 3600`
}

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

export type IncreaseBurnRateResult =
  | {
      ok: true
      campaignId: string
      previousBurnRateCentsPerHour: number
      newBurnRateCentsPerHour: number
      activeCents: number
      consumedBeforeChangeCents: number
      estimatedRuntimeMs: number
      changedAt: string
    }
  | {
      ok: false
      code:
        | 'NOT_FOUND'
        | 'NOT_ACTIVE'
        | 'EXHAUSTED'
        | 'INVALID_RATE'
        | 'RATE_NOT_HIGHER'
      message: string
    }

/**
 * Atomically increases Burn Rate.
 *
 * Important: settlement is performed at the OLD rate before changing it.
 * `lastSettledAt` is then forced to `now`, preventing the NEW rate from being
 * applied retroactively to an interval that belongs to the previous rate.
 *
 * Because balances are whole cents, a sub-cent remainder from the previous
 * rate may be discarded at the change boundary. This favors the advertiser
 * by less than one cent and will be replaced by explicit carry accounting if
 * we later require exact fractional-cent continuity.
 */
export async function increaseBurnRate(
  campaignId: string,
  newBurnRateCentsPerHour: number,
  now = new Date(),
): Promise<IncreaseBurnRateResult> {
  if (
    !Number.isInteger(newBurnRateCentsPerHour) ||
    newBurnRateCentsPerHour < MIN_BURN_RATE_CENTS_PER_HOUR ||
    newBurnRateCentsPerHour > ABSOLUTE_MAX_BURN_RATE_CENTS_PER_HOUR
  ) {
    return {
      ok: false,
      code: 'INVALID_RATE',
      message: 'Burn Rate must be between $1/h and $1,000/h.',
    }
  }

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

    if (!row) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
      }
    }

    if (row.status === 'EXHAUSTED' || row.activeCents <= 0) {
      return {
        ok: false,
        code: 'EXHAUSTED',
        message: 'An exhausted run cannot change Burn Rate.',
      }
    }

    if (row.status !== 'ACTIVE') {
      return {
        ok: false,
        code: 'NOT_ACTIVE',
        message: 'Only an active campaign can increase Burn Rate.',
      }
    }

    if (newBurnRateCentsPerHour <= row.burnRateCentsPerHour) {
      return {
        ok: false,
        code: 'RATE_NOT_HIGHER',
        message: 'Burn Rate can only increase during an active run.',
      }
    }

    const consumed = await applySettlement(tx, row, now)
    const activeAfterSettle = Math.max(0, row.activeCents - consumed)

    if (activeAfterSettle <= 0) {
      return {
        ok: false,
        code: 'EXHAUSTED',
        message: 'Campaign exhausted before the Burn Rate change.',
      }
    }

    await tx
      .update(campaigns)
      .set({
        burnRateCentsPerHour: newBurnRateCentsPerHour,
        // Critical boundary: the new rate begins exactly at `now`.
        lastSettledAt: now,
        burnRateChangedAt: now,
      })
      .where(eq(campaigns.id, campaignId))

    return {
      ok: true,
      campaignId,
      previousBurnRateCentsPerHour: row.burnRateCentsPerHour,
      newBurnRateCentsPerHour,
      activeCents: activeAfterSettle,
      consumedBeforeChangeCents: consumed,
      estimatedRuntimeMs: estimateRuntimeMs(
        activeAfterSettle,
        newBurnRateCentsPerHour,
      ),
      changedAt: now.toISOString(),
    }
  })
}

export type CreditBudgetResult =
  | {
      ok: true
      /** Campaign status after the credit committed. */
      status: Campaign['status']
      activeCents: number
    }
  | {
      ok: false
      code:
        | 'INVALID_AMOUNT'
        | 'NOT_FOUND'
        | 'STATUS_NOT_FUNDABLE'
        /**
         * The run is closed, either on entry or because settlement consumed
         * the last cent inside this transaction.
         */
        | 'RUN_EXHAUSTED'
        /** The campaign was rejected and can never be funded. */
        | 'CAMPAIGN_REJECTED'
      /**
       * True when captured funds exist for a campaign that reached a TERMINAL
       * non-fundable state. The general funding rule applies: never credit,
       * never revive, never silently reassign - refund to the payer.
       *
       * Callers branch on this flag rather than on the individual code, so a
       * future terminal state is covered by the rule instead of needing its
       * own special case.
       */
      refundable: boolean
      /** Terminal cause, used to pick the audit action for the refund. */
      terminalCause?: 'EXHAUSTED' | 'REJECTED'
      message: string
    }

/**
 * Statuses that may receive advertising budget.
 *
 *   APPROVED  first funding      -> becomes ACTIVE
 *   ACTIVE    top-up             -> stays ACTIVE, same run
 *   PAUSED    funded while off   -> stays PAUSED, never auto-resumes
 *
 * PENDING, REJECTED and EXHAUSTED are excluded. An exhausted run is terminal:
 * adding money to it would revive it, and Run Again exists precisely so a new
 * commercial run is created instead.
 *
 * Adding budget never changes competitive position. It only extends how long
 * the campaign can sustain its existing Burn Rate.
 */
const FUNDABLE_STATUSES: ReadonlySet<string> = new Set([
  'APPROVED',
  'ACTIVE',
  'PAUSED',
])

/**
 * Credits verified advertising budget inside an existing database transaction.
 *
 * This helper exists so payment claiming + budget credit + campaign activation
 * can commit atomically in one transaction.
 */
export async function creditBudgetInTransaction(
  tx: Executor,
  campaignId: string,
  amountCents: number,
  now = new Date(),
): Promise<CreditBudgetResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      refundable: false,
      message: 'Credit amount must be a positive integer number of cents.',
    }
  }

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
  if (!row) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      refundable: false,
      message: 'Campaign not found.',
    }
  }

  const status = row.status as Campaign['status']

  // General funding rule. A terminal state is refundable, not merely refused:
  // the money was already captured, so it has to go somewhere, and the only
  // place it may go is back to the payer.
  if (status === 'EXHAUSTED') {
    return {
      ok: false,
      code: 'RUN_EXHAUSTED',
      refundable: true,
      terminalCause: 'EXHAUSTED',
      message:
        'This run is closed. Advertising budget cannot be added to an ' +
        'exhausted run; a new run must be created with Run Again.',
    }
  }

  if (status === 'REJECTED') {
    return {
      ok: false,
      code: 'CAMPAIGN_REJECTED',
      refundable: true,
      terminalCause: 'REJECTED',
      message:
        'This campaign was rejected and can never receive advertising ' +
        'budget.',
    }
  }

  if (!FUNDABLE_STATUSES.has(status)) {
    // Not terminal, so not automatically refundable: a payment for a campaign
    // in this state should not exist at all, and that is an operator question
    // rather than a money-movement decision.
    return {
      ok: false,
      code: 'STATUS_NOT_FUNDABLE',
      refundable: false,
      message: `A campaign in ${status} cannot receive advertising budget.`,
    }
  }

  const consumed = await applySettlement(tx, row, now)
  const activeAfterSettle = Math.max(0, row.activeCents - consumed)

  // applySettlement() flips ACTIVE -> EXHAUSTED the instant the balance
  // reaches zero. Crediting here would write ACTIVE back over that and revive
  // a finished run. The status is therefore derived from the state AFTER
  // settlement, never from the row read before it.
  if (status === 'ACTIVE' && activeAfterSettle <= 0) {
    return {
      ok: false,
      code: 'RUN_EXHAUSTED',
      refundable: true,
      terminalCause: 'EXHAUSTED',
      message:
        'The run reached zero balance before this payment was applied. ' +
        'The run is closed; a new run must be created with Run Again.',
    }
  }

  const nextActive = activeAfterSettle + amountCents

  await tx
    .update(advertisingBudgets)
    .set({
      activeCents: nextActive,
      lifetimeFundedCents: row.lifetimeFundedCents + amountCents,
      updatedAt: now,
    })
    .where(eq(advertisingBudgets.campaignId, campaignId))

  if (status === 'APPROVED') {
    // First funding. The burn clock starts at payment time, not at approval
    // time, so an approved-but-unfunded campaign is never back-billed.
    await tx
      .update(campaigns)
      .set({
        status: 'ACTIVE',
        balanceChangedAt: now,
        lastSettledAt: now,
      })
      .where(eq(campaigns.id, campaignId))

    return { ok: true, status: 'ACTIVE', activeCents: nextActive }
  }

  // Top-up on an existing run (ACTIVE stays ACTIVE, PAUSED stays PAUSED).
  //
  // `lastSettledAt` is deliberately NOT reset here. applySettlement() already
  // advanced it by exactly the time the consumed cents represent, carrying the
  // sub-cent remainder forward. Overwriting it with `now` would discard that
  // remainder on every recharge and reintroduce the under-consumption drift.
  await tx
    .update(campaigns)
    .set({ balanceChangedAt: now })
    .where(eq(campaigns.id, campaignId))

  return { ok: true, status, activeCents: nextActive }
}

/**
 * Standalone budget credit wrapper.
 *
 * Verified payment handling should prefer `creditBudgetInTransaction()` from
 * its own transaction so payment state and budget state cannot diverge.
 */
export async function creditBudget(
  campaignId: string,
  amountCents: number,
  now = new Date(),
): Promise<CreditBudgetResult> {
  const db = getDb()
  return db.transaction((tx) =>
    creditBudgetInTransaction(tx, campaignId, amountCents, now),
  )
}
