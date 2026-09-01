import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdvertiseFlow } from '@/components/market/advertise-flow'

export const metadata: Metadata = {
  title: 'Advertise · FlipPeak',
  description:
    'Put your product on the board with a transparent advertising budget and dynamic placement.',
}

export default function AdvertisePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Advertise
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Put your product on the board.
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Set an advertising budget, see your projected placement, and launch
            a campaign with transparent rules for visibility.
          </p>
        </header>

        <AdvertiseFlow />
      </main>
      <SiteFooter />
    </div>
  )
}
