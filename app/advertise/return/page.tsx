import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { buttonVariants } from '@/components/ui/button'
import { getPaymentById } from '@/lib/server/store'
import { capturePendingPayment } from '@/lib/server/payments'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Payment status · FlipPeak',
  robots: { index: false, follow: false },
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where the payment provider returns the buyer.
 *
 * This page reports status only. Returning here is NOT proof of payment: the
 * status shown is read from our own server record, and advertising budget is
 * credited only by a verified provider webhook. A `paymentSuccess=true` style
 * parameter in the URL would change nothing.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>
}) {
  const { payment: paymentId } = await searchParams
  let payment = paymentId ? await getPaymentById(paymentId) : null

  // Only a genuinely pending payment is worth capturing. A payment already
  // routed to refund must never be re-captured here.
  if (paymentId && payment?.status === 'PENDING') {
    await capturePendingPayment(paymentId)
    payment = await getPaymentById(paymentId)
  }

  const credited = Boolean(payment?.creditedAt)
  const refunded =
    payment?.status === 'REFUNDED' || Boolean(payment?.refundedAt)
  const refunding =
    payment?.status === 'REFUND_PENDING' ||
    payment?.status === 'REFUND_FAILED'

  const title = !payment
    ? 'Payment not found'
    : credited
      ? 'Advertising budget added'
      : refunded
        ? 'Payment refunded'
        : refunding
          ? 'Refund in progress'
          : 'Confirming your payment'

  const body = !payment
    ? 'We could not find a payment with that reference. If you were charged, contact support with your provider receipt and nothing will be lost.'
    : credited
      ? 'Your payment was confirmed by the provider and your advertising budget is now active. Placement updates on the next ranking refresh.'
      : refunded
        ? 'Your payment was refunded because this campaign run had already ended before the funds could be applied.'
        : refunding
          ? 'This campaign run had already ended before your payment could be applied. We\u2019re returning the funds to your original payment method.'
          : 'Your payment is being confirmed with the provider. Advertising budget is added only once that confirmation reaches our server, so this page may take a moment to update. Refreshing is safe and will not charge you again.'

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 text-center sm:px-6">
        <div
          className={cn(
            'mx-auto flex h-16 w-16 items-center justify-center rounded-full border',
            credited
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-secondary/50 text-muted-foreground',
          )}
        >
          <span className="text-2xl">{credited ? '\u2713' : '\u2026'}</span>
        </div>

        <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          {body}
        </p>

        {refunding && (
          <p className="mt-2 text-sm text-muted-foreground">
            Refund timing depends on the payment provider.
          </p>
        )}

        {payment && (
          <dl className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border text-left">
            <Row label="Reference" value={payment.id} />
            <Row label="Status" value={payment.status} />
            <Row label="Service" value={payment.description} />
          </dl>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={refunded ? '/advertise' : '/dashboard'}
            className={cn(buttonVariants({ variant: 'default' }), 'h-10 px-5')}
          >
            {refunded ? 'Start a new run' : 'Go to dashboard'}
          </Link>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-5')}
          >
            Back to rankings
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-card/40 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono text-xs">{value}</dd>
    </div>
  )
}
