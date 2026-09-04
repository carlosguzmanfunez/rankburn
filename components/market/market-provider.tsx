'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  COMPANIES,
  type CategoryId,
  type Company,
  type RankMode,
} from '@/lib/rankburn-data'

export type ActivityKind = 'took' | 'moved' | 'entered' | 'boosted'

export type ActivityItem = {
  id: string
  kind: ActivityKind
  companyId: string
  companyName: string
  text: string
  burnRate?: number
  rank?: number
}

export type MarketCompany = Company & {
  status?: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'EXHAUSTED' | 'REJECTED'
}

export type RankedEntry = {
  company: MarketCompany
  rank: number
  categoryRank: number
  tierSize: number
  categoryTierSize: number
  delta: number
}

type MarketContextValue = {
  companies: MarketCompany[]
  ranked: (mode: RankMode, category?: CategoryId | 'all') => RankedEntry[]
  rankOf: (id: string, mode?: RankMode) => number
  categoryRankOf: (id: string) => number
  globalActive: number
  totalBurnRate: number
  activity: ActivityItem[]
  synced: boolean
  checkoutEnabled: boolean
  serverGeneratedAtMs: number | null
  rotationMs: number
  authoritativeNowMs: (localNowMs?: number) => number
  spotlightIndexForTier: (tierMemberCount: number, localNowMs?: number) => number
}

type ServerListing = MarketCompany & {
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'EXHAUSTED' | 'REJECTED'
  impressions: number
}

type ServerRankedEntry = {
  rank: number
  categoryRank: number
  tierSize: number
  categoryTierSize: number
  listing: ServerListing
}

type MarketSnapshot = {
  generatedAt: string
  generatedAtMs: number
  rotationMs: number
  totalActiveBudget: number
  totalBurnRate: number
  checkoutEnabled: boolean
  ranked: ServerRankedEntry[]
  listings: ServerListing[]
}

const MarketContext = createContext<MarketContextValue | null>(null)

const SYNC_INTERVAL_MS = 15_000
const TICK_INTERVAL_MS = 1_000
const DEFAULT_ROTATION_MS = 20_000

let activitySeq = 0
function nextId() {
  activitySeq += 1
  return `act-${Date.now()}-${activitySeq}`
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<MarketCompany[]>(() =>
    COMPANIES.map((c) => ({ ...c, rankHistory: [...c.rankHistory] })),
  )

  const [serverRanks, setServerRanks] = useState<Record<string, number>>({})
  const [serverCategoryRanks, setServerCategoryRanks] = useState<
    Record<string, number>
  >({})
  const [serverTierSizes, setServerTierSizes] = useState<Record<string, number>>(
    {},
  )
  const [serverCategoryTierSizes, setServerCategoryTierSizes] = useState<
    Record<string, number>
  >({})

  const [serverGeneratedAtMs, setServerGeneratedAtMs] = useState<number | null>(
    null,
  )
  const [rotationMs, setRotationMs] = useState(DEFAULT_ROTATION_MS)
  const [totalBurnRate, setTotalBurnRate] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [synced, setSynced] = useState(false)
  const [checkoutEnabled, setCheckoutEnabled] = useState(false)

  const serverSyncReceivedAtRef = useRef<number | null>(null)

  const previousRef = useRef<
    Record<string, { rank: number; burnRate: number }>
  >({})

  const sync = useCallback(async () => {
    try {
      const response = await fetch('/api/market', { cache: 'no-store' })
      if (!response.ok) return

      const receivedAt = Date.now()
      const snapshot = (await response.json()) as MarketSnapshot

      const nextRanks: Record<string, number> = {}
      const nextCategoryRanks: Record<string, number> = {}
      const nextTierSizes: Record<string, number> = {}
      const nextCategoryTierSizes: Record<string, number> = {}

      const events: ActivityItem[] = []
      const previous = previousRef.current
      const nextPrevious: Record<string, { rank: number; burnRate: number }> = {}

      for (const entry of snapshot.ranked) {
        const { listing, rank, categoryRank, tierSize, categoryTierSize } = entry

        nextRanks[listing.id] = rank
        nextCategoryRanks[listing.id] = categoryRank
        nextTierSizes[listing.id] = tierSize
        nextCategoryTierSizes[listing.id] = categoryTierSize

        nextPrevious[listing.id] = {
          rank,
          burnRate: listing.burnRate,
        }

        const before = previous[listing.id]

        if (!before) {
          if (Object.keys(previous).length > 0) {
            events.push({
              id: nextId(),
              kind: 'entered',
              companyId: listing.id,
              companyName: listing.name,
              text: 'entered the live market',
            })
          }
          continue
        }

        if (listing.burnRate > before.burnRate) {
          events.push({
            id: nextId(),
            kind: 'boosted',
            companyId: listing.id,
            companyName: listing.name,
            text: `boosted Burn Rate to $${listing.burnRate.toFixed(0)}/h`,
            burnRate: listing.burnRate,
          })
        }

        if (rank < before.rank && rank <= 5) {
          events.push({
            id: nextId(),
            kind: rank === 1 ? 'took' : 'moved',
            companyId: listing.id,
            companyName: listing.name,
            text: rank === 1 ? 'took #1' : `moved to #${rank}`,
            rank,
          })
        }
      }

      previousRef.current = nextPrevious

      setCompanies(
        snapshot.listings.map((listing) => ({
          ...listing,
          rankHistory: [...listing.rankHistory],
        })),
      )
      setServerRanks(nextRanks)
      setServerCategoryRanks(nextCategoryRanks)
      setServerTierSizes(nextTierSizes)
      setServerCategoryTierSizes(nextCategoryTierSizes)
      setServerGeneratedAtMs(snapshot.generatedAtMs)
      setRotationMs(snapshot.rotationMs || DEFAULT_ROTATION_MS)
      setTotalBurnRate(snapshot.totalBurnRate)
      serverSyncReceivedAtRef.current = receivedAt
      setCheckoutEnabled(snapshot.checkoutEnabled)
      setSynced(true)

      if (events.length > 0) {
        setActivity((current) => [...events, ...current].slice(0, 14))
      }
    } catch {
      // Keep last known good market snapshot.
    }
  }, [])

  useEffect(() => {
    sync()
    const interval = setInterval(sync, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [sync])

  useEffect(() => {
    if (!synced) return
    const interval = setInterval(() => {
      setCompanies((prev) =>
        prev.map((company) => {
          // Only an ACTIVE run consumes budget. Showing a balance tick down
          // on a paused, approved or finished campaign would be a lie.
          if (
            company.status !== 'ACTIVE' ||
            company.paused ||
            company.budget <= 0
          ) {
            return company
          }
          const perTick =
            (company.burnRate / 3600) * (TICK_INTERVAL_MS / 1000)
          const nextBudget = Math.max(0, company.budget - perTick)

          return {
            ...company,
            budget: Number(nextBudget.toFixed(2)),
          }
        }),
      )
    }, TICK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [synced])

  /**
   * Only an ACTIVE, funded, unpaused campaign can hold a competitive
   * position. The server already filters this in SQL; filtering again here
   * means a client-side fallback can never resurrect a campaign the server
   * excluded.
   */
  const liveCompanies = useMemo(
    () =>
      companies.filter(
        (company) =>
          company.status === 'ACTIVE' &&
          !company.paused &&
          company.budget > 0,
      ),
    [companies],
  )

  /**
   * Historical leaderboards report Burn already consumed, so they cover runs
   * that actually ran: currently live, paused, and finished. Submissions
   * (PENDING/APPROVED) never ran, and REJECTED campaigns must not be
   * republished on any surface.
   */
  const historicalCompanies = useMemo(
    () =>
      companies.filter(
        (company) =>
          company.status === 'ACTIVE' ||
          company.status === 'PAUSED' ||
          company.status === 'EXHAUSTED',
      ),
    [companies],
  )

  const ranked = useCallback(
    (
      mode: RankMode,
      category: CategoryId | 'all' = 'all',
    ): RankedEntry[] => {
      if (mode === 'today') {
        // Leaderboard, not a ranking: ordered by Burn consumed today.
        const ordered = [...historicalCompanies].sort(
          (a, b) => b.spentToday - a.spentToday,
        )
        return ordered
          .filter((company) =>
            category === 'all' ? true : company.category === category,
          )
          .map((company, index) => ({
            company,
            rank: index + 1,
            categoryRank: index + 1,
            tierSize: 1,
            categoryTierSize: 1,
            delta: 0,
          }))
      }

      if (mode === 'alltime') {
        // Leaderboard, not a ranking: ordered by Burn consumed across runs.
        const ordered = [...historicalCompanies].sort(
          (a, b) => b.totalSpend - a.totalSpend,
        )
        return ordered
          .filter((company) =>
            category === 'all' ? true : company.category === category,
          )
          .map((company, index) => ({
            company,
            rank: index + 1,
            categoryRank: index + 1,
            tierSize: 1,
            categoryTierSize: 1,
            delta: 0,
          }))
      }

      const haveServerRanks = Object.keys(serverRanks).length > 0

      if (!haveServerRanks) {
        // First-paint fallback only. The authoritative market replaces this.
        const ordered = [...liveCompanies].sort(
          (a, b) => b.burnRate - a.burnRate || a.id.localeCompare(b.id),
        )

        let dense = 0
        let previousRate: number | null = null

        const fallback = ordered.map((company) => {
          if (company.burnRate !== previousRate) {
            dense += 1
            previousRate = company.burnRate
          }

          return {
            company,
            rank: dense,
            categoryRank: dense,
            tierSize: ordered.filter(
              (candidate) => candidate.burnRate === company.burnRate,
            ).length,
            categoryTierSize: ordered.filter(
              (candidate) =>
                candidate.category === company.category &&
                candidate.burnRate === company.burnRate,
            ).length,
            delta: 0,
          }
        })

        return category === 'all'
          ? fallback
          : fallback.filter(
              (entry) => entry.company.category === category,
            )
      }

      const entries = liveCompanies
        .filter((company) => serverRanks[company.id] !== undefined)
        .map((company) => ({
          company,
          rank: serverRanks[company.id],
          categoryRank: serverCategoryRanks[company.id] ?? 0,
          tierSize: serverTierSizes[company.id] ?? 1,
          categoryTierSize:
            serverCategoryTierSizes[company.id] ?? 1,
          delta:
            company.isNew
              ? 0
              : (company.rankHistory[0] ?? serverRanks[company.id]) -
                serverRanks[company.id],
        }))
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            b.company.burnRate - a.company.burnRate ||
            a.company.id.localeCompare(b.company.id),
        )

      if (category === 'all') return entries

      return entries
        .filter((entry) => entry.company.category === category)
        .sort(
          (a, b) =>
            a.categoryRank - b.categoryRank ||
            b.company.burnRate - a.company.burnRate ||
            a.company.id.localeCompare(b.company.id),
        )
    },
    [
      historicalCompanies,
      liveCompanies,
      serverCategoryRanks,
      serverCategoryTierSizes,
      serverRanks,
      serverTierSizes,
    ],
  )

  const rankOf = useCallback(
    (id: string, mode: RankMode = 'live') => {
      if (mode === 'live' && serverRanks[id] !== undefined) {
        return serverRanks[id]
      }
      const entry = ranked(mode).find((item) => item.company.id === id)
      return entry?.rank ?? 0
    },
    [ranked, serverRanks],
  )

  const categoryRankOf = useCallback(
    (id: string) => serverCategoryRanks[id] ?? 0,
    [serverCategoryRanks],
  )

  const authoritativeNowMs = useCallback(
    (localNowMs = Date.now()) => {
      if (
        serverGeneratedAtMs === null ||
        serverSyncReceivedAtRef.current === null
      ) {
        return localNowMs
      }

      const elapsedSinceSync =
        localNowMs - serverSyncReceivedAtRef.current

      return serverGeneratedAtMs + Math.max(0, elapsedSinceSync)
    },
    [serverGeneratedAtMs],
  )

  const spotlightIndexForTier = useCallback(
    (tierMemberCount: number, localNowMs = Date.now()) => {
      if (tierMemberCount <= 1) return 0
      const estimatedServerNow = authoritativeNowMs(localNowMs)
      return Math.floor(estimatedServerNow / rotationMs) % tierMemberCount
    },
    [authoritativeNowMs, rotationMs],
  )

  const globalActive = useMemo(
    () =>
      companies.filter(
        (company) =>
          company.status === 'ACTIVE' &&
          !company.paused &&
          company.budget > 0,
      ).length,
    [companies],
  )

  const value = useMemo<MarketContextValue>(
    () => ({
      companies,
      ranked,
      rankOf,
      categoryRankOf,
      globalActive,
      totalBurnRate,
      activity,
      synced,
      checkoutEnabled,
      serverGeneratedAtMs,
      rotationMs,
      authoritativeNowMs,
      spotlightIndexForTier,
    }),
    [
      activity,
      authoritativeNowMs,
      categoryRankOf,
      checkoutEnabled,
      companies,
      globalActive,
      rankOf,
      ranked,
      rotationMs,
      serverGeneratedAtMs,
      spotlightIndexForTier,
      synced,
      totalBurnRate,
    ],
  )

  return (
    <MarketContext.Provider value={value}>
      {children}
    </MarketContext.Provider>
  )
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) {
    throw new Error('useMarket must be used within MarketProvider')
  }
  return ctx
}
