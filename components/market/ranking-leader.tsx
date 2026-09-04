'use client'

import Link from 'next/link'
import { ArrowUpRight, MousePointerClick, Users } from 'lucide-react'
import { AnimatedNumber } from '@/components/market/animated-number'
import { BurnIndicator } from '@/components/market/burn-indicator'
import { ChangeBadge } from '@/components/market/change-badge'
import { LiveDot } from '@/components/market/live-dot'
import { Monogram } from '@/components/market/monogram'
import type { RankedEntry } from '@/components/market/market-provider'
import { categoryLabel, formatCompact, formatMoney, websiteUrl } from '@/lib/rankburn-data'
import { trackEvent } from '@/lib/analytics-client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RankingLeader({ entry }: { entry: RankedEntry }) {
  const { company, delta } = entry

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-surface-1 p-5 shadow-[0_0_0_1px_var(--primary)/10,0_20px_60px_-24px_var(--primary)] sm:p-6">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: 'var(--primary)' }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-primary tabular">#1</span>
          <LiveDot />
        </div>
        <ChangeBadge delta={delta} isNew={company.isNew} />
      </div>

      <div className="relative mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Monogram
          name={company.name}
          hue={company.hue}
          className="h-14 w-14 text-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/product/${company.slug}`}
              className="text-xl font-semibold text-foreground hover:text-primary"
            >
              {company.name}
            </Link>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {categoryLabel(company.category)}
            </span>
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
          Visit {company.name}
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Active budget
          </span>
          <AnimatedNumber
            value={company.budget}
            prefix="$"
            className="text-2xl font-bold text-foreground"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Used today
          </span>
          <span className="text-2xl font-bold text-foreground tabular">
            {formatMoney(company.spentToday)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Visitors
          </span>
          <span className="flex items-center gap-1.5 text-2xl font-bold text-foreground tabular">
            <Users className="h-4 w-4 text-muted-foreground" />
            {formatCompact(company.visitors)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Outbound clicks
          </span>
          <span className="flex items-center gap-1.5 text-2xl font-bold text-foreground tabular">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            {formatCompact(company.clicks)}
          </span>
        </div>
      </div>

      <div className="relative mt-5">
        <BurnIndicator
          budget={company.budget}
          capacity={Math.max(company.budget, 520)}
          burnRate={company.burnRate}
        />
      </div>
    </div>
  )
}
