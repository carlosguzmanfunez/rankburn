import Link from 'next/link'
import { Eye, Flame, Gauge, Trophy } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    icon: Flame,
    title: 'Competition',
    body: 'Your Burn Rate determines your competitive position in the Live Market. A higher Burn Rate can move your campaign to a stronger Global Rank and Category Rank.',
  },
  {
    icon: Gauge,
    title: 'Budget',
    body: 'Your budget determines how long your campaign can sustain its Burn Rate. Adding budget extends your remaining runtime, but does not improve your position by itself.',
  },
  {
    icon: Trophy,
    title: 'Boost',
    body: 'To compete for a stronger position, increase your Burn Rate. During an active run, your Burn Rate can stay the same or increase, but it cannot be reduced.',
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
    a: 'No star ratings or secret algorithms determine placement. Rankings follow one transparent signal: Burn Rate.',
  },
  {
    q: 'Dynamic placement, always',
    a: 'Every category is a live advertising market. Rankings update as advertisers raise their Burn Rate, and as runs end when their budget is spent.',
  },
  {
    q: 'Transparent by design',
    a: 'Burn Rate, remaining budget, today’s spend, visitors and outbound clicks are visible on every product. Everyone can see how the market is moving in real time.',
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
            FlipPeak turns advertising visibility into a live market. Placement
            follows Burn Rate through clear, published rules.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-pretty font-medium text-foreground">
            You don&rsquo;t buy a position. You choose how aggressively you
            compete for it.
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
              See where your Burn Rate would place your product before
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
