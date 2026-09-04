import type { Metadata } from 'next'
import { FlipPeakSidebarBeta2 } from '@/components/market/flippeak-sidebar'
import { AdvertiserDashboardBeta2 } from '@/components/market/advertiser-dashboard'

export const metadata: Metadata = {
  title: 'My Campaigns · FlipPeak',
  description:
    'Track Burn Rate, balance, runtime and competitive position in FlipPeak.',
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-dvh bg-[#090b10] text-white">
      <FlipPeakSidebarBeta2 />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">
            Advertiser
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            My Campaigns
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Burn Rate determines position. Balance determines how long you can
            sustain it.
          </p>
        </header>

        <AdvertiserDashboardBeta2 />
      </main>
    </div>
  )
}
