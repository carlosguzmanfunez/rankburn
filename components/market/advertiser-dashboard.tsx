'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Gauge, TrendingUp } from 'lucide-react'
import { useMarket } from '@/components/market/market-provider'
import { websiteHost } from '@/lib/rankburn-data'
import { HighBurnBoostBeta2 } from '@/components/market/high-burn-boost'
import { RunAgainPanelBeta2 } from '@/components/market/run-again-panel'
import { useOwnedCampaigns } from '@/components/market/use-owned-campaigns'

type DashboardStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXHAUSTED'
  | 'REJECTED'

function runtimeLabel(balance: number, burnRate: number) {
  if (burnRate <= 0) return '—'
  const hours = balance / burnRate
  if (hours < 1) return `${Math.max(1, Math.floor(hours * 60))}m`
  const whole = Math.floor(hours)
  const minutes = Math.floor((hours - whole) * 60)
  return `${whole}h ${minutes}m`
}

function displayStatus(
  rawStatus: string | undefined,
  paused: boolean | undefined,
  balance: number,
): DashboardStatus {
  if (
    rawStatus === 'PENDING' ||
    rawStatus === 'APPROVED' ||
    rawStatus === 'ACTIVE' ||
    rawStatus === 'PAUSED' ||
    rawStatus === 'EXHAUSTED' ||
    rawStatus === 'REJECTED'
  ) {
    return rawStatus
  }

  // Temporary compatibility fallback only for old seed/client data.
  if (paused) return 'PAUSED'
  if (balance <= 0) return 'EXHAUSTED'
  return 'ACTIVE'
}

function statusDescription(status: DashboardStatus) {
  switch (status) {
    case 'PENDING':
      return 'Campaign has not completed the launch flow.'
    case 'APPROVED':
      return 'Automatic preflight passed. Waiting for verified funding.'
    case 'ACTIVE':
      return 'Live, funded and competing by Burn Rate.'
    case 'PAUSED':
      return 'Temporarily removed from live competition. Budget is not burning.'
    case 'EXHAUSTED':
      return 'This commercial run ended after its balance reached zero.'
    case 'REJECTED':
      return 'Removed by exception moderation or policy enforcement.'
  }
}

export function AdvertiserDashboardBeta2() {
  const market = useMarket()
  // Ownership comes from the private endpoint; ranking positions come from the
  // public market. Those are two different questions and two different sources.
  const {
    campaigns: ownedCampaigns,
    loading,
    signedOut,
    error: loadError,
    refresh,
  } = useOwnedCampaigns()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [boostRate, setBoostRate] = useState<number | null>(null)
  const [boosting, setBoosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const owned =
    ownedCampaigns.find((campaign) => campaign.id === selectedId) ??
    ownedCampaigns[0]

  const globalEntries = market.ranked('live', 'all')
  const ownedEntry = globalEntries.find(
    (entry) => entry.company.id === owned?.id,
  )

  const categoryEntries = owned ? market.ranked('live', owned.category) : []

  const ownedCategoryEntry = categoryEntries.find(
    (entry) => entry.company.id === owned?.id,
  )

  if (signedOut) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
        <h2 className="text-lg font-semibold text-white">Sign in required</h2>
        <p className="mt-2 text-sm text-white/45">
          Your campaigns are private to your account.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
        >
          Sign in
        </Link>
      </section>
    )
  }

  if (loading && ownedCampaigns.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-white/45">
        Loading your campaigns…
      </section>
    )
  }

  if (loadError && ownedCampaigns.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
        <h2 className="text-lg font-semibold text-white">
          Could not load your campaigns
        </h2>
        <p className="mt-2 text-sm text-white/45">{loadError}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
        >
          Try again
        </button>
      </section>
    )
  }

  if (!owned) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
        <h2 className="text-lg font-semibold text-white">No campaign found</h2>
        <p className="mt-2 text-sm text-white/45">
          Create a campaign to start competing in the Live Market.
        </p>
        <Link
          href="/advertise"
          className="mt-5 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
        >
          New Campaign
        </Link>
      </section>
    )
  }

  const status = displayStatus(owned.status, owned.paused, owned.budget)
  const currentBurnRate = owned.burnRate
  // Captured after the `!owned` guard above. `submitBoost` is a hoisted
  // function declaration, and TypeScript does not carry narrowing into those,
  // so the id is read here where `owned` is known to exist.
  const ownedCampaignId = owned.id
  const globalRank = status === 'ACTIVE' ? ownedEntry?.rank ?? 0 : 0
  const categoryRank =
    status === 'ACTIVE' ? ownedCategoryEntry?.categoryRank ?? 0 : 0

  const minimumBoost = Math.max(1, Math.ceil(currentBurnRate + 1))
  const selectedBoost = Math.max(
    minimumBoost,
    boostRate ?? minimumBoost,
  )

  const projectedGlobalRank = useMemo(() => {
    const distinctAbove = new Set(
      globalEntries
        .filter((entry) => entry.company.id !== owned.id)
        .map((entry) => entry.company.burnRate)
        .filter((rate) => rate > selectedBoost),
    )
    return distinctAbove.size + 1
  }, [globalEntries, owned.id, selectedBoost])

  const projectedCategoryRank = useMemo(() => {
    const distinctAbove = new Set(
      categoryEntries
        .filter((entry) => entry.company.id !== owned.id)
        .map((entry) => entry.company.burnRate)
        .filter((rate) => rate > selectedBoost),
    )
    return distinctAbove.size + 1
  }, [categoryEntries, owned.id, selectedBoost])

  const leaderRate = globalEntries.length
    ? Math.max(...globalEntries.map((entry) => entry.company.burnRate))
    : 0

  const sameRateCount = globalEntries.filter(
    (entry) =>
      entry.company.id !== owned.id &&
      entry.company.burnRate === selectedBoost,
  ).length

  let boostRelationship = `Projected global rank #${projectedGlobalRank}.`
  if (leaderRate > 0 && selectedBoost === leaderRate) {
    boostRelationship = 'Join #1 global tier.'
  } else if (leaderRate > 0 && selectedBoost > leaderRate) {
    boostRelationship = 'Become sole #1 globally.'
  } else if (sameRateCount > 0) {
    boostRelationship = `Join global tier #${projectedGlobalRank}.`
  }

  const canBoost = status === 'ACTIVE' && currentBurnRate < 1000

  async function submitBoost() {
    setError(null)

    if (!canBoost) {
      setError('Only an active campaign can increase Burn Rate.')
      return
    }

    if (selectedBoost <= currentBurnRate) {
      setError('New Burn Rate must be higher than the current Burn Rate.')
      return
    }

    if (selectedBoost > 1000) {
      setError('Maximum Burn Rate is $1,000/hour.')
      return
    }

    setBoosting(true)
    try {
      const response = await fetch(
        `/api/campaigns/${ownedCampaignId}/burn-rate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            burnRateCentsPerHour: Math.round(selectedBoost * 100),
          }),
        },
      )

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? 'Burn Rate could not be increased.')
        return
      }

      setBoostRate(null)
    } catch {
      setError('Network error while increasing Burn Rate.')
    } finally {
      setBoosting(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/35">
              Campaign
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {owned.name}
            </h2>
            <p className="mt-1 text-sm text-white/40">
              {websiteHost(owned.website)}
            </p>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/session', { method: 'DELETE' })
                // Full reload so no owned-campaign data survives sign-out in
                // client memory.
                window.location.assign('/')
              }}
              className="mt-3 text-xs text-white/35 underline underline-offset-4 hover:text-white/60"
            >
              Sign out
            </button>
          </div>

          <div className="text-right">
            <StatusPill status={status} />
            <p className="mt-2 max-w-xs text-xs text-white/35">
              {statusDescription(status)}
            </p>
            {!owned.publiclyVisible && (
              <p className="mt-2 max-w-xs text-xs text-white/30">
                Visible to you only. It enters the Live Market once a verified
                payment funds it.
              </p>
            )}
          </div>
        </div>

        {ownedCampaigns.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {ownedCampaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => {
                  setSelectedId(campaign.id)
                  setBoostRate(null)
                  setError(null)
                }}
                className={
                  campaign.id === owned.id
                    ? 'rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black'
                    : 'rounded-lg border border-white/12 px-3 py-1.5 text-xs text-white/55 hover:text-white'
                }
              >
                {campaign.name}
                <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">
                  {campaign.status}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Burn Rate"
            value={`$${currentBurnRate.toFixed(0)}/h`}
            primary
          />
          <Metric label="Balance" value={`$${owned.budget.toFixed(2)}`} />
          <Metric
            label="Est. runtime"
            value={
              status === 'ACTIVE'
                ? runtimeLabel(owned.budget, currentBurnRate)
                : '—'
            }
          />
          <Metric label="Global Rank" value={globalRank ? `#${globalRank}` : '—'} />
          <Metric
            label="Category Rank"
            value={categoryRank ? `#${categoryRank}` : '—'}
          />
        </div>
      </section>

      {status === 'ACTIVE' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-300" />
              <h3 className="font-semibold text-white">Boost your campaign</h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-white/45">
              Burn Rate can only increase during this run. A higher Burn Rate
              strengthens your position but shortens remaining runtime because
              the same balance burns faster.
            </p>

            {currentBurnRate < 100 && (
              <>
                <div className="mt-5">
                  <div className="flex items-end justify-between gap-3">
                    <label htmlFor="boost-rate" className="text-sm text-white/50">
                      Standard Burn Rate
                    </label>
                    <strong className="text-2xl tabular-nums text-white">
                      ${Math.min(100, selectedBoost)}/h
                    </strong>
                  </div>

                  <input
                    id="boost-rate"
                    type="range"
                    min={minimumBoost}
                    max={100}
                    step={1}
                    value={Math.min(100, selectedBoost)}
                    onChange={(event) =>
                      setBoostRate(Number(event.target.value))
                    }
                    className="mt-4 w-full"
                  />
                </div>

                <ProjectionGrid
                  globalRank={projectedGlobalRank}
                  categoryRank={projectedCategoryRank}
                  runtime={runtimeLabel(owned.budget, selectedBoost)}
                />

                <p className="mt-3 text-sm font-medium text-violet-100">
                  {boostRelationship}
                </p>

                <button
                  type="button"
                  disabled={boosting || selectedBoost <= currentBurnRate}
                  onClick={submitBoost}
                  className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {boosting ? 'Boosting…' : 'Boost Burn Rate'}
                </button>
              </>
            )}

            <div className="mt-5">
              <HighBurnBoostBeta2
                currentBurnRate={currentBurnRate}
                balance={owned.budget}
                onSelect={(rate) => setBoostRate(rate)}
              />
            </div>

            {selectedBoost > 100 && (
              <>
                <ProjectionGrid
                  globalRank={projectedGlobalRank}
                  categoryRank={projectedCategoryRank}
                  runtime={runtimeLabel(owned.budget, selectedBoost)}
                />
                <p className="mt-3 text-sm font-medium text-orange-100">
                  {boostRelationship}
                </p>
                <button
                  type="button"
                  disabled={boosting || selectedBoost <= currentBurnRate}
                  onClick={submitBoost}
                  className="mt-4 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {boosting ? 'Boosting…' : `Boost to $${selectedBoost}/h`}
                </button>
              </>
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <Gauge className="h-5 w-5 text-white/55" />
            <h3 className="mt-3 font-semibold text-white">Position rule</h3>
            <p className="mt-2 text-sm leading-6 text-white/45">
              You cannot lower Burn Rate on this run. Budget adds duration; it
              does not buy a higher rank.
            </p>
          </aside>
        </section>
      )}

      {status === 'APPROVED' && (
        <LifecycleAction
          title="Ready for funding"
          body="Automatic preflight passed. Complete verified checkout to fund the campaign. Payment adds duration; it does not lock or guarantee a fixed position."
          href="/advertise"
          action="Continue to checkout"
        />
      )}

      {status === 'PENDING' && (
        <LifecycleNotice
          title="Launch incomplete"
          body="This record has not completed the automatic campaign launch flow."
        />
      )}

      {status === 'PAUSED' && (
        <LifecycleNotice
          title="Campaign paused"
          body="The campaign is temporarily outside the Live Market. Its balance is not burning while paused."
        />
      )}

      {status === 'REJECTED' && (
        <LifecycleNotice
          title="Campaign removed"
          body="This run is no longer eligible for live competition. Post-publication enforcement remains separate from ordinary launch approval."
        />
      )}

      {status === 'EXHAUSTED' && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h3 className="text-lg font-semibold text-white">
            This run has ended
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Run Again creates a new commercial run and preserves this exhausted
            record for billing, ranking history and analytics.
          </p>
          <RunAgainPanelBeta2
            campaignId={owned.id}
            previousBurnRate={currentBurnRate}
          />
        </section>
      )}
    </div>
  )
}

function ProjectionGrid({
  globalRank,
  categoryRank,
  runtime,
}: {
  globalRank: number
  categoryRank: number
  runtime: string
}) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-3">
      <Metric label="Projected Global" value={`#${globalRank}`} />
      <Metric label="Projected Category" value={`#${categoryRank}`} />
      <Metric label="New runtime" value={runtime} />
    </div>
  )
}

function StatusPill({ status }: { status: DashboardStatus }) {
  const classes: Record<DashboardStatus, string> = {
    PENDING: 'border-white/10 text-white/40',
    APPROVED: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    ACTIVE: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    PAUSED: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    EXHAUSTED: 'border-white/10 text-white/35',
    REJECTED: 'border-red-400/20 bg-red-400/10 text-red-200',
  }

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  )
}

function LifecycleNotice({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
        {body}
      </p>
    </section>
  )
}

function LifecycleAction({
  title,
  body,
  href,
  action,
}: {
  title: string
  body: string
  href: string
  action: string
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
        {body}
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
      >
        {action}
      </Link>
    </section>
  )
}

function Metric({
  label,
  value,
  primary,
}: {
  label: string
  value: string
  primary?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </p>
      <p className={primary ? 'mt-1 text-xl font-semibold text-white' : 'mt-1 text-sm font-semibold text-white/85'}>
        {value}
      </p>
    </div>
  )
}
