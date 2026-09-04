import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { AdvertiserAuthForm } from '@/components/market/advertiser-auth-form'
import { getAdvertiserSession } from '@/lib/server/advertiser-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in — FlipPeak',
  robots: { index: false, follow: false },
}

export default async function SignInPage() {
  // Resolved server-side. An already-signed-in advertiser never sees this page.
  const session = await getAdvertiserSession()
  if (session) redirect('/dashboard')

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Advertiser access
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your campaigns, budgets and payments are private to your account.
        </p>
        <AdvertiserAuthForm />
      </main>
    </div>
  )
}
