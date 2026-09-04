'use client'

import { useState } from 'react'
import {
  FLIPPEAK_CATEGORIES,
  type FlipPeakCategoryId,
} from '@/lib/flippeak/taxonomy'
import { LiveMarketBoardBeta2 } from './live-market-board'
import { MarketOpportunityBeta2 } from './market-opportunity'

export function LiveMarketShellBeta2() {
  const [category, setCategory] =
    useState<FlipPeakCategoryId | 'all'>('all')

  return (
    <>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <MarketChip
          active={category === 'all'}
          onClick={() => setCategory('all')}
        >
          Global
        </MarketChip>

        {FLIPPEAK_CATEGORIES.map((item) => (
          <MarketChip
            key={item.id}
            active={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </MarketChip>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <LiveMarketBoardBeta2 category={category} />

        <div className="h-fit xl:sticky xl:top-6">
          <MarketOpportunityBeta2 category={category} />
        </div>
      </div>
    </>
  )
}

function MarketChip({
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
      className={[
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-violet-400/50 bg-violet-400/10 text-violet-200'
          : 'border-white/10 text-white/45 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
