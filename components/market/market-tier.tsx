'use client'

import Link from 'next/link'
import { ArrowUpRight, Clock3, Flame, Users } from 'lucide-react'
import type { CompetitiveTier, MarketScope } from '@/lib/flippeak/market-tiers'
import { compactRailIndexes } from '@/lib/flippeak/market-tiers'
import { formatMoney, websiteUrl } from '@/lib/rankburn-data'

type Props = {
  tier: CompetitiveTier
  scope: MarketScope
  spotlightIndex: number
  secondsRemaining: number
}

function runtimeLabel(balance: number, burnRate: number) {
  if (burnRate <= 0) return '—'
  const hours = balance / burnRate
  if (hours < 1) return `${Math.max(1, Math.floor(hours * 60))}m`
  const whole = Math.floor(hours)
  const minutes = Math.floor((hours - whole) * 60)
  return `${whole}h ${minutes}m`
}

export function MarketTier({
  tier,
  scope,
  spotlightIndex,
  secondsRemaining,
}: Props) {
  const spotlight = tier.members[spotlightIndex] ?? tier.members[0]
  if (!spotlight) return null

  const railIndexes = compactRailIndexes(
    tier.members.length,
    spotlightIndex,
    2,
  )
  const rail = railIndexes.map((index) => tier.members[index]).filter(Boolean)
  const hiddenCount = Math.max(0, tier.members.length - 1 - rail.length)
  const tied = tier.members.length > 1

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tabular-nums text-white">
            #{tier.rank}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="font-semibold text-white">
                ${tier.burnRate.toFixed(0)}/h
              </span>
            </div>
            <p className="text-xs text-white/45">
              {tied
                ? `${tier.members.length} competitors share this tier`
                : 'Sole position'}
            </p>
          </div>
        </div>

        {tied && (
          <div className="flex items-center gap-2 text-xs text-white/55">
            <Clock3 className="h-3.5 w-3.5" />
            Next spotlight in {secondsRemaining}s
          </div>
        )}
      </header>

      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="relative min-h-[250px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.045] p-5">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25 blur-3xl"
            style={{
              background:
                tier.rank === 1
                  ? 'linear-gradient(90deg,#f59e0b,#fb7185)'
                  : 'linear-gradient(90deg,#7c3aed,#2563eb)',
            }}
          />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                  Spotlight
                </p>
                <Link
                  href={`/product/${spotlight.company.slug}`}
                  className="mt-2 block text-2xl font-semibold text-white hover:text-violet-300"
                >
                  {spotlight.company.name}
                </Link>
                <p className="mt-1 text-sm text-white/50">
                  {spotlight.company.tagline}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/40">
                  Burn Rate
                </p>
                <p className="text-xl font-semibold text-white">
                  ${spotlight.company.burnRate.toFixed(0)}/h
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric label="Remaining" value={formatMoney(spotlight.company.budget)} />
              <Metric
                label="Est. runtime"
                value={runtimeLabel(
                  spotlight.company.budget,
                  spotlight.company.burnRate,
                )}
              />
              <Metric label="Global" value={`#${spotlight.rank}`} />
              <Metric
                label="Category"
                value={
                  spotlight.categoryRank > 0
                    ? `#${spotlight.categoryRank}`
                    : '—'
                }
              />
              <Metric
                label={scope.kind === 'global' ? 'Global tier' : 'Category tier'}
                value={String(tier.members.length)}
              />
            </div>

            <a
              href={websiteUrl(spotlight.company.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
            >
              Visit project
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </article>

        <div className="flex min-h-[250px] flex-col gap-2">
          {rail.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-white/35">
              No tied competitors at this Burn Rate.
            </div>
          ) : (
            <>
              {rail.map((entry) => (
                <Link
                  key={entry.company.id}
                  href={`/product/${entry.company.slug}`}
                  className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {entry.company.name}
                    </span>
                    <span className="text-xs tabular-nums text-white/45">
                      ${entry.company.burnRate.toFixed(0)}/h
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/35">
                    {entry.company.tagline}
                  </p>
                </Link>
              ))}

              {hiddenCount > 0 && (
                <div className="mt-auto flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/45">
                  <Users className="h-3.5 w-3.5" />
                  +{hiddenCount} more in equal rotation
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
