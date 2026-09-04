'use client'

import Link from 'next/link'
import { Bell, Search } from 'lucide-react'

export function LiveMarketTopbarBeta2() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Real-time
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          Live Market
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 sm:flex">
          <Search className="h-4 w-4 text-white/30" />
          <input
            aria-label="Search campaigns"
            placeholder="Search"
            className="w-40 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
          />
        </div>

        <button
          type="button"
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/55"
        >
          <Bell className="h-4 w-4" />
        </button>

        <Link
          href="/advertise"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          New Campaign
        </Link>
      </div>
    </header>
  )
}
