import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdminPanel } from '@/components/market/admin-panel'
import { requireAdminSession } from '@/lib/server/auth'

export const metadata: Metadata = {
  title: 'Admin · FlipPeak',
  description:
    'Review pending campaigns, moderate live advertising, and monitor platform health.',
  robots: {
    index: false,
    follow: false,
  },
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  // Server-side gate. The panel is never rendered for an unauthorized
  // request, and every action it performs is re-authorized on the server.
  const session = await requireAdminSession()
  if (!session) {
    redirect('/admin/login')
    return null
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Operations
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight">
            Moderation &amp; platform health
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Review campaign submissions, pause or flag live placements, and
            monitor advertising activity across FlipPeak.
          </p>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Signed in as {session.email}
          </p>
        </header>

        <AdminPanel />
      </main>
      <SiteFooter />
    </div>
  )
}
