'use client'

import useSWR from 'swr'

type Legend = {
  campaignId: string
  productName: string
  productSlug: string
  category: string
  subtype: string
  peakRank: number
  peakBurnRateCentsPerHour: number
  timeAtPeakSeconds: number
  expiresAt: string
}

const fetcher = (url: string) => fetch(url).then((response) => response.json())

export function LegendsBoardBeta2() {
  const { data, error, isLoading } = useSWR<{
    legends: Legend[]
  }>('/api/legends', fetcher, {
    refreshInterval: 30_000,
  })

  if (isLoading) {
    return <p className="text-sm text-white/40">Loading Legends…</p>
  }

  if (error || !data) {
    return (
      <p className="text-sm text-red-200">
        Legends could not be loaded.
      </p>
    )
  }

  if (data.legends.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h2 className="font-semibold text-white">No Legends yet</h2>
        <p className="mt-2 text-sm text-white/40">
          Exceptional completed runs can remain highlighted here for 48 hours.
        </p>
      </section>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.legends.map((legend) => (
        <article
          key={legend.campaignId}
          className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/30">
                Historical highlight
              </p>
              <h2 className="mt-1 font-semibold text-white">
                {legend.productName}
              </h2>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
              Peak #{legend.peakRank}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric
              label="Peak Burn Rate"
              value={`$${(legend.peakBurnRateCentsPerHour / 100).toFixed(0)}/h`}
            />
            <Metric
              label="Time at peak"
              value={`${Math.floor(legend.timeAtPeakSeconds / 60)}m`}
            />
          </div>

          <p className="mt-4 text-xs leading-5 text-white/35">
            This campaign is not active. Legends is historical recognition,
            not a live competitive position.
          </p>
        </article>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white/80">{value}</p>
    </div>
  )
}
