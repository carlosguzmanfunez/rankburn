import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdvertiserDashboard } from '@/components/market/advertiser-dashboard'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard · FlipPeak',
  description:
    'Track your live rank, advertising budget burn, and competitive position in real time.',
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
              Advertiser
            </p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight">
              Your position
            </h1>
          </div>
          <Link
            href="/advertise"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-9 px-4')}
          >
            Add budget
          </Link>
        </header>

        <AdvertiserDashboard />
      </main>
      <SiteFooter />
    </div>
  )
}
