/**
 * Persistence facade.
 *
 * This module used to hold an in-memory `Map` store. It is now backed by
 * PostgreSQL through Drizzle. The domain types in `types.ts` are unchanged -
 * rows are mapped to the same shapes at this boundary, so the rest of the
 * server code is unaffected apart from the reads becoming asynchronous.
 *
 * Everything above this file talks in domain objects and ISO date strings.
 * Everything below talks in rows, `timestamptz` and integer cents.
 */

import { eq, inArray } from 'drizzle-orm'
import { OWNED_COMPANY_ID } from '@/lib/rankburn-data'
import { getDb } from './db/client'
import {
  advertisingBudgets,
  campaignStats,
  campaigns,
  payments,
  products,
  users,
} from './db/schema'
import type {
  AdvertisingBudget,
  Campaign,
  CampaignStatus,
  Payment,
  PaymentStatus,
  Product,
  User,
  UserRole,
} from './types'

/** Traffic + historical counters kept alongside a campaign. */
export type CampaignStats = {
  campaignId: string
  impressions: number
  visitors: number
  outboundClicks: number
  verifiedOutboundClicks: number
  peakRank: number
  hoursAtOne: number
  joinedLabel: string
  rankHistory: number[]
}

/** A campaign with everything needed to present or moderate it. */
export type CampaignBundle = {
  campaign: Campaign
  product: Product
  budget: AdvertisingBudget
  stats: CampaignStats
}

export const DEMO_ADVERTISER_ID = 'user-demo-advertiser'
/** The campaign the demo advertiser dashboard reads. */
export const DEMO_CAMPAIGN_ID = OWNED_COMPANY_ID

export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function toDollars(cents: number): number {
  return Math.round(cents) / 100
}

export function utcDateKey(at: Date): string {
  return at.toISOString().slice(0, 10)
}

function iso(value: Date | null | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined
}

function parseRankHistory(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === 'number')
      : []
  } catch {
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Row mappers                                                                */
/* -------------------------------------------------------------------------- */

type CampaignRow = typeof campaigns.$inferSelect
type ProductRow = typeof products.$inferSelect
type BudgetRow = typeof advertisingBudgets.$inferSelect
type StatsRow = typeof campaignStats.$inferSelect
type PaymentRow = typeof payments.$inferSelect
type UserRow = typeof users.$inferSelect

export function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    productId: row.productId,
    advertiserId: row.advertiserId,
    status: row.status as CampaignStatus,
    flagged: row.flagged,
    flagReason: row.flagReason ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    burnRateCentsPerHour: row.burnRateCentsPerHour,
    createdAt: new Date(row.createdAt).toISOString(),
    approvedAt: iso(row.approvedAt),
    lastSettledAt: new Date(row.lastSettledAt).toISOString(),
    balanceChangedAt: new Date(row.balanceChangedAt).toISOString(),
  }
}

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    ownerId: row.ownerId,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category as Product['category'],
    website: row.website,
    hue: row.hue,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

export function mapBudget(row: BudgetRow): AdvertisingBudget {
  return {
    campaignId: row.campaignId,
    activeCents: row.activeCents,
    lifetimeFundedCents: row.lifetimeFundedCents,
    lifetimeUsedCents: row.lifetimeUsedCents,
    usedTodayCents: row.usedTodayCents,
    usedTodayDate: row.usedTodayDate,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }
}

export function mapStats(row: StatsRow): CampaignStats {
  return {
    campaignId: row.campaignId,
    impressions: row.impressions,
    visitors: row.visitors,
    outboundClicks: row.outboundClicks,
    verifiedOutboundClicks: row.verifiedOutboundClicks,
    peakRank: row.peakRank,
    // Sampled in minutes, reported in whole hours.
    hoursAtOne: Math.floor(row.minutesAtOne / 60),
    joinedLabel: row.joinedLabel,
    rankHistory: parseRankHistory(row.rankHistory),
  }
}

export function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    campaignId: row.campaignId,
    advertiserId: row.advertiserId,
    provider: row.provider,
    providerOrderId: row.providerOrderId ?? undefined,
    providerCaptureId: row.providerCaptureId ?? undefined,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status as PaymentStatus,
    description: row.description,
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: iso(row.completedAt),
    creditedAt: iso(row.creditedAt),
  }
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Every campaign with its product, budget and stats, in one round trip. */
export async function listCampaignBundles(): Promise<CampaignBundle[]> {
  const db = getDb()
  const rows = await db
    .select({
      campaign: campaigns,
      product: products,
      budget: advertisingBudgets,
      stats: campaignStats,
    })
    .from(campaigns)
    .innerJoin(products, eq(campaigns.productId, products.id))
    .innerJoin(
      advertisingBudgets,
      eq(advertisingBudgets.campaignId, campaigns.id),
    )
    .innerJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))

  return rows.map((row) => ({
    campaign: mapCampaign(row.campaign),
    product: mapProduct(row.product),
    budget: mapBudget(row.budget),
    stats: mapStats(row.stats),
  }))
}

export async function getCampaignBundle(
  campaignId: string,
): Promise<CampaignBundle | null> {
  const db = getDb()
  const rows = await db
    .select({
      campaign: campaigns,
      product: products,
      budget: advertisingBudgets,
      stats: campaignStats,
    })
    .from(campaigns)
    .innerJoin(products, eq(campaigns.productId, products.id))
    .innerJoin(
      advertisingBudgets,
      eq(advertisingBudgets.campaignId, campaigns.id),
    )
    .innerJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    campaign: mapCampaign(row.campaign),
    product: mapProduct(row.product),
    budget: mapBudget(row.budget),
    stats: mapStats(row.stats),
  }
}

export async function campaignExists(campaignId: string): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)
  return rows.length > 0
}

/** Product name for a campaign, used to label audit entries. */
export async function getCampaignLabel(campaignId: string): Promise<string> {
  const db = getDb()
  const rows = await db
    .select({ name: products.name })
    .from(campaigns)
    .innerJoin(products, eq(campaigns.productId, products.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1)
  return rows[0]?.name ?? campaignId
}

export async function slugsInUse(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()
  const db = getDb()
  const rows = await db
    .select({ slug: products.slug })
    .from(products)
    .where(inArray(products.slug, candidates))
  return new Set(rows.map((row) => row.slug))
}

export async function getPaymentById(
  paymentId: string,
): Promise<Payment | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1)
  return rows[0] ? mapPayment(rows[0]) : null
}

export async function getPaymentByOrderId(
  providerOrderId: string,
): Promise<Payment | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.providerOrderId, providerOrderId))
    .limit(1)
  return rows[0] ? mapPayment(rows[0]) : null
}

/** Distinct advertisers holding at least one ACTIVE campaign. */
export async function countActiveAdvertisers(): Promise<number> {
  const db = getDb()
  const rows = await db
    .selectDistinct({ advertiserId: campaigns.advertiserId })
    .from(campaigns)
    .where(eq(campaigns.status, 'ACTIVE'))
  return rows.length
}
