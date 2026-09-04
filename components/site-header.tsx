'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Live Market' },
  { href: '/categories', label: 'Categories' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/advertise', label: 'Advertise' },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="FlipPeak home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'ghost' }), 'h-9 px-3')}
          >
            Dashboard
          </Link>
          <Link
            href="/advertise"
            className={cn(
              buttonVariants({ variant: 'default' }),
              'h-9 px-4 font-semibold shadow-[0_0_0_1px_var(--primary),0_8px_24px_-8px_var(--primary)]',
            )}
          >
            Take a Spot
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/70 bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-1 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'h-10 flex-1',
                )}
              >
                Dashboard
              </Link>
              <Link
                href="/advertise"
                onClick={() => setOpen(false)}
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'h-10 flex-1 font-semibold',
                )}
              >
                Take a Spot
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
