'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMarket } from '@/components/market/market-provider'
import {
  buildCompetitiveTiers,
  rotationRemainingMs,
  spotlightIndexForTier,
  type MarketScope,
} from '@/lib/flippeak/market-tiers'
import type { FlipPeakCategoryId } from '@/lib/flippeak/taxonomy'
import { MarketTier } from './market-tier'

export function LiveMarketBoardBeta2({
  category,
}: {
  category: FlipPeakCategoryId | 'all'
}) {
  const market = useMarket()
  const scope: MarketScope =
    category === 'all'
      ? { kind: 'global' }
      : { kind: 'category', category }

  const entries = market.ranked('live', category)
  const tiers = useMemo(
    () => buildCompetitiveTiers(entries, scope),
    [entries, category],
  )

  const [, forceClock] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => forceClock((value) => value + 1),
      500,
    )
    return () => window.clearInterval(timer)
  }, [])

  const authoritativeNowMs = market.authoritativeNowMs()
  const rotationMs = market.rotationMs

  return (
    <div className="flex flex-col gap-4">
      {tiers.map((tier) => {
        const index = spotlightIndexForTier(
          tier.members.length,
          authoritativeNowMs,
          rotationMs,
        )

        const secondsRemaining = Math.max(
          1,
          Math.ceil(
            rotationRemainingMs(authoritativeNowMs, rotationMs) / 1000,
          ),
        )

        return (
          <MarketTier
            key={`${category}:${tier.rank}:${tier.burnRate}`}
            tier={tier}
            scope={scope}
            spotlightIndex={index}
            secondsRemaining={secondsRemaining}
          />
        )
      })}

      {tiers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/40">
          No active campaigns in this market yet.
        </div>
      )}
    </div>
  )
}
