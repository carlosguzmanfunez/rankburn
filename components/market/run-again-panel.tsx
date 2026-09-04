'use client'

import { useState } from 'react'
import {
  retryRunAgainCheckout,
  runAgainAndCheckout,
} from '@/lib/flippeak/run-again-checkout'

const PRESETS = [25, 50, 100, 250]

export function RunAgainPanelBeta2({
  campaignId,
  previousBurnRate,
}: {
  campaignId: string
  previousBurnRate: number
}) {
  const [budget, setBudget] = useState(50)
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runtime = budget / previousBurnRate

  async function launch() {
    setBusy(true)
    setError(null)

    try {
      if (createdCampaignId) {
        const approvalUrl = await retryRunAgainCheckout(
          createdCampaignId,
          budget,
        )
        window.location.assign(approvalUrl)
        return
      }

      const result = await runAgainAndCheckout(campaignId, budget)
      setCreatedCampaignId(result.campaignId)
      window.location.assign(result.approvalUrl)
    } catch (cause) {
      const typed = cause as Error & { campaignId?: string }
      if (typed.campaignId) setCreatedCampaignId(typed.campaignId)
      setError(typed.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4">
      <p className="text-sm font-medium text-white">Run Again</p>
      <p className="mt-1 text-xs leading-5 text-white/40">
        Previous Burn Rate: ${previousBurnRate.toFixed(0)}/h. A new run keeps
        the same starting Burn Rate and receives a fresh budget after verified
        checkout.
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {PRESETS.map((amount) => (
          <button
            type="button"
            key={amount}
            onClick={() => setBudget(amount)}
            className={[
              'rounded-lg border px-2 py-2 text-xs',
              budget === amount
                ? 'border-violet-400/40 bg-violet-400/10 text-violet-100'
                : 'border-white/10 text-white/45',
            ].join(' ')}
          >
            ${amount}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-white/35">
        Estimated runtime: {runtime.toFixed(1)}h
      </p>

      {error && (
        <p className="mt-3 text-xs text-red-200">
          {error}
          {createdCampaignId
            ? ' Retry will reuse the same new run.'
            : ''}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={launch}
        className="mt-4 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
      >
        {busy
          ? 'Preparing…'
          : createdCampaignId
            ? 'Retry checkout'
            : 'Run Again'}
      </button>
    </div>
  )
}
