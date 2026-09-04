'use client'

type ReviewProps = {
  name: string
  categoryLabel: string
  subtypeLabel: string
  budget: number
  burnRate: number
  runtime: string
  globalRank?: number
  categoryRank?: number
  relationship?: string
  pending?: boolean
  onPay: () => void
}

export function CampaignReviewBeta2({
  name,
  categoryLabel,
  subtypeLabel,
  budget,
  burnRate,
  runtime,
  globalRank,
  categoryRank,
  relationship,
  pending = false,
  onPay,
}: ReviewProps) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Review campaign
      </p>

      <h2 className="mt-2 text-2xl font-semibold">
        {name || 'Untitled campaign'}
      </h2>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Category</dt>
          <dd className="mt-1 font-medium">{categoryLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Subtype</dt>
          <dd className="mt-1 font-medium">{subtypeLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Budget</dt>
          <dd className="mt-1 font-medium">${budget.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Burn Rate</dt>
          <dd className="mt-1 font-medium">${burnRate}/h</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Estimated runtime
          </dt>
          <dd className="mt-1 font-medium">{runtime}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Projected positions
          </dt>
          <dd className="mt-1 font-medium">
            Global {globalRank ? `#${globalRank}` : '—'} · Category{' '}
            {categoryRank ? `#${categoryRank}` : '—'}
          </dd>
        </div>
      </dl>

      {relationship && (
        <div className="mt-5 rounded-xl bg-secondary/60 p-4 text-sm">
          {relationship}
        </div>
      )}

      <div className="mt-6 rounded-xl border p-4 text-sm text-muted-foreground">
        Your campaign remains subject to moderation. Payment funds campaign
        budget; it does not lock or guarantee a fixed position.
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={onPay}
        className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'Starting checkout…' : 'Continue to PayPal Sandbox'}
      </button>
    </section>
  )
}
