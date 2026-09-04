'use client'

import { useState } from 'react'

export function HighBurnBoostBeta2({
  currentBurnRate,
  balance,
  onSelect,
}: {
  currentBurnRate: number
  balance: number
  onSelect: (rate: number) => void
}) {
  const minimum = Math.max(101, Math.floor(currentBurnRate) + 1)
  const [rate, setRate] = useState(Math.min(1000, minimum))

  if (minimum > 1000) {
    return (
      <p className="text-sm text-white/40">
        This campaign is already at the maximum Burn Rate.
      </p>
    )
  }

  const runtimeHours = rate > 0 ? balance / rate : 0
  const runtimeMinutes = Math.max(0, Math.floor(runtimeHours * 60))

  return (
    <div className="rounded-xl border border-orange-400/15 bg-orange-400/[0.04] p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-orange-200/55">
            High Burn
          </p>
          <p className="mt-1 text-xs text-white/35">$101–$1,000/hour</p>
        </div>
        <strong className="text-xl tabular-nums text-white">${rate}/h</strong>
      </div>

      <input
        aria-label="High Burn Rate"
        type="number"
        min={minimum}
        max={1000}
        step={1}
        value={rate}
        onChange={(event) => {
          const next = Math.max(
            minimum,
            Math.min(1000, Number(event.target.value) || minimum),
          )
          setRate(next)
        }}
        className="mt-4 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
      />

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-white/35">Estimated remaining runtime</span>
        <span className="font-medium text-white/75">
          {Math.floor(runtimeMinutes / 60)}h {runtimeMinutes % 60}m
        </span>
      </div>

      <button
        type="button"
        onClick={() => onSelect(rate)}
        className="mt-4 w-full rounded-lg border border-orange-300/20 bg-orange-300/10 px-3 py-2 text-sm font-semibold text-orange-100"
      >
        Use ${rate}/h
      </button>
    </div>
  )
}
