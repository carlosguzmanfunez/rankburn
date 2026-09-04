'use client'

import { useMemo, useState } from 'react'
import { useMarket } from '@/components/market/market-provider'
import type { FlipPeakCategoryId } from '@/lib/flippeak/taxonomy'

type Props = {
  category: FlipPeakCategoryId | 'all'
}

function denseProjectedRank(rates: number[], selected: number) {
  const distinctAbove = new Set(rates.filter((rate) => rate > selected))
  return distinctAbove.size + 1
}

export function MarketOpportunityBeta2({ category }: Props) {
  const market = useMarket()
  const [burnRate, setBurnRate] = useState(17)

  const globalEntries = market.ranked('live', 'all')
  const categoryEntries =
    category === 'all' ? [] : market.ranked('live', category)

  const globalRates = globalEntries.map((entry) => entry.company.burnRate)
  const categoryRates = categoryEntries.map((entry) => entry.company.burnRate)

  const globalRank = useMemo(
    () => denseProjectedRank(globalRates, burnRate),
    [globalRates, burnRate],
  )

  const categoryRank = useMemo(
    () =>
      category === 'all'
        ? null
        : denseProjectedRank(categoryRates, burnRate),
    [category, categoryRates, burnRate],
  )

  const sameRateGlobal = globalRates.filter((rate) => rate === burnRate).length
  const leaderRate = globalRates.length ? Math.max(...globalRates) : 0

  let relationship = 'You would enter the live market.'
  if (leaderRate > 0 && burnRate === leaderRate) {
    relationship = 'Join #1 global tier.'
  } else if (leaderRate > 0 && burnRate > leaderRate) {
    relationship = 'Become sole #1 global position.'
  } else if (sameRateGlobal > 0) {
    relationship = `Join global tier #${globalRank}.`
  } else if (leaderRate > 0) {
    relationship = `Projected global rank #${globalRank}.`
  }

  return (
    <aside className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        Market Opportunity
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">
        Test a Burn Rate
      </h2>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor="market-rate" className="text-sm text-white/55">
            Burn Rate
          </label>
          <strong className="text-2xl tabular-nums text-white">
            ${burnRate}/h
          </strong>
        </div>

        <input
          id="market-rate"
          type="range"
          min={1}
          max={100}
          step={1}
          value={burnRate}
          onChange={(event) => setBurnRate(Number(event.target.value))}
          className="mt-4 w-full"
        />

        <p className="mt-2 text-xs text-white/35">
          Standard range $1–$100/h · High Burn is configured in Campaign Builder.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat label="Global" value={`#${globalRank}`} />
        <Stat
          label="Category"
          value={categoryRank ? `#${categoryRank}` : 'Select category'}
        />
        <Stat label="Same rate" value={String(sameRateGlobal)} />
        <Stat
          label="Current #1"
          value={leaderRate > 0 ? `$${leaderRate}/h` : 'Open'}
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-medium text-white">{relationship}</p>
        <p className="mt-1 text-xs leading-5 text-white/40">
          Projection is based only on current Burn Rates and can change as the
          market changes.
        </p>
      </div>
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
