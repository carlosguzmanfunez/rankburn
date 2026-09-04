'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PublicListing } from '@/lib/server/types'

/**
 * The advertiser's own campaigns.
 *
 * Deliberately NOT sourced from the market provider. Those two answer
 * different questions:
 *
 *   /api/market       "who is competing?"   public, ACTIVE / PAUSED / EXHAUSTED
 *   /api/me/campaigns "what do I own?"      private, every status
 *
 * A campaign that was just created is APPROVED and unfunded: it does not
 * belong in the Live Market yet, but it belongs to its owner immediately.
 * Deriving ownership from the public market is what made such a campaign
 * invisible to the person who had just created it.
 */

export type OwnedCampaign = PublicListing & {
  rejectionReason: string | null
  previousCampaignId: string | null
  publiclyVisible: boolean
  awaitingFunding: boolean
}

export type OwnedCampaignsState = {
  campaigns: OwnedCampaign[]
  loading: boolean
  /** True when there is no advertiser session at all. */
  signedOut: boolean
  error: string | null
  refresh: () => void
}

export function useOwnedCampaigns(): OwnedCampaignsState {
  const [campaigns, setCampaigns] = useState<OwnedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const response = await fetch('/api/me/campaigns', {
          cache: 'no-store',
        })

        if (response.status === 401) {
          if (cancelled) return
          setSignedOut(true)
          setCampaigns([])
          setError(null)
          return
        }

        const payload = await response.json().catch(() => null)

        if (cancelled) return

        if (!response.ok) {
          setError(payload?.error ?? 'Could not load your campaigns.')
          return
        }

        setSignedOut(false)
        setError(null)
        setCampaigns((payload?.campaigns ?? []) as OwnedCampaign[])
      } catch {
        if (!cancelled) setError('Could not load your campaigns.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { campaigns, loading, signedOut, error, refresh }
}
