import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            The internet&apos;s live attention market. Products compete for
            advertising visibility, you discover what&apos;s moving.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Live Market
          </Link>
          <Link href="/categories" className="hover:text-foreground">
            Categories
          </Link>
          <Link href="/how-it-works" className="hover:text-foreground">
            How It Works
          </Link>
          <Link href="/advertise" className="hover:text-foreground">
            Advertise
          </Link>
        </nav>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>FlipPeak — live advertising platform</span>
          <span className="tabular">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  )
}
