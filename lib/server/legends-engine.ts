/**
 * Legends qualification policy.
 *
 * Pure and dependency-free on purpose: this is the rule that decides whether a
 * finished run earns historical recognition, so it must be readable and
 * testable without a database.
 *
 * Product rule (FlipPeak Beta 2.0):
 *
 *   Historical merit is based on POSITION HELD OVER TIME, never on how much an
 *   advertiser could afford to spend per hour. There is deliberately NO
 *   minimum Burn Rate gate: a cheap campaign that genuinely held #1 in its
 *   category is a Legend; an expensive one that never held a position is not.
 *
 * A run qualifies if it satisfies AT LEAST ONE of three sustained-position
 * criteria, and the time is CUMULATIVE, not consecutive - a campaign that
 * traded #1 back and forth still earns the time it actually held.
 *
 * Legends is historical only. Nothing here can affect the Live Market, Global
 * Rank, Category Rank, tiers or rotation.
 */

export const LEGENDS_RETENTION_MS = 48 * 60 * 60 * 1000

export type LegendQualificationPolicy = {
  /** Cumulative minutes at Global Rank #1. */
  minMinutesAtGlobalOne: number
  /** Cumulative minutes at Category Rank #1. */
  minMinutesAtCategoryOne: number
  /** Cumulative minutes inside the global Top 3. */
  minMinutesInTopThree: number
  /** Rank that counts as "Top 3" - configurable, but 3 by product default. */
  topTierRank: number
}

export type LegendPerformance = {
  campaignId: string
  peakRank: number
  peakBurnRateCentsPerHour: number
  minutesAtGlobalOne: number
  minutesAtCategoryOne: number
  minutesInTopThree: number
  /** The run must be over. Legends is recognition for history, not for a live run. */
  runFinished: boolean
  /** A flagged or rejected campaign is not eligible for recognition. */
  sanctioned: boolean
}

export type LegendCriterion =
  | 'global-rank-one'
  | 'category-rank-one'
  | 'top-three-sustained'

export type LegendQualification =
  | {
      qualified: true
      criterion: LegendCriterion
      reason: string
      /** Seconds backing the criterion that was met. */
      timeAtPeakSeconds: number
      expiresAt: Date
    }
  | {
      qualified: false
      reason: string
    }

export function qualifyForLegends(
  performance: LegendPerformance,
  policy: LegendQualificationPolicy,
  now = new Date(),
): LegendQualification {
  if (!performance.runFinished) {
    return { qualified: false, reason: 'run-not-finished' }
  }

  if (performance.sanctioned) {
    return { qualified: false, reason: 'campaign-sanctioned' }
  }

  // Checked in order of prestige, so a run that meets several criteria is
  // recorded under the strongest one it earned.
  if (performance.minutesAtGlobalOne >= policy.minMinutesAtGlobalOne) {
    return {
      qualified: true,
      criterion: 'global-rank-one',
      reason: 'global-rank-one',
      timeAtPeakSeconds: performance.minutesAtGlobalOne * 60,
      expiresAt: new Date(now.getTime() + LEGENDS_RETENTION_MS),
    }
  }

  if (performance.minutesAtCategoryOne >= policy.minMinutesAtCategoryOne) {
    return {
      qualified: true,
      criterion: 'category-rank-one',
      reason: 'category-rank-one',
      timeAtPeakSeconds: performance.minutesAtCategoryOne * 60,
      expiresAt: new Date(now.getTime() + LEGENDS_RETENTION_MS),
    }
  }

  if (
    performance.peakRank > 0 &&
    performance.peakRank <= policy.topTierRank &&
    performance.minutesInTopThree >= policy.minMinutesInTopThree
  ) {
    return {
      qualified: true,
      criterion: 'top-three-sustained',
      reason: 'top-three-sustained',
      timeAtPeakSeconds: performance.minutesInTopThree * 60,
      expiresAt: new Date(now.getTime() + LEGENDS_RETENTION_MS),
    }
  }

  return { qualified: false, reason: 'sustained-position-below-policy' }
}
