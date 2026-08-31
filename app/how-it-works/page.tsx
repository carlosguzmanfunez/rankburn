import Link from 'next/link'
import { Eye, Flame, Gauge, Trophy } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    icon: Flame,
    title: 'Add your advertising budget',
    body: 'List your product and add an advertising budget. Your active budget determines your visibility — the more active budget you maintain, the higher your placement.',
  },
  {
    icon: Gauge,
    title: 'Your budget burns',
    body: 'While your campaign is active, your advertising budget is gradually used to maintain visibility. As your active budget changes, your placement may change too.',
  },
  {
    icon: Trophy,
    title: 'Climb the rankings',
    body: 'Placement updates in real time based on active advertising budget. Increase your budget to improve your position within your category.',
  },
  {
    icon: Eye,
    title: 'Get discovered',
    body: 'Visitors browse the live market to discover products and may click through to learn more. You pay for advertising placement and exposure, not per click.',
  },
]

const PRINCIPLES = [
  {
    q: 'No hidden ranking formula',
    a: 'No star ratings or secret algorithms determine placement. Rankings follow one transparent signal: active advertising budget.',
  },
  {
    q: 'Dynamic placement, always',
    a: 'Every category is a live advertising market. Rankings update as advertisers adjust their budgets or as active budgets are used over time.',
  },
  {
    q: 'Transparent by design',
    a: 'Active advertising budget, today’s spend, visitors and outbound clicks are visible on every product. Everyone can see how the market is moving in real time.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <p className="text-xs uppercase tracking-widest text-primary">
            How it works
          </p>
          <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Attention, priced in real time
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground sm:text-lg">
            RankBurn turns advertising visibility into a live market. Placement
            follows active advertising budget through clear, published rules.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
          <ol className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold tabular text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <div className="grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div
                key={p.q}
                className="rounded-2xl border border-border bg-surface-1 p-5"
              >
                <h3 className="text-sm font-semibold text-foreground">{p.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {p.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-surface-1 px-6 py-10 text-center">
            <h2 className="text-2xl font-bold text-foreground">
              Ready to compete for visibility?
            </h2>
            <p className="max-w-md text-muted-foreground">
              See where your advertising budget would place your product before
              you launch a campaign.
            </p>
            <Link
              href="/advertise"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'h-11 px-6 font-semibold',
              )}
            >
              Take a Spot
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
