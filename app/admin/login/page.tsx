import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdminLoginForm } from '@/components/market/admin-login-form'
import { requireAdminSession } from '@/lib/server/auth'
import { adminAuthConfigured } from '@/lib/server/config'

export const metadata: Metadata = {
  title: 'Admin sign in · FlipPeak',
  robots: { index: false, follow: false },
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  const session = await requireAdminSession()
  if (session) redirect('/admin')

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
          Operations
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Administrator sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Moderation is restricted to configured administrators. Access is
          verified on the server for every action.
        </p>

        {adminAuthConfigured() ? (
          <AdminLoginForm />
        ) : (
          <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            <p className="font-medium">Administrator sign in is disabled.</p>
            <p className="mt-2 leading-relaxed">
              This deployment is missing{' '}
              <span className="font-mono text-xs">RANKBURN_SESSION_SECRET</span>,{' '}
              <span className="font-mono text-xs">RANKBURN_ADMIN_EMAILS</span> or{' '}
              <span className="font-mono text-xs">RANKBURN_ADMIN_PASSWORD</span>.
              Until they are set, moderation stays closed rather than open.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
