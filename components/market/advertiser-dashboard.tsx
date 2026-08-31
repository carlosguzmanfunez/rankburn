'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useMarket } from './market-provider'
import { Monogram } from './monogram'
import { AnimatedNumber } from './animated-number'
import { ChangeBadge } from './change-badge'
import { BurnIndicator } from './burn-indicator'
import { RankHistoryChart } from './rank-history-chart'
import { buttonVariants } from '@/components/ui/button'
import {
  categoryLabel,
  formatMoney,
  formatCompact,
  estimateRemaining,
} from '@/lib/rankburn-data'
import { cn } from '@/lib/utils'

const TOPUPS = [50, 100, 250]

/**
 * Adding advertising budget always goes through checkout. There is no client
 * path that increases a balance: the server credits budget only after the
 * payment provider confirms a capture.
 */
function topUpHref(amount: number): string {
  return `/advertise?amount=${amount}`
}

export function AdvertiserDashboard() {
  const { companies, ranked, rankOf, ownedId, synced } = useMarket()

  const owned = companies.find((c) => c.id === ownedId)

  const overallRank = rankOf(ownedId, 'live')
  const liveOrder = ranked('live', 'all')
  const myIndex = liveOrder.findIndex((e) => e.company.id === ownedId)

  const isPaused = Boolean(owned?.paused)
  const catEntries = ranked('live', owned?.category ?? 'ai')
  const catRank = catEntries.findIndex((e) => e.company.id === ownedId) + 1

  // The rival directly ahead overall — used for competitive context.
  const rivalAhead = myIndex > 0 ? liveOrder[myIndex - 1].company : null
  const rivalBehind =
    myIndex >= 0 && myIndex < liveOrder.length - 1
      ? liveOrder[myIndex + 1].company
      : null

  const ownedBudget = owned?.budget ?? 0
  const gapToAhead = rivalAhead
    ? Math.max(0, rivalAhead.budget + 0.01 - ownedBudget)
    : 0
  const leadOverBehind = rivalBehind
    ? Math.max(0, ownedBudget - rivalBehind.budget)
    : 0

  const status: 'leading' | 'holding' | 'losing' | 'paused' = useMemo(() => {
    if (isPaused) return 'paused'
    if (overallRank === 1) return 'leading'
    if (rivalBehind && leadOverBehind < 20) return 'losing'
    return 'holding'
  }, [isPaused, overallRank, rivalBehind, leadOverBehind])

  // The campaign is unknown until the first server snapshot arrives, and it
  // can legitimately disappear from the market (rejected, or removed).
  if (!owned) {
    return synced ? <NoCampaignState /> : <DashboardSkeleton />
  }

  const ctr = owned.visitors > 0 ? (owned.clicks / owned.visitors) * 100 : 0

  return (
    <div className="space-y-8">
      {/* Status banner */}
      <StatusBanner
        status={status}
        rivalAhead={rivalAhead?.name}
        rivalBehind={rivalBehind?.name}
        gapToAhead={gapToAhead}
        leadOverBehind={leadOverBehind}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Hero position card */}
          <section
            className={cn(
              'overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-500',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
              <div className="flex items-center gap-4">
                <Monogram name={owned.name} hue={owned.hue} size={52} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{owned.name}</h2>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {categoryLabel(owned.category)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {owned.website}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Live rank
                </div>
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    {isPaused || overallRank === 0 ? (
                      '—'
                    ) : (
                      <>#<AnimatedNumber value={overallRank} /></>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {isPaused || catRank === 0 ? '· not ranked' : `· #${catRank} in cat`}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-border sm:grid-cols-3">
              <Stat
                label="Active budget"
                value={formatMoney(owned.budget)}
                accent
              />
              <Stat
                label="Runway left"
                value={estimateRemaining(owned.budget, owned.burnRate)}
              />
              <Stat label="Spent today" value={formatMoney(owned.spentToday)} />
            </div>

            <div className="border-t border-border p-6">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono uppercase tracking-[0.15em]">
                  Budget burn
                </span>
                <span className="tabular-nums">
                  {formatMoney(owned.burnRate)}/hr
                </span>
              </div>
              <BurnIndicator
                budget={owned.budget}
                capacity={Math.max(owned.budget, 520)}
                burnRate={owned.burnRate}
                paused={owned.paused}
              />
            </div>
          </section>

          {/* Rank history */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Rank history
              </h3>
              <span className="text-xs text-muted-foreground">
                Peak #{owned.peakRank} · {owned.hoursAtOne}h at #1
              </span>
            </div>
            <RankHistoryChart history={owned.rankHistory} />
          </section>

          {/* Competitive ladder */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Your neighborhood
            </h3>
            <div className="space-y-1">
              {liveOrder
                .slice(Math.max(0, myIndex - 2), myIndex + 3)
                .map((entry) => {
                  const mine = entry.company.id === ownedId
                  return (
                    <div
                      key={entry.company.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5',
                        mine ? 'bg-primary/10 ring-1 ring-primary/30' : '',
                      )}
                    >
                      <span className="w-8 font-mono text-sm tabular-nums text-muted-foreground">
                        #{entry.rank}
                      </span>
                      <Monogram
                        name={entry.company.name}
                        hue={entry.company.hue}
                        size={28}
                      />
                      <span
                        className={cn(
                          'flex-1 truncate text-sm',
                          mine ? 'font-semibold' : '',
                        )}
                      >
                        {entry.company.name}
                        {mine && (
                          <span className="ml-2 text-xs text-primary">You</span>
                        )}
                      </span>
                      <span className="tabular-nums text-sm text-muted-foreground">
                        {formatMoney(entry.company.budget)}
                      </span>
                    </div>
                  )
                })}
            </div>
          </section>
        </div>

        {/* Side column: actions + metrics */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {isPaused ? 'Campaign paused' : 'Defend your position'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {isPaused
                ? 'Moderation has paused this campaign. Your budget is not burning and the listing is removed from live placement until it is resumed.'
                : overallRank === 1
                  ? 'You hold #1. Top up to extend your runway before a rival moves ahead.'
                : gapToAhead > 0
                  ? `Add ${formatMoney(gapToAhead, 0)} to pass ${rivalAhead?.name}.`
                  : 'Top up to climb.'}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {TOPUPS.map((amt) => (
                <Link
                  key={amt}
                  href={topUpHref(amt)}
                  aria-disabled={isPaused}
                  tabIndex={isPaused ? -1 : undefined}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'h-9 tabular-nums',
                    isPaused && 'pointer-events-none opacity-50',
                  )}
                >
                  +${amt}
                </Link>
              ))}
            </div>
            {!isPaused && gapToAhead > 0 && (
              <Link
                href={topUpHref(Math.ceil(gapToAhead))}
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'mt-2 h-9 w-full',
                )}
              >
                Take {rivalAhead ? `#${overallRank - 1}` : 'the lead'} ·{' '}
                {formatMoney(Math.ceil(gapToAhead), 0)}
              </Link>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Adding advertising budget goes through checkout. Budget becomes
              active only after the payment is confirmed.
            </p>

            <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <Metric
                label="Impressions"
                value={formatCompact(owned.impressions ?? 0)}
              />
              <Metric label="Visitors" value={formatCompact(owned.visitors)} />
              <Metric
                label="Outbound clicks"
                value={formatCompact(owned.clicks)}
              />
              <Metric label="CTR" value={`${ctr.toFixed(1)}%`} />
              <Metric
                label="Lifetime spend"
                value={formatMoney(owned.totalSpend, 0)}
              />
            </div>

            <Link
              href={`/product/${owned.slug}`}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'mt-4 h-9 w-full',
              )}
            >
              View public listing
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your campaign">
      <div className="h-16 rounded-xl border border-border bg-card" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="h-72 rounded-2xl border border-border bg-card" />
          <div className="h-48 rounded-2xl border border-border bg-card" />
        </div>
        <div className="h-96 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  )
}

function NoCampaignState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <p className="text-sm font-medium text-foreground">
        No active campaign on this account
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Your campaign is not currently in the live market. It may be awaiting
        review, or its advertising budget may be exhausted.
      </p>
      <Link
        href="/advertise"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'mt-6 h-10 px-5 font-semibold',
        )}
      >
        Take a Spot
      </Link>
    </div>
  )
}

function StatusBanner({
  status,
  rivalAhead,
  rivalBehind,
  gapToAhead,
  leadOverBehind,
}: {
  status: 'leading' | 'holding' | 'losing' | 'paused'
  rivalAhead?: string
  rivalBehind?: string
  gapToAhead: number
  leadOverBehind: number
}) {
  const config = {
    paused: {
      dot: 'bg-muted-foreground',
      ring: 'border-border bg-secondary/40',
      title: 'Campaign paused.',
      body: 'Your placement is temporarily removed and your advertising budget is not being used.',
      titleColor: 'text-foreground',
    },
    leading: {
      dot: 'bg-primary',
      ring: 'border-primary/30 bg-primary/10',
      title: 'You own #1.',
      body: rivalBehind
        ? `Leading ${rivalBehind} by ${formatMoney(leadOverBehind, 0)}. Keep the runway topped up.`
        : 'Nobody is close. Keep your budget healthy.',
      titleColor: 'text-primary',
    },
    holding: {
      dot: 'bg-foreground',
      ring: 'border-border bg-secondary/40',
      title: 'Holding position.',
      body:
        gapToAhead > 0 && rivalAhead
          ? `${formatMoney(gapToAhead, 0)} behind ${rivalAhead}. A top-up moves you up.`
          : 'Steady. Watch for rivals topping up.',
      titleColor: 'text-foreground',
    },
    losing: {
      dot: 'bg-destructive',
      ring: 'border-destructive/40 bg-destructive/10',
      title: 'You&apos;re about to be passed.',
      body: rivalBehind
        ? `${rivalBehind} is only ${formatMoney(leadOverBehind, 0)} behind and climbing.`
        : 'A rival is closing in.',
      titleColor: 'text-destructive',
    },
  }[status]

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border px-5 py-4',
        config.ring,
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            config.dot,
          )}
        />
        <span
          className={cn(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            config.dot,
          )}
        />
      </span>
      <div>
        <span className={cn('font-semibold', config.titleColor)}>
          {config.title.replace('&apos;', "'")}
        </span>{' '}
        <span className="text-sm text-muted-foreground">{config.body}</span>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-card p-5">
      <div className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          accent && 'text-primary',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
