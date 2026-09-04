'use client'

import Link from 'next/link'
import { AnimatedNumber } from '@/components/market/animated-number'
import { LiveDot } from '@/components/market/live-dot'
import { useMarket } from '@/components/market/market-provider'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function MarketHero() {
  const { globalActive, companies } = useMarket()
  const competing = companies.filter((c) => c.budget > 0 && !c.paused).length

  return (
    <section className="relative overflow-hidden border-b border-border/70">
      <div className="grid-noise pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col items-center text-center">
          <LiveDot label="Live now" />
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            The internet&apos;s live{' '}
            <span className="text-primary">attention market</span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Products compete for visibility by Burn Rate in real
            time. No hidden ranking formula — placement follows transparent
            published rules.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/advertise"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'h-11 px-6 text-sm font-semibold shadow-[0_0_0_1px_var(--primary),0_10px_30px_-10px_var(--primary)]',
              )}
            >
              Take a Spot
            </Link>
            <Link
              href="/how-it-works"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-11 px-6 text-sm',
              )}
            >
              How it works
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-8 rounded-2xl border border-border bg-card/60 px-6 py-4 backdrop-blur">
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Active budget in market
              </span>
              <AnimatedNumber
                value={globalActive}
                prefix="$"
                className="text-2xl font-bold text-foreground sm:text-3xl"
                flash={false}
              />
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Competing now
              </span>
              <span className="text-2xl font-bold text-foreground tabular sm:text-3xl">
                {competing}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
