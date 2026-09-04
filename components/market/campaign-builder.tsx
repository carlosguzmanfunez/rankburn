'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FLIPPEAK_CATEGORIES,
  subtypesFor,
  type FlipPeakCategoryId,
  type FlipPeakSubtypeId,
} from '@/lib/flippeak/taxonomy'
import {
  CampaignPreflightError,
  CheckoutStartError,
  launchCampaign,
  retryCampaignCheckout,
  type PreflightIssue,
} from '@/lib/flippeak/campaign-launch'

const BUDGET_PRESETS = [25, 50, 100, 250, 500]
const MIN_BUDGET = 10
const STANDARD_MIN = 1
const STANDARD_MAX = 100
const HIGH_BURN_MIN = 101
const HIGH_BURN_MAX = 1000

type Projection = {
  overallRank: number
  categoryRank: number
  globalTierSize: number
  categoryTierSize: number
  relationship:
    | 'SOLE_LEADER'
    | 'JOIN_LEADER_TIER'
    | 'JOIN_TIER'
    | 'TAKE_POSITION'
    | 'BELOW_LEADER'
}

type Draft = {
  name: string
  website: string
  category: FlipPeakCategoryId
  subtype: FlipPeakSubtypeId
  budgetDollars: number
  burnRateDollarsPerHour: number
}

function formatRuntime(budget: number, rate: number): string {
  if (budget <= 0 || rate <= 0) return '0m'
  const totalMinutes = Math.floor((budget / rate) * 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function opportunityCopy(
  projection: Projection | null,
  rate: number,
): string {
  if (!projection) return 'Calculating market opportunity…'

  switch (projection.relationship) {
    case 'SOLE_LEADER':
      return `$${rate}/h → Become #1`
    case 'JOIN_LEADER_TIER':
      return `$${rate}/h → Join the #1 tier`
    case 'JOIN_TIER':
      return `$${rate}/h → Join #${projection.overallRank} tier`
    case 'TAKE_POSITION':
      return `$${rate}/h → Move into #${projection.overallRank}`
    default:
      return `$${rate}/h → Projected #${projection.overallRank}`
  }
}

export function CampaignBuilderBeta2() {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    website: '',
    category: 'creators',
    subtype: 'video-creator',
    budgetDollars: 100,
    burnRateDollarsPerHour: 10,
  })
  const [highBurnOpen, setHighBurnOpen] = useState(false)
  const [projection, setProjection] = useState<Projection | null>(null)
  const [projectionPending, setProjectionPending] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [issues, setIssues] = useState<PreflightIssue[]>([])
  // Set once the campaign exists on the server. A retry then resumes checkout
  // instead of creating a second campaign for the same intent.
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(
    null,
  )

  const runtime = useMemo(
    () =>
      formatRuntime(
        draft.budgetDollars,
        draft.burnRateDollarsPerHour,
      ),
    [draft.budgetDollars, draft.burnRateDollarsPerHour],
  )

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setProjectionPending(true)
      try {
        const params = new URLSearchParams({
          burnRateCentsPerHour: String(
            Math.round(draft.burnRateDollarsPerHour * 100),
          ),
          category: draft.category,
        })
        const response = await fetch(
          `/api/market/projection?${params.toString()}`,
          { cache: 'no-store', signal: controller.signal },
        )
        if (!response.ok) return
        const payload = (await response.json()) as {
          projection: Projection
        }
        setProjection(payload.projection)
      } catch {
        // Aborted by the debounce cleanup, or the request failed. Either way
        // the previous projection stays on screen; without this catch the
        // AbortError escaped as an unhandled rejection on every keystroke.
      } finally {
        setProjectionPending(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draft.burnRateDollarsPerHour, draft.category])

  function setCategory(category: FlipPeakCategoryId) {
    const firstSubtype = subtypesFor(category)[0]?.id ?? 'other'
    setDraft((current) => ({
      ...current,
      category,
      subtype: firstSubtype,
    }))
  }

  async function launch() {
    setLaunching(true)
    setLaunchError(null)
    setIssues([])

    try {
      if (createdCampaignId) {
        const approvalUrl = await retryCampaignCheckout(
          createdCampaignId,
          draft.budgetDollars,
        )
        window.location.assign(approvalUrl)
        return
      }

      const result = await launchCampaign({
        name: draft.name,
        website: draft.website,
        category: draft.category,
        subtype: draft.subtype,
        burnRateCentsPerHour: Math.round(draft.burnRateDollarsPerHour * 100),
        budgetDollars: draft.budgetDollars,
      })

      setCreatedCampaignId(result.campaignId)
      window.location.assign(result.approvalUrl)
    } catch (cause) {
      if (cause instanceof CampaignPreflightError) {
        setIssues(cause.issues)
        setLaunchError(cause.message)
      } else if (cause instanceof CheckoutStartError) {
        // The campaign exists; only checkout failed. Remember it so the retry
        // does not create another one.
        setCreatedCampaignId(cause.campaignId)
        setLaunchError(cause.message)
      } else {
        setLaunchError(
          cause instanceof Error
            ? cause.message
            : 'The campaign could not be launched.',
        )
      }
    } finally {
      setLaunching(false)
    }
  }

  function setStandardBurnRate(value: number) {
    setHighBurnOpen(false)
    setDraft((current) => ({
      ...current,
      burnRateDollarsPerHour: Math.max(
        STANDARD_MIN,
        Math.min(STANDARD_MAX, Math.round(value)),
      ),
    }))
  }

  function setHighBurnRate(value: number) {
    setDraft((current) => ({
      ...current,
      burnRateDollarsPerHour: Math.max(
        HIGH_BURN_MIN,
        Math.min(HIGH_BURN_MAX, Math.round(value)),
      ),
    }))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Campaign
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            What are you promoting?
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Name
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="rounded-lg border bg-background px-3 py-2"
                placeholder="Your campaign"
              />
            </label>

            <label className="grid gap-2 text-sm">
              Website
              <input
                value={draft.website}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
                className="rounded-lg border bg-background px-3 py-2"
                placeholder="example.com"
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="font-medium">Category</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your campaign competes globally and inside one category.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {FLIPPEAK_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategory(category.id)}
                className={
                  draft.category === category.id
                    ? 'rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary'
                    : 'rounded-full border px-3 py-1.5 text-sm text-muted-foreground'
                }
              >
                {category.label}
              </button>
            ))}
          </div>

          <label className="mt-5 grid max-w-sm gap-2 text-sm">
            Subtype
            <select
              value={draft.subtype}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  subtype: event.target.value as FlipPeakSubtypeId,
                }))
              }
              className="rounded-lg border bg-background px-3 py-2"
            >
              {subtypesFor(draft.category).map((subtype) => (
                <option key={subtype.id} value={subtype.id}>
                  {subtype.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <h3 className="font-medium">Budget</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Budget determines how long you can sustain your Burn Rate.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    budgetDollars: amount,
                  }))
                }
                className="rounded-lg border px-4 py-2 text-sm"
              >
                ${amount}
              </button>
            ))}
          </div>

          <label className="mt-4 grid max-w-xs gap-2 text-sm">
            Custom budget
            <input
              type="number"
              min={MIN_BUDGET}
              step={1}
              value={draft.budgetDollars}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  budgetDollars: Math.max(
                    MIN_BUDGET,
                    Number(event.target.value) || MIN_BUDGET,
                  ),
                }))
              }
              className="rounded-lg border bg-background px-3 py-2"
            />
          </label>
        </div>

        <div>
          <h3 className="font-medium">Burn Rate</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Higher Burn Rate = stronger position, shorter remaining runtime.
          </p>

          <div className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <span className="text-3xl font-semibold tabular-nums">
                ${draft.burnRateDollarsPerHour}/h
              </span>
              {!highBurnOpen && (
                <span className="text-xs text-muted-foreground">
                  Standard $1–$100/h
                </span>
              )}
            </div>

            {!highBurnOpen ? (
              <input
                aria-label="Burn Rate"
                type="range"
                min={STANDARD_MIN}
                max={STANDARD_MAX}
                step={1}
                value={Math.min(
                  STANDARD_MAX,
                  draft.burnRateDollarsPerHour,
                )}
                onChange={(event) =>
                  setStandardBurnRate(Number(event.target.value))
                }
                className="mt-5 w-full"
              />
            ) : (
              <label className="mt-5 grid max-w-xs gap-2 text-sm">
                High Burn
                <input
                  type="number"
                  min={HIGH_BURN_MIN}
                  max={HIGH_BURN_MAX}
                  step={1}
                  value={draft.burnRateDollarsPerHour}
                  onChange={(event) =>
                    setHighBurnRate(Number(event.target.value))
                  }
                  className="rounded-lg border bg-background px-3 py-2"
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => {
                setHighBurnOpen((open) => !open)
                if (!highBurnOpen) setHighBurnRate(HIGH_BURN_MIN)
                else setStandardBurnRate(STANDARD_MAX)
              }}
              className="mt-4 text-sm font-medium text-primary"
            >
              {highBurnOpen
                ? 'Back to standard Burn Rate'
                : 'High Burn $101–$1,000/h'}
            </button>
          </div>
        </div>
      </section>

      <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Market Opportunity
        </p>

        <div className="mt-5">
          <div className="text-sm text-muted-foreground">
            Estimated runtime
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {runtime}
          </div>
        </div>

        <div className="mt-6 border-t pt-5">
          <div className="text-sm text-muted-foreground">
            Projected Global Rank
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {projection ? `#${projection.overallRank}` : '—'}
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Projected Category Rank
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {projection ? `#${projection.categoryRank}` : '—'}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-secondary/50 p-4">
          <div className="text-sm font-medium">
            {projectionPending
              ? 'Calculating…'
              : opportunityCopy(
                  projection,
                  draft.burnRateDollarsPerHour,
                )}
          </div>
          {projection && projection.globalTierSize > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              {projection.globalTierSize} competitor
              {projection.globalTierSize === 1 ? '' : 's'} already at this rate
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={launch}
          disabled={launching}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {launching
            ? 'Preparing checkout…'
            : createdCampaignId
              ? 'Retry checkout'
              : `Launch for $${draft.budgetDollars}`}
        </button>

        {issues.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {issues.map((issue) => (
              <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
            ))}
          </ul>
        )}

        {launchError && issues.length === 0 && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {launchError}
            {createdCampaignId
              ? ' Your campaign was saved; retrying resumes checkout without creating another one.'
              : ''}
          </p>
        )}

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          You choose how aggressively you compete. Burn Rate determines position
          for it. Budget determines how long you can sustain that rate.
          Advertising budget is added only after the payment provider confirms
          it to our server.
        </p>
      </aside>
    </div>
  )
}
