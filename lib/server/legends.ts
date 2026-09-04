/**
 * Legends recording.
 *
 * A Legends entry is written at exactly one moment: when a commercial run
 * closes because its balance reached zero. Legends is historical recognition,
 * so it can only be decided once the run is history.
 *
 * This module holds the database side. The qualification rule itself stays a
 * pure function in `legends-engine.ts` so it can be reasoned about and tested
 * without a database.
 *
 * Legends never participates in the Live Market: nothing here writes to
 * campaigns, budgets or rank snapshots.
 */

import { eq } from 'drizzle-orm'
import { config } from './config'
import type { Executor } from './db/client'
import { campaignStats, campaigns, legendEntries } from './db/schema'
import { newId } from './id'
import { qualifyForLegends } from './legends-engine'

/**
 * Evaluates a just-closed run and records it if it qualifies.
 *
 * Runs inside the caller's transaction, so a run cannot be marked EXHAUSTED
 * without its Legends decision committing atomically alongside it.
 *
 * `peakBurnRateCentsPerHour` is the run's Burn Rate at closing time, which is
 * also its maximum: Burn Rate can only ever increase during an active run, so
 * the closing value is the peak by construction and no history scan is needed.
 *
 * Idempotent: `legend_entries` has a unique index on `campaign_id`, and the
 * insert is `ON CONFLICT DO NOTHING`.
 */
export async function recordLegendIfQualified(
  tx: Executor,
  campaignId: string,
  peakBurnRateCentsPerHour: number,
  now: Date,
): Promise<boolean> {
  const rows = await tx
    .select({
      peakRank: campaignStats.peakRank,
      minutesAtOne: campaignStats.minutesAtOne,
      minutesAtCategoryOne: campaignStats.minutesAtCategoryOne,
      minutesInTopThree: campaignStats.minutesInTopThree,
      flagged: campaigns.flagged,
      status: campaigns.status,
    })
    .from(campaignStats)
    .innerJoin(campaigns, eq(campaigns.id, campaignStats.campaignId))
    .where(eq(campaignStats.campaignId, campaignId))
    .limit(1)

  const row = rows[0]
  if (!row) return false

  const qualification = qualifyForLegends(
    {
      campaignId,
      peakRank: row.peakRank,
      peakBurnRateCentsPerHour,
      minutesAtGlobalOne: row.minutesAtOne,
      minutesAtCategoryOne: row.minutesAtCategoryOne,
      minutesInTopThree: row.minutesInTopThree,
      // The caller invokes this at the instant the run closes, so the run is
      // finished by construction. Passed explicitly rather than assumed, so
      // the policy stays honest if another caller appears.
      runFinished: true,
      // A flagged or rejected campaign is not eligible for recognition.
      sanctioned: row.flagged || row.status === 'REJECTED',
    },
    config.legendsPolicy,
    now,
  )

  if (!qualification.qualified) return false

  await tx
    .insert(legendEntries)
    .values({
      id: newId('legend'),
      campaignId,
      qualifiedAt: now,
      expiresAt: qualification.expiresAt,
      peakRank: row.peakRank,
      peakBurnRateCentsPerHour,
      timeAtPeakSeconds: qualification.timeAtPeakSeconds,
      qualificationReason: qualification.criterion,
      createdAt: now,
    })
    .onConflictDoNothing()

  return true
}
