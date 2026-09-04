import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CampaignBuilderBeta2 } from '@/components/market/campaign-builder'

export const metadata: Metadata = {
  title: 'New Campaign · FlipPeak',
  description:
    'Choose your Burn Rate, budget and market category to compete for live advertising exposure.',
}

export default function AdvertisePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            New Campaign
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Compete for attention in real time.
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            No compras una posición. Elige qué tan agresivamente quieres
            competir. Tu Burn Rate determina tu posición; tu presupuesto
            determina cuánto tiempo puedes sostenerla.
          </p>
        </header>

        <CampaignBuilderBeta2 />
      </main>
      <SiteFooter />
    </div>
  )
}
