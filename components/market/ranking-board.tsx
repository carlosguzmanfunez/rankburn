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

const MODES: { id: RankMode; label: string; hint: string }[] = [
  { id: 'live', label: 'Live', hint: 'Ranked by active advertising budget' },
  {
    id: 'today',
    label: 'Today',
    hint: 'Most advertising budget used in the last 24h',
  },
  {
    id: 'alltime',
    label: 'All Time',
    hint: 'Highest lifetime advertising spend',
  },
]

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
  const activeMode = MODES.find((m) => m.id === mode)!

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Mode tabs */}
        <div className="inline-flex rounded-lg border border-border bg-surface-1 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors sm:text-[13px]',
                mode === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{activeMode.hint}</p>
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
