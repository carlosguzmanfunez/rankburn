/**
 * FlipPeak Beta 2.0 server-side domain model.
 *
 * Money remains integer cents on the server.
 */

import type { CategoryId, SubtypeId } from '@/lib/rankburn-data'

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
  subtype: SubtypeId
  website: string
  hue: number
  createdAt: string
}

export type CampaignStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXHAUSTED'
  | 'REJECTED'

export type Campaign = {
  id: string
  productId: string
  advertiserId: string
  previousCampaignId?: string
  status: CampaignStatus
  flagged: boolean
  flagReason?: string
  rejectionReason?: string
  /** Competitive intensity, integer cents per active hour. */
  burnRateCentsPerHour: number
  createdAt: string
  approvedAt?: string
  lastSettledAt: string
  /** Exact instant the competitive Burn Rate last changed. */
  burnRateChangedAt: string
  /**
   * Compatibility field for actual balance mutations.
   * It has no ranking meaning in Beta 2.0.
   */
  balanceChangedAt: string
}

export type AdvertisingBudget = {
  campaignId: string
  activeCents: number
  lifetimeFundedCents: number
  lifetimeUsedCents: number
  usedTodayCents: number
  usedTodayDate: string
  updatedAt: string
}

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  /** Captured funds that must be returned; refund not yet confirmed. */
  | 'REFUND_PENDING'
  /** Refund was attempted and the provider rejected or errored. Needs an operator. */
  | 'REFUND_FAILED'
  | 'REFUNDED'

export type Payment = {
  id: string
  campaignId: string
  advertiserId: string
  provider: string
  providerOrderId?: string
  providerCaptureId?: string
  providerRefundId?: string
  amountCents: number
  currency: string
  status: PaymentStatus
  description: string
  createdAt: string
  completedAt?: string
  creditedAt?: string
  refundedAt?: string
  refundFailureReason?: string
}

export type BudgetUsageEvent = {
  id: string
  campaignId: string
  amountCents: number
  fromAt: string
  toAt: string
  createdAt: string
}

export type ImpressionEvent = {
  id: string
  campaignId: string
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
  verified: boolean
  createdAt: string
}

export type RankSnapshot = {
  id: string
  campaignId: string
  rank: number
  categoryRank: number
  activeCents: number
  burnRateCentsPerHour: number
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
  entityLabel: string
  actorId: string
  actorLabel: string
  reason?: string
  createdAt: string
}

export type PublicListing = {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: CategoryId
  subtype: SubtypeId
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
  /** Raw stored minutes at rank #1. Authoritative for writes. */
  minutesAtOne: number
  minutesAtCategoryOne: number
  minutesInTopThree: number
  /** Whole hours derived from `minutesAtOne`, for display. */
  hoursAtOne: number
  isNew?: boolean
  paused?: boolean
  status: CampaignStatus
  rankHistory: number[]
}
