'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Clock, Crown, Trophy } from 'lucide-react'
import { AnimatedNumber } from '@/components/market/animated-number'
import { BurnIndicator } from '@/components/market/burn-indicator'
import { ChangeBadge } from '@/components/market/change-badge'
import { LiveDot } from '@/components/market/live-dot'
import { Monogram } from '@/components/market/monogram'
import { RankHistoryChart } from '@/components/market/rank-history-chart'
import { Stat } from '@/components/market/live-dot'
import { useMarket } from '@/components/market/market-provider'
import {
  categoryLabel,
  websiteUrl,
  formatCompact,
  formatMoney,
} from '@/lib/rankburn-data'
import { buttonVariants } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics-client'
import { cn } from '@/lib/utils'

export function ProductDetail({ slug }: { slug: string }) {
  const { companies, ranked, rankOf, synced } = useMarket()
  const company = companies.find((c) => c.slug === slug)

  // A listing approved on the server is not in the first-paint seed data, so
  // calling notFound() here would 404 it before the first sync lands. Wait
  // for the sync, then show a real "not found" state instead.
  if (!company) {
    return synced ? <ListingNotFound /> : <ListingSkeleton />
  }

  const liveRank = rankOf(company.id, 'live')
  const isPaused = Boolean(company.paused)
  const catRank =
    ranked('live', company.category).find((e) => e.company.id === company.id)
      ?.rank ?? liveRank
  const startRank = company.rankHistory[0] ?? liveRank
  const delta = company.isNew || isPaused ? 0 : startRank - liveRank

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to market
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Monogram
                name={company.name}
                hue={company.hue}
                className="h-16 w-16 text-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground">
                    {company.name}
                  </h1>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {categoryLabel(company.category)}
                  </span>
                  {isPaused ? (
                    <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
                      Paused
                    </span>
                  ) : liveRank === 1 ? (
                    <LiveDot label="#1 Live" />
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {company.tagline}
                </p>
              </div>
              <a
                href={websiteUrl(company.website)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackEvent({ type: 'outbound_click', campaignId: company.id })
                }
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'h-9 shrink-0 gap-1 px-4 font-semibold',
                )}
              >
                Visit
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {company.description}
            </p>
          </div>

          {/* Rank position */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/40 bg-surface-1 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Overall rank
                </span>
                <ChangeBadge delta={delta} isNew={company.isNew} />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-primary tabular">
                  {isPaused || liveRank === 0 ? '—' : `#${liveRank}`}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                In {categoryLabel(company.category)}
              </span>
              <div className="mt-1 text-4xl font-bold text-foreground tabular">
                {isPaused || catRank === 0 ? '—' : `#${catRank}`}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Active budget
              </span>
              <AnimatedNumber
                value={company.budget}
                prefix="$"
                className="mt-1 block text-4xl font-bold text-foreground"
              />
            </div>
          </div>

          {/* Burn */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Campaign burn
              </h2>
              {isPaused ? (
                <span className="text-xs text-muted-foreground">Paused</span>
              ) : (
                <LiveDot />
              )}
            </div>
            <div className="mt-4">
              <BurnIndicator
                budget={company.budget}
                capacity={Math.max(company.budget, 520)}
                burnRate={company.burnRate}
                paused={company.paused}
              />
            </div>
          </div>

          {/* Rank history */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">
              Rank history
            </h2>
            <p className="text-xs text-muted-foreground">
              Position over the tracked window — higher is better.
            </p>
            <div className="mt-4">
              <RankHistoryChart history={company.rankHistory} />
            </div>
          </div>
        </div>

        {/* Sidebar stats */}
        <aside className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-5">
            <Stat label="Visitors">{formatCompact(company.visitors)}</Stat>
            <Stat label="Outbound clicks">
              {formatCompact(company.clicks)}
            </Stat>
            <Stat label="Total spend">
              {formatMoney(company.totalSpend, 0)}
            </Stat>
            <Stat label="Used today">
              {formatMoney(company.spentToday)}
            </Stat>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Trophy className="h-4 w-4 text-primary" />
              Peak rank{' '}
              <span className="ml-auto font-semibold tabular">
                #{company.peakRank}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Crown className="h-4 w-4 text-primary" />
              Hours at #1
              <span className="ml-auto font-semibold tabular">
                {company.hoursAtOne}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Joined
              <span className="ml-auto font-semibold">{company.joined}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-surface-1 p-5">
            <h3 className="text-sm font-semibold text-foreground">
              Compete with {company.name}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              List your product and increase your advertising budget for stronger placement in{' '}
              {categoryLabel(company.category)}.
            </p>
            <Link
              href="/advertise"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'mt-4 h-10 w-full font-semibold',
              )}
            >
              Take a Spot
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ListingSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
      aria-busy="true"
      aria-label="Loading listing"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <div className="h-44 rounded-2xl border border-border bg-card" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="h-28 rounded-2xl border border-border bg-card" />
            <div className="h-28 rounded-2xl border border-border bg-card" />
            <div className="h-28 rounded-2xl border border-border bg-card" />
          </div>
        </div>
        <div className="h-64 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  )
}

function ListingNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Listing not available
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This product is not in the live market right now. It may be paused,
        awaiting review, or its advertising budget may be exhausted.
      </p>
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'mt-6 h-10 px-5 font-semibold',
        )}
      >
        Back to the live market
      </Link>
    </div>
  )
}
