'use client'

import { useState } from 'react'
import { useMarket } from '@/components/market/market-provider'
import { RankingLeader } from '@/components/market/ranking-leader'
import { RankingRow } from '@/components/market/ranking-row'
import {
  CATEGORIES,
  type CategoryId,
  type RankMode,
} from '@/lib/rankburn-data'
import { cn } from '@/lib/utils'

/**
 * Live Market is the only competitive ranking, and it is decided solely by
 * Burn Rate. Today and All Time are historical leaderboards: they report Burn
 * already consumed and never influence Global Rank or Category Rank.
 *
 * They are deliberately NOT presented as three equivalent modes of one
 * ranking. Doing that implies the leaderboards are alternative ways to hold a
 * market position, which they are not.
 */
const LIVE_VIEW = {
  label: 'Live Market',
  heading: 'Live Market',
  description:
    'Ranked by Burn Rate. Higher Burn Rate means a stronger competitive position. Budget affects duration only.',
}

const LEADERBOARD_VIEWS: {
  id: Exclude<RankMode, 'live'>
  label: string
  heading: string
  description: string
}[] = [
  {
    id: 'today',
    label: 'Today',
    heading: 'Today Leaderboard',
    description:
      'Historical activity today. Ranked by total Burn consumed today. This does not affect Live Market position.',
  },
  {
    id: 'alltime',
    label: 'All Time',
    heading: 'All-Time Leaderboard',
    description:
      'Historical activity across all runs. Ranked by total Burn consumed. This does not affect Live Market position.',
  },
]

function viewFor(mode: RankMode) {
  return mode === 'live'
    ? LIVE_VIEW
    : (LEADERBOARD_VIEWS.find((view) => view.id === mode) ?? LIVE_VIEW)
}

export function RankingBoard({
  lockedCategory,
  showFilters = true,
}: {
  lockedCategory?: CategoryId
  showFilters?: boolean
}) {
  const { ranked } = useMarket()
  const [mode, setMode] = useState<RankMode>('live')
  const [category, setCategory] = useState<CategoryId | 'all'>(
    lockedCategory ?? 'all',
  )

  const activeCategory = lockedCategory ?? category
  const entries = ranked(mode, activeCategory)
  const activeView = viewFor(mode)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* Live Market stands on its own. The leaderboards sit beside it as a
            clearly secondary, clearly historical group. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setMode('live')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors sm:text-[13px]',
              mode === 'live'
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface-1 text-muted-foreground hover:text-foreground',
            )}
          >
            {LIVE_VIEW.label}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Historical leaderboards
            </span>
            <div className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5">
              {LEADERBOARD_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setMode(view.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === view.id
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {activeView.heading}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {activeView.description}
          </p>
        </div>
      </div>

      {/* Category filters */}
      {showFilters && !lockedCategory && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>
      )}

      {/* List */}
      {entries.length === 0 ? (
        <EmptyCategory />
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.map((entry, i) => {
            if (i === 0 && mode === 'live' && activeCategory === 'all') {
              return <RankingLeader key={entry.company.id} entry={entry} />
            }
            return (
              <RankingRow
                key={entry.company.id}
                entry={entry}
                featured={entry.rank <= 3}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-border bg-surface-1 text-muted-foreground hover:border-border/80 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function EmptyCategory() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        No products competing here yet
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This category is wide open. The first campaign with active
        advertising budget takes #1.
      </p>
    </div>
  )
}
