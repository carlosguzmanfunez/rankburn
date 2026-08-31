/**
 * RankBurn server-side domain model.
 *
 * These types describe the entities that must eventually live in a real
 * database. They are intentionally storage-agnostic: the in-memory store in
 * `store.ts` implements the same shapes a SQL schema would, so swapping the
 * persistence layer does not require touching business logic.
 *
 * Money is always stored in **integer cents** on the server. Floating point
 * dollars are a presentation concern only. This removes rounding drift from
 * the budget engine and from any future payment reconciliation.
 */

import type { CategoryId } from '@/lib/rankburn-data'

export type UserRole = 'ADVERTISER' | 'MODERATOR' | 'ADMIN'

export type User = {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAt: string
}

export type Product = {
  id: string
  ownerId: string
  slug: string
  name: string
  tagline: string
  description: string
  category: CategoryId
  website: string
  /** hue used for the deterministic monogram tile */
  hue: number
  createdAt: string
}

/**
 * Campaign lifecycle.
 *
 * PENDING   - submitted, awaiting moderation. Does not rank, does not consume.
 * ACTIVE    - approved and delivering exposure. Consumes advertising budget.
 * PAUSED    - moderator- or advertiser-paused. Keeps all data, does not rank,
 *             does not consume. Can be resumed.
 * EXHAUSTED - active advertising budget reached zero. Stops ranking. Can
 *             return to ACTIVE when new budget is added.
 * REJECTED  - refused in moderation. Does not rank, does not consume.
 */
export type CampaignStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXHAUSTED'
  | 'REJECTED'

export type Campaign = {
  id: string
  productId: string
  advertiserId: string
  status: CampaignStatus
  /**
   * FLAGGED is deliberately NOT a status. A flagged campaign can keep running
   * unless a moderator also pauses it, so the two states are independent.
   */
  flagged: boolean
  flagReason?: string
  rejectionReason?: string
  /** budget consumed per hour of active exposure, in cents */
  burnRateCentsPerHour: number
  createdAt: string
  approvedAt?: string
  /** last time the burn engine settled this campaign */
  lastSettledAt: string
  /** last time the active balance changed - used as the ranking tie-break */
  balanceChangedAt: string
}

/**
 * One advertising budget per campaign. Non-transferable, non-withdrawable,
 * not redeemable for cash. It only buys advertising placement and exposure
 * inside RankBurn.
 */
export type AdvertisingBudget = {
  campaignId: string
  /** currently rankable / consumable balance, in cents */
  activeCents: number
  /** lifetime funded amount, in cents */
  lifetimeFundedCents: number
  /** lifetime consumed amount, in cents */
  lifetimeUsedCents: number
  /** consumed during the current UTC day, in cents */
  usedTodayCents: number
  /** UTC date key (YYYY-MM-DD) that `usedTodayCents` belongs to */
  usedTodayDate: string
  updatedAt: string
}

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'

export type Payment = {
  id: string
  campaignId: string
  advertiserId: string
  provider: string
  /** provider-side order/checkout id */
  providerOrderId?: string
  /** provider-side capture/transaction id, set on confirmed capture */
  providerCaptureId?: string
  amountCents: number
  currency: string
  status: PaymentStatus
  /** commercial description shown to the payment provider and the buyer */
  description: string
  createdAt: string
  completedAt?: string
  /**
   * Guards against double-crediting the same provider event. A payment may
   * only ever credit advertising budget once.
   */
  creditedAt?: string
}

export type BudgetUsageEvent = {
  id: string
  campaignId: string
  /** consumed amount for this settlement window, in cents */
  amountCents: number
  fromAt: string
  toAt: string
  createdAt: string
}

export type ImpressionEvent = {
  id: string
  campaignId: string
  /** anonymous rotating visitor key, never a raw IP */
  visitorKey: string
  surface: string
  createdAt: string
}

export type VisitorEvent = {
  id: string
  visitorKey: string
  path: string
  createdAt: string
}

export type OutboundClickEvent = {
  id: string
  campaignId: string
  visitorKey: string
  /**
   * Verified clicks are the subset that passed anomaly checks. In this MVP
   * nothing is verified yet - the field exists so the analytics pipeline and
   * any future fraud scoring have a place to write.
   */
  verified: boolean
  createdAt: string
}

export type RankSnapshot = {
  id: string
  campaignId: string
  rank: number
  categoryRank: number
  activeCents: number
  createdAt: string
}

export type ModerationAction =
  | 'APPROVE'
  | 'REJECT'
  | 'FLAG'
  | 'UNFLAG'
  | 'PAUSE'
  | 'RESUME'

export type ModerationEvent = {
  id: string
  campaignId: string
  action: ModerationAction
  reason?: string
  moderatorId: string
  createdAt: string
}

export type AuditLog = {
  id: string
  action: string
  entityType: 'campaign' | 'payment' | 'session' | 'system'
  entityId: string
  /** denormalised label so the log stays readable if the entity is removed */
  entityLabel: string
  actorId: string
  actorLabel: string
  reason?: string
  createdAt: string
}

/** Shape returned to the browser. Never exposes internal cents or owner ids. */
export type PublicListing = {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: CategoryId
  website: string
  hue: number
  budget: number
  burnRate: number
  totalSpend: number
  spentToday: number
  visitors: number
  impressions: number
  clicks: number
  joined: string
  peakRank: number
  hoursAtOne: number
  isNew?: boolean
  paused?: boolean
  status: CampaignStatus
  rankHistory: number[]
}
