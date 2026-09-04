'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMarket } from './market-provider'
import { Monogram } from './monogram'
import { AnimatedNumber } from './animated-number'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  CATEGORIES,
  categoryLabel,
  formatMoney,
  estimateRemaining,
  type CategoryId,
} from '@/lib/rankburn-data'
import { cn } from '@/lib/utils'

type Step = 'product' | 'budget' | 'review' | 'submitted'

const STEP_ORDER: Step[] = ['product', 'budget', 'review']
const PRESETS = [50, 100, 250, 500]
const MIN_AMOUNT = 10

type Draft = {
  mode: 'existing' | 'new'
  companyId: string | null
  name: string
  category: CategoryId
  website: string
  amount: number
}

type SubmitOutcome = {
  campaignSubmitted: boolean
  checkoutStarted: boolean
  message: string
}

/**
 * Deterministic hue from the product name. Using a stable value instead of
 * Math.random() keeps server and client markup identical, which avoids a
 * hydration mismatch on this page.
 */
function hueFor(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360
  }
  return name.length === 0 ? 42 : hash
}

export function AdvertiseFlow() {
  const { companies, checkoutEnabled } = useMarket()
  const [step, setStep] = useState<Step>('product')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [draft, setDraft] = useState<Draft>({
    mode: 'existing',
    // No implicit "the owned campaign". Ownership is resolved server-side from
    // the session; this legacy flow starts with nothing selected.
    companyId: '',
    name: '',
    category: 'ai',
    website: '',
    amount: 100,
  })

  const selected = useMemo(
    () => companies.find((c) => c.id === draft.companyId) ?? null,
    [companies, draft.companyId],
  )

  // Projection is an estimate of where this budget would place right now.
  // Placement is dynamic and is always recomputed on the server.
  const projection = useMemo(() => {
    const targetCategory =
      draft.mode === 'existing' && selected ? selected.category : draft.category
    const baseBudget =
      draft.mode === 'existing' && selected ? selected.budget : 0
    const newBudget = baseBudget + draft.amount

    const overall = companies
      .filter((c) => c.id !== draft.companyId)
      .map((c) => c.budget)
      .concat(newBudget)
      .sort((a, b) => b - a)
    const overallRank = overall.indexOf(newBudget) + 1

    const inCat = companies
      .filter((c) => c.category === targetCategory && c.id !== draft.companyId)
      .map((c) => c.budget)
      .concat(newBudget)
      .sort((a, b) => b - a)
    const catRank = inCat.indexOf(newBudget) + 1

    const leader = [...companies].sort((a, b) => b.budget - a.budget)[0]
    const toBeat = leader ? Math.max(0, leader.budget + 0.01 - baseBudget) : 0

    return {
      overallRank,
      catRank,
      category: targetCategory,
      newBudget,
      runway: estimateRemaining(newBudget, selected?.burnRate ?? 0.42),
      toBeat,
      leaderName: leader?.name ?? '',
      willLead: overallRank === 1,
    }
  }, [companies, draft, selected])

  const canContinue =
    step === 'product'
      ? draft.mode === 'existing'
        ? Boolean(draft.companyId)
        : draft.name.trim().length > 1
      : step === 'budget'
        ? draft.amount >= MIN_AMOUNT
        : true

  /**
   * Submits the campaign and starts a server-created checkout.
   *
   * No advertising budget is created here. The browser cannot credit a
   * balance: budget only appears after the payment provider confirms the
   * capture to our server.
   */
  async function submit() {
    setPending(true)
    setError(null)
    try {
      let campaignId = draft.companyId
      let campaignSubmitted = false

      if (draft.mode === 'new') {
        const response = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            website: draft.website.trim(),
            category: draft.category,
            hue: hueFor(draft.name.trim()),
          }),
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          setError(payload?.error ?? 'Could not submit this product.')
          return
        }
        const created = (await response.json()) as { campaignId: string }
        campaignId = created.campaignId
        campaignSubmitted = true
      }

      if (!campaignId) {
        setError('Select a product before continuing.')
        return
      }

      const checkout = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, amount: draft.amount }),
      })

      if (checkout.ok) {
        const session = (await checkout.json()) as { approvalUrl: string }
        window.location.href = session.approvalUrl
        return
      }

      const payload = (await checkout.json().catch(() => null)) as {
        error?: string
      } | null

      setOutcome({
        campaignSubmitted,
        checkoutStarted: false,
        message:
          payload?.error ??
          'Checkout could not be started on this deployment.',
      })
      setStep('submitted')
    } catch {
      setError('Network error. Nothing was charged and no budget was added.')
    } finally {
      setPending(false)
    }
  }

  if (step === 'submitted' && outcome) {
    return <SubmissionSummary draft={draft} outcome={outcome} />
  }

  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <Stepper current={stepIndex} />

        <div className="mt-8">
          {step === 'product' && (
            <ProductStep
              companies={companies}
              draft={draft}
              setDraft={setDraft}
            />
          )}
          {step === 'budget' && <BudgetStep draft={draft} setDraft={setDraft} />}
          {step === 'review' && (
            <ReviewStep
              draft={draft}
              selected={selected}
              projection={projection}
              checkoutEnabled={checkoutEnabled}
            />
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-6">
          {stepIndex > 0 ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setStep(STEP_ORDER[stepIndex - 1])}
            >
              Back
            </Button>
          ) : (
            <Link
              href="/"
              className={cn(buttonVariants({ variant: 'ghost' }), 'h-8')}
            >
              Cancel
            </Link>
          )}

          {step === 'review' ? (
            <Button onClick={submit} disabled={pending} className="min-w-40">
              {pending ? 'Starting checkout…' : 'Continue to payment'}
            </Button>
          ) : (
            <Button
              disabled={!canContinue}
              onClick={() => setStep(STEP_ORDER[stepIndex + 1])}
              className="min-w-40"
            >
              Continue
            </Button>
          )}
        </div>
      </div>

      <ProjectionPanel draft={draft} projection={projection} />
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  const labels = ['Product', 'Budget', 'Review']
  return (
    <ol className="flex items-center gap-3">
      {labels.map((label, i) => {
        const active = i === current
        const done = i < current
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums transition-colors',
                active && 'border-primary bg-primary text-primary-foreground',
                done && 'border-primary/40 bg-primary/10 text-primary',
                !active && !done && 'border-border text-muted-foreground',
              )}
            >
              {done ? '\u2713' : i + 1}
            </div>
            <span
              className={cn(
                'text-sm font-medium',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className="ml-1 hidden h-px flex-1 bg-border sm:block" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ProductStep({
  companies,
  draft,
  setDraft,
}: {
  companies: ReturnType<typeof useMarket>['companies']
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
}) {
  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Step 1
      </h2>
      <p className="mt-2 text-balance text-2xl font-semibold tracking-tight">
        What are you putting on the board?
      </p>

      <div className="mt-6 inline-flex rounded-lg border border-border p-1">
        {(['existing', 'new'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, mode }))}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              draft.mode === mode
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {mode === 'existing' ? 'A listed product' : 'A new product'}
          </button>
        ))}
      </div>

      {draft.mode === 'existing' ? (
        companies.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No listed products yet. Switch to “A new product” to submit one.
          </p>
        ) : (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {companies.map((c) => {
              const active = c.id === draft.companyId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, companyId: c.id }))}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <Monogram name={c.name} hue={c.hue} size={40} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {categoryLabel(c.category)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div className="mt-6 grid max-w-lg gap-4">
          <Field label="Product name">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Northwind AI"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground/60 focus:ring-2"
            />
          </Field>
          <Field label="Website">
            <input
              value={draft.website}
              onChange={(e) =>
                setDraft((d) => ({ ...d, website: e.target.value }))
              }
              placeholder="northwind.ai"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground/60 focus:ring-2"
            />
          </Field>
          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, category: cat.id }))}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    draft.category === cat.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-xs leading-relaxed text-muted-foreground">
            New products are reviewed before they can appear in the live
            ranking.
          </p>
        </div>
      )}
    </div>
  )
}

function BudgetStep({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
}) {
  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Step 2
      </h2>
      <p className="mt-2 text-balance text-2xl font-semibold tracking-tight">
        Set your advertising budget
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Your budget determines how long your campaign can sustain its Burn
        Rate. Adding budget extends your remaining runtime, but does not
        improve your position by itself.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, amount: amt }))}
            className={cn(
              'rounded-lg border px-5 py-2.5 text-sm font-medium tabular-nums transition-colors',
              draft.amount === amt
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {formatMoney(amt, 0)}
          </button>
        ))}
      </div>

      <div className="mt-6 max-w-sm">
        <label
          htmlFor="custom-budget"
          className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground"
        >
          Custom amount
        </label>
        <div className="mt-2 flex items-center rounded-lg border border-border bg-input px-3 focus-within:ring-2 focus-within:ring-primary/40">
          <span className="text-muted-foreground">$</span>
          <input
            id="custom-budget"
            type="number"
            min={MIN_AMOUNT}
            step={10}
            value={draft.amount}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                amount: Math.max(0, Number(e.target.value) || 0),
              }))
            }
            className="w-full bg-transparent px-2 py-2.5 text-lg font-semibold tabular-nums outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Minimum {formatMoney(MIN_AMOUNT, 0)}.
        </p>
      </div>
    </div>
  )
}

/** Phase 10 disclosure. Shown before payment, in plain language. */
function CheckoutDisclosure() {
  const points = [
    'Rankings are dynamic and placement can change at any time.',
    'Advertising budget is gradually used while the campaign is active.',
    'Clicks, leads, sales, conversions and ROI are not guaranteed.',
    'Advertising budget is non-transferable between accounts.',
    'Advertising budget cannot be withdrawn or redeemed for cash.',
  ]
  return (
    <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-5">
      <h3 className="text-sm font-semibold text-foreground">
        What you are buying
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Digital advertising placement and exposure on FlipPeak.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span className="leading-relaxed">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReviewStep({
  draft,
  selected,
  projection,
  checkoutEnabled,
}: {
  draft: Draft
  selected: ReturnType<typeof useMarket>['companies'][number] | null
  projection: {
    overallRank: number
    catRank: number
    category: CategoryId
    runway: string
  }
  checkoutEnabled: boolean
}) {
  const name = draft.mode === 'existing' ? selected?.name : draft.name
  const hue =
    draft.mode === 'existing'
      ? (selected?.hue ?? hueFor(draft.name))
      : hueFor(draft.name)

  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Step 3
      </h2>
      <p className="mt-2 text-balance text-2xl font-semibold tracking-tight">
        Review &amp; continue
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-3 border-b border-border bg-card p-4">
          <Monogram name={name ?? 'New'} hue={hue} size={44} />
          <div>
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground">
              {categoryLabel(projection.category)}
            </div>
          </div>
        </div>
        <dl className="divide-y divide-border">
          <Row label="Advertising budget" value={formatMoney(draft.amount)} />
          <Row
            label="Estimated placement"
            value={`#${projection.overallRank} overall · #${projection.catRank} in ${categoryLabel(projection.category)}`}
          />
          <Row label="Estimated exposure time" value={projection.runway} />
          <Row label="Service" value="FlipPeak Digital Advertising" />
          <Row
            label="Billing description"
            value="Digital Advertising Placement and Exposure"
          />
        </dl>
      </div>

      <CheckoutDisclosure />

      {!checkoutEnabled && (
        <p className="mt-4 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          No payment provider is configured on this deployment, so checkout
          cannot complete. Your submission will still be recorded for review,
          and no advertising budget will be created.
        </p>
      )}
    </div>
  )
}

function ProjectionPanel({
  draft,
  projection,
}: {
  draft: Draft
  projection: {
    overallRank: number
    catRank: number
    category: CategoryId
    newBudget: number
    runway: string
    toBeat: number
    leaderName: string
    willLead: boolean
  }
}) {
  return (
    <aside className="h-fit rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-24">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Live projection
        </h3>
      </div>

      <div className="mt-6">
        <div className="text-xs text-muted-foreground">
          With {formatMoney(draft.amount, 0)} you&apos;d place around
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tabular-nums tracking-tight text-primary">
            #<AnimatedNumber value={projection.overallRank} decimals={0} />
          </span>
          <span className="text-sm text-muted-foreground">overall</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          #{projection.catRank} in {categoryLabel(projection.category)}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Exposure time</span>
          <span className="font-medium tabular-nums">{projection.runway}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Active budget</span>
          <span className="font-medium tabular-nums">
            {formatMoney(projection.newBudget)}
          </span>
        </div>
      </div>

      {projection.willLead ? (
        <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          This would take #1 at current budgets.
        </div>
      ) : projection.toBeat > 0 ? (
        <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          Add{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {formatMoney(projection.toBeat, 0)}
          </span>{' '}
          more to pass {projection.leaderName} for #1.
        </div>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Placement is dynamic. This is an estimate at current budgets, not a
        guaranteed position.
      </p>
    </aside>
  )
}

/**
 * Shown when a checkout could not be started. It never claims a campaign is
 * live, because no advertising budget exists until a payment is confirmed.
 */
function SubmissionSummary({
  draft,
  outcome,
}: {
  draft: Draft
  outcome: SubmitOutcome
}) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary/50">
        <span className="text-2xl text-muted-foreground">!</span>
      </div>
      <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight">
        {outcome.campaignSubmitted
          ? 'Submitted for review'
          : 'Checkout not completed'}
      </h1>
      <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
        {outcome.message}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        No payment was taken and no advertising budget was added. Your{' '}
        {formatMoney(draft.amount, 0)} budget will only become active after a
        confirmed payment.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: 'default' }), 'h-10 px-5')}
        >
          Back to rankings
        </Link>
        <Link
          href="/how-it-works"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-5')}
        >
          How it works
        </Link>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-card/40 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  )
}
