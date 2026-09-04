import type { Metadata } from 'next'
import { FlipPeakSidebarBeta2 } from '@/components/market/flippeak-sidebar'
import { LegendsBoardBeta2 } from '@/components/market/legends-board'

export const metadata: Metadata = {
  title: 'Legends · FlipPeak',
  description:
    'Historical recognition for exceptional FlipPeak campaign runs.',
}

export default function LegendsPage() {
  return (
    <div className="flex min-h-dvh bg-[#090b10] text-white">
      <FlipPeakSidebarBeta2 />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200/55">
            Historical
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Legends
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Qualified completed runs remain visible for 48 hours. Legends does
            not affect the Live Market or current ranking.
          </p>
        </header>

        <LegendsBoardBeta2 />
      </main>
    </div>
  )
}
