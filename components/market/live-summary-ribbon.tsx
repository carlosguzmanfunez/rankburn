'use client'

import { useMemo } from 'react'
import { useMarket } from '@/components/market/market-provider'

type CategoryLeaderGroup = {
  category: string
  burnRate: number
  names: string[]
}

export function LiveSummaryRibbonBeta2() {
  const market = useMarket()
  const active = market.ranked('live', 'all')

  const totalBurnRate = useMemo(
    () =>
      active.reduce(
        (sum, entry) => sum + entry.company.burnRate,
        0,
      ),
    [active],
  )

  const mostCompetitive = useMemo(() => {
    const counts = new Map<string, number>()

    for (const entry of active) {
      const key = entry.company.category
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    let winner = '—'
    let best = 0

    for (const [key, value] of counts) {
      if (value > best) {
        winner = key
        best = value
      }
    }

    return winner
  }, [active])

  const categoryLeaders = useMemo<CategoryLeaderGroup[]>(() => {
    const grouped = new Map<
      string,
      { topBurnRate: number; names: string[] }
    >()

    for (const entry of active) {
      const category = entry.company.category
      const burnRate = entry.company.burnRate
      const current = grouped.get(category)

      if (!current || burnRate > current.topBurnRate) {
        grouped.set(category, {
          topBurnRate: burnRate,
          names: [entry.company.name],
        })
        continue
      }

      if (burnRate === current.topBurnRate) {
        current.names.push(entry.company.name)
      }
    }

    return [...grouped.entries()]
      .map(([category, value]) => ({
        category,
        burnRate: value.topBurnRate,
        names: [...value.names].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => b.burnRate - a.burnRate)
      .slice(0, 3)
  }, [active])

  return (
    <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[0.7fr_1fr_1fr_2fr]">
        <Metric label="Live Now" value={String(active.length)} />
        <Metric
          label="Total Burn Rate"
          value={`$${totalBurnRate.toFixed(0)}/h`}
        />
        <Metric label="Most Competitive" value={mostCompetitive} />

        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
            Category Leaders
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {categoryLeaders.length === 0 ? (
              <span className="text-sm text-white/35">No active leaders</span>
            ) : (
              categoryLeaders.map((leader) => (
                <span
                  key={leader.category}
                  className="text-sm text-white/65"
                >
                  <span className="text-white/35">{leader.category}</span>{' '}
                  {leader.names.join(' + ')}{' '}
                  <strong className="font-medium text-white">
                    ${leader.burnRate.toFixed(0)}/h
                  </strong>
                  {leader.names.length > 1 && (
                    <span className="ml-1 text-white/35">
                      co-leaders
                    </span>
                  )}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
