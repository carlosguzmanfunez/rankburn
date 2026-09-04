'use client'

import Link from 'next/link'
import { ArrowUpRight, MousePointerClick, Users } from 'lucide-react'
import { AnimatedNumber } from '@/components/market/animated-number'
import { ChangeBadge } from '@/components/market/change-badge'
import { Monogram } from '@/components/market/monogram'
import type { RankedEntry } from '@/components/market/market-provider'
import { categoryLabel, formatCompact, formatMoney, websiteUrl } from '@/lib/rankburn-data'
import { trackEvent } from '@/lib/analytics-client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RankingRow({
  entry,
  featured,
}: {
  entry: RankedEntry
  featured?: boolean
}) {
  const { company, rank, delta } = entry
  const depleted = company.budget <= 0

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-border/80 hover:bg-surface-1 sm:gap-4 sm:px-4',
        featured && 'border-border/90 bg-surface-1',
      )}
    >
      <div className="flex w-8 shrink-0 flex-col items-center sm:w-10">
        <span
          className={cn(
            'text-base font-semibold tabular sm:text-lg',
            featured ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {rank}
        </span>
        <ChangeBadge delta={delta} isNew={company.isNew} className="scale-90" />
      </div>

      <Monogram
        name={company.name}
        hue={company.hue}
        className="h-10 w-10 text-sm sm:h-11 sm:w-11"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/product/${company.slug}`}
            className="truncate text-sm font-semibold text-foreground hover:text-primary sm:text-[15px]"
          >
            {company.name}
          </Link>
          <span className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            {categoryLabel(company.category)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground sm:text-[13px]">
          {company.tagline}
        </p>
      </div>

      {/* Budget — always visible, the load-bearing number */}
      <div className="hidden shrink-0 flex-col items-end sm:flex">
        <AnimatedNumber
          value={company.budget}
          prefix="$"
          className="text-sm font-semibold text-foreground sm:text-[15px]"
        />
        <span className="text-[11px] text-muted-foreground">
          {depleted ? 'depleted' : `${formatMoney(company.spentToday)} today`}
        </span>
      </div>

      {/* Secondary metrics — desktop only */}
      <div className="hidden w-16 shrink-0 flex-col items-end lg:flex">
        <span className="flex items-center gap-1 text-sm text-foreground tabular">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {formatCompact(company.visitors)}
        </span>
        <span
          className="flex items-center gap-1 text-[11px] text-muted-foreground tabular"
          title="Outbound clicks"
        >
          <MousePointerClick className="h-3 w-3" />
          {formatCompact(company.clicks)}
        </span>
      </div>

      <a
        href={websiteUrl(company.website)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          trackEvent({ type: 'outbound_click', campaignId: company.id })
        }
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-9 shrink-0 gap-1 px-3',
        )}
      >
        Visit
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
