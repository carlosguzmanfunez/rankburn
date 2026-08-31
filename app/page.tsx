import Link from 'next/link'
import { ActivityFeed } from '@/components/market/activity-feed'
import { MarketHero } from '@/components/market/market-hero'
import { RankingBoard } from '@/components/market/ranking-board'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <MarketHero />

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                    The Rankings
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Positions update live as active advertising budgets change.
                  </p>
                </div>
              </div>
              <RankingBoard />
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <ActivityFeed />
              <div className="rounded-2xl border border-primary/30 bg-surface-1 p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Want the top spot?
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Add advertising budget, improve your placement, and compete
                  for visibility in real time.
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
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
