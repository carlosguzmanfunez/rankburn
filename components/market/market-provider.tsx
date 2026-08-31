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
  OWNED_COMPANY_ID,
  type CategoryId,
  type Company,
  type RankMode,
} from '@/lib/rankburn-data'

export type ActivityKind = 'took' | 'added' | 'moved' | 'entered'

export type ActivityItem = {
  id: string
  kind: ActivityKind
  companyId: string
  companyName: string
  text: string
  amount?: number
  rank?: number
}

export type RankedEntry = {
  company: Company
  rank: number
  /** positive = moved up vs the start of the tracked window */
  delta: number
}

type MarketContextValue = {
  companies: Company[]
  ranked: (mode: RankMode, category?: CategoryId | 'all') => RankedEntry[]
  rankOf: (id: string, mode?: RankMode) => number
  globalActive: number
  activity: ActivityItem[]
  ownedId: string
  /** false while the first server snapshot is still loading */
  synced: boolean
  /** true when a payment provider is configured on this deployment */
  checkoutEnabled: boolean
}

type ServerListing = Company & {
  status: string
  impressions: number
}

type MarketSnapshot = {
  totalActiveBudget: number
  checkoutEnabled: boolean
  ranked: { rank: number; categoryRank: number; listing: ServerListing }[]
  listings: ServerListing[]
}

const MarketContext = createContext<MarketContextValue | null>(null)

/** How often the browser re-reads authoritative state from the server. */
const SYNC_INTERVAL_MS = 15_000
/** How often displayed balances are smoothed between syncs. */
const TICK_INTERVAL_MS = 1_000

let activitySeq = 0
function nextId() {
  activitySeq += 1
  return `act-${Date.now()}-${activitySeq}`
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  // Seeded from the shared dataset so server and client render identically on
  // first paint. Replaced by authoritative server state on mount.
  const [companies, setCompanies] = useState<Company[]>(() =>
    COMPANIES.map((c) => ({ ...c, rankHistory: [...c.rankHistory] })),
  )
  /**
   * Placement as computed by the server. The browser renders this order; it
   * does not decide it. Empty until the first sync completes.
   */
  const [serverRanks, setServerRanks] = useState<Record<string, number>>({})
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [synced, setSynced] = useState(false)
  const [checkoutEnabled, setCheckoutEnabled] = useState(false)

  const previousRef = useRef<Record<string, { rank: number; budget: number }>>(
    {},
  )

  /**
   * Pulls authoritative state and derives activity from what actually
   * changed on the server between two snapshots. Nothing here invents
   * market movement.
   */
  const sync = useCallback(async () => {
    try {
      const response = await fetch('/api/market', { cache: 'no-store' })
      if (!response.ok) return
      const snapshot = (await response.json()) as MarketSnapshot

      const nextRanks: Record<string, number> = {}
      const events: ActivityItem[] = []
      const previous = previousRef.current
      const nextPrevious: Record<string, { rank: number; budget: number }> = {}

      for (const entry of snapshot.ranked) {
        const { listing, rank } = entry
        nextRanks[listing.id] = rank
        nextPrevious[listing.id] = { rank, budget: listing.budget }

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

        const gained = listing.budget - before.budget
        if (gained > 0.5) {
          events.push({
            id: nextId(),
            kind: 'added',
            companyId: listing.id,
            companyName: listing.name,
            text: `added ${gained.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            })} advertising budget`,
            amount: gained,
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
      setCheckoutEnabled(snapshot.checkoutEnabled)
      setSynced(true)
      if (events.length > 0) {
        setActivity((current) => [...events, ...current].slice(0, 14))
      }
    } catch {
      // A failed sync leaves the last known good snapshot on screen rather
      // than blanking the market.
    }
  }, [])

  useEffect(() => {
    sync()
    const interval = setInterval(sync, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [sync])

  /**
   * Display-only smoothing between syncs so balances visibly move instead of
   * jumping every 15 seconds. This mirrors the server's burn rate; it never
   * changes placement, and the next sync overwrites it with real values.
   */
  useEffect(() => {
    if (!synced) return
    const interval = setInterval(() => {
      setCompanies((prev) =>
        prev.map((company) => {
          if (company.paused || company.budget <= 0) return company
          const perTick = (company.burnRate / 3600) * (TICK_INTERVAL_MS / 1000)
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

  const sortBy = useCallback(
    (list: Company[], mode: RankMode): Company[] => {
      const visible = list.filter(
        (company) => !company.paused && company.budget > 0,
      )
      if (mode === 'today') {
        return [...visible].sort((a, b) => b.spentToday - a.spentToday)
      }
      if (mode === 'alltime') {
        return [...visible].sort((a, b) => b.totalSpend - a.totalSpend)
      }
      // Live placement comes from the server whenever it is available.
      const haveServerRanks = Object.keys(serverRanks).length > 0
      if (!haveServerRanks) {
        return [...visible].sort((a, b) => b.budget - a.budget)
      }
      return visible
        .filter((company) => serverRanks[company.id] !== undefined)
        .sort((a, b) => serverRanks[a.id] - serverRanks[b.id])
    },
    [serverRanks],
  )

  const ranked = useCallback(
    (mode: RankMode, category: CategoryId | 'all' = 'all'): RankedEntry[] => {
      const ordered = sortBy(companies, mode)
      const withRank = ordered.map((company, i) => {
        const startRank = company.rankHistory[0] ?? i + 1
        return {
          company,
          rank: i + 1,
          delta: company.isNew ? 0 : startRank - (i + 1),
        }
      })
      if (category === 'all') return withRank
      return withRank
        .filter((e) => e.company.category === category)
        .map((e, i) => ({ ...e, rank: i + 1 }))
    },
    [companies, sortBy],
  )

  const rankOf = useCallback(
    (id: string, mode: RankMode = 'live') => {
      const ordered = sortBy(companies, mode)
      const index = ordered.findIndex((c) => c.id === id)
      return index === -1 ? 0 : index + 1
    },
    [companies, sortBy],
  )

  const globalActive = useMemo(
    () =>
      companies.reduce(
        (sum, c) => sum + (!c.paused && c.budget > 0 ? c.budget : 0),
        0,
      ),
    [companies],
  )

  const value = useMemo<MarketContextValue>(
    () => ({
      companies,
      ranked,
      rankOf,
      globalActive,
      activity,
      ownedId: OWNED_COMPANY_ID,
      synced,
      checkoutEnabled,
    }),
    [
      companies,
      ranked,
      rankOf,
      globalActive,
      activity,
      synced,
      checkoutEnabled,
    ],
  )

  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  )
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket must be used within MarketProvider')
  return ctx
}
