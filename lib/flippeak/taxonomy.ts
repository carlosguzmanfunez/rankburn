export type FlipPeakCategoryId =
  | 'creators'
  | 'music-artists'
  | 'events'
  | 'gaming'
  | 'apps'
  | 'ai'
  | 'tech'
  | 'startups'
  | 'ecommerce'
  | 'entertainment'
  | 'education'
  | 'other'

export type FlipPeakSubtypeId =
  | 'video-creator'
  | 'streamer'
  | 'podcast'
  | 'newsletter'
  | 'influencer'
  | 'musician'
  | 'band'
  | 'dj'
  | 'visual-artist'
  | 'new-release'
  | 'concert'
  | 'festival'
  | 'conference'
  | 'exhibition'
  | 'online-event'
  | 'game'
  | 'indie-game'
  | 'studio'
  | 'gaming-community'
  | 'mobile-app'
  | 'web-app'
  | 'productivity-app'
  | 'consumer-app'
  | 'ai-product'
  | 'ai-agent'
  | 'ai-tool'
  | 'developer-tool'
  | 'hardware'
  | 'saas'
  | 'startup'
  | 'launch'
  | 'marketplace'
  | 'store'
  | 'product'
  | 'brand'
  | 'show'
  | 'film'
  | 'channel'
  | 'course'
  | 'school'
  | 'learning-platform'
  | 'other'

export type FlipPeakCategory = {
  id: FlipPeakCategoryId
  label: string
  subtypes: { id: FlipPeakSubtypeId; label: string }[]
}

export const FLIPPEAK_CATEGORIES: FlipPeakCategory[] = [
  {
    id: 'creators',
    label: 'Creators',
    subtypes: [
      { id: 'video-creator', label: 'Video Creator' },
      { id: 'streamer', label: 'Streamer' },
      { id: 'podcast', label: 'Podcast' },
      { id: 'newsletter', label: 'Newsletter' },
      { id: 'influencer', label: 'Influencer' },
    ],
  },
  {
    id: 'music-artists',
    label: 'Music & Artists',
    subtypes: [
      { id: 'musician', label: 'Musician' },
      { id: 'band', label: 'Band' },
      { id: 'dj', label: 'DJ' },
      { id: 'visual-artist', label: 'Visual Artist' },
      { id: 'new-release', label: 'New Release' },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    subtypes: [
      { id: 'concert', label: 'Concert' },
      { id: 'festival', label: 'Festival' },
      { id: 'conference', label: 'Conference' },
      { id: 'exhibition', label: 'Exhibition' },
      { id: 'online-event', label: 'Online Event' },
    ],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    subtypes: [
      { id: 'game', label: 'Game' },
      { id: 'indie-game', label: 'Indie Game' },
      { id: 'studio', label: 'Studio' },
      { id: 'gaming-community', label: 'Gaming Community' },
    ],
  },
  {
    id: 'apps',
    label: 'Apps',
    subtypes: [
      { id: 'mobile-app', label: 'Mobile App' },
      { id: 'web-app', label: 'Web App' },
      { id: 'productivity-app', label: 'Productivity App' },
      { id: 'consumer-app', label: 'Consumer App' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    subtypes: [
      { id: 'ai-product', label: 'AI Product' },
      { id: 'ai-agent', label: 'AI Agent' },
      { id: 'ai-tool', label: 'AI Tool' },
    ],
  },
  {
    id: 'tech',
    label: 'Tech',
    subtypes: [
      { id: 'developer-tool', label: 'Developer Tool' },
      { id: 'hardware', label: 'Hardware' },
      { id: 'saas', label: 'SaaS' },
    ],
  },
  {
    id: 'startups',
    label: 'Startups',
    subtypes: [
      { id: 'startup', label: 'Startup' },
      { id: 'launch', label: 'Launch' },
      { id: 'marketplace', label: 'Marketplace' },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    subtypes: [
      { id: 'store', label: 'Store' },
      { id: 'product', label: 'Product' },
      { id: 'brand', label: 'Brand' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    subtypes: [
      { id: 'show', label: 'Show' },
      { id: 'film', label: 'Film' },
      { id: 'channel', label: 'Channel' },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    subtypes: [
      { id: 'course', label: 'Course' },
      { id: 'school', label: 'School' },
      { id: 'learning-platform', label: 'Learning Platform' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    subtypes: [{ id: 'other', label: 'Other' }],
  },
]

export function subtypesFor(category: FlipPeakCategoryId) {
  return FLIPPEAK_CATEGORIES.find((item) => item.id === category)?.subtypes ?? []
}

/**
 * Legacy RankBurn category ids, mapped to their FlipPeak equivalent.
 *
 * These six ids were the entire taxonomy before Beta 2.0. Migration
 * `0006_flippeak_beta2_legacy_taxonomy_normalization.sql` rewrites stored rows
 * to the FlipPeak vocabulary using exactly these pairs. This table exists so
 * application code can normalise the same way for any row that has not been
 * migrated yet, instead of silently carrying an id that no longer belongs to
 * the taxonomy.
 *
 * It is a migration aid, not a semantic inference rule for new advertiser
 * content: new campaigns pick their own category and subtype in the builder.
 */
export const LEGACY_CATEGORY_MAP: Record<
  string,
  { category: FlipPeakCategoryId; subtype: FlipPeakSubtypeId }
> = {
  ai: { category: 'ai', subtype: 'ai-tool' },
  devtools: { category: 'tech', subtype: 'developer-tool' },
  seo: { category: 'tech', subtype: 'saas' },
  productivity: { category: 'apps', subtype: 'productivity-app' },
  marketing: { category: 'startups', subtype: 'startup' },
  sales: { category: 'startups', subtype: 'startup' },
}

/**
 * Coerces any stored category string into a valid FlipPeak category.
 *
 * Order matters: a value that is already a FlipPeak id is returned untouched,
 * a known legacy id is translated, and anything unrecognised falls back to
 * 'other' rather than escaping as an invalid union member. Nothing downstream
 * should ever have to cast a category again.
 */
export function normalizeCategoryId(value: unknown): FlipPeakCategoryId {
  if (isFlipPeakCategory(value)) return value
  if (typeof value === 'string' && LEGACY_CATEGORY_MAP[value]) {
    return LEGACY_CATEGORY_MAP[value].category
  }
  return 'other'
}

/** Same coercion for a subtype, scoped to its (already normalised) category. */
export function normalizeSubtypeId(
  category: FlipPeakCategoryId,
  value: unknown,
  legacyCategory?: unknown,
): FlipPeakSubtypeId {
  if (isSubtypeForCategory(category, value)) return value
  if (
    typeof legacyCategory === 'string' &&
    LEGACY_CATEGORY_MAP[legacyCategory]?.category === category
  ) {
    return LEGACY_CATEGORY_MAP[legacyCategory].subtype
  }
  return subtypesFor(category)[0]?.id ?? 'other'
}

export function isFlipPeakCategory(value: unknown): value is FlipPeakCategoryId {
  return (
    typeof value === 'string' &&
    FLIPPEAK_CATEGORIES.some((category) => category.id === value)
  )
}

export function isSubtypeForCategory(
  category: FlipPeakCategoryId,
  subtype: unknown,
): subtype is FlipPeakSubtypeId {
  return (
    typeof subtype === 'string' &&
    subtypesFor(category).some((item) => item.id === subtype)
  )
}
