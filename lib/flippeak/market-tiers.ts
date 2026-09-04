import type { RankedEntry } from '@/components/market/market-provider'

export type MarketScope =
  | { kind: 'global' }
  | { kind: 'category'; category: string }

export type CompetitiveTier = {
  rank: number
  burnRate: number
  members: RankedEntry[]
}

function competitiveRank(entry: RankedEntry, scope: MarketScope) {
  return scope.kind === 'global' ? entry.rank : entry.categoryRank
}

/**
 * Builds real competitive tiers from authoritative dense ranks.
 * Category scope uses categoryRank; global scope uses global rank.
 */
export function buildCompetitiveTiers(
  entries: RankedEntry[],
  scope: MarketScope,
): CompetitiveTier[] {
  const byRank = new Map<number, CompetitiveTier>()

  for (const entry of entries) {
    const rank = competitiveRank(entry, scope)
    if (rank <= 0) continue

    const existing = byRank.get(rank)
    if (existing) {
      existing.members.push(entry)
      continue
    }

    byRank.set(rank, {
      rank,
      burnRate: entry.company.burnRate,
      members: [entry],
    })
  }

  return [...byRank.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((tier) => ({
      ...tier,
      members: [...tier.members].sort((a, b) =>
        a.company.id.localeCompare(b.company.id),
      ),
    }))
}

export function spotlightIndexForTier(
  memberCount: number,
  authoritativeNowMs: number,
  rotationMs = 20_000,
): number {
  if (memberCount <= 1) return 0
  const slot = Math.floor(authoritativeNowMs / rotationMs)
  return slot % memberCount
}

export function rotationRemainingMs(
  authoritativeNowMs: number,
  rotationMs = 20_000,
): number {
  const elapsed = authoritativeNowMs % rotationMs
  return rotationMs - elapsed
}

/**
 * Returns the two nearest compact neighbors around the spotlight.
 * With large ties this creates a moving rail instead of permanently showing
 * the same first cards.
 */
export function compactRailIndexes(
  memberCount: number,
  spotlightIndex: number,
  count = 2,
): number[] {
  if (memberCount <= 1) return []

  const indexes: number[] = []
  for (let offset = 1; offset < memberCount && indexes.length < count; offset++) {
    indexes.push((spotlightIndex + offset) % memberCount)
  }
  return indexes
}
