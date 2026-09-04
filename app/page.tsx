import { FlipPeakSidebarBeta2 } from '@/components/market/flippeak-sidebar'
import { LiveMarketTopbarBeta2 } from '@/components/market/live-market-topbar'
import { LiveMarketShellBeta2 } from '@/components/market/live-market-shell'
import { LiveSummaryRibbonBeta2 } from '@/components/market/live-summary-ribbon'

export default function HomePage() {
  return (
    <div className="flex min-h-dvh bg-[#090b10] text-white">
      <FlipPeakSidebarBeta2 />

      <div className="min-w-0 flex-1">
        <LiveMarketTopbarBeta2 />

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="max-w-3xl text-sm leading-6 text-white/45">
              Burn Rate determines competitive position. Budget determines how
              long a campaign can sustain that position. Campaigns at the same
              Burn Rate share one tier and rotate spotlight equally.
            </p>
          </div>

          <LiveMarketShellBeta2 />
          <LiveSummaryRibbonBeta2 />
        </main>
      </div>
    </div>
  )
}
