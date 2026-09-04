/**
 * RankBurn database schema (PostgreSQL via Drizzle).
 *
 * Conventions:
 *  - Money is stored in integer cents. Never floats, so no rounding drift can
 *    accumulate in a balance that a real payment funded.
 *  - Timestamps are `timestamptz`. The application converts to ISO strings at
 *    the repository boundary so the domain types in `types.ts` are unchanged.
 *  - Ids are application-generated text (prefixed UUIDs) so a record can be
 *    referenced before it is written.
 */

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('ADVERTISER'),
  /**
   * Salted scrypt hash, or NULL for an account with no credential path at all
   * (the seed/demo advertiser). Never selected into an API response.
   */
  passwordHash: text('password_hash'),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    subtype: text('subtype').notNull().default('other'),
    website: text('website').notNull(),
    hue: integer('hue').notNull().default(42),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('products_owner_idx').on(table.ownerId)],
)

/**
 * Campaign lifecycle: PENDING | ACTIVE | PAUSED | EXHAUSTED | REJECTED.
 *
 * `flagged` is a separate boolean on purpose. FLAGGED and PAUSED are
 * independent states: a flagged campaign keeps running unless a moderator
 * also pauses it.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    advertiserId: text('advertiser_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('PENDING'),
    flagged: boolean('flagged').notNull().default(false),
    flagReason: text('flag_reason'),
    rejectionReason: text('rejection_reason'),
    burnRateCentsPerHour: integer('burn_rate_cents_per_hour')
      .notNull()
      .default(3500),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    burnRateChangedAt: timestamp('burn_rate_changed_at', { withTimezone: true }).notNull().defaultNow(),
    previousCampaignId: text('previous_campaign_id'),
    expiryWarningSentAt: timestamp('expiry_warning_sent_at', { withTimezone: true }),
    /** last time the burn engine settled this campaign */
    lastSettledAt: timestamp('last_settled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** when the active balance last changed - the ranking tie-break */
    balanceChangedAt: timestamp('balance_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('campaigns_status_idx').on(table.status),
    index('campaigns_product_idx').on(table.productId),
    index('campaigns_previous_campaign_idx').on(table.previousCampaignId),
  ],
)

/**
 * One advertising budget per campaign. Non-transferable, non-withdrawable,
 * not redeemable for cash. It only buys advertising placement and exposure.
 */
export const advertisingBudgets = pgTable(
  'advertising_budgets',
  {
    campaignId: text('campaign_id')
      .primaryKey()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    activeCents: bigint('active_cents', { mode: 'number' })
      .notNull()
      .default(0),
    lifetimeFundedCents: bigint('lifetime_funded_cents', { mode: 'number' })
      .notNull()
      .default(0),
    lifetimeUsedCents: bigint('lifetime_used_cents', { mode: 'number' })
      .notNull()
      .default(0),
    usedTodayCents: bigint('used_today_cents', { mode: 'number' })
      .notNull()
      .default(0),
    /** UTC date key (YYYY-MM-DD) that `usedTodayCents` belongs to */
    usedTodayDate: text('used_today_date').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('budgets_active_idx').on(table.activeCents)],
)

/** Traffic and historical counters kept alongside a campaign. */
export const campaignStats = pgTable('campaign_stats', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
  visitors: bigint('visitors', { mode: 'number' }).notNull().default(0),
  outboundClicks: bigint('outbound_clicks', { mode: 'number' })
    .notNull()
    .default(0),
  verifiedOutboundClicks: bigint('verified_outbound_clicks', {
    mode: 'number',
  })
    .notNull()
    .default(0),
  peakRank: integer('peak_rank').notNull().default(99),
  /**
   * Stored in minutes because placement is sampled every few minutes.
   * The domain layer exposes whole hours derived from this.
   */
  minutesAtOne: integer('minutes_at_one').notNull().default(0),
  /** Cumulative minutes held at Category Rank #1. */
  minutesAtCategoryOne: integer('minutes_at_category_one')
    .notNull()
    .default(0),
  /** Cumulative minutes held inside the global Top 3. */
  minutesInTopThree: integer('minutes_in_top_three').notNull().default(0),
  joinedLabel: text('joined_label').notNull().default('Today'),
  /** last 12 recorded placements, oldest first, for the rank chart */
  rankHistory: text('rank_history').notNull().default('[]'),
})

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    advertiserId: text('advertiser_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerOrderId: text('provider_order_id'),
    providerCaptureId: text('provider_capture_id'),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('CREATED'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /**
     * Set the moment this payment funds advertising budget. A payment with a
     * non-null `creditedAt` can never credit a balance again.
     */
    creditedAt: timestamp('credited_at', { withTimezone: true }),
    /**
     * Refund bookkeeping. A payment whose campaign run closed before the
     * webhook arrived is refunded, never credited and never reassigned to a
     * different run. `refundedAt` is the idempotency guard: it is set exactly
     * once, so a redelivered event can never trigger a second refund.
     */
    providerRefundId: text('provider_refund_id'),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundFailureReason: text('refund_failure_reason'),
  },
  (table) => [
    index('payments_campaign_idx').on(table.campaignId),
    index('payments_order_idx').on(table.providerOrderId),
    index('payments_status_idx').on(table.status),
  ],
)

export const budgetUsageEvents = pgTable(
  'budget_usage_events',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    fromAt: timestamp('from_at', { withTimezone: true }).notNull(),
    toAt: timestamp('to_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('usage_campaign_idx').on(table.campaignId)],
)

export const impressions = pgTable(
  'impressions',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** anonymous rotating key, never a raw IP */
    visitorKey: text('visitor_key').notNull(),
    surface: text('surface').notNull().default('unknown'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('impressions_campaign_idx').on(table.campaignId)],
)

export const visitorEvents = pgTable(
  'visitor_events',
  {
    id: text('id').primaryKey(),
    visitorKey: text('visitor_key').notNull(),
    path: text('path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('visitors_key_idx').on(table.visitorKey)],
)

export const outboundClicks = pgTable(
  'outbound_clicks',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    visitorKey: text('visitor_key').notNull(),
    /**
     * Always false for now. The column exists so traffic-quality scoring can
     * be added later without a migration or a change to the event contract.
     */
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('clicks_campaign_idx').on(table.campaignId),
    index('clicks_created_idx').on(table.createdAt),
  ],
)

export const rankSnapshots = pgTable(
  'rank_snapshots',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    categoryRank: integer('category_rank').notNull(),
    activeCents: bigint('active_cents', { mode: 'number' }).notNull(),
    burnRateCentsPerHour: integer('burn_rate_cents_per_hour').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('snapshots_created_idx').on(table.createdAt)],
)

export const moderationEvents = pgTable(
  'moderation_events',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    reason: text('reason'),
    moderatorId: text('moderator_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('moderation_campaign_idx').on(table.campaignId)],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** denormalised so the log stays readable if the entity is removed */
    entityLabel: text('entity_label').notNull(),
    actorId: text('actor_id').notNull(),
    actorLabel: text('actor_label').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('audit_created_idx').on(table.createdAt)],
)

/**
 * Replay protection for payment provider webhooks. The primary key is the
 * provider's own event id, so re-delivering an event cannot credit twice.
 */
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  eventId: text('event_id').primaryKey(),
  provider: text('provider').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})


export const legendEntries = pgTable('legend_entries', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  peakRank: integer('peak_rank').notNull(),
  peakBurnRateCentsPerHour: integer('peak_burn_rate_cents_per_hour').notNull(),
  timeAtPeakSeconds: integer('time_at_peak_seconds').notNull().default(0),
  qualificationReason: text('qualification_reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notificationOutbox = pgTable('notification_outbox', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  recipient: text('recipient'),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
})
