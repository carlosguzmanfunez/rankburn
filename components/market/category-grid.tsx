'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AnimatedNumber } from '@/components/market/animated-number'
import { Monogram } from '@/components/market/monogram'
import { useMarket } from '@/components/market/market-provider'
import { CATEGORIES, formatMoney } from '@/lib/rankburn-data'

export function CategoryGrid() {
  const { ranked, companies } = useMarket()

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map((cat) => {
        const entries = ranked('live', cat.id)
        const leader = entries[0]?.company
        const competing = companies.filter(
          (c) => c.category === cat.id && c.budget > 0 && !c.paused,
        ).length
        const pot = companies
          .filter((c) => c.category === cat.id && !c.paused && c.budget > 0)
          .reduce((s, c) => s + c.budget, 0)

        return (
          <Link
            key={cat.id}
            href={`/categories/${cat.id}`}
            className="group flex flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-surface-1"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {cat.label}
              </h2>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            {leader ? (
              <div className="flex items-center gap-3">
                <Monogram
                  name={leader.name}
                  hue={leader.hue}
                  className="h-9 w-9 text-sm"
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-primary">
                    Leading
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {leader.name}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Wide open — no campaigns competing yet.
              </p>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Active budget
                </span>
                <AnimatedNumber
                  value={pot}
                  prefix="$"
                  flash={false}
                  className="font-semibold text-foreground"
                />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">Competing</span>
                <span className="font-semibold text-foreground tabular">
                  {competing}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
