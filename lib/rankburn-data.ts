export type CategoryId =
  | 'ai'
  | 'marketing'
  | 'seo'
  | 'devtools'
  | 'sales'
  | 'productivity'

export type RankMode = 'live' | 'today' | 'alltime'

export type Category = {
  id: CategoryId
  label: string
}

export const CATEGORIES: Category[] = [
  { id: 'ai', label: 'AI' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'seo', label: 'SEO' },
  { id: 'devtools', label: 'Developer Tools' },
  { id: 'sales', label: 'Sales' },
  { id: 'productivity', label: 'Productivity' },
]

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export type Company = {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: CategoryId
  website: string
  /** hue used for the generated monogram tile */
  hue: number
  /** active advertising budget in USD */
  budget: number
  /** budget consumed per hour (visibility rate) */
  burnRate: number
  /** lifetime spend */
  totalSpend: number
  /** budget spent in the last 24h */
  spentToday: number
  visitors: number
  /** times the listing was rendered on a surface (server-provided) */
  impressions?: number
  /** outbound clicks through to the advertiser */
  clicks: number
  joined: string
  peakRank: number
  hoursAtOne: number
  isNew?: boolean
  paused?: boolean
  /** rank samples over the last window, oldest -> newest */
  rankHistory: number[]
}

/**
 * Seed dataset used to render the first paint and to seed the server store.
 *
 * The authoritative live market is served by /api/market. This array is only
 * the shared starting point so server and client markup match on first paint;
 * it is not the source of truth for balances or placement.
 */
export const COMPANIES: Company[] = [
  {
    id: 'nova-ai',
    slug: 'nova-ai',
    name: 'Nova AI',
    tagline: 'Build AI agents without code.',
    description:
      'Nova AI lets teams design, deploy and monitor autonomous AI agents from a visual canvas — no engineering required.',
    category: 'ai',
    website: 'nova.ai',
    hue: 58,
    budget: 487.42,
    burnRate: 0.6,
    totalSpend: 12480,
    spentToday: 214.5,
    visitors: 1842,
    clicks: 207,
    joined: 'Mar 2025',
    peakRank: 1,
    hoursAtOne: 312,
    rankHistory: [4, 3, 3, 2, 2, 1, 1, 2, 1, 1, 1, 1],
  },
  {
    id: 'flowseo',
    slug: 'flowseo',
    name: 'FlowSEO',
    tagline: 'Rank higher on autopilot.',
    description:
      'FlowSEO audits, plans and publishes SEO content that compounds — an autonomous growth engine for lean teams.',
    category: 'seo',
    website: 'flowseo.com',
    hue: 158,
    budget: 452.1,
    burnRate: 0.55,
    totalSpend: 9820,
    spentToday: 198.2,
    visitors: 1610,
    clicks: 184,
    joined: 'Apr 2025',
    peakRank: 1,
    hoursAtOne: 96,
    rankHistory: [6, 5, 4, 4, 3, 3, 2, 2, 3, 2, 2, 2],
  },
  {
    id: 'devpilot',
    slug: 'devpilot',
    name: 'DevPilot',
    tagline: 'Ship code with an AI copilot.',
    description:
      'DevPilot reviews pull requests, writes tests and fixes flaky builds so your team ships with confidence.',
    category: 'devtools',
    website: 'devpilot.dev',
    hue: 240,
    budget: 398.75,
    burnRate: 0.5,
    totalSpend: 8110,
    spentToday: 176.4,
    visitors: 1394,
    clicks: 158,
    joined: 'Feb 2025',
    peakRank: 1,
    hoursAtOne: 44,
    rankHistory: [5, 5, 4, 3, 4, 4, 3, 3, 3, 3, 3, 3],
  },
  {
    id: 'saleskit',
    slug: 'saleskit',
    name: 'SalesKit',
    tagline: 'Close deals with less busywork.',
    description:
      'SalesKit automates outreach, follow-ups and CRM hygiene so reps spend time selling, not updating fields.',
    category: 'sales',
    website: 'saleskit.io',
    hue: 22,
    budget: 302.0,
    burnRate: 0.48,
    totalSpend: 6640,
    spentToday: 142.8,
    visitors: 1102,
    clicks: 121,
    joined: 'Jan 2025',
    peakRank: 2,
    hoursAtOne: 0,
    rankHistory: [7, 6, 6, 5, 5, 4, 5, 4, 4, 4, 4, 4],
  },
  {
    id: 'brightreach',
    slug: 'brightreach',
    name: 'BrightReach',
    tagline: 'Marketing that runs itself.',
    description:
      'BrightReach plans campaigns, drafts copy and schedules everything across channels from a single brief.',
    category: 'marketing',
    website: 'brightreach.com',
    hue: 300,
    budget: 247.0,
    burnRate: 0.42,
    totalSpend: 5210,
    spentToday: 118.6,
    visitors: 968,
    clicks: 104,
    joined: 'May 2025',
    peakRank: 3,
    hoursAtOne: 0,
    rankHistory: [8, 7, 7, 6, 6, 5, 5, 6, 5, 5, 5, 5],
  },
  {
    id: 'taskloop',
    slug: 'taskloop',
    name: 'TaskLoop',
    tagline: 'Your team\u2019s work, in one loop.',
    description:
      'TaskLoop turns scattered updates into a single live plan — projects, docs and status without the meetings.',
    category: 'productivity',
    website: 'taskloop.app',
    hue: 190,
    budget: 214.3,
    burnRate: 0.4,
    totalSpend: 4480,
    spentToday: 96.2,
    visitors: 812,
    clicks: 88,
    joined: 'Jun 2025',
    peakRank: 4,
    hoursAtOne: 0,
    rankHistory: [9, 9, 8, 8, 7, 7, 6, 6, 6, 6, 6, 6],
  },
  {
    id: 'inboxzero',
    slug: 'inboxzero',
    name: 'InboxZero AI',
    tagline: 'Email that answers itself.',
    description:
      'InboxZero AI triages, drafts and schedules replies so your inbox stays empty and your customers stay happy.',
    category: 'ai',
    website: 'inboxzero.ai',
    hue: 45,
    budget: 168.9,
    burnRate: 0.36,
    totalSpend: 3620,
    spentToday: 74.1,
    visitors: 640,
    clicks: 71,
    joined: 'Jun 2025',
    peakRank: 5,
    hoursAtOne: 0,
    rankHistory: [11, 10, 10, 9, 9, 8, 8, 7, 7, 7, 7, 7],
  },
  {
    id: 'keywordpop',
    slug: 'keywordpop',
    name: 'KeywordPop',
    tagline: 'Find keywords that convert.',
    description:
      'KeywordPop surfaces low-competition, high-intent keywords and turns them into ready-to-publish briefs.',
    category: 'seo',
    website: 'keywordpop.com',
    hue: 130,
    budget: 142.5,
    burnRate: 0.34,
    totalSpend: 2980,
    spentToday: 61.3,
    visitors: 548,
    clicks: 59,
    joined: 'Jul 2025',
    peakRank: 6,
    hoursAtOne: 0,
    rankHistory: [12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 8, 8],
  },
  {
    id: 'shipyard',
    slug: 'shipyard',
    name: 'Shipyard',
    tagline: 'Preview every deploy.',
    description:
      'Shipyard spins up disposable preview environments for every branch so teams review real software, not screenshots.',
    category: 'devtools',
    website: 'shipyard.build',
    hue: 210,
    budget: 118.2,
    burnRate: 0.3,
    totalSpend: 2410,
    spentToday: 48.9,
    visitors: 452,
    clicks: 47,
    joined: 'Jul 2025',
    peakRank: 7,
    hoursAtOne: 0,
    rankHistory: [13, 12, 12, 11, 11, 10, 10, 10, 9, 9, 9, 9],
  },
  {
    id: 'pipeline',
    slug: 'pipeline',
    name: 'Pipeline',
    tagline: 'Revenue you can predict.',
    description:
      'Pipeline forecasts deals with signal from your CRM, calendar and email so leaders stop guessing.',
    category: 'sales',
    website: 'pipeline.so',
    hue: 15,
    budget: 96.8,
    burnRate: 0.28,
    totalSpend: 1980,
    spentToday: 39.4,
    visitors: 388,
    clicks: 40,
    joined: 'Aug 2025',
    peakRank: 8,
    hoursAtOne: 0,
    rankHistory: [14, 14, 13, 13, 12, 12, 11, 11, 11, 10, 10, 10],
  },
  {
    id: 'draftly',
    slug: 'draftly',
    name: 'Draftly',
    tagline: 'Turn ideas into content, fast.',
    description:
      'Draftly writes on-brand posts, newsletters and landing copy from a single prompt and your style guide.',
    category: 'marketing',
    website: 'draftly.co',
    hue: 320,
    budget: 74.5,
    burnRate: 0.24,
    totalSpend: 1420,
    spentToday: 28.7,
    visitors: 296,
    clicks: 31,
    joined: 'Aug 2025',
    peakRank: 9,
    hoursAtOne: 0,
    rankHistory: [15, 15, 14, 14, 13, 13, 12, 12, 12, 11, 11, 11],
  },
  {
    id: 'focusflow',
    slug: 'focusflow',
    name: 'FocusFlow',
    tagline: 'Deep work, on schedule.',
    description:
      'FocusFlow protects your calendar, batches distractions and reports where your team\u2019s hours actually go.',
    category: 'productivity',
    website: 'focusflow.app',
    hue: 175,
    budget: 52.15,
    burnRate: 0.2,
    totalSpend: 980,
    spentToday: 19.2,
    visitors: 214,
    clicks: 22,
    joined: 'Aug 2025',
    peakRank: 11,
    hoursAtOne: 0,
    rankHistory: [16, 16, 15, 15, 14, 14, 13, 13, 13, 12, 12, 12],
  },
  {
    id: 'agentgrid',
    slug: 'agentgrid',
    name: 'AgentGrid',
    tagline: 'Orchestrate AI at scale.',
    description:
      'AgentGrid runs fleets of AI agents with guardrails, evals and observability built for production.',
    category: 'ai',
    website: 'agentgrid.io',
    hue: 70,
    budget: 34.6,
    burnRate: 0.18,
    totalSpend: 210,
    spentToday: 34.6,
    visitors: 96,
    clicks: 11,
    joined: 'Today',
    peakRank: 13,
    hoursAtOne: 0,
    isNew: true,
    rankHistory: [13, 13, 13],
  },
  {
    id: 'rankradar',
    slug: 'rankradar',
    name: 'RankRadar',
    tagline: 'Track every SERP move.',
    description:
      'RankRadar monitors your rankings across markets and alerts you the moment a competitor moves.',
    category: 'seo',
    website: 'rankradar.com',
    hue: 145,
    budget: 12.4,
    burnRate: 0.16,
    totalSpend: 640,
    spentToday: 8.1,
    visitors: 172,
    clicks: 18,
    joined: 'Jul 2025',
    peakRank: 10,
    hoursAtOne: 0,
    rankHistory: [12, 12, 13, 13, 14, 14, 14, 14, 14, 14, 14, 14],
  },
]

/** The company the demo "advertiser" owns (used by the dashboard). */
export const OWNED_COMPANY_ID = 'brightreach'

export function formatMoney(n: number, decimals = 2): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export function formatCompact(n: number): string {
  return n.toLocaleString('en-US')
}

export function estimateRemaining(budget: number, burnRate: number): string {
  if (burnRate <= 0) return '\u2014'
  const hours = budget / burnRate
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rem = h % 24
    return `${d}d ${rem}h`
  }
  return `${h}h ${m}m`
}
