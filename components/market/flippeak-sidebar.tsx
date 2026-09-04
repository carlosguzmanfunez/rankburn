'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CircleDollarSign,
  Gauge,
  History,
  LayoutDashboard,
  Megaphone,
  Plus,
  Settings,
} from 'lucide-react'

const ITEMS = [
  { href: '/advertise', label: 'New Campaign', icon: Plus },
  { href: '/', label: 'Live Market', icon: Gauge },
  { href: '/dashboard', label: 'My Campaigns', icon: LayoutDashboard },
  { href: '/dashboard?view=analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard?view=billing', label: 'Billing', icon: CircleDollarSign },
  { href: '/legends', label: 'Legends', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function FlipPeakSidebarBeta2() {
  const pathname = usePathname()

  return (
    <aside className="hidden min-h-dvh w-[232px] shrink-0 border-r border-white/8 bg-[#080a0f] lg:flex lg:flex-col">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
            <Megaphone className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            FlipPeak
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href.split('?')[0])

          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
                active
                  ? 'bg-white/[0.07] text-white'
                  : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="m-3 rounded-xl border border-white/8 bg-white/[0.025] p-3">
        <p className="text-xs font-medium text-white">Advertiser</p>
        <p className="mt-1 truncate text-xs text-white/35">
          Beta account
        </p>
      </div>
    </aside>
  )
}
